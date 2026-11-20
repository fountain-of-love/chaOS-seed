# Inference

Record findings from real runs and use them to inform later design and
planning decisions.

- **One set of scenarios tests both implementations.** Python and Node.js each passed the 35 native scenarios. Both runners also passed the two handoff directions on the same workspace. The handoff checks exercise one writer at a time. [Interoperability scenario](../../test/features/interoperability.feature)
- **A clean merge is one part of compatibility evidence.** A trial detected a conflicting pair of branches. A clean merged tree then passed linting, both native suites, and both interoperability runs with the selected archives. The review needs the merge result and the gate result. [Compatibility workflow](../execution/README.md#check-compatibility)
- **Commit pins make the source interchangeable.** The full gate passed with local sibling repositories and from a clean checkout fetching all three commits over HTTPS. The launcher used the pinned commits even when the sibling worktrees contained edits. [Compatibility rollout](../planning/README.md#compatibility-rollout)
