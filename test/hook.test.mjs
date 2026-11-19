import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseFrontmatter, renderFrontmatter } from "../src/formats.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const hook = path.join(here, "..", "hooks", "spiral-hook.mjs");
const sandbox = () => fs.mkdtempSync(path.join(os.tmpdir(), "spiral-hook-"));

function run(root, event, payload, env = {}) {
  return spawnSync(process.execPath, [hook, event], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, SPIRAL_REFLECT_EVERY: "", SPIRAL_DEBUG: "", ...env },
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

test("apply: updating state preserves the body and custom metadata", () => {
  const root = sandbox();
  run(root, "UserPromptSubmit", { prompt: "one" });
  const file = path.join(root, ".spiral", "state", "promptsSinceReflection.mdx");
  const original = state(root, "promptsSinceReflection");
  const editedBody = original.body + "\nMy own words.\n";
  fs.writeFileSync(file, renderFrontmatter({ ...original.meta, owner: "team" }, editedBody));
  run(root, "UserPromptSubmit", { prompt: "two" });
  const updated = state(root, "promptsSinceReflection");
  assert.equal(updated.meta.value, 2);
  assert.equal(updated.meta.owner, "team");
  assert.equal(updated.body, editedBody);
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
  const result = run(root, "Stop", { session_id: "s1", last_assistant_message: "intent: tidy the README\n\nDone." });
  assert.equal(result.status, 0);
  const [event] = events(root);
  assert.equal(event.type, "reply");
  assert.deepEqual(event.actor, { role: "agent", session: "s1" });
  assert.equal(event.data.intent, "tidy the README");
});

test("the hook fails open on bad input", () => {
  const root = sandbox();
  const result = run(root, "UserPromptSubmit", "not json");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
  assert.equal(fs.existsSync(path.join(root, ".spiral")), false);
  const debug = run(root, "UserPromptSubmit", "not json", { SPIRAL_DEBUG: "1" });
  assert.equal(debug.status, 0);
  assert.equal(debug.stdout, "");
  assert.match(debug.stderr, /spiral-hook:/);
});

test("parallel prompt hooks keep the counter in sync", async (t) => {
  const root = sandbox();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const submit = (index) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hook, "UserPromptSubmit"], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: root, SPIRAL_REFLECT_EVERY: "" },
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 10_000,
    });
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (text) => { output += text; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, output }));
    child.stdin.end(JSON.stringify({ prompt: `prompt ${index}` }));
  });
  const results = [];
  for (const start of [0, 8]) {
    results.push(...await Promise.all(Array.from({ length: 8 }, (_, index) => submit(start + index))));
  }
  assert.deepEqual(results.map(({ status }) => status), Array(16).fill(0));
  assert.equal(events(root).length, 16);
  assert.equal(state(root, "promptsSinceReflection").meta.value, 16);
  assert.equal(results.filter(({ output }) => output.includes("Reflection is due")).length, 1);
});
