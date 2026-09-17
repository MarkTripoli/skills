#!/usr/bin/env node
import { loadConfig } from "./config.mjs";
import { loadChannel } from "./channels/index.mjs";
import { appendLog, readLog } from "./store.mjs";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i].startsWith("--")) throw new Error(`unexpected argument ${rest[i]}`);
    flags[rest[i].slice(2)] = rest[i + 1];
  }
  return { command, flags };
}

export async function main(argv, { stdout = process.stdout } = {}) {
  const { command, flags } = parseArgs(argv);
  const config = loadConfig();
  if (command === "send") {
    for (const key of ["channel", "to", "message"]) {
      if (!flags[key]) throw new Error(`send needs --${key}`);
    }
    const channel = await loadChannel(flags.channel, config);
    const result = await channel.deliver({ to: flags.to, message: flags.message, config: config.channels[flags.channel] ?? {} });
    appendLog(config, { channel: flags.channel, to: flags.to, ...result, at: new Date().toISOString() });
    stdout.write(`${result.status} ${result.id}\n`);
    return 0;
  }
  if (command === "list") {
    for (const entry of readLog(config)) stdout.write(`${entry.at} ${entry.channel} ${entry.to} ${entry.status}\n`);
    return 0;
  }
  throw new Error(`unknown command ${command ?? "(none)"}; use send or list`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    },
  );
}
