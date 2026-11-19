import test from "node:test";
import assert from "node:assert/strict";

import { parseDot, parseFrontmatter, renderDot, renderFrontmatter } from "../src/formats.mjs";

test("MDX frontmatter round-trips and leaves the body untouched", () => {
  const body = "\n## What\nThe counter.\n";
  const text = renderFrontmatter({ key: "count", value: 3, at: "2026-11-19T09:00:00.000Z", cause: "e-1", version: 2 }, body);
  assert.match(text, /^---\nkey: "count"\nvalue: 3\n/);
  const { meta, body: back } = parseFrontmatter(text);
  assert.deepEqual(meta, { key: "count", value: 3, at: "2026-11-19T09:00:00.000Z", cause: "e-1", version: 2 });
  assert.equal(back, body);
});

test("frontmatter written by hand in plain YAML is read too", () => {
  const { meta } = parseFrontmatter("---\nkey: mood\nvalue: calm\nversion: 1\nat: null\n---\nfree text\n");
  assert.deepEqual(meta, { key: "mood", value: "calm", version: 1, at: null });
});

test("DOT relations round-trip as weighted directed vectors, quotes included", () => {
  const relations = [
    { from: 'say "ship it"', type: "follows", to: "run the \\tests", weight: 2, evidence: ["e-1", "e-2"] },
    { from: "person", type: "prefers", to: "small steps", weight: 5, evidence: ["e-3"], extra: { colour: "red" } },
  ];
  const text = renderDot(relations);
  assert.match(text, /^digraph memory \{\n/);
  assert.match(text, /"person" -> "small steps" \[type="prefers", weight=5/);
  assert.deepEqual(parseDot(text), { relations, skipped: [] });
});

test("an edge line that cannot be read is reported, not guessed", () => {
  const { relations, skipped } = parseDot('digraph memory {\n  a -> b;\n}\n');
  assert.deepEqual(relations, []);
  assert.deepEqual(skipped, ["a -> b;"]);
});
