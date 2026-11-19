import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { validateEvent, validateRelation, validateState } from "./contract.mjs";
import { parseDot, parseFrontmatter, renderDot, renderFrontmatter } from "./formats.mjs";

const STATE_TEMPLATE = new URL("../templates/state.mdx", import.meta.url);

// Everything lives in `.spiral/` inside the project
export function openWorkspace(root, { now = () => new Date() } = {}) {
  const dir = path.join(root, ".spiral");
  const stateDir = path.join(dir, "state");
  const journalPath = path.join(dir, "journal.jsonl");
  const memoryPath = path.join(dir, "memory.dot");
  const statePath = (key) => path.join(stateDir, `${key}.mdx`);
  const readText = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");

  function reject(kind, record, errors) {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "rejected.jsonl"), JSON.stringify({ at: now().toISOString(), kind, errors, record }) + "\n");
    return errors;
  }

  function readState(key) {
    const text = readText(statePath(key));
    return text ? parseFrontmatter(text) : null;
  }

  function readRelations() {
    return parseDot(readText(memoryPath)).relations.filter((relation) => validateRelation(relation).length === 0);
  }

  return {
    dir,
    journalPath,
    memoryPath,

    // Returns the event when it was written, or null when the contract refused it.
    appendEvent({ type, role, session = null, data }) {
      const event = {
        id: `e-${now().getTime().toString(36)}-${crypto.randomBytes(3).toString("hex")}`,
        at: now().toISOString(),
        type,
        actor: { role, session },
        data,
      };
      const errors = validateEvent(event);
      if (errors.length > 0) {
        reject("event", event, errors);
        return null;
      }
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(journalPath, JSON.stringify(event) + "\n");
      return event;
    },

    readEvents() {
      return readText(journalPath)
        .split("\n")
        .flatMap((line) => {
          try {
            return line.trim() ? [JSON.parse(line)] : [];
          } catch {
            return [];
          }
        })
        .filter((event) => validateEvent(event).length === 0);
    },

    readState,

    stateValue(key, fallback) {
      const value = readState(key)?.meta.value;
      return value === undefined || value === null ? fallback : value;
    },

    // The hook and the CLI write only the frontmatter. The body belongs to people and agents.
    writeState(key, value, cause) {
      const current = readState(key);
      const meta = { key, value, at: now().toISOString(), cause, version: (current?.meta.version || 0) + 1 };
      const errors = validateState(meta);
      if (errors.length > 0) return reject("state", meta, errors);
      const body = current ? current.body : readText(STATE_TEMPLATE);
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(statePath(key), renderFrontmatter(meta, body));
      return [];
    },

    readRelations,

    writeRelations(relations) {
      const refused = relations.filter((relation) => validateRelation(relation).length > 0);
      for (const relation of refused) reject("relation", relation, validateRelation(relation));
      if (refused.length > 0) return refused.flatMap(validateRelation);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(memoryPath, renderDot(relations));
      return [];
    },
  };
}

export function workspaceRoot(env = process.env) {
  return env.CLAUDE_PROJECT_DIR || env.SPIRAL_ROOT || process.cwd();
}

export function reflectEvery(env = process.env, fallback) {
  const value = Number.parseInt(env.SPIRAL_REFLECT_EVERY, 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
