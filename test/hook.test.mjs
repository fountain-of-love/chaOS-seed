import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseFrontmatter } from "../src/formats.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const hook = path.join(here, "..", "hooks", "spiral-hook.mjs");
const sandbox = () => fs.mkdtempSync(path.join(os.tmpdir(), "spiral-hook-"));

function run(root, event, payload, env = {}) {
  return spawnSync(process.execPath, [hook, event], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env },
    encoding: "utf8",
  });
}

const events = (root) =>
  fs.readFileSync(path.join(root, ".spiral", "journal.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const state = (root, key) => parseFrontmatter(fs.readFileSync(path.join(root, ".spiral", "state", `${key}.mdx`), "utf8"));

test("observe: a prompt becomes an event, and the spiral is applied as context", () => {
  const root = sandbox();
  const result = run(root, "UserPromptSubmit", { session_id: "s1", prompt: "Tidy the README" });
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(output.hookSpecificOutput.additionalContext, /intent/i);
  const [event] = events(root);
  assert.equal(event.type, "prompt");
  assert.deepEqual(event.actor, { role: "person", session: "s1" });
  assert.equal(event.data.text, "Tidy the README");
});

test("apply: the counter persists as an MDX state, caused by the event, with a 5W2H body", () => {
  const root = sandbox();
  run(root, "UserPromptSubmit", { prompt: "one" });
  run(root, "UserPromptSubmit", { prompt: "two" });
  const { meta, body } = state(root, "promptsSinceReflection");
  assert.equal(meta.value, 2);
  assert.equal(meta.version, 2);
  assert.equal(meta.cause, events(root)[1].id);
  for (const heading of ["What", "Why", "Who", "Where", "When", "How", "How much"]) assert.match(body, new RegExp(`^## ${heading}$`, "m"));
});

test("apply: the body of a state is never overwritten by the hook", () => {
  const root = sandbox();
  run(root, "UserPromptSubmit", { prompt: "one" });
  const file = path.join(root, ".spiral", "state", "promptsSinceReflection.mdx");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/## What\n.*\n/, "## What\nMy own words.\n"));
  run(root, "UserPromptSubmit", { prompt: "two" });
  assert.match(state(root, "promptsSinceReflection").body, /My own words\./);
});

test("learn: the volume trigger fires and relations that held come back", () => {
  const root = sandbox();
  fs.mkdirSync(path.join(root, ".spiral"));
  fs.writeFileSync(
    path.join(root, ".spiral", "memory.dot"),
    'digraph memory {\n  "person" -> "small steps" [type="prefers", weight=4, evidence="e-1 e-2 e-3 e-4"];\n}\n',
  );
  let last;
  for (let i = 0; i < 3; i += 1) last = run(root, "UserPromptSubmit", { prompt: `p${i}` }, { SPIRAL_REFLECT_EVERY: "3" });
  const context = JSON.parse(last.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /Reflection is due/);
  assert.match(context, /person → prefers → small steps \(4, noticed\)/);
});

test("apply: the reply's stated intent is kept with the reply", () => {
  const root = sandbox();
  run(root, "Stop", { session_id: "s1", last_assistant_message: "intent: tidy the README\n\nDone." });
  const [event] = events(root);
  assert.equal(event.type, "reply");
  assert.equal(event.actor.role, "agent");
  assert.equal(event.data.intent, "tidy the README");
});

test("the hook fails open on bad input", () => {
  const result = run(sandbox(), "UserPromptSubmit", "not json");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});
