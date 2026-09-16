// npm `prepare`: point git at the repository's hooks (commit-msg validates Conventional Commits). A no-op
// outside a git checkout, such as when npx installs the package from GitHub to run the installer.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

if (fs.existsSync(".git") && fs.existsSync(".githooks")) {
  try {
    execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
  } catch {
    // git missing or refusing: the hook is a convenience, the CI check is the gate.
  }
}
