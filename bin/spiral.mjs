#!/usr/bin/env node
// Learn reflects the mind and remembers.
//   spiral status                             the counter and the trigger
//   spiral review                             prompts per day and repeats since the last reflection
//   spiral reflect                            the reflection prompt, with the review as its input
//   spiral reflected                          mark a reflection done (resets the counter)
//   spiral memory                             the learned relations, strongest first
//   spiral remember <from> <type> <to> [--evidence e-1,e-2]
//                                             strengthen a relation by one
import { validateRelation } from "../src/contract.mjs";
import { DEFAULT_REFLECT_EVERY, describeRelation, reviewJournal, strengthen } from "../src/spiral.mjs";
import { ladderStage } from "../src/growth.mjs";
import { openWorkspace, reflectEvery, workspaceRoot } from "../src/workspace.mjs";

// A mistake in how the command was used: reported plainly, never as a stack trace.
class UsageError extends Error {}

const COUNTER = "promptsSinceReflection";
const MOMENT = "lastReflectionAt";

const workspace = openWorkspace(workspaceRoot());
const every = reflectEvery(process.env, DEFAULT_REFLECT_EVERY);

function formatReview() {
  const since = workspace.stateValue(MOMENT, null);
  const review = reviewJournal(workspace.readEvents(), since);
  const lines = [`${review.prompts} prompts ${since ? `since ${since}` : "since the start"}.`];
  for (const [day, count] of Object.entries(review.byDay)) lines.push(`  ${day}: ${count}`);
  if (review.repeats.length > 0) {
    lines.push("Repeated verbatim:");
    for (const { text, count, evidence } of review.repeats) lines.push(`  ${count}× ${text} (${evidence.join(" ")})`);
  }
  return lines.join("\n");
}

function remember(args) {
  const [from, type, to] = args;
  if (!from || !type || !to) throw new UsageError("Use: spiral remember <from> <type> <to> [--evidence e-1,e-2]");
  const shapeErrors = validateRelation({ from, type, to, weight: 1, evidence: [] });
  if (shapeErrors.length > 0) throw new UsageError(`Refused by the contract: ${shapeErrors.join("; ")}`);
  const flag = args.indexOf("--evidence");
  let evidence = flag >= 0 ? String(args[flag + 1] || "").split(",").filter(Boolean) : [];
  if (evidence.length === 0) {
    const event = workspace.appendEvent({ type: "remember", role: "tool", data: { from, type, to } });
    if (!event) throw new UsageError("The remember event was refused; see .spiral/rejected.jsonl.");
    evidence = [event.id];
  }
  const errors = workspace.writeRelations(strengthen(workspace.readRelations(), { from, type, to }, ...evidence));
  if (errors.length > 0) throw new UsageError(`Refused by the contract: ${errors.join("; ")}`);
  const relation = workspace.readRelations().find((r) => r.from === from && r.type === type && r.to === to);
  return `${describeRelation(relation)}: weight ${relation.weight} (${ladderStage(relation.weight)}).`;
}

const commands = {
  status: () =>
    `${workspace.stateValue(COUNTER, 0)} of ${every} prompts before reflection is due. Last reflection: ${workspace.stateValue(MOMENT, "never")}.`,

  review: formatReview,

  reflect: () =>
    [
      "Reflect on the work since the last reflection.",
      "",
      formatReview(),
      "",
      `Read the journal (${workspace.journalPath}) where the review is not enough.`,
      "Ask: what did the person have to repeat? What did I misread (compare each reply's intent with its prompt)? What should I do without being asked next time?",
      "Ask about variation too: what varied, and is that variation emergence to keep or drift to correct?",
      "Record each finding as a directed relation, with the events that support it:",
      '  spiral remember "<from>" <verb> "<to>" --evidence e-…,e-…',
      "Use a lowercase verb such as follows, prefers, means or avoids. A relation weighs as many distinct events as support it.",
      "Repetition is evidence, not a verdict: only relations with weight 4 or more are given back as lessons.",
      "Then run `spiral reflected`.",
    ].join("\n"),

  reflected: () => {
    const event = workspace.appendEvent({ type: "reflection", role: "tool", data: {} });
    if (!event) throw new UsageError("The reflection event was refused; see .spiral/rejected.jsonl.");
    workspace.writeState(COUNTER, 0, event.id);
    workspace.writeState(MOMENT, event.at, event.id);
    return "Reflection marked. The counter starts again.";
  },

  memory: () => {
    const relations = [...workspace.readRelations()].sort((a, b) => b.weight - a.weight);
    if (relations.length === 0) return "Nothing learned yet.";
    return relations.map((r) => `${String(r.weight).padStart(3)}  ${describeRelation(r)} (${ladderStage(r.weight)})`).join("\n");
  },

  remember: () => remember(process.argv.slice(3)),
};


const command = commands[process.argv[2] || "status"];
if (!command) {
  process.stderr.write(`Unknown command. Use: ${Object.keys(commands).join(" | ")}\n`);
  process.exit(1);
}
try {
  process.stdout.write(command() + "\n");
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  process.stderr.write(error.message + "\n");
  process.exit(1);
}
