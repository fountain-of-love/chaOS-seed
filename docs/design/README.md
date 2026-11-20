# Design

Each repository is a node in the organism's graph. A rib owns its
implementation, direct dependency pins, and the contracts it offers
to callers. A nucleus provides the project context and starts a run.
chaOS-seed fills that role for its own runs. Future nuclei can compose
their own paths through shared nodes using the same contracts.
[ADR 0001 Rib ownership and compatible evolution](adr/0001-rib-branching.md)

## As above, so below

chaOS-seed is conceived as a transcendence of py-crystal-seed. The ambition
is to carry the same principles and functionality to a higher level, from
the structure and guardrails of a Python project to the coordination of
an organism that spans repositories and runtimes.
[py-crystal-seed](https://github.com/fountain-of-love/py-crystal-seed/blob/main/README.md)

Each rib applies explicit contracts and repeatable checks to its own work.
At the level of the organism, shared contracts and compatibility checks
apply that discipline to how the ribs grow together.

## Execution contract

Make targets are the execution contract across repositories. The caller
chooses a target, and the receiving repository owns the recipe. chaOS-seed
invokes the guardrails rib through `make test`. Guardrails uses the same
contract for linting and asks the project snapshot to run its tests.
Each caller supplies its direct dependency pins. The shared launcher
acts as the execution kernel during the run. Each node can call it with
its own manifest to continue the cascade.
[Rib execution](../../scripts/README.md#rib-execution)

## Shared behavior

The canonical Gherkin in chaOS-seed describes the behavior every runtime
must support. Python and Node.js each run the scenarios with their own
tools. The workspace contract lets the runtimes take turns using the same
journal, state, and memory.
[Canonical scenarios](../../test/features/) · [Workspace contract](../../CONTRACT.md)

## Room to grow

Design, coordination, planning, execution, and inference can each later
spiral into their own repositories. For design, the broader chaOS
architecture already has a separate home. [chaOS-blueprint](https://github.com/fountain-of-love/chaOS-blueprint)
