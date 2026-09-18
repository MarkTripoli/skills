import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const name = "email";

// Writes an RFC 5322 message into the outbox instead of talking to an SMTP server.
export async function deliver({ to, message, config }) {
  const id = randomUUID();
  const dir = path.join(process.cwd(), "outbox");
  fs.mkdirSync(dir, { recursive: true });
  const body = [`From: ${config.from ?? "noreply@example.com"}`, `To: ${to}`, `Subject: Account notification`, `Message-ID: <${id}@notifyctl>`, "", message, ""].join("\r\n");
  fs.writeFileSync(path.join(dir, `${id}.eml`), body);
  return { id, status: "queued" };
}
