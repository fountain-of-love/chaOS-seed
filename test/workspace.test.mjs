import test from "node:test";
import assert from "node:assert/strict";
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
