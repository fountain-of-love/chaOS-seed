import assert from "node:assert/strict";
import fs from "node:fs";
import { Given, Then, When } from "@cucumber/cucumber";
import { counterKey } from "../support/world.mjs";

Given("this prompt history:", async function (table) {
  const events = table.hashes().map(({ id, at, text }) => ({
    id, at, type: "prompt", actor: { role: "person" }, data: { text },
  }));
  this.write(["journal.jsonl"], events.map((event) => JSON.stringify(event) + "\n").join(""));
  const latest = events.at(-1);
  const state = { key: counterKey, value: events.length, at: latest.at, cause: latest.id, version: events.length };
  this.write(["state", `${counterKey}.mdx`], await this.probe("renderFrontmatter", state, ""));
});

When("I run {string}", async function (command) {
  this.result = await this.run("cli", [command]);
});

When("I run {string} with these arguments:", async function (command, document) {
  this.result = await this.run("cli", [command, ...JSON.parse(document)]);
});

Then("it exits with code {int}", function (code) {
  assert.equal(this.result.status, code, this.result.stderr);
});

Then("stdout contains {string}", function (part) {
  assert.ok(this.result.stdout.includes(part), this.result.stdout || this.result.stderr);
});

Then("stderr contains {string}", function (part) {
  assert.ok(this.result.stderr.includes(part), this.result.stderr);
});

Then("stdout and stderr are empty", function () {
  assert.equal(this.result.stdout, "");
  assert.equal(this.result.stderr, "");
});

Then("stdout is empty", function () {
  assert.equal(this.result.stdout, "");
});

Then("the prompt count is {int} at version {int}", async function (value, version) {
  const { meta } = await this.state();
  assert.equal(meta.value, value);
  assert.equal(meta.version, version);
});

Then("the reflection event caused both state updates", async function () {
  const event = this.journal().at(-1);
  const { meta: counter } = await this.state();
  const { meta: moment } = await this.state("lastReflectionAt");
  assert.equal(event.type, "reflection");
  assert.equal(counter.cause, event.id);
  assert.equal(moment.cause, event.id);
  assert.equal(moment.value, event.at);
});

Then("the relation weighs {int} and has {int} evidence events", async function (weight, count) {
  const relations = await this.memory();
  assert.equal(relations.length, 1);
  assert.equal(relations[0].weight, weight);
  assert.equal(relations[0].evidence.length, count);
});

Then("no memory file was created", function () {
  assert.equal(fs.existsSync(this.file("memory.dot")), false);
});

Then("the journal has no {string} event", function (type) {
  assert.ok(this.journal().every((event) => event.type !== type), `The journal contains a ${type} event`);
});

Given("I snapshot the memory and journal", function () {
  this.snapshot = { memory: this.read("memory.dot"), journal: this.read("journal.jsonl") };
});

Then("memory and the journal match the snapshot", function () {
  assert.equal(this.read("memory.dot"), this.snapshot.memory);
  assert.equal(this.read("journal.jsonl"), this.snapshot.journal);
});

Given("I add the unsupported edge {string} to memory", function (edge) {
  this.write(["memory.dot"], this.read("memory.dot").replace("}\n", `  ${edge}\n}\n`));
});

When("{int} writers cite different evidence for {string} {word} {string}", async function (count, from, verb, to) {
  const results = await Promise.all(Array.from({ length: count }, (_, index) =>
    this.run("cli", ["remember", from, verb, to, "--evidence", `e-${index}`]),
  ));
  for (const result of results) assert.equal(result.status, 0, result.stderr);
});

Then("the relation cites {string}", async function (evidence) {
  const [relation] = await this.memory();
  assert.deepEqual([...relation.evidence].sort(), evidence.split(",").sort());
});

Given("a writer exits while holding the workspace lock", async function () {
  const result = await this.run("probe", [], { input: JSON.stringify([["exitWithLock"]]) });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});

When("I try to record a prompt as {string}", async function (role) {
  this.event = await this.probe("appendEvent", "prompt", role, "hi");
});

Then("the event is refused", function () {
  assert.equal(this.event, null);
});

Then("the journal has no valid events", async function () {
  assert.deepEqual(await this.probe("readEvents"), []);
});

Then("the rejection identifies {string}", function (error) {
  const entries = this.read("rejected.jsonl").trim().split("\n").map(JSON.parse);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "event");
  assert.ok(entries[0].errors.some((message) => message.includes(error)), entries[0].errors.join(", "));
});

Then("the journal contains the newly recorded event", async function () {
  assert.ok(this.event?.id);
  assert.deepEqual(await this.probe("readEvents"), [this.event]);
});
