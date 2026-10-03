# Personas

Each file here describes one reader of an `/explain` page: who they are, what they want to see, the tone, how to write numbers, words to avoid, and which sections their page shows. Every persona's page is built from the same template (`../references/page.html`) and the same style, so pages look alike. What changes is which sections appear, in what order, and how they are worded.

You can edit these files without touching any code.

## Change a persona

- **The line under the title** (who reads it), **What they want to see**, **Tone**, **Numbers**: plain guidance the writer follows. Edit freely; put any other guidance under Tone.
- **Words to avoid**: one plain word or phrase per bullet, with no notes; apostrophes, hyphens, slashes and dots are fine (don't, e-mail, CI/CD, Node.js), other punctuation is not. The page check rejects it and its plural (commit, commits; branch, branches) in the page's own words; list other forms you want caught, such as "latencies". Exact on-screen quotes and the evidence footer may still use them.
- **Sections**: a numbered list of section names from the menu below, in the order the page shows them. Add "(optional)" after a name to let the writer drop it when the evidence has nothing for it. `top` comes first and `about-evidence` last, and neither is optional.
- **Limits**: `- Table rows: at most N` and `- Pictures and videos: at most N`. Write "None." for no limits.

## Add a persona

Copy a file, rename it (for example `sales.md`), and edit it. The file name is the persona's name: `/explain sales`.

Make every change here, in the skills repository (`skills/explain/personas/`), and open a pull request; installing the skills again copies it everywhere. A file edited inside an installed copy is replaced at the next install.

## Section menu

`headline-number`, `test-results`, `key-facts` and `video` sit in the banner at the top of the page; listing them turns them on, and they keep their place in the banner.

| Section | What it shows |
|---|---|
| `top` | The page title, the outcome, and why it matters |
| `headline-number` | The one measurement every page leads with: before and now |
| `test-results` | How many behaviors passed, were not captured, or failed |
| `key-facts` | The change, branch, what it was compared with, builds and environment |
| `video` | The before and after recording, side by side |
| `before-and-now` | Two cards: how it was and how it is now, with screens when useful |
| `before-stills` | Screens from the old flow, in order, with times |
| `timeline` | What happens now, moment by moment, with times, exact words and screens |
| `copy-changes` | On-screen words that changed, old beside new |
| `new-states` | Each new screen state, such as a loading cue, and what it means |
| `mechanism` | A diagram of how it works and what moved |
| `numbers` | The measurements in a table, with an optional chart |
| `build-under-test` | The build, devices, test data and steps to reach the behavior |
| `coverage` | Each behavior, what was expected, the evidence, and the result |
| `where-it-lives` | The files that changed and what each one does |
| `test-next` | What to test by hand next, and what could break nearby |
| `scope` | What shipped, what stayed the same, and what is not in this change |
| `decisions` | The decisions made and why |
| `takeaways` | What we learned |
| `open-question` | One question still to decide, with what raised it |
| `status` | Where the change stands, the next step, the decision and the open item |
| `limits` | What the evidence does not prove |
| `about-evidence` | The fine print: what is real, what was set up, what is not shown, sources |

The Slack message has its own template, `../references/slack.md`, in the same voice.

Keep the headings as they are, each once and with two hashes: the check reads Words to avoid, Sections and Limits by name, and reports any other `##` heading, a repeated one, a section name not in the menu, a word bullet with extra text, or a limit it does not know. `npm test` runs that check on every persona file.
