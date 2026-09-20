import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizedGitEnvironment } from "../evals/git-environment.mjs";

test("Git environment sanitization removes every case variant", () => {
  // Given
  const environment = {
    PATH: "/bin",
    GIT_DIR: "uppercase",
    git_work_tree: "lowercase",
    Git_Config_Count: "mixed",
  };

  // When
  const sanitized = sanitizedGitEnvironment(environment);

  // Then
  assert.equal(sanitized.PATH, "/bin");
  assert.equal(Object.keys(sanitized).some((key) => key.toUpperCase().startsWith("GIT_")
    && !["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_SYSTEM"].includes(key)), false);
});
