import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

const RETRY_MS = 10;
const LOCK_TIMEOUT_MS = 2_000;
const timer = new Int32Array(new SharedArrayBuffer(4));

function removeEmptyDirectory(directory) {
  try {
    fs.rmdirSync(directory);
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
  }
}

function clearAbandonedLock(lock) {
  let entries;
  try {
    entries = fs.readdirSync(lock);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const [owner] = entries;
  if (!owner) {
    removeEmptyDirectory(lock);
    return;
  }
  const pid = Number(owner.match(/^([1-9]\d*)\.node-claim-/)?.[1]);
  if (!Number.isSafeInteger(pid) || entries.length !== 1) return;
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code !== "ESRCH") return;
    fs.rmSync(path.join(lock, owner), { force: true });
    removeEmptyDirectory(lock);
  }
}

export function withWorkspaceMutation(directory, operation) {
  fs.mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, ".node.lock");
  const claim = fs.mkdtempSync(path.join(directory, ".node-claim-"));
  const owner = `${process.pid}${path.basename(claim)}`;
  const deadline = performance.now() + LOCK_TIMEOUT_MS;
  let held = false;
  try {
    fs.writeFileSync(path.join(claim, owner), "");
    // Publish a nonempty directory atomically, with its owner already visible.
    for (;;) {
      try {
        fs.renameSync(claim, lock);
        held = true;
      } catch (error) {
        const occupied = ["ENOTEMPTY", "EEXIST"].includes(error.code) || (error.code === "EPERM" && fs.existsSync(lock));
        if (!occupied) throw error;
        clearAbandonedLock(lock);
        if (performance.now() >= deadline) {
          const timeout = new Error(`Timed out waiting for the workspace lock at ${lock}.`);
          timeout.code = "ETIMEDOUT";
          throw timeout;
        }
        Atomics.wait(timer, 0, 0, RETRY_MS);
      }
      if (held) return operation();
    }
  } finally {
    const ownedDirectory = held ? lock : claim;
    fs.rmSync(path.join(ownedDirectory, owner), { force: true });
    removeEmptyDirectory(ownedDirectory);
  }
}
