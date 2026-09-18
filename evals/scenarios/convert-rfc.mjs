// An accepted RFC exists outside the repository and the team wants to start at the TDD. Two fresh
// sessions. `task.md` says "convert" and names the RFC; nothing tells the skill to skip its interview,
// to read the repository, or where the chain continues. gather-sources hands off to create-tdd;
// create-tdd converts in one pass, pairs each RFC section with a fact the RFC cannot supply (so pasting
// the RFC under the right headings fails), cites the code with `path:line` pointers that resolve to
// lines saying what they are cited for (so a fabricated line number fails), and leaves the RFC's two
// `TBD`s as decisions for the reader rather than deciding them.

import { expect, failures, pointers, section, sentences } from "../lib.mjs";

const SOURCE = "docs/external/rfc-0007-webhook-delivery.md";
const HUMAN_REVIEW = "## Human Review";
// A sentence recording an open item rather than a decision.
const HEDGE = /whether|not stated|open question|TBD|to be decided|undecided|leaves? open|or only|or (the )?body plus|unstated/i;
// Sentences that decide the RFC's open items.
const DEAD_LETTER_DECIDED = /(written|writes?|append(ed|s)?|saved|persist(ed|s)?|go(es)? to|moved to|lands? in|placed in)[^.\n]{0,60}dead[- ]?letter|dead[- ]?letter (file|queue)[^.\n]{0,40}(is|are|gets) (written|created|used|kept)|dropped after the (third|last|final) attempt/i;
const SIGNATURE_SCOPE_DECIDED = /signature (also |additionally )?(covers|includes|is computed over|spans|extends to|is taken over)[^.\n]{0,60}timestamp|(body (and|plus|\+) (the )?timestamp|timestamp (and|plus) (the )?body)[^.\n]{0,40}(signed|HMAC|covered|hashed)|only the body is signed|sign(s|ed)? (only )?the body only/i;

// Pointers whose cited lines exist and say what the check needs them to say.
const realPointers = (text, root, contentRe) => pointers(text, root).filter((p) => p.valid && contentRe.test(p.text));

