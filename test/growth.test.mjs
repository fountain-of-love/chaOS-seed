import test from "node:test";
import assert from "node:assert/strict";

import { isVariationCheck, ladderStage } from "../src/growth.mjs";

test("weights read on the stages of growth", () => {
  assert.equal(ladderStage(1), "none");
  assert.equal(ladderStage(2), "dance");
  assert.equal(ladderStage(5), "noticed");
  assert.equal(ladderStage(10), "routine");
  assert.equal(ladderStage(25), "governed");
  assert.equal(ladderStage(26), "re-seed");
});

test("variation checks come at their own counts", () => {
  const checks = Array.from({ length: 50 }, (_, n) => n).filter(isVariationCheck);
  assert.deepEqual(checks, [2, 6, 8, 14, 22, 36]);
});
