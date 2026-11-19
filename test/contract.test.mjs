import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { EVENT_FIELDS, RELATION_FIELDS, STATE_FIELDS, validateEvent, validateRelation, validateState } from "../src/contract.mjs";

const event = { id: "e-1a2b-c3d4", at: "2026-11-19T09:00:00.000Z", type: "prompt", actor: { role: "person", session: "s1" }, data: { text: "hi" } };
const state = { key: "promptsSinceReflection", value: 3, at: "2026-11-19T09:00:00.000Z", cause: "e-1a2b-c3d4", version: 1 };
const relation = { from: "ship it", type: "follows", to: "run the tests", weight: 2, evidence: ["e-1", "e-2"] };

test("each record type has required elements, as CONTRACT.md says", () => {
  const page = fs.readFileSync(new URL("../CONTRACT.md", import.meta.url), "utf8");
  for (const [fields, record] of [[EVENT_FIELDS, "event"], [STATE_FIELDS, "state"], [RELATION_FIELDS, "relation"]]) {
    const row = page.split("\n").find((line) => line.includes(`| ${record}:`));
    const documented = row.split("|").at(-2).match(/`([^`]+)`/g).map((name) => name.slice(1, -1));
    assert.equal(fields.length, 5);
    assert.deepEqual(documented, fields, `CONTRACT.md drifted from the validator for ${record}`);
  }
});

test("valid records pass, and unknown fields are allowed", () => {
  assert.deepEqual(validateEvent({ ...event, mood: "calm" }), []);
  assert.deepEqual(validateState(state), []);
  assert.deepEqual(validateRelation({ ...relation, extra: { colour: "red" } }), []);
});

test("invalid records say what is wrong", () => {
  assert.ok(validateEvent({ ...event, actor: { role: "robot" } }).some((e) => /actor\.role/.test(e)));
  assert.ok(validateEvent({ at: event.at }).includes("missing id"));
  assert.ok(validateState({ ...state, key: "../escape" }).some((e) => /key/.test(e)));
  assert.ok(validateState({ ...state, version: 0 }).some((e) => /version/.test(e)));
  assert.ok(validateRelation({ ...relation, weight: Number.NaN }).some((e) => /weight/.test(e)));
  assert.ok(validateRelation({ ...relation, evidence: "e-1" }).some((e) => /evidence/.test(e)));
});
