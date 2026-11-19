# HTML survey report

## Contents

- Where the page goes
- Scaffold
- Header
- Candidate card
- Diagram patterns
- Style
- Top recommendation
- Wording

## Where the page goes

One self-contained HTML file in the OS temp directory (`$TMPDIR`, else `/tmp`), named `architecture-review-<timestamp>.html` so each run gets a fresh file. Nothing lands in the repository. Open it (`open` on macOS, `xdg-open` on Linux) and give the absolute path. When the user wants the page shared, the installed show-me skill may publish it instead.

## Scaffold

Tailwind and Mermaid come from CDNs with pinned versions; nothing else runs on the page.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Architecture review for {repo}</title>
    <script src="https://cdn.tailwindcss.com/3.4.17"></script>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true, theme: "neutral" });
    </script>
    <style>
      .seam { stroke-dasharray: 4 4; }
      .leak { stroke: #dc2626; }
      .deep { background: linear-gradient(135deg, #0f172a, #1e293b); }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans">
    <main class="max-w-5xl mx-auto px-6 py-12 space-y-12">
      <header>...</header>
      <section id="candidates" class="space-y-10">...</section>
      <section id="top-recommendation">...</section>
    </main>
  </body>
</html>
```

## Header

Repository name, date and a legend: solid box is a module, dashed line a seam, red arrow leakage, thick dark box a deep module. No introduction paragraph.

## Candidate card

One `<article>` per candidate, in ranked order. The diagram carries the point; prose stays sparse.

- **Title** names the deepening: "Fold the order intake modules into one".
- **Badges:** strength (`Strong` emerald, `Worth exploring` amber, `Speculative` slate) and dependency category (`in-process`, `local-substitutable`, `ports & adapters`, `mock`).
- **Files** in `font-mono text-sm`.
- **Before and after diagram**, two columns side by side.
- **Problem:** one sentence. **Solution:** one sentence.
- **Wins:** bullets of six words or fewer in vocabulary terms, such as "locality: bugs concentrate in one module".
- **ADR callout**, one line in an amber box, only when the candidate contradicts an ADR.

If a diagram needs a paragraph to be understood, redraw it.

## Diagram patterns

Vary them across cards.

- **Mermaid flowchart** for call flow and dependencies; color leak edges red with `classDef`. A sequence diagram suits "six round trips become one".

  ```html
  <div class="rounded-lg border border-slate-200 bg-white p-4">
    <pre class="mermaid">
      flowchart LR
        A[OrderHandler] --> B[OrderValidator]
        B --> C[OrderRepo]
        C -.leak.-> D[PricingClient]
        classDef leak stroke:#dc2626,stroke-width:2px;
        class C,D leak
    </pre>
  </div>
  ```

- **Hand-built boxes and arrows:** `div` modules with inline SVG arrows, when the after state should read as one thick deep module with faded internals.
- **Cross-section:** stacked bands (`h-12 border-l-4`) for the layers a call crosses; many thin bands before, one thick band after.
- **Mass diagram:** two rectangles per module, interface and implementation; nearly equal before, short over tall after.
- **Call-graph collapse:** nested call boxes before, one box with faded internal calls after.

## Style

- Editorial, not dashboard: generous whitespace, optional `font-serif` headings.
- One accent (emerald or indigo), red for leakage, amber for warnings.
- Diagrams about 320px tall so both columns fit without scrolling.
- Module labels in diagrams use `text-xs uppercase tracking-wider`.

## Top recommendation

One larger card: candidate name, one sentence on why, an anchor link to its card.

## Wording

Use the SKILL.md vocabulary exactly. Write "Order intake module is shallow: interface nearly matches the implementation", "Pricing leaks across the seam", "Two adapters justify the seam: HTTP in production, in-memory in tests". Replace "easier to maintain" or "cleaner code" with the leverage or locality gain it hides.
