import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { validateEvent, validateRelation, validateState } from "./contract.mjs";
import { parseDot, parseFrontmatter, renderDot, renderFrontmatter } from "./formats.mjs";
import { withWorkspaceMutation } from "./mutation.mjs";

const STATE_TEMPLATE = new URL("../../templates/state.mdx", import.meta.url);

export class InvalidMemoryError extends Error {}

function replaceText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  const handle = fs.openSync(temporary, "wx", 0o600);
  try {
    try {
      fs.writeFileSync(handle, text, "utf8");
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

// Everything lives in `.spiral/` inside the project
export function openWorkspace(root, { now = () => new Date() } = {}) {
  const dir = path.join(root, ".spiral");
  const stateDir = path.join(dir, "state");
  const journalPath = path.join(dir, "journal.jsonl");
  const memoryPath = path.join(dir, "memory.dot");
  const statePath = (key) => path.join(stateDir, `${key}.mdx`);
  function readText(file) {
    try {
      return fs.readFileSync(file, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return "";
      throw error;
    }
  }

  function reject(kind, record, errors) {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "rejected.jsonl"), JSON.stringify({ at: now().toISOString(), kind, errors, record }) + "\n");
    return errors;
  }

  function readState(key) {
    const text = readText(statePath(key));
    return text ? parseFrontmatter(text) : null;
  }

  function readRelations({ strict = false } = {}) {
    const { relations, skipped } = parseDot(readText(memoryPath));
    const valid = relations.filter((relation) => validateRelation(relation).length === 0);
    if (strict && (skipped.length > 0 || valid.length !== relations.length)) {
      throw new InvalidMemoryError(`Unable to safely update ${memoryPath}: unreadable relations.`);
    }
    return valid;
  }

  return {
    dir,
    journalPath,
    memoryPath,
    mutation: (operation) => withWorkspaceMutation(dir, operation),

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
      const version = current?.meta.version ?? 0;
      const meta = {
        ...current?.meta, key, value, at: now().toISOString(), cause,
        version: Number.isInteger(version) ? version + 1 : version,
      };
      const errors = validateState(meta);
      if (errors.length > 0) return reject("state", meta, errors);
      const body = current ? current.body : readText(STATE_TEMPLATE);
      replaceText(statePath(key), renderFrontmatter(meta, body));
      return [];
    },

    readRelations,

    writeRelations(relations) {
      const errors = [];
      for (const relation of relations) {
        const reasons = validateRelation(relation);
        if (reasons.length > 0) errors.push(...reject("relation", relation, reasons));
      }
      if (errors.length > 0) return errors;
      replaceText(memoryPath, renderDot(relations));
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
