# Pi

## Skill notes

Invoke a skill by typing `/<name>` in the Pi prompt, for example `/create-plan @03-plan-verbose-flag-cli.md`.
Child workers: Pi has no worker tool of its own. Ordinary phase roles run inline after reading their installed skill and report this.

## Install

`npx git+github:MarkTripoli/skills pi` performs these steps (add `--project` for one repository, `--dry-run` to look first); by hand:

1. Skills: Pi reads `~/.agents/skills/` and `<project>/.agents/skills/` natively, so the portable install is enough: `cp -R skills/delivery/* skills/show-me ~/.agents/skills/` from a checkout. For the Pi notes inserted into every skill, build `npm run build -- --runtime pi` and copy `dist/pi/skills/*` to `~/.pi/agent/skills/` instead.
2. Workers: none are generated. Ordinary roles run inline.
3. Restart Pi or `/reload`; `/` lists the skills.

## Model routing

Run `/configure-model-routing` when no valid profile exists. Standalone Pi skills may call the shared `route-model` helper through Node; discovery may use the documented public `pi --list-models` command, and failed or unavailable discovery falls back to explicit exact candidates. Do not scrape provider-private registries or store credentials.
