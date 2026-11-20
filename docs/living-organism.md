# Living organism

The living organism is a graph. Each repository is a node that owns a
capability and can evolve at its own pace. Shared contracts and guardrails
check how the nodes work together when their changes meet.

chaOS-seed is one OS nucleus in that graph. It starts a cascade through
its direct dependencies. Other nuclei may emerge and start their own
cascades through some of the same nodes.

- [Design](design/README.md) explains the principles, contracts, and architectural decisions.
- [Coordination](coordination/README.md) shows how repositories, branches, and owners connect.
- [Planning](planning/README.md) records priorities and proposed work, including runtime selection.
- [Execution](execution/README.md) provides the steps for branching, review, and compatibility checks.
- [Inference](inference/README.md) records what we learned from running those checks.
