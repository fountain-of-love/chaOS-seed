import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseDot, parseFrontmatter } from "../src/formats.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "..", "bin", "spiral.mjs");
const spiral = (root, ...args) =>
  spawnSync(process.execPath, [cli, ...args], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: "utf8" });

function seed() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spiral-cli-"));
  fs.mkdirSync(path.join(root, ".spiral", "state"), { recursive: true });
  const lines = ["run the tests", "Run the tests", "ship it"].map((text, i) =>
    JSON.stringify({ id: `e-${i}`, at: `2026-11-18T09:0${i}:00.000Z`, type: "prompt", actor: { role: "person" }, data: { text } }),
  );
  fs.writeFileSync(path.join(root, ".spiral", "journal.jsonl"), lines.join("\n") + "\n");
  fs.writeFileSync(
    path.join(root, ".spiral", "state", "promptsSinceReflection.mdx"),
    '---\nkey: "promptsSinceReflection"\nvalue: 3\nat: "2026-11-18T09:02:00.000Z"\ncause: "e-2"\nversion: 3\n---\n',
  );
  return root;
}

const readState = (root, key) =>
  parseFrontmatter(fs.readFileSync(path.join(root, ".spiral", "state", `${key}.mdx`), "utf8")).meta;
const readMemory = (root) => parseDot(fs.readFileSync(path.join(root, ".spiral", "memory.dot"), "utf8")).relations;

test("review shows prompts and repeats, with the events", () => {
  const result = spiral(seed(), "review");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /3 prompts/);
  assert.match(result.stdout, /2× run the tests \(e-0 e-1\)/);
});

test("reflect asks for relations", () => {
  const result = spiral(seed(), "reflect");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /run the tests/);
  assert.match(result.stdout, /spiral remember/);
  assert.match(result.stdout, /spiral reflected/);
});

test("reflected is an event that sets the counter to 0 and registers the moment", () => {
  const root = seed();
  assert.equal(spiral(root, "reflected").status, 0);
  const counter = readState(root, "promptsSinceReflection");
  const moment = readState(root, "lastReflectionAt");
  assert.equal(counter.value, 0);
  assert.equal(counter.version, 4);
  assert.equal(counter.cause, moment.cause);
  assert.ok(moment.value);
  assert.match(spiral(root, "review").stdout, /0 prompts/);
});

test("remember incements a relation with evidence, and memory reads it back", () => {
  const root = seed();
  assert.equal(spiral(root, "remember", "ship it", "follows", "run the tests", "--evidence", "e-0,e-1").status, 0);
  assert.equal(spiral(root, "remember", "ship it", "follows", "run the tests").status, 0);
  const [relation] = readMemory(root);
  assert.equal(relation.weight, 3, "two cited events plus the remember event");
  assert.equal(relation.evidence.length, 3);
  assert.match(spiral(root, "memory").stdout, /3\s+ship it → follows → run the tests \(dance\)/);
});

test("remember refuses a relation that breaks the contract, before writing anything", () => {
  const root = seed();
  const result = spiral(root, "remember", "a", "Not A Type", "b");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /type/);
  const journal = fs.readFileSync(path.join(root, ".spiral", "journal.jsonl"), "utf8");
  assert.doesNotMatch(journal, /"remember"/, "a refused relation leaves no event behind");
});

test("status reports the counter and the trigger", () => {
  assert.match(spiral(seed(), "status").stdout, /3 of 14 prompts/);
});
