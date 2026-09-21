---
task: one-thing-i-m
type: design-discussion
summary: "A portable route-model helper owns candidate validation and JEV selection for every supported harness. It accepts exact caller-supplied candidates, chooses the cheapest adequate candidate, keeps economy defaults for mutation and unknown phases, and exposes a Node JSON contract. Atomic delegates to it; native discovery is limited to stable Pi and Oh My Pi catalog commands, while Claude Code and Codex require explicit candidates."
repo: skills
branch: one-thing-i-m
sha: 130b0b1
---

# Shared portable model routing

## Decision

Add model-invoked `skills/delivery/configure-model-routing/SKILL.md` as the setup owner for missing or invalid profiles. It asks one question at a time, writes project or `SKILLS_MODEL_CANDIDATES_FILE` profiles, and verifies the saved file through `route-model`.

Create `skills/delivery/route-model/route-model.mjs` as the single policy owner. The helper accepts a request, phase, exact candidate list, and economy candidate; it validates the list, asks JEV to choose among the supplied candidates for eligible non-mutating phases, and returns a machine-readable selection record. A CLI reads one JSON request from stdin and writes one JSON response to stdout, so Claude Code, Codex, Oh My Pi, Pi, portable installs, and Atomic can call the same code without proxy interception.

Candidates are `{model, cost, description}` objects. `model` is the exact native identifier, `cost` is a caller-supplied comparable non-negative number, and `description` states capability. The helper never invents candidates, fetches provider registries, probes accounts, or treats cost as provider billing truth. It ranks by lowest expected loss: JEV supplies adequacy probabilities and the helper combines them with normalized cost and an under-provision penalty. A single candidate is selected without JEV.

## Policy invariants

- The configured economy candidate must appear exactly in the supplied candidate set.
- Mutation, implementation, tool-oriented, and unknown phases select economy without JEV.
- Eligible non-mutating phases may select only supplied candidates; the selected candidate minimizes expected loss, not merely the highest JEV probability.
- Omitted candidate configuration preserves the Atomic two-candidate compatibility path. An explicit empty list fails before execution.
- JEV failure is visible and fail-closed when a judgment is required. Native execution failure never triggers a model fallback.
- Credentials stay in the environment or configured key file and never enter artifacts, CLI JSON, or selection records.

## Harness boundary

`configure-model-routing` uses `pi --list-models` and `omp models --json` only when those stable public commands are available; failed discovery falls back to explicit IDs. Claude Code and Codex use explicit candidates without private catalog scraping.

`Atomic` calls the portable helper and passes exact candidate objects derived from its existing model inputs. Its defaults remain Luna-fast as economy and Sol as the optional reasoning candidate, with mutation and unknown phases on economy.

Pi and Oh My Pi may discover exact candidates only through a stable public catalog command supplied by their runtime adapter. Claude Code and Codex do not use provider-private scraping; callers or configuration must provide candidates explicitly. Herdr handoffs pass a selected model to `herdr agent start --model` when candidates are configured and the selected runtime supports enforcement. Manual handoffs cannot enforce a model, so they print the recommendation and preserve the ordinary command.

## Rejected alternatives

- A proxy or wrapper around Claude Code or Codex would own authentication and turn execution, duplicate native routing, and violate the requested boundary.
- Separate Atomic and portable routers would allow policy drift.
- Provider-private registries, account probing, and guessed static catalogs would misrepresent authenticated availability.
- A fixed two-choice economy/reasoning response cannot route an arbitrary exact candidate list or minimize cost.

## Contract example

```json
{"phase":"create-plan","request":"Plan the change","economy":"openai-codex/gpt-5.6-luna-fast","candidates":[{"model":"openai-codex/gpt-5.6-luna-fast","cost":1,"description":"fast implementation and ordinary reasoning"},{"model":"openai-codex/gpt-5.6-sol","cost":4,"description":"strong planning and review reasoning"}],"routing":"auto"}
```

```json
{"model":"openai-codex/gpt-5.6-luna-fast","source":"policy|jev","candidates":["openai-codex/gpt-5.6-luna-fast","openai-codex/gpt-5.6-sol"],"availableCandidates":[...],"confidence":0.0,"probabilities":{...}}
```

### Verify

- [ ] The helper rejects duplicate or malformed candidates, missing economy, negative costs, and empty explicit lists.
- [ ] Tests prove economy policy for mutation and unknown phases, cheapest adequate selection for eligible phases, JEV failure, and exact candidate preservation.
- [ ] Atomic imports the helper rather than maintaining a second JEV policy.
- [ ] Herdr documents enforced `--model` and manual recommendation behavior.
- [ ] `npm test` and commit checks pass.

### Known limits

- Candidate truth and cost are caller-owned; the helper does not verify account access or provider pricing.
- Native catalog discovery is adapter-specific and only documented where Pi or Oh My Pi exposes `pi --list-models` or `omp models --json`; failed discovery uses explicit input.
- Herdr's native command must support `--model`; manual sessions cannot be forced by this repository.
