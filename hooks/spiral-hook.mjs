#!/usr/bin/env node
// One hook for Claude Code and Codex. Usage: spiral-hook.mjs <UserPromptSubmit|Stop>
// It reads the host's JSON payload on stdin. It always exits 0: the spiral may help,
// it must never block the person.
import { buildContext, DEFAULT_REFLECT_EVERY, statedIntent } from "../src/mjs/spiral.mjs";
import { openWorkspace, reflectEvery, workspaceRoot } from "../src/mjs/workspace.mjs";

const COUNTER = "promptsSinceReflection";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

// Observe journals the prompt as an event; apply persists the counter as a state
// and gives the spiral, with what was learned, back as context.
function onPrompt(workspace, payload, every) {
  const additionalContext = workspace.mutation(() => {
    const event = workspace.appendEvent({ type: "prompt", role: "person", session: payload.session_id, data: { text: payload.prompt || "" } });
    if (!event) throw new Error("The prompt event was refused; see .spiral/rejected.jsonl.");
    const count = workspace.stateValue(COUNTER, 0) + 1;
    const errors = workspace.writeState(COUNTER, count, event.id);
    if (errors.length > 0) throw new Error(`Unable to update ${COUNTER}: ${errors.join("; ")}`);
    return buildContext({ relations: workspace.readRelations(), promptsSinceReflection: count, reflectEvery: every });
  });
  return { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } };
}

// The reply is journaled with the intent it stated.
function onStop(workspace, payload) {
  const text = payload.last_assistant_message || "";
  const data = { intent: statedIntent(text), text };
  workspace.mutation(() => workspace.appendEvent({ type: "reply", role: "agent", session: payload.session_id, data }));
  return null;
}

const handlers = { UserPromptSubmit: onPrompt, Stop: onStop };

try {
  const handler = handlers[process.argv[2]];
  const payload = JSON.parse(await readStdin());
  const output = handler?.(openWorkspace(workspaceRoot()), payload, reflectEvery(process.env, DEFAULT_REFLECT_EVERY));
  if (output) process.stdout.write(JSON.stringify(output));
} catch (error) {
  if (process.env.SPIRAL_DEBUG) process.stderr.write(`spiral-hook: ${error.message}\n`);
}
process.exit(0);
