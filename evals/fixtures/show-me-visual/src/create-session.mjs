import { randomUUID } from "node:crypto";

const sessions = new Map();

// Issues a token for `user` limited to `options.scope` and remembers it for one hour.
export function createSession(user, options) {
  const token = randomUUID();
  sessions.set(token, { user, scope: options.scope, expires: Date.now() + 3_600_000 });
  return { token };
}
