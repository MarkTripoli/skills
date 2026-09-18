import { randomUUID } from "node:crypto";

export const name = "console";

export async function deliver({ to, message }) {
  process.stdout.write(`[console] to=${to} ${message}\n`);
  return { id: randomUUID(), status: "delivered" };
}
