import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { openWorkspace } from "../src/workspace.mjs";

test("an event the contract refuses is not journaled, and the refusal is kept", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spiral-workspace-"));
  const workspace = openWorkspace(root);
  assert.equal(workspace.appendEvent({ type: "prompt", role: "robot", data: { text: "hi" } }), null);
  assert.deepEqual(workspace.readEvents(), []);
  const [rejected] = fs.readFileSync(path.join(root, ".spiral", "rejected.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(rejected.kind, "event");
  assert.match(rejected.errors.join(" "), /actor\.role/);
});

test("a workspace accepts writes after its lock owner exits unexpectedly", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spiral-workspace-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const module = JSON.stringify(new URL("../src/workspace.mjs", import.meta.url).href);
  const script = `import { openWorkspace } from ${module};
    openWorkspace(process.cwd()).mutation(() => process.exit(0));`;
  const owner = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: root, timeout: 10_000 });
  assert.equal(owner.status, 0);
  const workspace = openWorkspace(root);
  const event = workspace.mutation(() => workspace.appendEvent({ type: "prompt", role: "person", data: { text: "hi" } }));
  assert.deepEqual(workspace.readEvents(), [event]);
});
