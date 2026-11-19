import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The seed stands alone: no dependencies, and no imports from outside this folder.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(full);
    return /\.m?js$/.test(entry.name) ? [full] : [];
  });
}

test("the seed imports nothing outside itself and only standard library modules", () => {
  for (const file of sources(root)) {
    const text = fs.readFileSync(file, "utf8");
    for (const [, spec] of text.matchAll(/(?:from\s+|import\s*\(?\s*)["']([^"']+)["']/g)) {
      if (spec.startsWith("node:")) continue;
      assert.ok(spec.startsWith("."), `${path.relative(root, file)} imports a package: ${spec}`);
      const target = path.resolve(path.dirname(file), spec);
      assert.ok(target.startsWith(root + path.sep), `${path.relative(root, file)} reaches outside: ${spec}`);
    }
  }
});
