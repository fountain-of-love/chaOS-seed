# Commit checks

Enable the versioned hook for this worktree.

```sh
git config --local extensions.worktreeConfig true
git config --worktree core.hooksPath .githooks
```

Pre-commit calls `make guardrails`. That target asks the launcher to run the
`guardrails` rib against a temporary snapshot of the Git index. The launcher
resolves the pinned revision from [`ribs.conf`](ribs.conf). Each calling
Makefile supplies the command explicitly. Guardrails runs its linting
subrib before calling `make test` in the project snapshot. The linting
subrib owns the separate Python and Node.js rules. The project's `test`
target dispatches the test rib.
Python scope selects Python linting and testing.
The guardrails and test targets require their pins. A failed fetch,
verification, or rib execution blocks the commit.

```sh
make guardrails
CHAOS_TEST_SCOPE=python make guardrails
make test
```

The first two commands test staged files through guardrails. Stage changes
to the Make interface, archive manifest, and canonical features for the
gate to see them. `make test` runs the test rib against working files.

## Archive pins

Each row has four whitespace-separated fields.

1. Rib name, for example `guardrails`.
2. Scope of `shared`, `python`, or `node`.
3. `commit:<full Git commit ID>` for a repository, or the lowercase SHA-256
   digest for a gzip tar archive.
4. HTTPS Git URL for a commit pin, or an HTTPS or `file:///` URL for an
   archive with one top-level directory.

For a commit pin, the launcher looks for a sibling checkout named after
the repository in the URL. It uses the exact commit from that checkout
when available and otherwise fetches that commit over HTTPS. Both paths
run an export of the same commit and clean up the temporary repository
and extracted files. An archive pin verifies the bytes against its digest.

Use `--ribs FILE` to try a manifest explicitly. For a local development
override, set `git config --worktree chaos.ribsManifest /absolute/path/to/manifest`.
The explicit option takes precedence over the local setting and the project
manifest. With `--staged`, relative paths resolve inside the staged snapshot.
`--repo PATH` selects the target checkout.

Each repository lists its direct children in its own manifest. A rib's
Makefile uses `CHAOS_RIB_LAUNCHER` and passes its own manifest with
`--ribs` when delegating. The launcher resolves children from that
manifest and reports missing required pins. These calls follow the
dependency graph from the nucleus that started the run.
[Dependency graph](../docs/coordination/README.md#dependency-graph)

## Rib execution

Every executable rib provides a phony `test` target in its root `Makefile`.
Pass the execution command after `--` when using the launcher directly.
For example, `./scripts/check.sh --staged --rib guardrails --required -- make -f Makefile test`
runs the guardrails target through the launcher.

The target runs in the extracted archive. It receives `CHAOS_CHECKOUT`
for the project snapshot, `CHAOS_SOURCE_CHECKOUT` for the original checkout,
and `CHAOS_TEST_SCOPE` for the selected scope. The rib owns its recipe,
including any build it needs before running checks.

The test rib supplies runner code and reads the canonical Gherkin from
`CHAOS_CHECKOUT/test/features/`. A local manifest configured for the
project also applies when guardrails delegates back to that staged
snapshot. `make test` requires a matching `test` pin. See the
[rib workflow](../docs/execution/README.md).

## Carve out a folder

```sh
remote_url=https://github.com/OWNER/REPOSITORY.git
sh scripts/carve-out.sh --dry-run test "$remote_url"
make carve-out FOLDER=test REMOTE_URL="$remote_url"
make carve-out-undo FOLDER=test
```

Prepare a folder with a Makefile target named after the folder. For a
nested folder such as `tools/audit`, the script uses all path components
for the repository suffix and uses `audit` as the Make target.
An optional `carve-out.keep` lists paths to retain. It takes one relative
shell pattern per line, and `*` can match across directories.

Supply a writable Git remote URL at the start. The script initializes a
new Git repository on `main`, adds `origin`, and commits the selected
working files. It runs the folder's Make target from the committed tree
and pushes `main` before recording the paths and checksums in `carve-out.files`
and removing the originals. It prunes directories that become empty as
files move. A failed check or push leaves the source files in place.
The command also preserves ignored untracked and retained paths and
rejects an existing sibling.

Undo verifies the snapshot in the sibling's `.git/carve-out.tar.gz`,
recreates any needed directories, and restores the originals.
It refuses to overwrite changed source files.
Keep the receipt and snapshot together for recovery.

The test plan keeps the Gherkin under `test/features/`. To connect a carved
rib, pin its archive in a manifest and call the folder's Make target
through the launcher. The test target can also run the in-tree Makefile
before carving or after undo.
