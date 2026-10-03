import http from "node:http";

const PAGE = `<!doctype html>
<title>Sign-up</title>
<h1>Sign-up</h1>
<button id="subscribe" onclick="document.getElementById('status').textContent = 'Thanks for subscribing'">Subscribe</button>
<p id="status"></p>
`;

const port = Number(process.env.PORT ?? 4310);
http
  .createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(PAGE);
  })
  .listen(port, () => console.log(`listening on http://localhost:${port}`));
