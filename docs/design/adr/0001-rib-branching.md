# ADR 0001 Rib ownership and compatible evolution

## Status

Proposed

## Context

chaOS-seed should evolve like a living organism. Each repository is a
node in the organism's graph. Its rib can deepen independently.
Guardrails and shared contracts provide consistency when changes meet.
chaOS-seed is one nucleus that starts a run through the graph. Other
OS nuclei may emerge and use some of the same nodes.

`codex/runtime-portals` owns the mirrored runtimes. The original
`codex/guardrails` worktree checked out a branch from the same snapshot,
so it carried a full copy of the runtimes and tests. Python and Node.js follow a
shared Gherkin blackboard and exchange workspace data through
[CONTRACT.md](../../../CONTRACT.md).

## Requirements

- A contributor can branch from an existing rib or topic at any depth.
- Each receiving branch accepts changes within its own responsibility.
  Changes to shared agreements receive approval from the affected ribs.
- Each runtime retains its independent test run. A compatibility pass runs
  both native suites and both interoperability runs against the proposed
  merged tree and pinned ribs.
- Compatibility checks identify the exact Git commits or archive digests
  tested. Checking a combination leaves each branch tip in place.
- Contributors can use ordinary Git worktrees and pull requests.

## Options considered

| Option | Benefit | Cost or limitation |
| --- | --- | --- |
| Flat topic names such as `codex/guardrails-linting` | Existing tips and tooling work as-is. | Deep branches become harder to browse, and their names still need a parent convention. |
| Move all tips to terminal names such as `codex/guardrails/tip` | Every level can follow one naming rule. | Renaming existing tips changes references used by contributors and tooling. |
| Use a separate topic namespace and terminal `/tip` names | Existing tips can anchor new topics at any depth. The path describes the expected PR target. | Contributors learn one naming convention and Git ancestry still needs to be set when creating a topic. |
| Give each rib a separate repository | Repository permissions can establish a distinct write boundary. | Shared features and workspace compatibility require cross-repository coordination and versioning. |

## Decision

Use standalone repositories for ribs with separate ownership. Each
node declares the edges to its direct dependencies in its own manifest.
chaOS-seed supplies the project snapshot and shared launcher for its run.
Make targets define the execution contract across repositories. The hook calls
`make guardrails`. Calling Makefiles pass the `make test` command to the
launcher to execute in each extracted rib.
Guardrails delegates to the testing implementation through
`make test` in the project snapshot. Each provider controls its recipe
and dependencies. The gate requires the guardrails and test pins.

The linting subrib is a separate repository called by guardrails before
the test suite. It owns the Python and Node.js lint rules and publishes
one `make test` interface. Guardrails supplies the linting pin in its own
manifest and passes the same project snapshot and scope. The execution
kernel resolves the pins in the caller's manifest.
[Dependency graph](../../coordination/README.md#dependency-graph)

The launcher resolves an exact commit from a sibling repository when
available and fetches that commit over HTTPS otherwise. It runs the
exported files in a temporary directory. A candidate archive can also be
pinned by its SHA-256 digest.

chaOS-seed owns the canonical Gherkin under `test/features/`. The sibling
test rib owns the runner implementations, step definitions, and test
dependencies. Its `make test` target reads the features from the checkout
under test. Any future language-specific children receive the same
canonical feature directory.

The carve-out command derives the rib name from the repository and folder
path. The caller supplies the remote URL. The command validates the first
commit through the folder's Make target, then pushes it before moving
the files. It records the transfer and keeps a snapshot so the
implementation can be restored to the source tree.

Use `codex/ribs/<rib>/<topic>[/<subtopic>...]/tip` for nested topics within
a repository. Examples include `codex/ribs/guardrails/linting/tip` and
`codex/ribs/runtime-portals/java/tip`. The reserved terminal `tip` lets
parent and child refs coexist. Create each topic from its immediate parent
and open its pull request against that parent. [Git worktrees](https://git-scm.com/docs/git-worktree)

Check ownership against the paths proposed for the receiving branch.
Each rib owns its implementation. When two ribs share a contract, both
approve changes to it. The [workflow](../../execution/README.md) describes the
ownership boundaries and review procedure.

The proposed GitHub rollout uses rulesets to require pull requests and
trusted scope and compatibility checks. Until rollout, maintainers apply
the documented review and compatibility procedure.
[GitHub ruleset rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)

Use `git merge-tree --write-tree` within the receiving repository to detect
conflicts. Test the resulting chaOS-seed tree in a disposable detached
worktree with the proposed rib archives pinned in its manifest. When a
topic belongs to another repository, use a candidate archive of that
repository's proposed merge result. The full gate includes both native
suites and both interoperability runs. Test each new combination before a
promotion or pin update.
[Git merge-tree](https://git-scm.com/docs/git-merge-tree)

## Consequences

Ribs can evolve at their own pace while sharing a test contract. A clean Git
merge preview establishes file compatibility within a repository. The
combined suite establishes behavior for the tested commit and archive pins.

Maintainers review pin changes when a rib publishes a revision. A passing
run applies to the exact revisions recorded in the review.
