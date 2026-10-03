# Converting an existing technical document

When the request asks to convert, import, adopt or port an existing RFC, design document, technical spec or architecture decision held by current `research.sources` or a user-named file, skip the interview and its two review gates. Write the whole TDD in one pass, record its immutable successor, and stop at Step 7:

1. Map the source onto the template, by section:
   - System Design: architecture, components, endpoints, data flow, external systems, and any security, signing, or authentication scheme, naming who signs or authenticates, the header or credential that carries it, the algorithm and secret, and what the other side verifies.
   - Program Design: module layout, call paths, internal contracts.
   - Type Definitions: interfaces, schemas, message shapes, including a scheme's header value format and payload fields.
   - Configuration: settings, flags, migrations.
   - Error Handling: failure modes, retries with their exact count and schedule, and recovery, wherever the source places them.
   - What We're Not Doing: non-goals.

   Beside each mapped statement cite the source as the sources artifact records it: location and pointer. Redraw a diagram the source gives as Mermaid only when its content is fully stated; otherwise link the source's visual by location.
2. Fill the blanks from the repository, not from the source: for each area the source names, start a child worker for role `agent-codebase-locator` or `agent-codebase-pattern-finder` (see the conventions' Child workers section), wait for it, and read its final message. Local Patterns has one entry per area the source names, quoting a compact excerpt, cited `path:line`, of the existing code that area extends even when a mapped section also cites it or the source contradicts it, or `No current code.` with the paths searched. Each mapped section (System Design, Program Design, Type Definitions, Configuration, Error Handling) also states the current code it changes or relies on, cited `path:line` from the workers' findings; for Error Handling, where a failure surfaces today. A mapped section whose workers found no code it changes or relies on says `No current code.` followed by the paths they searched. Where the repository contradicts the source (a module, contract, or store the source assumes does not exist or differs), record the difference in the affected section and as a `### Known limits` item; do not resolve it.
3. A template section the source does not cover, and every item the source marks open (`TBD`, `TODO`, `open question`, `to be decided`), reads `Not stated in <source title>.` followed by the closest fact the source gives, never an invented decision. Each becomes one `### Known limits` item and one `### Verify` box naming the decision the reader must make.
4. Do not ask questions during the conversion. Wrap up per Step 7: save the TDD locally and reply with `references/tdd_final_answer.md`, whose `Check:` and `Known limits:` lines carry the blanks the reader fills before the plan.
