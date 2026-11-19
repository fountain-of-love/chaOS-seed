import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Given, Then, When } from "@cucumber/cucumber";
import { repository } from "../support/world.mjs";

Given("these example records:", function (document) {
  this.records = JSON.parse(document);
});

Then("the runtime has no external application imports", async function () {
  assert.deepEqual(await this.probe("externalImports"), []);
});

Then("the required fields of each record match CONTRACT.md", async function () {
  const lines = fs.readFileSync(path.join(repository, "CONTRACT.md"), "utf8").split("\n");
  const fields = await this.probe("recordFields");
  for (const kind of ["event", "state", "relation"]) {
    const row = lines.find((line) => line.includes(`| ${kind}:`));
    const documented = Array.from(row.split("|").at(-2).matchAll(/`([^`]+)`/g), (match) => match[1]);
    assert.equal(fields[kind].length, 5, kind);
    assert.deepEqual(fields[kind], documented, kind);
  }
});

Then("these extensions are accepted:", async function (table) {
  const cases = table.hashes();
  const requests = cases.map(({ record, "extra fields": extra }) => [
    "validate", record, { ...this.records[record], ...JSON.parse(extra) },
  ]);
  const results = await this.probeMany(requests);
  for (const [index, { record }] of cases.entries()) assert.deepEqual(results[index], [], record);
});

Then("these invalid records are explained:", async function (table) {
  const cases = table.hashes();
  const requests = cases.map(({ record, change }) => {
    const { remove = [], ...fields } = JSON.parse(change);
    const example = { ...this.records[record], ...fields };
    for (const key of remove) delete example[key];
    return ["validate", record, example, fields.weight === "NaN"];
  });
  const results = await this.probeMany(requests);
  for (const [index, { error }] of cases.entries()) {
    assert.ok(results[index].some((message) => message.includes(error)), `Expected ${error} in ${results[index]}`);
  }
});

Given("these state details:", function (document) {
  this.stateDetails = JSON.parse(document);
});

Given("these relations:", function (document) {
  this.relations = JSON.parse(document);
});

When("I render the state", async function () {
  this.rendered = await this.probe("renderFrontmatter", this.stateDetails.meta, this.stateDetails.body);
});

When("I render the memory graph", async function () {
  this.rendered = await this.probe("renderDot", this.relations);
});

Then("the rendered text starts with:", function (prefix) {
  assert.ok(this.rendered.startsWith(prefix), this.rendered);
});

Then("the rendered text contains:", function (part) {
  assert.ok(this.rendered.includes(part), this.rendered);
});

Then("reading the rendered state returns the original metadata and body", async function () {
  assert.deepEqual(await this.probe("parseFrontmatter", this.rendered), this.stateDetails);
});

Then("reading the rendered graph returns the original relations", async function () {
  assert.deepEqual(await this.probe("parseDot", this.rendered), { relations: this.relations, skipped: [] });
});

When("I read this state document:", async function (document) {
  this.value = await this.probe("parseFrontmatter", document);
});

When("I read this memory graph:", async function (document) {
  this.value = await this.probe("parseDot", document);
});

Then("the result is:", function (document) {
  assert.deepEqual(this.value, JSON.parse(document));
});

Then("weights produce these growth stages:", async function (table) {
  const cases = table.hashes();
  const stages = await this.probeMany(cases.map(({ weight }) => ["ladderStage", Number(weight)]));
  assert.deepEqual(stages, cases.map(({ stage }) => stage));
});

Then("the variation checks from prompt {int} through {int} occur at {string}", async function (start, end, expected) {
  const counts = Array.from({ length: end - start + 1 }, (_, index) => index + start);
  const checks = await this.probeMany(counts.map((count) => ["isVariationCheck", count]));
  assert.deepEqual(counts.filter((_, index) => checks[index]), expected.split(",").map(Number));
});

When("I build context after {int} prompts with a reflection interval of {int}", async function (count, interval) {
  this.context = await this.probe("buildContext", {
    relations: this.relations,
    promptsSinceReflection: count,
    reflectEvery: interval,
  });
});

Then("the context mentions {string}", function (part) {
  assert.ok(this.context.includes(part), this.context);
});

Then("the context omits {string}", function (part) {
  assert.ok(!this.context.includes(part), this.context);
});

Then("with a reflection interval of {int} these counts are due:", async function (interval, table) {
  const cases = table.hashes();
  const due = await this.probeMany(cases.map(({ count }) => ["isReflectionDue", Number(count), interval]));
  assert.deepEqual(due, cases.map(({ due }) => due === "true"));
});

Then("these replies state the following intents:", async function (document) {
  const cases = JSON.parse(document);
  const intents = await this.probeMany(cases.map(([reply]) => ["statedIntent", reply]));
  assert.deepEqual(intents, cases.map(([, intent]) => intent));
});

When("I strengthen memory with:", async function (document) {
  const input = JSON.parse(document);
  this.originalRelations = input.before;
  this.value = await this.probe("strengthen", input);
});

Then("the original relations are unchanged", function () {
  assert.deepEqual(this.value.before, this.originalRelations);
});

Then("the strengthened memory has these weights and citations:", function (table) {
  const actual = this.value.after.map(({ from, type, to, weight, evidence }) => [
    `${from} ${type} ${to}`, String(weight), evidence.join(","),
  ]);
  assert.deepEqual(actual, table.rows());
});

When("I review these events from {string}:", async function (since, table) {
  const events = table.hashes().map(({ text, ...event }) => ({
    ...event,
    actor: { role: event.type === "prompt" ? "person" : "agent" },
    data: { text },
  }));
  this.value = await this.probe("reviewJournal", events, since);
});
