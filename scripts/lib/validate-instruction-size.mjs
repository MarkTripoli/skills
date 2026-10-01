import fs from 'node:fs';
import path from 'node:path';

// Source-only ratchet. Runtime adapters add instructions; fix recurring failures with executable checks, not longer rulebooks.
export const WORD_CAPS = Object.freeze({
  'shared/CONVENTIONS.md': 1998,
  'shared/WRITING.md': 716,
  'skills/delivery/deliver/SKILL.md': 1037,
  'skills/delivery/deliver/references/deliver_answer.md': 117,
  'skills/delivery/deliver/references/model_enforcement.md': 199,
  'skills/delivery/deliver/references/task_setup.md': 566,
  'skills/delivery/deliver/references/tool_approval.md': 525,
  'skills/delivery/agent-implementation-reviewer/SKILL.md': 642,
  'skills/delivery/agent-implementer/SKILL.md': 509,
  'skills/delivery/implement-plan/SKILL.md': 1240,
  'skills/delivery/review-code/SKILL.md': 1171,
  'skills/delivery/verify-implementation/SKILL.md': 2133,
  'skills/delivery/record-evidence/SKILL.md': 3571,
});

export function validateInstructionSize({ root, generated = false, fail, caps = WORD_CAPS }) {
  if (generated) return;
  for (const [file, cap] of Object.entries(caps)) {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) { fail(file, 0, 'capped instruction file missing'); continue; }
    const words = fs.readFileSync(absolute, 'utf8').split(/\s+/).filter(Boolean).length;
    if (words > cap) fail(file, 0, `${words} words exceeds its cap of ${cap}; trim instructions or split the referenced contract`);
  }
}
