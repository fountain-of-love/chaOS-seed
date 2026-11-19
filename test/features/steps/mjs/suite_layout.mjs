import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Then } from "@cucumber/cucumber";
import { nodeRuntime, repository } from "../../../support/mjs/world.mjs";

function moduleNames(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name) === extension)
    .map((entry) => path.basename(entry.name, extension))
    .sort();
}

Then("this runner has exactly these step modules:", function (table) {
  const expected = table.hashes().map(({ module }) => module).sort();
  const actual = moduleNames(new URL("./", import.meta.url), ".mjs");
  assert.deepEqual(actual, expected, "Node.js step modules must match the shared layout.");
});

Then("this runner has exactly these production modules:", function (table) {
  const expected = table.hashes().map(({ module }) => module).sort();
  const actual = moduleNames(path.join(repository, "src", "mjs"), ".mjs");
  assert.deepEqual(actual, expected, "Node.js production modules must match the shared layout.");
});

Then("this runner uses these production entry points:", function (table) {
  for (const { entry, path: stem } of table.hashes()) {
    const expected = `${stem}.mjs`;
    assert.equal(nodeRuntime[entry], expected);
    assert.ok(fs.statSync(path.join(repository, expected), { throwIfNoEntry: false })?.isFile(),
      `Missing Node.js script: ${expected}`);
  }
});