export default {
  slug: "webhook-delivery-channel",
  title: "Convert RFC 0007 into a TDD for the webhook channel",
  workflow: "prd",
  fixtures: ["convert-rfc"],
  request: `Convert the accepted RFC 0007 (webhook delivery channel) at ${SOURCE} into our TDD.`,
  phases: [
    {
      skill: "gather-sources",
      request: `Gather the sources for this task: the RFC at ${SOURCE}.`,
      artifactType: "sources",
      template: "sources_template.md",
      next: "create-tdd",
      commit: "docs(task): sources artifact",
      check: ({ artifact }) => {
        const text = artifact?.text ?? "";
        return failures(
          expect.includes("sources: source location", text, SOURCE),
          expect.includes("sources: signature header excerpt", text, "X-Notifyctl-Signature"),
          expect.matches("sources: backoff excerpt", text, /1 s, then 4 s, then 16 s/),
          expect.matches("sources: RFC's open items kept", text, /dead-letter/),
          expect.matches("sources: nothing unreachable", section(text, "## Unreachable", { body: true }), /^None\.?$/m),
        );
      },
    },
    {
      skill: "create-tdd",
      artifactType: "design-tdd",
      template: "tdd_template.md",
      next: "create-plan",
      handoffNamesArtifact: true,
      commit: "docs(task): tdd artifact",
      check: ({ artifact, answer, codeRoot }) => {
        const text = artifact?.text ?? "";
        const body = text.split(HUMAN_REVIEW)[0];
        const system = section(text, "### System Design") ?? "";
        const program = section(text, "### Program Design") ?? "";
        const types = section(text, "### Type Definitions") ?? "";
        const config = section(text, "### Configuration") ?? "";
        const errors = section(text, "### Error Handling") ?? "";
        const local = section(text, "### Local Patterns") ?? "";
        const verify = section(text, "### Verify", { last: true }) ?? "";
        const limits = section(text, "### Known limits", { last: true }) ?? "";
        const bogus = pointers(text, codeRoot).filter((p) => !p.valid);
        const deadLetterDecided = sentences(body, DEAD_LETTER_DECIDED).filter((s) => !HEDGE.test(s));
        const signatureDecided = sentences(body, SIGNATURE_SCOPE_DECIDED).filter((s) => !HEDGE.test(s));
        return failures(
          // One pass: no review-gate question.
          expect.includes("reply: ended at the final answer", answer, "The TDD is ready for review."),
          expect.excludes("reply: no interview options offered", answer, /Option [ABC]\b/),
          // Each section holds the RFC's content AND a repository fact the RFC cannot supply.
          expect.matches("tdd: signing scheme in System Design", system, /X-Notifyctl-Signature[\s\S]*HMAC-SHA256|HMAC-SHA256[\s\S]*X-Notifyctl-Signature/),
          expect.atLeast("tdd: System Design cites a real line of the loader or CLI that says what it is cited for", realPointers(system, codeRoot, /loadChannel|import\(|deliver|appendLog|channels\[/).filter((p) => /src\/(cli|channels\/index)\.mjs/.test(p.file)).length, 1),
          expect.matches("tdd: channel module shape in Program Design", program, /webhook\.mjs/),
          expect.atLeast("tdd: Program Design cites a real line of an existing channel or the CLI", realPointers(program, codeRoot, /deliver|name|loadChannel|appendLog|randomUUID/).length, 1),
          expect.matches("tdd: payload shape in Type Definitions", types, /sentAt/),
          expect.atLeast("tdd: Type Definitions cite a real line defining the existing deliver() contract", realPointers(types, codeRoot, /deliver|\{ id|status/).length, 1),
          expect.matches("tdd: endpoint secret and timeout in Configuration", config, /secret[\s\S]*timeoutMs|timeoutMs[\s\S]*secret/),
          expect.atLeast("tdd: Configuration cites a real line of the config loader", realPointers(config, codeRoot, /loadConfig|DEFAULTS|channels|JSON\.parse/).filter((p) => /config\.mjs/.test(p.file)).length, 1),
          expect.matches("tdd: exact backoff schedule in Error Handling", errors, /1 ?s,? (then )?4 ?s,? (then )?16 ?s/),
          expect.atLeast("tdd: Error Handling reconciles with the code through a real pointer", realPointers(errors, codeRoot, /./).length, 1),
          // Local Patterns come from the code: pointers that resolve and lines that say what they are cited for.
          expect.atLeast("tdd: Local Patterns cite real lines of the existing channel modules", realPointers(local, codeRoot, /deliver|name =|randomUUID|status/).filter((p) => /src\/channels\/(email|console|index)\.mjs/.test(p.file)).length, 1),
          expect.atLeast("tdd: Local Patterns cite a real line of the outbox log", realPointers(local, codeRoot, /appendLog|readLog|log\.json|writeFileSync/).filter((p) => /store\.mjs/.test(p.file)).length, 1),
          expect.matches("tdd: Local Patterns carry a fact only the code has", local, /randomUUID|queued|noreply@example\.com|Object\.hasOwn/),
          bogus.length ? `tdd: ${bogus.length} pointer(s) do not resolve to existing lines, e.g. ${bogus[0].pointer}` : null,
          // The RFC's TBDs stay open: a Verify decision each, a Known limit each, and no sentence in the
          // design body that decides either.
          expect.matches("tdd: Verify box decides dead-lettering", verify, /- \[ \][^\n]*dead-letter/i),
          expect.matches("tdd: Verify box decides signature scope", verify, /- \[ \][^\n]*(timestamp|signature)/i),
          expect.matches("tdd: dead-letter question named as a known limit", limits, /dead-letter/i),
          expect.matches("tdd: timestamp-in-signature question named as a known limit", limits, /timestamp|signature scope/i),
          deadLetterDecided.length ? `tdd: dead-lettering reads as decided: "${deadLetterDecided[0].slice(0, 120)}"` : null,
          signatureDecided.length ? `tdd: signature scope reads as decided: "${signatureDecided[0].slice(0, 120)}"` : null,
          expect.matches("tdd: source cited", text, /rfc-0007-webhook-delivery\.md/),
        );
      },
    },
  ],
};
