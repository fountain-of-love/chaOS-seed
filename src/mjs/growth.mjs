// Growth follows a rhythm
// At its stages a relation's weight moves up a step; at the counts in between, the
// agent checks what varied. Each count is the sum of the two before it.

function rhythm(first, second, limit) {
  const counts = [];
  for (let [a, b] = [first, second]; a <= limit; [a, b] = [b, a + b]) counts.push(a);
  return counts;
}

const STAGES = [
  [26, "re-seed"],
  [16, "governed"],
  [10, "routine"],
  [4, "noticed"],
  [2, "dance"],
];

// How far a relation has grown.
export function ladderStage(weight) {
  return (STAGES.find(([threshold]) => weight >= threshold) || [0, "none"])[1];
}

// The counts between the stages, where variation is checked: 2, 6, 11 ...
export function isVariationCheck(count) {
  return Number.isInteger(count) && rhythm(2, 6, count).includes(count);
}
