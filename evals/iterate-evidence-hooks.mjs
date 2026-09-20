// Observe every tool boundary; the viewer fault has a finite, evaluator-owned denial policy.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { evidenceSnapshot } from "./iterate-evidence.mjs";

// Observe the reader's actual ffmpeg process and bytes, not a filename exemption.
// OMP 18.1.22 uses a relative TempDir prefix, so these files can appear in cwd.
function observeViewerTemps(pi, config, observeProcess) {
  const active = new Map();
  const original = Bun.spawn;
  const pending = new Set();
  Bun.spawn = function (...args) {
    const command = Array.isArray(args[0]) ? args[0] : args[0]?.cmd;
    const stack = new Error("viewer process").stack;
    const calls = [...active.values()];
    const child = original.apply(this, args);
    if (Array.isArray(command) && path.basename(String(command[0])) === "ffmpeg") {
      const output = path.resolve(config.repo, command.at(-1));
      const record = { output: path.relative(config.repo, output), cwd: config.repo, command, stack, calls, pid: child.pid, at: new Date().toISOString() };
      const operation = child.exited.then((code) => {
        record.code = code;
        if (code === 0 && fs.existsSync(output)) record.sha256 = createHash("sha256").update(fs.readFileSync(output)).digest("hex");
        fs.appendFileSync(path.join(config.out, "viewer-temporaries.jsonl"), `${JSON.stringify(record)}\n`);
        // Snapshot while the real output still exists, before the reader's
        // cleanup. Do not depend on a concurrent tool happening to catch it.
        observeProcess({ toolName: "read", input: { viewerProcess: record } });
      });
      pending.add(operation);
      operation.finally(() => pending.delete(operation)).catch(() => {});
    }
    return child;
  };
  pi.on("tool_execution_start", (event) => active.set(event.toolCallId, { id: event.toolCallId, name: event.toolName }));
  pi.on("tool_execution_end", (event) => active.delete(event.toolCallId));
  pi.on("session_shutdown", async () => {
    await Promise.allSettled(pending);
    Bun.spawn = original;
  });
}

export function viewerToolDenial(config, event) {
  if (!config.blocked) return null;
  const { toolName, input = {} } = event;
  // Leave read to OMP's supported approval deny policy, retaining its actual denial result.
  if (toolName === "read" || toolName === "todo") return null;
  if (toolName === "write" && path.resolve(config.repo, input.path ?? "") === path.join(config.repo, config.receipt) && !input.path?.startsWith("xd://")) return null;
  if (toolName === "bash" && config.shellCommands.includes(input.command) && !input.env && !input.pty && !input.async && (!input.cwd || path.resolve(config.repo, input.cwd) === config.repo)) return null;
  return "Viewer fault isolation: only the exact declared text/capture/receipt commands and named receipt write are allowed; alternate viewing and execution routes are denied.";
}

export default function (pi) {
  const configPath = process.env.ITERATE_EVIDENCE_OBSERVER;
  if (!configPath) throw new Error("ITERATE_EVIDENCE_OBSERVER must name the evaluator-owned configuration");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  observeViewerTemps(pi, config, (event) => observe("viewer_process_end", event));
  let sequence = 0;
  const observe = (boundary, event = {}) => {
    const snapshot = evidenceSnapshot(config, { sequence: ++sequence, boundary, toolCallId: event.toolCallId ?? null, toolName: event.toolName ?? null, input: event.input ?? null });
    fs.appendFileSync(path.join(config.out, "observer.jsonl"), `${JSON.stringify(snapshot)}\n`);
  };
  pi.on("session_start", (_event, ctx) => {
    fs.writeFileSync(path.join(config.out, "capabilities.json"), JSON.stringify({ tools: pi.getAllTools(), activeTools: pi.getActiveTools(), model: ctx.model ? { id: ctx.model.id, provider: ctx.model.provider, input: ctx.model.input } : null }, null, 2));
    if (config.blocked) {
      const keys = ["tools.approval", "tools.xdev", "eval.py", "eval.js", "browser.enabled", "computer.enabled", "images.blockImages", "images.describeForTextModels", "mcp.enableProjectConfig"];
      fs.writeFileSync(path.join(config.out, "effective-config.json"), JSON.stringify({ source: "live extension pi.pi.settings.get", values: Object.fromEntries(keys.map((key) => [key, pi.pi.settings.get(key)])) }, null, 2));
    }
    observe("session_start");
  });
  pi.on("tool_call", (event) => {
    observe("tool_call", event);
    const reason = viewerToolDenial(config, event);
    if (reason) {
      fs.appendFileSync(path.join(config.out, "denials.jsonl"), `${JSON.stringify({ toolCallId: event.toolCallId, toolName: event.toolName, reason })}\n`);
      return { block: true, reason };
    }
  });
  pi.on("tool_execution_start", (event) => observe("tool_execution_start", event));
  pi.on("tool_execution_end", (event) => observe("tool_execution_end", event));
  pi.on("session_shutdown", () => observe("session_shutdown"));
}
