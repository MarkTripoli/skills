# Web

## Launch

`target` is the URL. Without one, start the repository's development server (`npm run dev`, `pnpm dev`, `yarn dev`, or the script the README names) in the background, wait for its port to accept connections, and use `http://localhost:<port>`. Confirm the server is yours: `lsof -i :<port>` then `ps -p <pid> -o args=`.

## Drive

`command -v agent-browser` first.

- Present: `agent-browser open <url>`, then per step `agent-browser snapshot -i` before acting, `agent-browser click @eN` / `agent-browser fill @eN "<text>"` / `agent-browser press <key>`, `agent-browser wait --load networkidle`, `agent-browser snapshot -i` again to read the result, `agent-browser screenshot <task dir>/app-test/SN.png` when a screenshot helps a reviewer; `agent-browser close` at the end.
- Absent: run `node <skills-dir>/test-app/scripts/snapshot.mjs <url> --actions <actions.json> --screenshots <task dir>/app-test`. The actions file is a JSON list of `{"action": "click", "selector": "text=Save"}`, `{"action": "fill", "selector": "#name", "text": "Ada"}`, `{"action": "press", "key": "Enter"}`, `{"action": "wait"}` and `{"action": "screenshot", "name": "S1"}`. It prints one JSON entry per action with the page's text snapshot, or an `error` for an action that failed. It needs Playwright. When it exits nonzero with an install instruction, install Playwright once into a scratch directory outside the repository: `P=$(mktemp -d) && echo "$P" && npm install --prefix "$P" playwright && "$P/node_modules/.bin/playwright" install chromium`, then run the script with `NODE_PATH=<printed directory>/node_modules`; shell variables do not persist between commands, so use the printed directory, not `$P`, later. Never run `npm install` in the repository, and never delete or change its `node_modules`, `package.json` or lockfile; delete only that directory when done. When the install or browser download fails, the web run is `blocked` and `## Missing` names Playwright.
- Neither driver works: `blocked`.
