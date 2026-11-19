import test from "node:test";
import assert from "node:assert/strict";

import { buildContext, isReflectionDue, reviewJournal, statedIntent, strengthen } from "../src/spiral.mjs";

const relation = (from, to, weight) => ({ from, type: "follows", to, weight, evidence: [] });

test("the context carries the spiral and only relations that reached noticed", () => {
  const context = buildContext({ relations: [relation("ship it", "run the tests", 4), relation("once", "only", 3)], promptsSinceReflection: 1, reflectEvery: 10 });
  assert.match(context, /intent/i);
  assert.match(context, /ship it → follows → run the tests \(4, noticed\)/);
  assert.doesNotMatch(context, /once/);
  assert.doesNotMatch(context, /Reflection is due|Variation check/);
});

test("reflection is due every N prompts", () => {
  assert.equal(isReflectionDue(9, 10), false);
  assert.equal(isReflectionDue(10, 10), true);
  assert.equal(isReflectionDue(0, 10), false);
  assert.match(buildContext({ relations: [], promptsSinceReflection: 10, reflectEvery: 10 }), /Reflection is due/);
});

test("a variation check comes at its counts and not at others", () => {
  assert.match(buildContext({ relations: [], promptsSinceReflection: 6, reflectEvery: 10 }), /Variation check/);
  assert.doesNotMatch(buildContext({ relations: [], promptsSinceReflection: 7, reflectEvery: 10 }), /Variation check/);
});

test("only the opening intent line of a reply counts", () => {
  assert.equal(statedIntent("intent: tidy the README\n\nDone."), "tidy the README");
  assert.equal(statedIntent("Done.\nintent: quoted later"), null);
  assert.equal(statedIntent(""), null);
});

test("weight counts the distinct events that support a relation, without mutating the original", () => {
  const before = [{ from: "a", type: "follows", to: "b", weight: 1, evidence: ["e-1"] }];
  const ab = { from: "a", type: "follows", to: "b" };
  const after = strengthen(strengthen(before, ab, "e-2", "e-2", "e-1"), { from: "c", type: "follows", to: "d" }, "e-3", "e-4");
  assert.deepEqual(before[0].evidence, ["e-1"]);
  assert.deepEqual(after.map(({ weight, evidence }) => [weight, evidence]), [[2, ["e-1", "e-2"]], [2, ["e-3", "e-4"]]]);
});

test("the review counts prompts per day and verbatim repeats, with their events", () => {
  const prompt = (id, at, text) => ({ id, at, type: "prompt", actor: { role: "person" }, data: { text } });
  const events = [
    prompt("e-0", "2026-11-17T09:00:00.000Z", "old"),
    prompt("e-1", "2026-11-18T09:00:00.000Z", "Run the tests"),
    { id: "e-2", at: "2026-11-18T10:00:00.000Z", type: "reply", actor: { role: "agent" }, data: { text: "ok" } },
    prompt("e-3", "2026-11-19T09:00:00.000Z", "run the tests "),
    prompt("e-4", "2026-11-19T09:05:00.000Z", "something new"),
  ];
  const review = reviewJournal(events, "2026-11-18T00:00:00.000Z");
  assert.equal(review.prompts, 3);
  assert.deepEqual(review.byDay, { "2026-11-18": 1, "2026-11-19": 2 });
  assert.deepEqual(review.repeats, [{ text: "run the tests", count: 2, evidence: ["e-1", "e-3"] }]);
});
