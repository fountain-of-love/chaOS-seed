# Planning

## Runtime selection

Callers currently select the Python or Node.js hook and CLI directly.
The next design step is to make runtime choice a parameter. chaOS-seed
would resolve the requested implementation and invoke it through a shared
execution interface. Each runtime would adapt its hook and CLI to the
common workspace and behavior contracts.

Once the selection interface is defined, explore carving out the two
runtime implementations as their own ribs. Use the canonical scenarios
and both handoff directions to validate the boundary.
[Shared behavior](../design/README.md#shared-behavior) · [Carve-out workflow](../../scripts/README.md#carve-out-a-folder)

## Compatibility rollout

The project manifest pins the public guardrails and test commits.
The guardrails manifest pins its linting commit.
The full gate has passed with sibling repositories and from a clean
checkout fetching all three commits over HTTPS. [Rib pins](../../scripts/ribs.conf)

Roll out GitHub rulesets for receiving branches once the scope and
compatibility checks can run in CI.

[Compatibility workflow](../execution/README.md#check-compatibility) · [Proposed GitHub enforcement](../execution/README.md#enforce-the-rules-on-github)
