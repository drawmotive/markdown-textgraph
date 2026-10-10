import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { command, ownedCommands } from "./support/command.mjs";

test("cancelled commands stop descendants before fixture cleanup", { timeout: 10000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "markdown-command-cancel-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const ready = path.join(directory, "ready"), late = path.join(directory, "late");
  const descendant = path.join(directory, "descendant.mjs"), parent = path.join(directory, "parent.mjs");
  await writeFile(descendant, 'import {writeFile} from "node:fs/promises"; await writeFile(' + JSON.stringify(ready) + ', String(process.pid)); setTimeout(async()=>{await writeFile(' + JSON.stringify(late) + ', "outlived cancellation");}, 3000);');
  await writeFile(parent, 'import {spawn} from "node:child_process"; spawn(process.execPath,[' + JSON.stringify(descendant) + '],{stdio:"inherit"}); setInterval(()=>{},1000);');
  const controller = new AbortController();
  const completed = command([parent], directory, { signal: controller.signal, stage: "cancel fixture", log: () => {} });
  const rejected = assert.rejects(completed, /cancel fixture stopped: fixture cancelled/);
  while (await access(ready).then(() => false, () => true)) {
    t.signal.throwIfAborted();
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const pid = Number(await readFile(ready, "utf8"));
  controller.abort(new Error("fixture cancelled"));
  await rejected;
  await assert.rejects(access(late), { code: "ENOENT" });
  // A killed POSIX descendant may briefly remain a zombie until init reaps it.
  if (process.platform === "linux") {
    const status = await readFile("/proc/" + pid + "/status", "utf8").catch(error => { if (error.code !== "ENOENT") throw error; });
    assert.ok(status === undefined || /^State:\s+Z\b/m.test(status));
  } else {
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  }
});

test("pre-cancelled commands never start and command failures identify their stage", async t => {
  const controller = new AbortController();
  controller.abort(new Error("already cancelled"));
  await assert.rejects(command(["--eval", "process.exit(0)"], process.cwd(), { signal: controller.signal, stage: "not started" }), /already cancelled/);
  await assert.rejects(command(["--eval", "console.error('fixture failure');process.exit(7)"], process.cwd(), { signal: t.signal, stage: "typecheck", log: () => {} }), /typecheck exited 7\nfixture failure/);
});

test("owned command drain joins cancellation before the next cleanup hook", { timeout: 10000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "markdown-command-drain-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const controller = new AbortController(), hooks = [];
  const ready = path.join(directory, "ready");
  const run = ownedCommands({ signal: controller.signal, after: hook => hooks.push(hook) }, { log: () => {} });
  let settled = false;
  const accepted = run(["--eval", 'require("node:fs").writeFileSync(' + JSON.stringify(ready) + ', "ready");setInterval(()=>{},1000);'], directory, "drain fixture");
  accepted.then(() => { settled = true; }, () => { settled = true; });
  const rejected = assert.rejects(accepted, /drain fixture stopped/);
  hooks.push(() => assert.ok(settled, "fixture cleanup must follow the accepted command's close"));
  while (await access(ready).then(() => false, () => true)) {
    t.signal.throwIfAborted();
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  controller.abort(new Error("fixture cancelled"));
  for (const hook of hooks) await hook();
  await rejected;
});
