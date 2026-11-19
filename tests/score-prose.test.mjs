import test from "node:test";
import assert from "node:assert/strict";
import { lintProse, scoreProse, GROUPS } from "../skills/writing/technical-writing/scripts/score-prose.mjs";

const clean = [
  "The build cache stores each compiled module under a key made from its inputs. A pipeline that finds the key downloads the module and skips the compile step.",
  "In the last 30 days the median pipeline took 22 minutes, and 14 of them went to compiling modules that had not changed. Engineers started 1,240 pipelines in that period.",
  "We propose one shared cache in the same region as the runners. A runner asks the cache before it compiles, and it uploads what it had to build.",
  "The cache costs $400 a month for storage and transfer. Larger runners cost $2,100 a month and keep the wasted work.",
  "When the cache is down, a runner compiles every module as it does today. The pipeline is slower for that hour, and no build fails.",
].join("\n\n");
// A machine-written RFC draft: marketing words, filler, hedges, contrast frames and a narrated history.
const SLOP = "# 🚀 RFC: Next-Generation Tenant Rate Limiting for ledger-api\n\n## Executive Summary\n\nIn today's fast-paced SaaS landscape, API reliability is not just a feature — it's a promise. This RFC will delve into a robust, scalable, and future-proof rate limiting solution that will be a game-changer for ledger-api. By leveraging a cutting-edge token bucket architecture, we can seamlessly protect every tenant and unlock a best-in-class experience.\n\n## Background\n\nMany tenants complained about slowness recently. On September 14, 2026 one tenant ran a batch import that sent 41,000 requests in 10 minutes. It is important to note that p99 latency for all 212 tenants rose from 180 ms to 2.4 s for 37 minutes. This was the third incident of this kind in the third quarter of 2026. Today there is only a global limit of 50,000 requests per minute, which is basically a blunt instrument.\n\n## What We Did During The Spike\n\nDuring the spike we first tried an nginx module, then we tried a Lua script, then we looked at three open-source libraries, and then we wrote a prototype in Go. The prototype was tested on Tuesday and again on Thursday. We learned a lot of valuable lessons on this journey. The load test showed the limiter adds 0.4 ms per request at p50. We also explored a sidecar approach, a service mesh approach, and an eBPF approach, each of which has its own pros and cons.\n\n## Proposed Solution\n\n- **Token bucket:** per-tenant token bucket at the API gateway\n- **Limits:** default 600 requests per minute, burst of 1,200\n- **Config:** limits are stored in the config service\n- **Response:** HTTP 429 with a Retry-After header\n- **Counters:** Redis, $180 per month\n- **Effort:** 3 engineer-weeks\n- **Extensibility:** the design also supports per-IP limiting, geo-based limiting, per-API-key limiting, and websocket frame limiting 🌍\n\n## Key Benefits\n\n- **Reliability:** No more noisy neighbors! 🎉\n- **Scalability:** Infinitely scalable and robust.\n- **Support:** Significantly reduces support load.\n- **Fairness:** Every tenant gets a fair share, which is our north star.\n\n## Options\n\nThere are several options: per-tenant limits at the gateway, keeping only the global limit, or a larger database for $4,200 more per month. Each has trade-offs that should be weighed carefully.\n\n## Risks\n\n- Redis failover could be problematic.\n- How enterprise tenants get higher limits remains open.\n\nKeep these questions explicit:\n- What about GraphQL?\n- What about websockets?\n\n## Conclusion\n\nIn conclusion, tenant rate limiting is a crucial step on our reliability journey. Let's make it happen!\n";
const long = (text) => text;
const rules = (text) => lintProse(text).map((h) => h.rule);

test("clean prose scores above 90 and a machine-written draft below 50", () => {
  assert.ok(scoreProse(long(clean)).score > 90);
  assert.ok(scoreProse(SLOP).score < 50);
});

test("the same text gives the same result", () => {
  const text = `${long(clean)}\n\nThis is a robust, seamless solution that could be problematic.`;
  assert.deepEqual(scoreProse(text), scoreProse(text));
});

test("each fault lowers the score and no group costs more than its cap", () => {
  const base = scoreProse(long(clean)).score;
  for (const fault of ["It is basically a very robust north star.", "It is not just a cache but a contract.", "A restart could be problematic."]) {
    assert.ok(scoreProse(`${long(clean)}\n\n${fault}`).score < base, fault);
  }
  const flooded = scoreProse(Array(200).fill("This robust, seamless, scalable platform leverages synergy.").join(" "));
  for (const group of flooded.groups) assert.ok(group.penalty <= GROUPS[group.name].cap, group.name);
  assert.ok(flooded.score >= 0);
});

test("a leftover note or placeholder holds the score at 70", () => {
  const result = scoreProse(`${long(clean)}\n\nThe limit is TBD.`);
  assert.equal(result.score, 70);
  assert.ok(result.capped);
  assert.ok(scoreProse(long(clean), { unfinished: true }).capped);
});

test("code, quotations, block quotes and link text are not scored", () => {
  assert.deepEqual(rules("Run `robust --very-fast`.\n\n```\nbasically seamless\n```\n\n> A robust north star.\n\nSupport said \"many teams wait\". See [adding a skill](docs/testing.md)."), []);
});

test("common phrases that only look like faults pass", () => {
  assert.deepEqual(rules("Count how many pipelines failed. Reply as soon as the run ends. The test harness starts the server. Do not promise a date. The API returns JSON over HTTP."), []);
});

test("a caller's hits count in their group and a caller's filter removes hits", () => {
  const text = `${long(clean)}\n\nIt is a robust cache.`;
  const base = scoreProse(text);
  const extra = scoreProse(text, { extraHits: [{ line: 1, rule: "open-item", group: "claims", weight: 2, match: "", message: "open" }] });
  assert.ok(extra.score < base.score);
  assert.ok(scoreProse(text, { keep: (hit) => hit.rule !== "jargon" }).score > base.score);
});

test("a bold-label bullet is reported only when the caller asks for it", () => {
  const text = "- **Impact:** the job drops from 63 to 25 minutes.";
  assert.deepEqual(rules(text), []);
  assert.deepEqual(lintProse(text, { boldLead: true }).map((h) => h.rule), ["bold-lead"]);
});

test("a short text is scored as if it had the minimum length", () => {
  assert.ok(scoreProse("The cache is robust.").score > 85);
});
