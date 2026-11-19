import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { nodeRuntime } from "../../../support/mjs/world.mjs";

const runtimes = {
  node: nodeRuntime,
  python: {
    executable: process.env.PYTHON || "python3",
    cli: "bin/spiral.py",
    hook: "hooks/spiral-hook.py",
    env: { PYTHONIOENCODING: "utf-8" },
  },
};

Given("I use {string}", function (runtime) {
  assert.ok(Object.hasOwn(runtimes, runtime), `Unknown test runtime: ${runtime}`);
  this.runtime = runtimes[runtime];
});

When("I save the hook context", function () {
  this.savedContext = this.context;
});

Then("the hook context matches the saved context", function () {
  assert.equal(this.context, this.savedContext);
});

When("I remember this relation citing prompts {int} through {int}:", async function (first, last, document) {
  const prompts = this.journal().filter((event) => event.type === "prompt");
  const evidence = prompts.slice(first - 1, last).map((event) => event.id);
  assert.equal(evidence.length, last - first + 1);
  const result = await this.run("cli", ["remember", ...JSON.parse(document), "--evidence", evidence.join(",")]);
  assert.equal(result.status, 0, result.stderr);
});

Then("both runtimes agree on these commands:", async function (table) {
  for (const { command } of table.hashes()) {
    const [node, python] = await Promise.all(Object.values(runtimes).map((runtime) => this.run("cli", [command], { runtime })));
    assert.equal(node.status, 0, node.stderr);
    assert.equal(python.status, 0, python.stderr);
    assert.equal(node.stdout, python.stdout, command);
  }
});
