#!/bin/sh
set -eu

fail() {
  printf 'carve-out: %s\n' "$1" >&2
  exit 1
}

checksum() {
  if command -v sha256sum >/dev/null 2>&1; then
    hash=$(sha256sum < "$1")
  else
    hash=$(shasum -a 256 < "$1")
  fi
  printf '%s\n' "${hash%% *}"
}

safe_path() (
  relative=$1
  case "/$relative/" in
    *//*|*/./*|*/../*) fail "Invalid relative path: $relative" ;;
  esac
  path=$folder/$relative
  [ ! -L "$path" ] || fail "Symbolic links cannot be moved or restored: $path"
  path=${path%/*}
  while [ "$path" != "$folder" ]; do
    [ ! -L "$path" ] || fail "Symbolic links cannot be moved or restored: $path"
    [ ! -e "$path" ] || [ -d "$path" ] || fail "Expected a directory: $path"
    path=${path%/*}
  done
)

retained() {
  case "$1" in
    carve-out.keep|carve-out.files) return 0 ;;
  esac
  [ -f "$folder/carve-out.keep" ] || return 1
  while IFS= read -r pattern || [ -n "$pattern" ]; do
    case "$pattern" in
      ''|\#*) continue ;;
    esac
    case "$1" in
      $pattern) return 0 ;;
    esac
  done < "$folder/carve-out.keep"
  return 1
}

record_action() {
  action=$1
  while IFS="$tab" read -r expected relative extra <&3; do
    [ -n "$relative" ] && [ -z "$extra" ] || fail "Invalid record row."
    safe_path "$relative"
    original=$folder/$relative
    copy=$payload/$relative
    case "$action" in
      check)
        [ -f "$copy" ] && [ "$(checksum "$copy")" = "$expected" ] ||
          fail "Snapshot file did not verify: $relative"
        if [ -e "$original" ]; then
          [ -f "$original" ] && cmp -s "$original" "$copy" ||
            fail "File changed or would be overwritten: $original"
        fi
        ;;
      move)
        cmp -s "$original" "$copy" || fail "File changed during carve-out: $original"
        rm "$original"
        directory=${original%/*}
        while [ "$directory" != "$folder" ] && rmdir "$directory" 2>/dev/null; do
          directory=${directory%/*}
        done
        ;;
      restore)
        if [ -e "$original" ]; then
          cmp -s "$original" "$copy" || fail "File changed during restore: $original"
        else
          mkdir -p "${original%/*}"
          cp -p "$copy" "$original"
        fi
        ;;
    esac
  done 3< "$scratch/files"
}

operation=move
case "${1:-}" in
  --dry-run) operation=preview; shift ;;
  --undo) operation=undo; shift ;;
esac
if [ "$operation" = undo ]; then
  [ "$#" -eq 1 ] || fail "Usage: $0 --undo FOLDER"
else
  [ "$#" -eq 2 ] || fail "Usage: $0 [--dry-run] FOLDER REMOTE_URL"
  remote_url=$2
  case "$remote_url" in
    -*) fail "Provide the Git remote URL as the second argument." ;;
    *[![:space:]]*) ;;
    *) fail "A Git remote URL is required." ;;
  esac
fi

root=$(git rev-parse --show-toplevel)
root=$(CDPATH= cd -- "$root" && pwd -P)
[ ! -L "$1" ] || fail "Choose a folder inside the checkout."
folder=$(CDPATH= cd -- "$1" && pwd -P) || fail "Cannot open folder: $1"
case "$folder" in
  "$root/"*) tree=${folder#"$root/"} ;;
  *) fail "Choose a folder inside the checkout." ;;
esac
target=${folder##*/}
case "$target" in
  [!a-zA-Z0-9]*|*[!a-zA-Z0-9_.-]*) fail "The folder name must be a valid Make target." ;;
esac

