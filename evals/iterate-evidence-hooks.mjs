// Observation only: never inject findings, select repairs, or alter tool results.
import fs from "node:fs";
import path from "node:path";
import { evidenceSnapshot } from "./iterate-evidence.mjs";

export default function (pi) {
  const configPath = process.env.ITERATE_EVIDENCE_OBSERVER;
  if (!configPath) throw new Error("ITERATE_EVIDENCE_OBSERVER must name the evaluator-owned configuration");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  let sequence = 0;
  const observe = (boundary, event = {}) => {
    const snapshot = evidenceSnapshot(config, { sequence: ++sequence, boundary, toolCallId: event.toolCallId ?? null, toolName: event.toolName ?? null, input: event.input ?? null });
    fs.appendFileSync(path.join(config.out, "observer.jsonl"), `${JSON.stringify(snapshot)}\n`);
  };
  pi.on("session_start", (_event, ctx) => {
    fs.writeFileSync(path.join(config.out, "capabilities.json"), JSON.stringify({ tools: pi.getAllTools(), activeTools: pi.getActiveTools(), model: ctx.model ? { id: ctx.model.id, provider: ctx.model.provider, input: ctx.model.input } : null }, null, 2));
    observe("session_start");
  });
  pi.on("tool_call", (event) => observe("tool_call", event));
  pi.on("tool_execution_start", (event) => observe("tool_execution_start", event));
  pi.on("tool_execution_end", (event) => observe("tool_execution_end", event));
  pi.on("session_shutdown", () => observe("session_shutdown"));
}
