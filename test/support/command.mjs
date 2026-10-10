import { spawn } from "node:child_process";

/** Register the drain before a fixture's cleanup hook. Node test timeouts abort
 * the context without awaiting the test body, so cleanup must join accepted I/O. */
export function ownedCommands(t, { log = console.log } = {}) {
  const pending = new Set();
  t.after(() => Promise.allSettled([...pending]));
  return (args, cwd, stage) => {
    const accepted = command(args, cwd, { signal: t.signal, stage, log });
    pending.add(accepted);
    accepted.then(() => pending.delete(accepted), () => pending.delete(accepted));
    return accepted;
  };
}

/** A test owns its entire command tree until cancellation and pipe closure have
 * completed. This prevents an aborted install/build from outliving its fixture. */
export async function command(args, cwd, { signal, stage, timeout = 60000, log = console.log } = {}) {
  signal?.throwIfAborted();
  const started = performance.now();
  log("Starting " + stage);
  const child = spawn(process.execPath, args, {
    cwd, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32", windowsHide: true,
  });
  let output = "", errors = "", spawnError, stopError, stopped, stopping;
  child.stdout.on("data", data => { output += data; });
  child.stderr.on("data", data => { errors += data; });
  child.once("error", error => { spawnError = error; });
  const closed = new Promise(resolve => child.once("close", (code, exitSignal) => resolve({ code, exitSignal })));
  const stop = reason => {
    if (stopping) return;
    stopped = reason;
    stopping = stopTree(child).catch(error => { stopError = error; });
  };
  const abort = () => stop(signal.reason ?? new Error("Test cancelled"));
  const timer = setTimeout(() => stop(new Error(stage + " exceeded " + timeout + "ms")), timeout);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const { code, exitSignal } = await closed;
    await stopping;
    if (stopError) throw new Error(stage + " could not stop its process tree", { cause: stopError });
    if (stopped) throw new Error(stage + " stopped: " + stopped.message + "\n" + errors + output, { cause: stopped });
    if (spawnError) throw new Error(stage + " could not start", { cause: spawnError });
    if (code !== 0) throw new Error(stage + " exited " + (code ?? exitSignal) + "\n" + errors + output);
    return output;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    log(stage + " finished in " + Math.round(performance.now() - started) + "ms");
  }
}

async function stopTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      killer.once("error", reject);
      killer.once("close", resolve);
    });
    return;
  }
  const kill = signal => {
    try { process.kill(-child.pid, signal); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  kill("SIGTERM");
  await new Promise(resolve => setTimeout(resolve, 1500));
  kill("SIGKILL");
}
