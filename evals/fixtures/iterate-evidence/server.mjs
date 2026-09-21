import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const routes = new Map([["/", ["index.html", "text/html"]], ["/app.js", ["app.js", "text/javascript"]]]);
const server = http.createServer((request, response) => {
  const route = routes.get(new URL(request.url, "http://127.0.0.1").pathname);
  response.setHeader("Cache-Control", "no-store");
  if (!route) { response.writeHead(404); response.end("Not found"); return; }
  try {
    response.setHeader("Content-Type", `${route[1]}; charset=utf-8`);
    response.end(fs.readFileSync(path.join(root, route[0])));
  } catch {
    response.writeHead(500);
    response.end("Fixture unavailable");
  }
});
server.listen(0, "127.0.0.1", () => console.log(`http://127.0.0.1:${server.address().port}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close());
