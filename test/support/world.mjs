import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { After, Before, World, setDefaultTimeout, setWorldConstructor } from "@cucumber/cucumber";

export const repository = fileURLToPath(new URL("../..", import.meta.url));
export const counterKey = "promptsSinceReflection";
const runFile = promisify(execFile);
export const nodeRuntime = {
  executable: process.execPath,
  cli: "bin/spiral.mjs",
  hook: "hooks/spiral-hook.mjs",
  probe: "test/support/node-probe.mjs",
};

class WorkspaceWorld extends World {
  constructor(options) {
    super(options);
    this.runtime = nodeRuntime;
    this.hookEnv = {};
    this.relations = [];
  }

  async run(entry, args = [], { runtime = this.runtime, input, env = {} } = {}) {
    const execution = runFile(runtime.executable, [path.join(repository, runtime[entry]), ...args], {
      cwd: this.root,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: "",
        SPIRAL_ROOT: this.root,
        SPIRAL_REFLECT_EVERY: "",
        SPIRAL_DEBUG: "",
        ...runtime.env,
        ...env,
      },
      timeout: 10_000,
    });
    if (input !== undefined) {
      execution.child.stdin.on("error", (error) => {
        if (error.code !== "EPIPE") execution.child.kill();
      });
      execution.child.stdin.end(input);
    }
    try {
      return { status: 0, ...await execution };
    } catch (error) {
      if (!Number.isInteger(error.code)) throw error;
      return { status: error.code, stdout: error.stdout, stderr: error.stderr };
    }
  }

  async probeMany(requests) {
    const result = await this.run("probe", [], { runtime: nodeRuntime, input: JSON.stringify(requests) });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }

  async probe(action, ...args) {
    const [result] = await this.probeMany([[action, ...args]]);
    return result;
  }

  hook(event, payload) {
    const input = typeof payload === "string" ? payload : JSON.stringify(payload);
    return this.run("hook", [event], { input, env: this.hookEnv });
  }

  file(...parts) {
    return path.join(this.directory, ...parts);
  }

  write(parts, data) {
    const target = this.file(...parts);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }

  read(...parts) {
    return fs.readFileSync(this.file(...parts), "utf8");
  }

  state(key = counterKey) {
    return this.probe("parseFrontmatter", this.read("state", `${key}.mdx`));
  }

  journal() {
    return this.read("journal.jsonl").trim().split("\n").map(JSON.parse);
  }

  async memory() {
    const { relations } = await this.probe("parseDot", this.read("memory.dot"));
    return relations;
  }
}

setWorldConstructor(WorkspaceWorld);
setDefaultTimeout(15_000);
Before(function () {
  this.root = fs.mkdtempSync(path.join(os.tmpdir(), "chaos-cucumber-"));
  this.directory = path.join(this.root, ".spiral");
});
After(function () {
  fs.rmSync(this.root, { recursive: true, force: true });
});
