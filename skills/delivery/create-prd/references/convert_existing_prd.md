# Converting an existing product document

When the request asks to convert, import, adopt or port an existing PRD, product spec or brief held by current `research.sources` or a user-named file, skip the interview. Write the whole PRD in one pass, record its immutable successor, and stop at Step 6:

1. Map the source onto the template: its problem statement and user impact become Problem to Solve; its goals, metrics, or success criteria become Success Measures; its chosen approach becomes Proposed Solution; rejected options become Alternative Solutions Considered; each requirement, user story, flow, or acceptance criterion becomes one Solution Details obligation, an EARS `shall` sentence with an observable outcome; its non-goals become Out of Scope. Beside each mapped statement cite the source as the sources artifact records it: location and pointer.
2. A template section the source does not cover reads `Not stated in <source title>.` followed by the closest fact the source gives, never an invented one. Each such section, and each source statement too vague to be one obligation, becomes one `### Known limits` item and one `### Verify` box naming the decision the reader must make.
3. Do not ask questions during the conversion. Do not write mockups; link the source's own visuals by location when it has them. Do not reconcile the source with the codebase; that is the TDD's work.
4. Wrap up per Step 6: save the PRD locally and reply with `references/prd_final_answer.md`, whose `Check:` and `Known limits:` lines carry the blanks the reader fills before the TDD.
