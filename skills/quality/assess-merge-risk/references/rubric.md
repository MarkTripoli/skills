# Merge risk rubric

## Contents

- Rating one finding
- Adjustments
- Intent
- The overall level
- Tests and checks
- Examples
- Signals by surface
- Sources

The level measures harm to the people who use the product after the merge, not code quality. A clumsy change that no user can notice is Low; a one-line change that hides a button on every page is High.

## Rating one finding

A finding is one way the merged tree can change what a user sees or can do. Rate each on two axes.

Severity, the worst plausible outcome for one affected user:

| Severity | Meaning | Examples |
|---|---|---|
| S1 cosmetic | Looks different; the task still works | spacing, color, alignment, copy tone |
| S2 degraded | Slower, confusing, or needs a workaround inside the product that the user can find | slow page, misleading label, extra step, lost preference |
| S3 blocked | A user cannot finish the task in the product: the only path left is outside it, or names no way to get there | hidden or dead control, failing request, crash, lockout, unreadable for a screen reader user |
| S4 harmful | Damage that outlives the bug | data lost or corrupted, wrong money or totals, data shown to the wrong user, security exposure |

Reach, how many users can hit it after the merge:

| Reach | Meaning |
|---|---|
| Narrow | One screen, endpoint or rare path; few users |
| Feature | Everyone who uses one feature or journey |
| Wide | Most users, every request, every tenant, or a shared component, token or global style used across features |

| | Narrow | Feature | Wide |
|---|---|---|---|
| S4 harmful | High | High | High |
| S3 blocked | Medium | High | High |
| S2 degraded | Low | Medium | High |
| S1 cosmetic | Low | Low | Medium |

Login, signup, checkout and payment, and saving user data count as Feature reach at least: everyone passes through them.

## Adjustments

Apply each at most once, after the table, and write its key in the Level cell, for example `Medium (down: flag)`:

| Key | Moves | When |
|---|---|---|
| `down: conditional` | down one | The failure needs a condition the diff does not create: a rare input, a race, an unusual config. Not for S4 |
| `down: flag` | down one | A flag that defaults off, or a staged rollout with automatic rollback, keeps the path from users |
| `down: tested` | down one | A test in the merged tree exercises the exact behavior at risk; a test that only runs the code does not count |
| `up: irreversible` | up one | A revert does not undo it: a one-way migration, deleted or rewritten data, an email or webhook already sent, a mobile or SDK release, a cached client payload |
| `up: silent` | up one | Users would find it before anyone else: wrong but plausible output, a silent failure, no test or alert on the path |

Levels stop at Low and High. S4 stays High unless `down: flag` applies; then Medium.

## Intent

Each finding's Intent cell says whether something explains the effect, and cites where:

| Intent | When | Rating |
|---|---|---|
| `Specified (<source>)` | A ticket, PRD, design or doc asks for this effect | Intended |
| `Stated (<source>)` | Only the MR description or a commit message says it | Intended |
| `Contradicts (<source>)` | A ticket, PRD, design or doc says the product should behave otherwise | A defect: rate it from the table, whatever the MR says |
| `Unexplained` | Nothing says it; a shared component, style, token, helper or default changed for one place and other consumers changed with it | A side effect: rate it from the table with the reach of every consumer. The most common source of an unexpected High |

Specified and Stated count the same. A missing ticket or PRD never raises a level or adds a finding; docs can only add `Contradicts` findings.

- Intended and wide: rate the risk that it lands wrong somewhere the author did not check, usually Medium, and list the screens to look at.
- Intended but not delivered: when the targeted screen or flow does not do what the intent says, that is a finding too, with the intent as its source.
- Two sources disagree: the ticket or doc wins over the MR description, and the finding is `Contradicts`. Name both sources.

## The overall level

- The overall level is the highest finding level.
- Low needs evidence: every finding Low, or no change a user can reach (tests, docs, tooling, dead code).
- A shared thing whose consumers cannot be found or read is at least Medium; say what was not verified. Missing evidence never lowers a level.
- Conflicts and stale branches do not set the level. They mean the merged tree differs from the source branch: assess the merged tree and name the files whose resolution needs a careful look.
- Size raises likelihood, not impact. A large, scattered diff with no rated finding still gets a Not verified line for the areas not read.

## Tests and checks

Exploratory QA happens outside this skill: never ask anyone to "click through the product" or "check it in a real browser". A local check may still include exact UI steps on a local build, simulator or emulator, after the command that starts it.

