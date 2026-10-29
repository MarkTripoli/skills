#!/usr/bin/env node
// Explicit opt-in only. Ordinary skill installation never imports or runs this file.
// Usage: node scripts/install-updater.mjs --targets codex --skill show-me [--project] [--print]
// --print/--dry-run render without writes or scheduler commands. --uninstall disables only this job.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNoSymlinks, checkState, normalizeSelection, parseArgs, run, usage } from './nightly-update.mjs';

export const UNIT = 'marktripoli-skills-update';
export const LABEL = 'io.github.marktripoli.skills-update';
const here = path.dirname(fileURLToPath(import.meta.url));

function unitQuote(value) {
  if (/[\r\n\0]/.test(value)) throw new Error('scheduler arguments must be single-line strings');
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%')}"`;
}
function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
export function systemdFiles({ node, script, config, searchPath = process.env.PATH || '' }) {
  const service = `[Unit]
Description=Update MarkTripoli/skills selected resources to the newest release
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
Environment=${unitQuote(`PATH=${searchPath}`)}
ExecStart=${[node, script, '--config', config].map(value => unitQuote(value).replaceAll('$', () => '$$')).join(' ')}
`;
  const timer = `[Unit]
Description=Nightly MarkTripoli/skills update

[Timer]
OnCalendar=*-*-* 23:00:00
Persistent=true
RandomizedDelaySec=15min

[Install]
WantedBy=timers.target
`;
  return { service, timer };
}
export function launchdPlist({ node, script, config, dir, hour }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>
${[node, script, '--config', config].map(value => `    <string>${xml(value)}</string>`).join('\n')}
  </array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>${xml(path.join(dir, 'update.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(dir, 'update.log'))}</string>
</dict></plist>
`;
}

function unloadLaunchd(exec, plist) {
  try {
    exec('launchctl', ['print', `gui/${process.getuid()}/${LABEL}`]);
  } catch (error) {
    if (/could not find service/i.test(error.message)) return;
    throw error;
  }
  exec('launchctl', ['unload', plist]);
}

export function installUpdater(argv, { home = os.homedir(), cwd = process.cwd(), env = process.env, platform = process.platform, exec = run, node = process.execPath } = {}) {
  const args = parseArgs(argv, { cwd, env });
  if (args.help) return `usage: node scripts/install-updater.mjs ${usage} [--print] [--uninstall]`;
  if (args.config) throw new Error('--config belongs to nightly-update.mjs; use selection flags to configure the scheduler');
  if (!['linux', 'darwin'].includes(platform)) throw new Error(`no scheduler support for ${platform}; run scripts/nightly-update.mjs manually`);
  const dir = checkState(args.dir);
  const config = path.join(dir, 'config.json');
  const script = path.join(dir, 'bin', 'nightly-update.mjs');
  const unitDir = path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'systemd', 'user');
  const plist = path.join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`);
  const files = platform === 'linux'
    ? Object.entries(systemdFiles({ node, script, config, searchPath: env.PATH || '' })).map(([ext, text]) => [path.join(unitDir, `${UNIT}.${ext}`), text])
    : [[plist, launchdPlist({ node, script, config, dir, hour: 23 })]];
  const selection = args.uninstall ? null : normalizeSelection(args);
  if (args.print || args.dryRun) return args.uninstall
    ? `Would disable ${platform === 'linux' ? `${UNIT}.timer` : LABEL} and remove its scheduler files; installed skills and updater state remain unchanged.`
    : `${files.map(([file, text]) => `# ${file}\n${text}`).join('\n')}\n# ${config}\n${JSON.stringify(selection, null, 2)}\n`;
  if (fs.existsSync(path.join(dir, 'update.lock'))) throw new Error('updater is running; retry scheduler configuration after it finishes');
  // Refuse links rather than overwrite files outside the selected updater resources.
  for (const file of [...files.map(([file]) => file), script]) assertNoSymlinks(file);
  if (args.uninstall) {
    if (files.some(([file]) => fs.existsSync(file))) {
      if (platform === 'linux') exec('systemctl', ['--user', 'disable', '--now', `${UNIT}.timer`]);
      else unloadLaunchd(exec, plist);
    }
    for (const [file] of files) fs.rmSync(file, { force: true });
    if (platform === 'linux') exec('systemctl', ['--user', 'daemon-reload']);
    return 'Removed the nightly scheduler; installed skills and updater configuration/state are unchanged.';
  }
  checkState(dir, { create: true });
  if (platform === 'darwin' && fs.existsSync(plist)) unloadLaunchd(exec, plist);
  fs.mkdirSync(path.dirname(script), { recursive: true, mode: 0o700 });
  fs.copyFileSync(path.join(here, 'nightly-update.mjs'), script);
  fs.writeFileSync(config, `${JSON.stringify(selection, null, 2)}\n`, { mode: 0o600 });
  for (const [file, text] of files) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  if (platform === 'linux') {
    exec('systemctl', ['--user', 'daemon-reload']);
    exec('systemctl', ['--user', 'enable', '--now', `${UNIT}.timer`]);
  } else exec('launchctl', ['load', plist]);
  return `Nightly selected-skill updates enabled at 23:00 local time. Configuration: ${config}`;
}

const invoked = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : null;
if (invoked && invoked === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try { console.log(installUpdater(process.argv.slice(2))); }
  catch (error) { console.error(`skills: updater scheduler failed (${error.message})`); process.exitCode = 1; }
}
