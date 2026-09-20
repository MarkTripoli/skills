import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(
  root,
  "tests/fixtures/setup-repository/provider-outcomes.json",
);
const referencePath = path.join(
  root,
  "skills/setup-repository/references/repository-metadata.md",
);
const cases = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const reference = fs.readFileSync(referencePath, "utf8");

const caseKeys = [
  "provider",
  "case",
  "mode",
  "priorOwnedState",
  "observedIdentity",
  "observedDigest",
  "expectedCategory",
  "expectedOwnedState",
].sort();
const categories = ["create", "update", "no-op", "conflict", "unsupported"];
const ownershipKeys = ["lastAppliedDigest", "logicalKey", "stableId"];
const forbiddenKeys = new Set([
  "apikey",
  "credential",
  "credentials",
  "endpoint",
  "endpointurl",
  "label",
  "labels",
  "password",
  "secret",
  "token",
  "upsertlabel",
  "url",
]);

function normalizedKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function visit(value, at = "fixture") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, `${at}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    assert.equal(
      forbiddenKeys.has(normalizedKey(key)),
      false,
      `${at}.${key} uses a forbidden generic-provider or secret-shaped key`,
    );
    visit(child, `${at}.${key}`);
  }
}

function byCase(fragment) {
  return cases.find(({ case: name }) => name.includes(fragment));
}

test("provider fixtures expose exactly five result categories and bounded fields", () => {
  assert.ok(Array.isArray(cases));
  assert.ok(cases.length >= 7);
  assert.deepEqual(
    [...new Set(cases.map(({ expectedCategory }) => expectedCategory))].sort(),
    [...categories].sort(),
  );

  for (const fixtureCase of cases) {
    assert.deepEqual(Object.keys(fixtureCase).sort(), caseKeys);
    assert.ok(categories.includes(fixtureCase.expectedCategory));
  }
});

test("owned outcomes use stable identity and digest rules", () => {
  for (const fixtureCase of cases) {
    const { expectedCategory, expectedOwnedState, priorOwnedState } = fixtureCase;

    if (["create", "update"].includes(expectedCategory)) {
      assert.deepEqual(Object.keys(expectedOwnedState).sort(), ownershipKeys);
      assert.ok(expectedOwnedState.logicalKey.startsWith(`${fixtureCase.provider}.`));
      assert.ok(expectedOwnedState.stableId);
      assert.ok(expectedOwnedState.lastAppliedDigest);
    }

    if (expectedCategory === "no-op") {
      assert.deepEqual(expectedOwnedState, priorOwnedState);
    }

    if (["conflict", "unsupported"].includes(expectedCategory) && priorOwnedState === null) {
      assert.equal(expectedOwnedState, null);
    }
  }
});

test("foreign names, drift, explicit reset, and Jira follow the provider contract", () => {
  const foreign = byCase("matching name");
  assert.equal(foreign.priorOwnedState, null);
  assert.ok(foreign.observedIdentity.name);
  assert.equal(foreign.expectedCategory, "conflict");

  const reconcileDrift = byCase("reconcile when recorded identity has drifted");
  assert.equal(reconcileDrift.mode, "reconcile");
  assert.equal(reconcileDrift.expectedCategory, "conflict");
  assert.equal(
    reconcileDrift.observedIdentity.stableId,
    reconcileDrift.priorOwnedState.stableId,
  );
  assert.notEqual(
    reconcileDrift.observedDigest,
    reconcileDrift.priorOwnedState.lastAppliedDigest,
  );

  const resetDrift = byCase("explicit reset observes drift");
  assert.equal(resetDrift.mode, "reset-managed");
  assert.equal(resetDrift.expectedCategory, "update");
  assert.equal(resetDrift.observedIdentity.stableId, resetDrift.priorOwnedState.stableId);

  const jira = cases.find(({ provider }) => provider === "jira");
  assert.equal(jira.expectedCategory, "unsupported");
  assert.equal(jira.expectedOwnedState, null);
});

test("fixtures reject generic upserts, generic label shapes, endpoints, and secrets", () => {
  visit(cases);
  assert.doesNotMatch(JSON.stringify(cases), /upsertLabel/i);
});

test("metadata reference freezes provider behavior without claiming an adapter", () => {
  for (const category of categories) {
    assert.match(reference, new RegExp(`\\b${category.replace("-", "[- ]")}\\b`, "i"));
  }
  assert.match(reference, /recorded stable identity/i);
  assert.match(reference, /different observed digest[\s\S]*conflict[\s\S]*reconcile/i);
  assert.match(reference, /reset-managed[\s\S]*same recorded identity[\s\S]*update/i);
  assert.match(reference, /first release[\s\S]*no provider adapters?/i);
  assert.doesNotMatch(reference, /upsertLabel/);
});