| Finding | Goes in | Content |
|---|---|---|
| Level High, or severity S4 | Before merging, one item per finding | `Test:` an integration test to add (file, setup, assertion), and/or `Local check:` the exact commands or steps a developer runs locally, ending with what to expect. Prefer a test when the repository has an integration suite that can reach the path; add a local check when a test cannot reach it (a device upgrade, a simulator-only flow, a real third-party service) or would take more than a day |
| Any other level | Advisories, only when a test would catch it | `Test:` an integration test that would catch the failure. Leave the finding out when no test would help |

With no High or S4 finding, the block reads `Before merging: None.`; with no advisory, `Advisories: None.`

A local check is specific enough to run without judgment: at least one command written as run `<command>`, the data or fixture to start from, the action, and the result that clears the finding, after "expect". The expected result is the healthy outcome, so the check passes only when the finding is wrong or fixed; a check that confirms the failure, or only reads the diff, clears nothing. "Test the migration" is not a local check; this is: "Check out `main`, run `flutter test integration_test/drafts_seed_test.dart` to create a v12 drafts database, check out the branch, run the app with `flutter run`, open Drafts; expect the three seeded drafts to open."

## Examples

Each example is a change, its intent, and the row it produces; the Intent cell is the last column.

1. Intent "make the save button on the profile page submit on Enter". The diff changes the shared `Button` default from `type="button"` to `type="submit"`; the merged tree has 40 importers, 12 inside forms with other buttons.

   | 1 | Cancel and Back buttons inside forms submit the form instead | Users of the 12 forms with secondary buttons, including checkout | S3 | Wide | High | `src/ui/Button.tsx:8`, `src/checkout/Address.tsx:51` | Unexplained |

2. Ticket PROJ-88 asks to "raise contrast of the primary color site-wide"; the diff changes one token and updates every visual snapshot.

   | 1 | Every primary button and link turns a darker blue | All users | S1 | Wide | Medium | `src/theme/tokens.css:3` | Specified (PROJ-88) |

3. Intent "drop the unused `legacy_name` column"; the migration drops it, and a nightly export job in the merged tree still reads it.

   | 1 | The nightly customer export fails, and the dropped values cannot be restored by a revert | Admins who download exports | S3 | Feature | High (up: irreversible) | `db/migrate/0042_drop_legacy_name.rb:3`, `jobs/export.rb:27` | Unexplained |

4. Intent "fix typo on the pricing page" in the MR description; one string changes.

   | 1 | Corrected heading text on the pricing page | Visitors to the pricing page | S1 | Narrow | Low | `src/pages/Pricing.tsx:14` | Stated (MR description) |

5. The MR description says "remove the export button; nobody uses it". `docs/prd/reports.md:22` says admins must be able to export every report.

   | 1 | Admins can no longer export reports | Admins on the reports page | S3 | Feature | High | `src/reports/Toolbar.tsx:31` | Contradicts (`docs/prd/reports.md:22`) |

6. A saved report has a High finding, "the drafts migration may fail for users upgrading from schema v12", with a local check. The developer reports: "On `c85b177`, I ran `flutter test integration_test/drafts_seed_test.dart` on main, switched to the branch, ran `flutter run -d 'iPhone 16'`, and the three seeded drafts opened." The row and its Before merging item go, and the report gains:

   ```text
   Retracted:
   - Drafts fail to open after upgrading from schema v12. Cleared by: the Local check for that finding, run by the developer on `c85b177` on the iPhone 16 simulator. Observed: the three seeded drafts opened.
   ```

## Signals by surface

The signals to look for on each surface, with the typical worst outcome, are data: `scope.mjs` prints them beside the files they apply to, from the surfaces file that SKILL.md links. Signals point at where to read; the diff and its consumers decide the finding.

## Sources

- Google SRE book, introduction: about 70% of outages come from changes to a live system. https://sre.google/sre-book/introduction/
- Meta Diff Risk Score: gates diffs by predicted impact on end users in tiers. https://engineering.fb.com/2025/08/06/developer-tools/diff-risk-score-drs-ai-risk-aware-software-development-meta/
- Kamei et al., just-in-time defect prediction: size, diffusion and experience predict defective changes. https://sail.cs.queensu.ca/data/pdfs/TSE_ALarge-ScaleEmpiricalStudyOfJust-in-TimeQualityAssurance.pdf
- DORA change failure rate. https://dora.dev/guides/dora-metrics/history/
- Semantic Versioning. https://semver.org/
- buf breaking rules. https://buf.build/docs/breaking/rules/
- GraphQL Inspector diff. https://the-guild.dev/graphql/inspector/docs/essentials/diff
- oasdiff. https://github.com/oasdiff/oasdiff
- strong_migrations. https://github.com/ankane/strong_migrations
- Parallel change. https://martinfowler.com/bliki/ParallelChange.html
- WCAG 2.2. https://www.w3.org/TR/WCAG22/
