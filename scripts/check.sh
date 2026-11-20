#!/bin/sh
set -eu

usage() {
  printf 'Usage: %s [--repo PATH] [--staged] [--scope all|python] [--ribs FILE] [--rib NAME] [--required] -- COMMAND [ARG ...]\n' "$0"
  printf '%s\n' '  --repo PATH  Select the checkout to pass to the ribs.'
  printf '%s\n' '  --staged     Pass a snapshot of the selected checkout’s Git index.'
  printf '%s\n' '  --scope      Select all ribs or Python and shared ribs. Defaults to all.'
  printf '%s\n' '  --ribs FILE  Read pins from this manifest.'
  printf '%s\n' '  --rib NAME   Invoke one named rib from the manifest.'
  printf '%s\n' '  --required   Fail if the named rib is missing for the selected scope.'
  printf '%s\n' '  -- COMMAND   Run this command in each selected, extracted rib.'
}

usage_error() {
  printf '%s\n' "$1" >&2
  usage >&2
  exit 2
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

extract_commit() (
  commit=$1
  repository_url=${2%/}
  repository=${repository_url##*/}
  repository=${repository%.git}

  case "$commit" in
    *[!a-f0-9]*) fail "$rib_name requires a lowercase Git commit ID." ;;
  esac
  [ "${#commit}" -eq 40 ] || fail "$rib_name requires a full Git commit ID."
  case "$repository_url" in
    https://*) ;;
    *) fail "$rib_name requires an HTTPS Git URL for commit pins." ;;
  esac
  case "$repository" in
    ''|.|..|*[!a-zA-Z0-9_.-]*) fail "Invalid Git repository name for $rib_name." ;;
  esac

  git_variables=$(git rev-parse --local-env-vars)
  unset $git_variables
  git init --quiet --bare --template= git-source
  sibling=${CHAOS_SOURCE_CHECKOUT%/*}/$repository
  if [ -e "$sibling/.git" ] &&
    git -C git-source -c protocol.allow=never -c protocol.file.allow=always \
      fetch --quiet --no-tags --depth=1 "$sibling" "$commit" 2>/dev/null; then
    printf 'Using local %s at %s.\n' "$rib_name" "$commit"
  else
    printf 'Fetching %s at %s over HTTPS.\n' "$rib_name" "$commit"
    GIT_TERMINAL_PROMPT=0 git -C git-source -c protocol.allow=never -c protocol.https.allow=always \
      fetch --quiet --no-tags --depth=1 "$repository_url" "$commit" ||
      fail "Could not fetch the pinned commit for $rib_name."
  fi
  [ "$(git -C git-source rev-parse 'FETCH_HEAD^{commit}')" = "$commit" ] ||
    fail "Fetched commit does not match the pin for $rib_name."
  git -C git-source archive --format=tar "$commit" > rib.tar
  tar -xf rib.tar -C checkout
)

extract_archive() {
  expected_digest=$1
  archive_url=$2
  case "$archive_url" in
    https://*|file:///*) ;;
    *) fail "$rib_name requires an HTTPS or local file archive URL." ;;
  esac
  case "$expected_digest" in
    *[!a-f0-9]*) fail "$rib_name requires a lowercase SHA-256 digest." ;;
  esac
  [ "${#expected_digest}" -eq 64 ] || fail "$rib_name requires a 64-character SHA-256 digest."

  curl --disable --fail --silent --show-error --location --proto '=https,file' --proto-redir '=https' \
    --connect-timeout 10 --max-time 120 --output rib.tar.gz -- "$archive_url" ||
    fail "Could not download archive for $rib_name."

  if command -v sha256sum >/dev/null 2>&1; then
    checksum=$(sha256sum rib.tar.gz)
  else
    checksum=$(shasum -a 256 rib.tar.gz)
  fi
  [ "${checksum%% *}" = "$expected_digest" ] || fail "Archive checksum mismatch for $rib_name."

  tar -xzf rib.tar.gz --strip-components 1 -C checkout
}

run_rib() (
  rib_name=$1
  pin=$2
  source_url=$3
  shift 3

  printf 'Checking rib %s (%s)\n' "$rib_name" "$CHAOS_TEST_SCOPE"
  scratch=$(mktemp -d "${TMPDIR:-/tmp}/chaos-rib.XXXXXX")
  trap 'rm -rf "$scratch"' 0
  trap 'exit 1' HUP INT TERM
  cd "$scratch"
  mkdir checkout
  case "$pin" in
    commit:*) extract_commit "${pin#commit:}" "$source_url" ;;
    *) extract_archive "$pin" "$source_url" ;;
  esac
  cd checkout
  "$@"
)

run_ribs() {
  manifest_file=$1
  shift
  matched=false
  while read -r rib_name rib_scope pin url extra <&3 || [ -n "$rib_name" ]; do
    case "$rib_name" in
      ''|\#*) continue ;;
    esac
    if [ -n "$selected_rib" ] && [ "$rib_name" != "$selected_rib" ]; then
      continue
    fi
    [ -n "$url" ] && [ -z "$extra" ] || fail "Expected four fields for $rib_name in $manifest_file."
    case "$rib_scope" in
      shared|python|node) ;;
      *) fail "Unknown scope for $rib_name in $manifest_file. Use shared, python, or node." ;;
    esac
    case "$CHAOS_TEST_SCOPE:$rib_scope" in
      all:*|python:shared|python:python)
        matched=true
        run_rib "$rib_name" "$pin" "$url" "$@" 3<&-
        ;;
    esac
  done 3< "$manifest_file"
}

target=
staged=false
scope=${CHAOS_TEST_SCOPE:-all}
manifest=
selected_rib=
required=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo)
      [ "$#" -ge 2 ] && [ -n "$2" ] || usage_error 'Expected a path after --repo.'
      target=$2
      shift 2
      ;;
    --staged)
      staged=true
      shift
      ;;
    --scope)
      [ "$#" -ge 2 ] || usage_error 'Expected a scope after --scope.'
      case "$2" in
        all|python) scope=$2 ;;
        *) usage_error 'Expected all or python after --scope.' ;;
      esac
      shift 2
      ;;
    --ribs)
      [ "$#" -ge 2 ] && [ -n "$2" ] || usage_error 'Expected a manifest path after --ribs.'
      manifest=$2
      shift 2
      ;;
    --rib)
      [ "$#" -ge 2 ] && [ -n "$2" ] || usage_error 'Expected a rib name after --rib.'
      selected_rib=$2
      shift 2
      ;;
    --required)
      required=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      usage_error "Unknown option: $1"
      ;;
  esac
done

[ "$#" -gt 0 ] && [ -n "$1" ] || usage_error 'Provide an execution command after --.'
[ "$required" = false ] || [ -n "$selected_rib" ] || usage_error 'Use --required with --rib NAME.'

case "$scope" in
  all|python) ;;
  *) usage_error 'CHAOS_TEST_SCOPE must be all or python.' ;;
esac

launcher_directory=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
target=${target:-"$launcher_directory/.."}
if ! checkout_root=$(CDPATH= cd -- "$target" && pwd -P); then
  usage_error "Cannot open checkout: $target"
fi

git_variables=
if command -v git >/dev/null 2>&1; then
  git_variables=$(git rev-parse --local-env-vars)
  caller_context=$(git rev-parse --show-toplevel --absolute-git-dir 2>/dev/null || true)
  target_context=$(
    unset $git_variables
    git -C "$checkout_root" rev-parse --show-toplevel --absolute-git-dir 2>/dev/null || true
  )
  # Keep Git's active index for an in-repository hook, including partial commits.
  if [ -z "$target_context" ] || [ "$target_context" != "$caller_context" ]; then
    unset $git_variables
  fi
fi
cd "$checkout_root"

configured_manifest=
if [ "$checkout_root" = "${CHAOS_CHECKOUT:-}" ]; then
  configured_manifest=${CHAOS_RIBS_MANIFEST:-}
fi
if [ -z "$configured_manifest" ] && [ -n "${target_context:-}" ]; then
  configured_manifest=$(git config --worktree --get chaos.ribsManifest 2>/dev/null || true)
fi
manifest=${manifest:-$configured_manifest}

if [ "$staged" = true ]; then
  if ! git_root=$(git rev-parse --show-toplevel 2>/dev/null) || [ "$git_root" != "$checkout_root" ]; then
    usage_error "--staged requires a Git worktree root: $checkout_root"
  fi
  snapshot=$(mktemp -d "${TMPDIR:-/tmp}/chaos-seed-test.XXXXXX")
  trap 'rm -rf "$snapshot"' 0
  trap 'exit 1' HUP INT TERM
  git checkout-index --all --ignore-skip-worktree-bits --prefix="$snapshot/"
  cd "$snapshot"
  unset $git_variables
fi

export CHAOS_TEST_SCOPE="$scope"
if [ "$checkout_root" != "${CHAOS_CHECKOUT:-}" ]; then
  CHAOS_SOURCE_CHECKOUT=$checkout_root
fi
export CHAOS_CHECKOUT="$(pwd -P)"
export CHAOS_SOURCE_CHECKOUT="${CHAOS_SOURCE_CHECKOUT:-$checkout_root}"
export CHAOS_RIB_LAUNCHER="$launcher_directory/${0##*/}"
export CHAOS_RIBS_MANIFEST="$configured_manifest"

if [ -n "$manifest" ]; then
  [ -f "$manifest" ] || fail "Cannot find rib manifest: $manifest"
elif [ -f scripts/ribs.conf ]; then
  manifest=$CHAOS_CHECKOUT/scripts/ribs.conf
fi

matched=false
if [ -n "$manifest" ]; then
  run_ribs "$manifest" "$@"
fi
if [ "$matched" = false ] && [ -n "$selected_rib" ]; then
  message="No $selected_rib rib configured for scope $CHAOS_TEST_SCOPE."
  [ "$required" = false ] || fail "$message"
  printf '%s\n' "$message"
fi
