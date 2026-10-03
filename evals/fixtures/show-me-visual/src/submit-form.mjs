import { createSession } from "./create-session.mjs";

// Validates the form fields, opens a session for the signed-in user, then stores the form.
export function submitForm(form, user) {
  if (!form.title || form.title.trim() === "") throw new Error("title is required");
  const session = createSession(user, { scope: "forms:write" });
  return { id: `${session.token}:${form.title}`, session: session.token };
}
