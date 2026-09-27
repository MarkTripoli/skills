// Recognizes only direct gh/./gh PR commands in Bash tool input. This is not a shell
// interpreter: dynamic shell syntax on a targeted command is rejected, not guessed.
function words(command) {
  const tokens = [];
  let word = '';
  let active = false;
  let quote = '';
  let dynamic = false;
  let quoted = false;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === '\\' && quote !== "'") {
      if (++i === command.length) return null;
      word += command[i]; active = true;
    } else if (char === quote && quote) {
      quote = '';
    } else if ((char === "'" || char === '"') && !quote) {
      quote = char; active = true; quoted = true;
    } else if ((char === '$' && quote !== "'" && command[i + 1] === '(') || (char === '`' && quote !== "'")) {
      dynamic = true; word += char; active = true;
    } else if (!quote && /[;&|()<>\n]/.test(char)) {
      if (active) tokens.push({ value: word, dynamic, quoted });
      tokens.push({ separator: char });
      word = ''; active = false; dynamic = false; quoted = false;
    } else if (!quote && /\s/.test(char)) {
      if (active) tokens.push({ value: word, dynamic, quoted });
      word = ''; active = false; dynamic = false; quoted = false;
    } else {
      word += char; active = true;
    }
  }
  if (quote) return null;
  if (active) tokens.push({ value: word, dynamic, quoted });
  return tokens;
}

function classifyArgs(args, tokens) {
  if (args[0] !== 'pr') return null;
  const verb = args[1];
  if (verb === 'create') {
    let draft = false;
    const values = new Set(['--title', '--body', '--body-file', '--base', '--head', '--assignee', '--reviewer', '--label', '--milestone', '--project', '--template']);
    const switches = new Set(['--fill', '--fill-first', '--fill-verbose', '--no-maintainer-edit']);
    for (let i = 2; i < args.length; i++) {
      const value = args[i];
      if (value === '--draft' || value === '-d' || value === '--draft=true') draft = true;
      else if (value === '--draft=false') draft = false;
      else if (values.has(value)) {
        if (!args[++i] || (args[i].startsWith('-') && !tokens[i].quoted)) return { action: 'unsupported-pr-command' };
      } else if (switches.has(value)) { /* flag */ }
      else if (/^--[a-z-]+=/.test(value) && values.has(value.slice(0, value.indexOf('='))) && value.split('=')[1]) { /* value flag */ }
      else return { action: 'unsupported-pr-command' };
    }
    return { action: draft ? 'draft-create' : 'ready-create' };
  }
  if (verb === 'ready') {
    if (args.length > 3 || args[2] && !/^[1-9]\d*$/.test(args[2])) return { action: 'unsupported-pr-command' };
    return { action: 'ready-existing', ...(args[2] ? { number: args[2] } : {}) };
  }
  // Body/comment edits and read-only PR inspection are part of the draft-first
  // publication sequence, not ready transitions.
  if (['view', 'edit', 'comment', 'list', 'checks', 'status', 'diff'].includes(verb)) return null;
  return { action: 'unsupported-pr-command' };
}

export function classifyPublicationCommand(command) {
  if (typeof command !== 'string') return null;
  const tokens = words(command);
  if (!tokens) return /(?:^|[;&|\n])\s*(?:\.\/)?gh\s+pr\b/.test(command) ? { action: 'unsupported-pr-command' } : null;
  let segment = [];
  const results = [];
  let hasContextChange = false;
  const inspect = () => {
    if (!segment.length) return;
    const args = segment.map(token => token.value);
    if (args[0] === 'cd') hasContextChange = true;
    const gh = args.findIndex(value => value === 'gh' || value === './gh' || /\/gh$/.test(value));
    // A gh executable must begin the observed simple command. Wrappers,
    // assignments, and absolute executables are targeted but unsupported.
    if (gh === 0 && !['gh', './gh'].includes(args[0])) {
      results.push({ action: 'unsupported-pr-command' });
    } else if (gh === 0) {
      const result = args[1] === 'pr' && !segment.some(token => token.dynamic)
        ? classifyArgs(args.slice(1), segment.slice(1)) : args.includes('pr') ? { action: 'unsupported-pr-command' } : null;
      if (result) results.push(result);
    } else if (gh > 0 && args[gh + 1] === 'pr') {
      results.push({ action: 'unsupported-pr-command' });
    } else if (['bash', 'sh', 'zsh', 'eval'].includes(args[0]) &&
      segment.some(token => /(?:^|[;&|\n])\s*(?:\.\/)?gh\s+pr\b/.test(token.value))) {
      results.push({ action: 'unsupported-pr-command' });
    }
    segment = [];
  };
  for (const token of tokens) {
    if (token.separator) inspect();
    else segment.push(token);
  }
  inspect();
  if (!results.length) return null;
  if (hasContextChange || tokens.some(token => token.dynamic)) return { action: 'unsupported-pr-command' };
  return results.find(result => result.action === 'unsupported-pr-command')
    ?? results.find(result => result.action === 'ready-existing' || result.action === 'ready-create')
    ?? results[0];
}
