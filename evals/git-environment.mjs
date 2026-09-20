import os from "node:os";

export function sanitizedGitEnvironment(environment = process.env) {
  const sanitized = {};
  for (const [key, value] of Object.entries(environment)) {
    if (!key.startsWith("GIT_")) sanitized[key] = value;
  }
  sanitized.GIT_CONFIG_GLOBAL = os.devNull;
  sanitized.GIT_CONFIG_NOSYSTEM = "1";
  sanitized.GIT_CONFIG_SYSTEM = os.devNull;
  return sanitized;
}
