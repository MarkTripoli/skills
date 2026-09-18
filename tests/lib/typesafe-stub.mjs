// A stand-in for the TypeSafe System One endpoint: answers each question through the test's `decide`
// function, records every request, and rejects a missing bearer token like the real service.
// Usage: const stub = await startStub((id, question, state) => noul(0.9)); ... stub.close();
import http from "node:http";

export const noul = (p) => ({ type: "noul", noul: p });
// A choice with `p` on the chosen option and the rest spread over the others; confidence is `p`.
export const choice = (chosen, criteria, p = 0.95) => {
  const keys = Object.keys(criteria);
  const rest = keys.length > 1 ? (1 - p) / (keys.length - 1) : 0;
  return { type: "choice", choice: chosen, probabilities: Object.fromEntries(keys.map((key) => [key, key === chosen ? p : rest])), confidence: p };
};
export const score = (level, levels, p = 0.95) => {
  const rest = levels.length > 1 ? (1 - p) / (levels.length - 1) : 0;
  return { type: "score", score: level, legend: Object.fromEntries(levels.map((text, i) => [String(i), text])), probabilities: Object.fromEntries(levels.map((_, i) => [String(i), i === level ? p : rest])), confidence: p };
};

export function startStub(decide, options = {}) {
  const requests = [];
  const statuses = [...(options.statuses ?? [])];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      if (request.headers.authorization !== "Bearer test-key") { response.writeHead(401); response.end('{"error":"unauthorized"}'); return; }
      const payload = JSON.parse(body);
      requests.push(payload);
      const status = statuses.shift();
      if (status) {
        response.writeHead(status, options.retryAfter === undefined ? {} : { "retry-after": String(options.retryAfter) });
        response.end(status === 400 ? '{"error":"max_tokens_exceeded"}' : `{"error":"status ${status}"}`);
        return;
      }
      const answers = {};
      for (const [id, question] of Object.entries(payload.questions)) answers[id] = decide(id, question, payload.state);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ model: "jev-stub", answers, usage: { input_tokens: 1, output_tokens: 1 } }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${server.address().port}`;
      resolve({ url, requests, env: { TYPESAFE_API_KEY: "test-key", TYPESAFE_BASE_URL: url }, close: () => server.close() });
    });
  });
}