parent=${root%/*}
tab=$(printf '\t')
record=$folder/carve-out.files
scratch_parent=${TMPDIR:-/tmp}
if [ "$operation" = move ]; then
  scratch_parent=$parent
fi
scratch=$(mktemp -d "$scratch_parent/.chaos-carve-out.XXXXXX")
trap 'rm -rf "$scratch"' 0
trap 'exit 1' HUP INT TERM

if [ "$operation" = undo ]; then
  [ -f "$record" ] && [ ! -L "$record" ] || fail "No carve-out record at $record"
  IFS="$tab" read -r rib expected extra < "$record" || fail "Invalid record header."
  case "$rib" in
    ''|.|..|*[!a-zA-Z0-9_.-]*) fail "Invalid rib name in the record." ;;
  esac
  [ -n "$expected" ] && [ -z "$extra" ] || fail "Invalid record header."
  archive=$parent/$rib/.git/carve-out.tar.gz
  [ -f "$archive" ] && [ "$(checksum "$archive")" = "$expected" ] ||
    fail "Snapshot archive did not verify: $archive"
  tar -xzf "$archive" -C "$scratch"
  payload=$scratch/$rib
  sed '1d' "$record" > "$scratch/files"
  record_action check
  record_action restore
  printf 'Restored files to %s using %s.\n' "$folder" "$record"
  exit 0
fi

origin=$(git config --get remote.origin.url || true)
repository=${origin:-$root}
repository=${repository%/}
repository=${repository##*/}
repository=${repository##*:}
repository=${repository%.git}
suffix=$(printf '%s' "$tree" | tr '/' '-')
rib=$repository-$suffix
case "$rib" in
  [!a-zA-Z0-9]*|*[!a-zA-Z0-9_.-]*) fail "The repository and folder tree must form a valid rib name." ;;
esac
destination=$parent/$rib
[ ! -e "$destination" ] && [ ! -L "$destination" ] || fail "Destination already exists: $destination"
[ ! -e "$record" ] && [ ! -L "$record" ] || fail "Record already exists: $record"
target_pattern=$(printf '%s' "$target" | sed 's/\./\\./g')
grep -Eq "^$target_pattern[[:space:]]*:" "$folder/Makefile" ||
  fail "Provide the $target target in $folder/Makefile."

git --literal-pathspecs -C "$root" -c core.quotePath=false ls-files \
  --cached --others --exclude-standard -- "$tree" > "$scratch/git-files"
LC_ALL=C sort -u "$scratch/git-files" > "$scratch/candidates"
: > "$scratch/files"
payload=$scratch/$rib
mkdir "$payload"
while IFS= read -r path; do
  case "$path" in
    "$tree/"*) relative=${path#"$tree/"} ;;
    *) fail "Unsupported filename in $tree: $path" ;;
  esac
  retained "$relative" && continue
  safe_path "$relative"
  source=$folder/$relative
  [ -e "$source" ] || continue
  [ -f "$source" ] || fail "Carve-out only moves regular files: $source"
  copy=$payload/$relative
  mkdir -p "${copy%/*}"
  cp -p "$source" "$copy"
  printf '%s\t%s\n' "$(checksum "$copy")" "$relative" >> "$scratch/files"
done < "$scratch/candidates"
[ -f "$payload/Makefile" ] || fail "The Makefile must move into the rib."
count=$(wc -l < "$scratch/files")

if [ "$operation" = preview ]; then
  printf 'Would move %s files to %s with Make target %s.\n' "$((count))" "$destination" "$target"
  exit 0
fi

record_action check
archive=$scratch/carve-out.tar.gz
tar -czf "$archive" -C "$scratch" "$rib"
archive_hash=$(checksum "$archive")
git_variables=$(git rev-parse --local-env-vars)
(
  unset $git_variables
  git -C "$payload" init --quiet --initial-branch=main
  git -C "$payload" remote add origin "$remote_url"
  git -C "$payload" add --force -- .
  git -C "$payload" commit -m "Initialize $target rib"
  git -C "$payload" archive HEAD > "$scratch/commit.tar"
)

verification=$scratch/verification
mkdir "$verification"
tar -xf "$scratch/commit.tar" -C "$verification"
(
  payload=$verification
  record_action check
  unset $git_variables
  CHAOS_CHECKOUT="$root" CHAOS_SOURCE_CHECKOUT="$root" CHAOS_TEST_SCOPE=all \
    make -C "$verification" -f Makefile "$target"
)
record_action check
[ ! -e "$destination" ] && [ ! -L "$destination" ] || fail "Destination already exists: $destination"
(
  unset $git_variables
  git -C "$payload" push --set-upstream origin main
)
mv "$archive" "$payload/.git/carve-out.tar.gz"

mkdir "$destination"
cp -Rp "$payload/." "$destination/"
payload=$destination
record_action check
(set -C; { printf '%s\t%s\n' "$rib" "$archive_hash"; cat "$scratch/files"; } > "$record")
record_action move
printf 'Moved %s files to %s with Make target %s.\n' "$((count))" "$destination" "$target"
printf 'Record: %s\n' "$record"
