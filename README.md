# chaOS seed

chaOS exists so that you don’t have to repeat yourself. It learns your routines and preferences, and grows with you.

<p align="center">
  <img src="assets/lisa.png" alt="Hurricane Lisa: a spiral of cloud around a wide, clear eye" width="480">
  <br>
  <sub>Hurricane Lisa near its peak. Image: <a href="https://satlib.cira.colostate.edu">CSU/CIRA &amp; JMA/JAXA</a>, Himawari-9.</sub>
</p>

Chaos is not merely disorder. It is the space from which patterns emerge. Every interaction leaves a trace. Every trace contributes to a state. Every state creates the possibility of new understanding.

chaOS gives coding agents a way to evolve through experience:

Observe - preserve the living trace of every interaction.
Apply - carry accumulated experience into the present.
Learn - discover relations, strengthen connections, and reshape memory.

Like a living system, it does not simply repeat. It adapts.

Observe. Apply. Learn.

From events to memory. From memory to understanding. From understanding to possibility.

## What is it?

A tiny hook that lets a coding agent (Claude Code or Codex) work by a spiral:

- **Observe** controls: every prompt and reply becomes an **event**
  in `.spiral/journal.jsonl`, and each reply keeps its stated `intent:`.
- **Apply** saves: **states** are MDX documents in `.spiral/state/`,
  and the spiral plus what was learned is given to the agent as context.
- **Learn** analyses: every N prompts, or on a schedule, the agent
  reflects and records **relations**, weighted directed vectors, in `.spiral/memory.dot`.

Each record type has required elements; see [CONTRACT.md](CONTRACT.md).

No dependencies; Node 20 or later.

## Where does it's name come from?

chaOS
- cha evokes the spiritual symbolism of life force, sky, destiny and creation.
- OS makes it unmistakably an operating system-like foundation for agent behaviour.
- chaOS itself evokes chaos: the primordial space from which order and complexity emerge.

## Install

Copy this folder into your project as `chaos-seed/`, then add the hook.

**Claude Code** (`.claude/settings.json`):

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/chaos-seed/hooks/spiral-hook.mjs\" UserPromptSubmit", "timeout": 5 }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/chaos-seed/hooks/spiral-hook.mjs\" Stop", "timeout": 5 }] }]
  }
}
```

**Codex** (`.codex/hooks.json`): the same two commands, run from the project folder.
Tested with Claude Code; Codex sends the same payload fields but is not yet tested here.

Optionally link the skill which carries spiral steps on growth:

```bash
ln -s ../../chaos-seed/skill .claude/skills/spiral
```

## Use

```bash
node chaos-seed/bin/spiral.mjs status
node chaos-seed/bin/spiral.mjs review
node chaos-seed/bin/spiral.mjs reflect
node chaos-seed/bin/spiral.mjs reflected
node chaos-seed/bin/spiral.mjs memory
node chaos-seed/bin/spiral.mjs remember "ship it" follows "run the tests" --evidence e-…,e-…
```

- Volume trigger: every 14 prompts by default (`SPIRAL_REFLECT_EVERY`).
- Variation checks: at prompts 2, 6 and 8, between the stages of growth, the hook asks what varied.
- The hook never blocks: on any error it exits 0 silently (`SPIRAL_DEBUG=1` to see why).
- Add `.spiral/journal.jsonl` to `.gitignore` if your prompts are private.

## Reflect on a schedule too

The hook reflects on volume; a scheduled job reflects on time, so a quiet week still
reflects once. Schedule this prompt in your agent (for example *"every weekday at 18:00"*
in Claude Code, or a cron entry running `claude -p` or `codex exec` in the project):

> Run `node chaos-seed/bin/spiral.mjs reflect` and follow what it prints.
> If there were no prompts since the last reflection, say so and stop.

Both end with `spiral reflected`, so they never double-count.

## Make it yours

[CONTRACT.md](CONTRACT.md) and [templates/state.mdx](templates/state.mdx) live in your
copy. Reshape them when your work asks for it.

## Inspiration: automate with what already exists

Before building a routine yourself (step 6 of the spiral, System), look at what others have
already shared. These sources regularly post open-source projects you can use as they
are, or learn from:

- [alindnbrg on LinkedIn](https://www.linkedin.com/in/alindnbrg/recent-activity/all/)

**If you are not technical:** open the link in your own browser (LinkedIn asks you to
sign in), find a post that matches something you keep repeating, and paste it into the
chat with your agent. Then ask: *"Could this automate what I keep asking you for? What
would it take?"* The agent cannot open LinkedIn on its own, so your paste is the bridge.

## Licence

Fountain of Love License v2.0, dual with CC BY-NC-SA 4.0. See [LICENSE.md](LICENSE.md)
and [NOTICE.md](NOTICE.md).
