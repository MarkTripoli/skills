# Before and after

Five examples follow: one chat reply, two machine-read strings, one documentation paragraph, and one prose opening. Then come the two traps that catch most rewrites (hedges, label register) and a table of six single-rule illustrations from Simplified Technical English (STE). All are illustrations built for this skill, not quotes from a real system.

## Chat: a reply to the engineer

**Before:**
> Sure! I'd be happy to help you with that. I went ahead and checked the parity script and it looks like the issue you're experiencing is most likely caused by the fact that the CLAUDE.md files are regular files rather than symlinks. I've gone ahead and fixed this for you and I've also taken the liberty of updating the tests. Let me know if there's anything else!

**Cut:** pleasantry, self-narration ("I went ahead and checked"), hedge stack ("looks like", "most likely"), "taken the liberty", closing offer.

**After:**
> All 54 `CLAUDE.md` files were regular copies, not symlinks. Parity hook rejected them. Replaced each with `ln -s AGENTS.md CLAUDE.md`, switched the check to `-L` + `readlink`. Self-test 8/8, parity OK (54 pairs). Commit `b29794c54`.

Answer, evidence, next state. Fragments carry checkable facts. Every number and symbol survives.

## Machine-read: an error message

**Before:**
> An error may have occurred while processing your request due to a possible mismatch in the expected data format, which could be caused by an outdated client version.

**Flagged:** one sentence, three claims. 28 words, past the point where a reader of an error message keeps the first claim in mind.

**Not flagged:** "may have occurred" and "could be caused by". The system does not know what went wrong. Both hedges report that ignorance accurately.

**After:**
> Your request may have failed. The cause may be a data format that does not match what the server expects. An outdated client can cause this mismatch. Check your client version.

## Machine-read: an inter-agent instruction

**Before:**
> Once the upstream job has completed and assuming no errors were raised, the downstream agent should proceed to consume the output artifact, though it is worth noting that partial artifacts are sometimes produced under timeout conditions.

**Flagged:** present perfect, stacked subordinate clauses, three facts in one sentence, 42 words, "once" (ambiguous between "after" and "one time").

**After:**
> Wait for the upstream job to finish with no errors. Then read the output artifact. Warning: a timeout can produce a partial artifact. Check that the artifact is complete before you use it.

Two calls stated, not hidden:

- "should proceed to consume" became the imperative "read". STE permits this in instructions, where a recommendation to the executing agent is a command. Do not make the same move in descriptive text.
- The last sentence is new. The original warned without saying what to do. Added content is called out, never passed off as a rewrite. If the source's silence was deliberate, drop it.

## Documentation: README prose

**Before:**
> Our caching layer is designed to slot seamlessly into your existing stack with minimal friction and no vendor lock-in; it leverages semantic similarity to dramatically reduce the cache misses that traditionally plague LLM workloads.

**Flagged:** marketing adjectives with no measurement ("seamlessly", "minimal friction", "dramatically"), semicolon, "leverages", 36 words.

**After:**
> A normal cache matches requests by exact text, so a small change in wording causes a cache miss. This cache compares the meaning of a new prompt against the prompts it already holds. It runs alongside your current stack and stores no data outside it.

The documentation register kept the explanatory rhythm and let ordinary verbs vary. It still cut the adjectives, the semicolon, and the length.

## Prose: an incident write-up opening

**Before:**
> Recently the team became aware of a situation in which a significant number of volunteers were no longer visible on their shift roster. After a thorough investigation, it was determined that the root cause was related to the way signup deadlines were being evaluated during a resync.

**Flagged:** buried lede (what broke arrives in sentence two, how many never arrives), weasel words ("recently", "significant number", "thorough"), agentless passives ("it was determined"), "situation", "related to the way".

**After:**
> The resync removed 8 of 13 volunteers from one Saturday shift. The signup check read the current time during the resync, so signups made before the deadline counted as late when the check ran again. The fix (v2.4.1) compares each signup against the time it was made.

What broke, how many, why, and the fix, in three sentences. The number replaces the adjective. The actor (the signup check) replaces the passive.

Flagged, not fixed: "recently" needs a date the source did not give.

## Trap 1: the hedge that carried content

The machine-read error message above is the reason the hedge rule exists. An earlier draft rewrote "may have failed" as "failed" and "an outdated client can cause this" as "an outdated client is the most common cause". Both read better. Both are wrong: the first asserts a failure the system only suspects, and the second invents a frequency claim from nowhere.

Test before cutting a hedge: delete it. If the truth conditions of the claim change, it was content. A rewrite that supplies a cause, a frequency, or a mechanism has stopped being a rewrite.

When the tense rule and the hedge rule conflict, the hedge wins. "May have failed" keeps a compound verb form the simple-tense rule would otherwise remove, because dropping the auxiliary deletes the uncertainty with the tense.

## Trap 2: the label that was not a claim

**Before:**
> Four worked examples, one per register plus the two traps that catch most rewrites.

No verb, so no truth conditions. This exact sentence introduced an earlier version of this file and was false for two revisions: the file held two machine-read examples, not one per register. Nobody could check it because nothing predicated it.

**After:**
> Five examples follow: one chat reply, two machine-read strings, one documentation paragraph, and one prose opening. Then come the two traps.

Finite verb, glossed labels, checkable arithmetic. A length target is never a reason to drop the predicate. Split the sentence instead.

## STE rule illustrations

Paraphrased illustrations of individual STE rules, from public secondary sources (see `references/ste-structure.md`). Not quotes from the standard.

| Rule | Before | After | Why |
|---|---|---|---|
| One meaning per word | "Verify the system." / "Check the connections." / "Confirm receipt." | "Ensure the system is correct." (one term, used consistently) | Three near-synonyms make the reader guess whether they mean the same action |
| One part of speech per word | "Oil the valve." | "Apply oil to the valve." | If "oil" is approved only as a noun, the verb use breaks the one-word-one-role guarantee |
| Precise verb meaning | "Follow the safety instructions." | "Obey the safety instructions." | "Follow" can mean "come after" or "obey" |
| Simple tense | "We have received the reports." | "We received the reports." | Present perfect adds a second parse the simple past avoids |
| Verb, not noun | "Perform an inspection of the filter." | "Inspect the filter." | The noun form hides the action behind a filler verb |
| No phrasal verbs | "Take off the access panel." | "Remove the access panel." | "Take off" also means "depart" and "deduct" |
