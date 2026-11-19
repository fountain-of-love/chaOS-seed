import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Then } from "@cucumber/cucumber";

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
