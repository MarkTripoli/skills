// Exits 0 only when the README's `Channels:` line lists `sms`.
import fs from "node:fs";

const readme = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8");
if (!/^Channels:.*\bsms\b/m.test(readme)) {
  console.error("README.md: the Channels line does not list sms");
  process.exit(1);
}
console.log("README.md lists sms");
