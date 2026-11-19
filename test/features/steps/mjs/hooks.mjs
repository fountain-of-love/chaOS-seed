import assert from "node:assert/strict";
import fs from "node:fs";
import { Given, Then, When } from "@cucumber/cucumber";
import { counterKey } from "../../../support/mjs/world.mjs";

async function submit(world, prompt, session) {
  world.result = await world.hook("UserPromptSubmit", { prompt, session_id: session });
  assert.equal(world.result.status, 0, world.result.stderr);
  world.response = JSON.parse(world.result.stdout).hookSpecificOutput;
  world.context = world.response.additionalContext;
}

When("session {string} submits the prompt {string}", async function (session, prompt) {
  await submit(this, prompt, session);
});

When("I submit {string}", async function (prompt) {
  await submit(this, prompt);
});

Then("the hook response is for {string}", function (event) {
  assert.equal(this.response.hookEventName, event);
});

Then("the last journal entry has these fields:", function (document) {
  const expected = JSON.parse(document);
  const entry = this.journal().at(-1);
  assert.deepEqual(Object.fromEntries(Object.keys(expected).map((key) => [key, entry[key]])), expected);
});

Then("the last prompt caused the counter update", async function () {
  const { meta } = await this.state();
  assert.equal(meta.cause, this.journal().at(-1).id);
});

Then("the state body includes these headings:", async function (table) {
  const { body } = await this.state();
  const lines = body.split("\n");
  for (const { heading } of table.hashes()) assert.ok(lines.includes(`## ${heading}`), body);
});

Given("I set state metadata {string} to {string} and append this note:", async function (key, value, note) {
  const { meta, body } = await this.state();
  this.editedState = { key, value, body: body + "\n" + note + "\n" };
  const text = await this.probe("renderFrontmatter", { ...meta, [key]: value }, this.editedState.body);
  this.write(["state", `${counterKey}.mdx`], text);
});

Then("the edited state body and extra metadata are unchanged", async function () {
  const { meta, body } = await this.state();
  assert.equal(meta[this.editedState.key], this.editedState.value);
  assert.equal(body, this.editedState.body);
});

Given("reflection is due every {int} prompts", function (count) {
  this.hookEnv.SPIRAL_REFLECT_EVERY = String(count);
});

Given("this memory graph is stored:", function (document) {
  this.write(["memory.dot"], document + "\n");
});

When("session {string} ends with this reply:", async function (session, reply) {
  this.result = await this.hook("Stop", { session_id: session, last_assistant_message: reply });
});

Given("hook debugging is enabled", function () {
  this.hookEnv.SPIRAL_DEBUG = "1";
});

When("the prompt hook receives raw input {string}", async function (input) {
  this.result = await this.hook("UserPromptSubmit", input);
});

Then("the workspace has no spiral files", function () {
  assert.equal(fs.existsSync(this.directory), false);
});

When("{int} prompts are submitted concurrently", async function (count) {
  this.hookResponses = [];
  const writers = 8;
  for (let start = 0; start < count; start += writers) {
    const size = Math.min(writers, count - start);
    const results = await Promise.all(Array.from({ length: size }, (_, index) =>
      this.hook("UserPromptSubmit", { prompt: `prompt ${start + index}` }),
    ));
    for (const result of results) {
      assert.equal(result.status, 0, result.stderr);
      this.hookResponses.push(JSON.parse(result.stdout).hookSpecificOutput.additionalContext);
    }
  }
});

Then("the journal contains {int} events", function (count) {
  assert.equal(this.journal().length, count);
});

Then("exactly {int} hook response(s) mentions {string}", function (count, part) {
  assert.equal(this.hookResponses.filter((context) => context.includes(part)).length, count);
});
