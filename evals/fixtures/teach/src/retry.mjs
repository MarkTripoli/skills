// Calls `send` until it succeeds or `attempts` runs out, waiting `baseMs * 2 ** n` between tries.
// A 4xx response is returned at once: retrying a request the server rejected cannot succeed.
export async function withRetry(send, { attempts = 3, baseMs = 200, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last;
  for (let n = 0; n < attempts; n++) {
    last = await send();
    if (last.status < 500) return last;
    if (n < attempts - 1) await sleep(baseMs * 2 ** n);
  }
  return last;
}
