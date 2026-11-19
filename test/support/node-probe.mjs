import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as contract from "../../src/contract.mjs";
import { parseDot, parseFrontmatter, renderDot, renderFrontmatter } from "../../src/formats.mjs";
import { isVariationCheck, ladderStage } from "../../src/growth.mjs";
import { buildContext, isReflectionDue, reviewJournal, statedIntent, strengthen } from "../../src/spiral.mjs";
import { openWorkspace } from "../../src/workspace.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const workspace = openWorkspace(process.cwd());

function* sources(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* sources(file);
    else if (/\.m?js$/.test(file)) yield file;
  }
}

function externalImports() {
  const violations = [];
  for (const directory of ["bin", "hooks", "src"]) {
    for (const file of sources(path.join(root, directory))) {
      const source = fs.readFileSync(file, "utf8");
      for (const [, name] of source.matchAll(/(?:from\s+|import\s*\(?\s*)["']([^"']+)["']/g)) {
        if (name.startsWith("node:")) continue;
        if (!name.startsWith(".") || path.relative(root, path.resolve(path.dirname(file), name)).startsWith("..")) {
          violations.push(`${path.relative(root, file)}: ${name}`);
        }
      }
    }
  }
  return violations;
}

const validators = {
  event: contract.validateEvent,
  state: contract.validateState,
  relation: contract.validateRelation,
};

const operations = {
  externalImports,
  recordFields: () => ({ event: contract.EVENT_FIELDS, state: contract.STATE_FIELDS, relation: contract.RELATION_FIELDS }),
  validate: (kind, record, nanWeight) => validators[kind](nanWeight ? { ...record, weight: NaN } : record),
  parseDot,
  parseFrontmatter,
  renderDot,
  renderFrontmatter,
  isVariationCheck,
  ladderStage,
  buildContext,
  isReflectionDue,
  reviewJournal,
  statedIntent,
  strengthen: ({ before, first, second }) => {
    const intermediate = strengthen(before, first.relation, ...first.evidence);
    return { before, after: strengthen(intermediate, second.relation, ...second.evidence) };
  },
  appendEvent: (type, role, text) => workspace.mutation(() => workspace.appendEvent({ type, role, data: { text } })),
  readEvents: workspace.readEvents,
  exitWithLock: () => workspace.mutation(() => process.exit(0)),
};

const requests = JSON.parse(fs.readFileSync(0, "utf8"));
console.log(JSON.stringify(requests.map(([action, ...args]) => operations[action](...args))));
