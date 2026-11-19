// The spiral, as pure functions.
// Observe controls; Apply saves; Learn analyses.
import { isVariationCheck, ladderStage } from "./growth.mjs";

// Reflection comes at 13, the re-seed; variation checks come between, at 2, 6 and 11.
export const DEFAULT_REFLECT_EVERY = 14;
const LESSONS_SHOWN = 3;

const SPIRAL = [
  "Open your reply with one line `intent: <what the person wants, in one clear sentence>`.",
  "Without repetition, a dance suffices. With repetition, a system emerges; it needs governance.",
];

export function isReflectionDue(promptsSinceReflection, reflectEvery = DEFAULT_REFLECT_EVERY) {
  return promptsSinceReflection > 0 && promptsSinceReflection % reflectEvery === 0;
}

export const describeRelation = ({ from, type, to }) => `${from} → ${type} → ${to}`;

// Only relations that reached "noticed" come back: a dance is not yet a lesson.
export function lessonsFrom(relations, count = LESSONS_SHOWN) {
  return relations
    .filter(({ weight }) => weight >= 4)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count)
    .map((relation) => `${describeRelation(relation)} (${relation.weight}, ${ladderStage(relation.weight)})`);
}

export function buildContext({ relations = [], promptsSinceReflection = 0, reflectEvery = DEFAULT_REFLECT_EVERY }) {
  const lines = [...SPIRAL];
  const lessons = lessonsFrom(relations);
  if (lessons.length > 0) lines.push("Learned here (weight, stage):", ...lessons.map((lesson) => `- ${lesson}`));
  if (isVariationCheck(promptsSinceReflection)) {
    lines.push(
      `Variation check (prompt ${promptsSinceReflection}): name what changed that the structure did not plan for, before you follow the pattern.`,
    );
  }
  if (isReflectionDue(promptsSinceReflection, reflectEvery)) {
    lines.push(
      `Reflection is due (${promptsSinceReflection} prompts since the last one). After this request, offer to run \`spiral reflect\`.`,
    );
  }
  return lines.join("\n");
}

// Only the opening line counts, so an intent quoted later in a reply is never mistaken for one.
export function statedIntent(reply) {
  const first = String(reply || "").trimStart().split("\n", 1)[0].trim().replace(/^`+|`+$/g, "");
  const match = first.match(/^intent:\s*(.+)$/i);
  return match ? match[1].trim() : null;
}

// A relation's weight is the number of distinct events that support it, so a pattern seen
// twice is remembered at weight 2. Citing the same event again adds nothing.
// Strengthening returns a new list; the original is left as it was.
export function strengthen(relations, { from, type, to }, ...evidence) {
  const same = (relation) => relation.from === from && relation.type === type && relation.to === to;
  const current = relations.find(same) || { from, type, to, weight: 0, evidence: [] };
  const added = [...new Set(evidence)].filter((id) => !current.evidence.includes(id));
  const next = { ...current, weight: current.weight + added.length, evidence: [...current.evidence, ...added] };
  return relations.some(same) ? relations.map((relation) => (same(relation) ? next : relation)) : [...relations, next];
}

const normalise = (text) => String(text || "").trim().replace(/\s+/g, " ").toLowerCase();

export function reviewJournal(events, since = null) {
  const prompts = events.filter((event) => event.type === "prompt" && (!since || event.at >= since));
  const byDay = {};
  const groups = new Map();
  for (const { id, at, data } of prompts) {
    const day = String(at).slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
    const key = normalise(data?.text);
    if (key) groups.set(key, [...(groups.get(key) || []), id]);
  }
  const repeats = [...groups]
    .filter(([, ids]) => ids.length > 1)
    .map(([text, ids]) => ({ text, count: ids.length, evidence: ids }))
    .sort((a, b) => b.count - a.count);
  return { prompts: prompts.length, byDay, repeats };
}
