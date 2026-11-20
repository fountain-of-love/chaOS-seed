# Execution

Use this workflow to develop topics inside a rib, route shared changes,
and test a proposed combination of repositories. The
[architecture decision](../design/adr/0001-rib-branching.md) records the reasons and
options.

## Start a topic

Git stores branch names as refs. An existing `codex/guardrails` ref occupies
the name that would be needed as a directory for `codex/guardrails/linting`.
The topic namespace gives each depth a terminal `tip` ref and leaves room
for its children. Create guardrail topics in the standalone guardrails
repository and runtime topics in chaOS-seed.

```text
codex/ribs/guardrails/linting/tip              guardrails topic
codex/ribs/guardrails/linting/ruff/tip         child of linting
codex/runtime-portals                         receiving tip
codex/ribs/runtime-portals/java/tip           child of codex/runtime-portals
```

Create a worktree from the actual parent. The names help people route
changes. The last argument sets the Git ancestry.
[Git worktree add](https://git-scm.com/docs/git-worktree#_commands)

```sh
git worktree add -b codex/ribs/guardrails/linting/tip ../chaOS-seed-linting main
git worktree add -b codex/ribs/runtime-portals/java/tip ../chaOS-seed-java codex/runtime-portals
git worktree add -b codex/ribs/guardrails/linting/ruff/tip ../chaOS-seed-ruff codex/ribs/guardrails/linting/tip
```

Run the guardrails examples in its repository once it has a `main` commit.
The third command assumes the linting topic already exists. Send each
topic’s PR to its immediate parent when review begins.

## Review the change scope

A runtime topic can add language-specific implementation and test adapters
in the owning repository. Route changes to shared behavior, Make interfaces,
and the definition of what passes the gate to the affected ribs. Put those
changes in a dedicated PR or commit and record both approvals when two
ribs share the contract. Assign new or unclear paths in review before promotion.
[Path ownership](../coordination/README.md#path-ownership)

Inspect the changes introduced by the topic using the receiving tip and
candidate SHA. Check both paths of a rename as a removal and an addition.
Use the receiving tip’s approved scope rules for the decision.

```sh
git diff --name-status --no-renames "$receiving_sha...$candidate_sha"
```

## Check compatibility

### Preview and materialize the branch merge

In the repository receiving the topic, set `receiving_sha` and
`candidate_sha` to the commits under review. Check the merge for
conflicts. For a clean merge, use the resulting tree to create a trial
commit and open it in a detached worktree.

```sh
trial_dir=../chaOS-seed-trial
(
  set -eu
  merge_tree=$(git merge-tree --write-tree "$receiving_sha" "$candidate_sha") || {
    printf '%s\n' "$merge_tree" >&2
    exit 1
  }
  trial_sha=$(git commit-tree "$merge_tree" -p "$receiving_sha" -p "$candidate_sha" -m "Compatibility trial")
  git worktree add --detach "$trial_dir" "$trial_sha"
)
```

The detached checkout supplies the exact merged tree to the gate.
For a proposal in a rib repository, use the same preview there and
prepare a candidate rib archive from its trial tree. For a linting
change, use a guardrails candidate archive whose manifest pins that
linting archive. [Merge tree](https://git-scm.com/docs/git-merge-tree) ·
[Trial commit](https://git-scm.com/docs/git-commit-tree) ·
[Detached worktree](https://git-scm.com/docs/git-worktree)

### Run the repository combination

Use the detached chaOS-seed merge worktree for a chaOS-seed branch
proposal. When only a rib is changing, start a detached chaOS-seed
worktree at the runtime commit under review with
`git worktree add --detach "$trial_dir" "$runtime_sha"`.
Stage the candidate commit or archive pins in `scripts/ribs.conf` and run the
full gate from that worktree.

```sh
# Update scripts/ribs.conf in the trial checkout with the candidate pins.
git -C "$trial_dir" add scripts/ribs.conf
CHAOS_TEST_SCOPE=all make -C "$trial_dir" guardrails
```

Record a pass when the pinned guardrails, linting, both native suites, and
both interoperability runs have executed successfully. Record the
receiving and candidate SHAs, trial tree or runtime SHA, and the commit
or archive digest for each rib, including the linting pin. Repeat the check
when a candidate, receiving tip, or pin changes.

Restore the manifest in the trial checkout and remove the worktree after
testing.

```sh
git -C "$trial_dir" restore --staged --worktree -- scripts/ribs.conf
git worktree remove "$trial_dir"
```

A consumer can select only Python and shared checks from the test rib. See the
[launcher instructions](../../scripts/README.md) for the manifest and scope.

## Enforce the rules on GitHub

The pre-commit hook gives local test feedback. The proposed GitHub rollout
uses rulesets on receiving tips to require PRs and passing scope and
compatibility checks. Reviewers apply the workflow before that rollout.
The scope check reads the trusted receiving branch’s policy and inspects
PR paths. Run contribution code in the compatibility job with read-only
permissions and no secrets. A contributor should need an approved policy
change to change the rules that judge their work.
[GitHub branch rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) ·
[GitHub workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)

Use `CODEOWNERS` to route review. For shared changes, record approval from
each rib explicitly. GitHub accepts one owner’s approval when several
owners share a path, so the shared approval procedure needs its own check
or a maintainer’s review.
[GitHub code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
