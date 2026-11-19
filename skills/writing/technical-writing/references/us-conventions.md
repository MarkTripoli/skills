# US conventions

The dialect rulings. They apply in every register, including chat. Convert the text, do not match it. Exceptions: direct quotations, proper nouns, code identifiers, literal strings.

## Spelling

| Use | Not |
|---|---|
| organize, realize, recognize, prioritize | -ise forms |
| analyze, paralyze, catalyze (verbs only; *analysis* is unchanged) | analyse, paralyse |
| color, favor, labor, honor, behavior, neighbor | -our forms |
| center, theater, meter, liter, fiber | -re forms |
| traveling, traveled, canceled, modeling, labeling, signaling, focused | doubled consonants |
| offense, license (noun and verb), practice (noun and verb) | offence, licence/license split, practice/practise split |
| judgment, acknowledgment | judgement, acknowledgement |
| gray, catalog, dialog (UI element), analog, program | grey, catalogue, dialogue (UI), analogue, programme |
| toward, afterward, forward | trailing -s forms |
| math, airplane, aluminum | maths, aeroplane, aluminium |

US doubles the consonant only when the final syllable is stressed: referred, occurred, committed, transferred. *Dialogue* keeps -ue when it means conversation.

## Punctuation

- **Serial comma, always.** "The service validates, transforms, and stores each record." A list without it has two readings. Machine readers pick badly.
- **Quotation marks.** Double outside, single inside. Commas and periods inside in prose: `The build is "green," so ship it.` Outside when the quoted thing is a string, path, command, flag, or token, because a comma inside changes the value: `Set the mode to "strict", not "lax".` Better: code formatting, which removes the question.
- **Periods in abbreviations.** Mr., Dr., e.g., i.e., etc., vs. No periods in acronyms: US, API, HTTP. In machine-read text and documentation, write "for example" and "that is" instead of e.g. and i.e.
- **Em dash** closed up, no spaces. None in machine-read text, sparingly elsewhere. **En dash** for ranges: pages 20–30, 2020–2024. **Hyphen** for compound modifiers before a noun (a well-known bug) not after (the bug is well known). Never hyphenate an -ly adverb. US closes up what British hyphenates: cooperate, coordinate, email, nonzero, reenter. Keep the hyphen only when the closed form misreads: re-sign vs resign.
- One space after a period. No exclamation points. Ellipses only inside quotations to mark an omission.

## Dates and times

| Context | Format |
|---|---|
| Prose | April 5, 1999. Comma after the year when the sentence continues |
| Prose, no day | April 1999 |
| Logs, filenames, tables, machine strings, API fields | 2025-04-05 |
| Timestamps | 2025-04-05T14:30:00Z. Always state the zone |
| Clock time in prose | 3 p.m., 9:30 a.m., or the 24-hour clock in operational text |
| Decades | the 1990s |
| Ranges | 2020–2024, April–June |

Never 4/5/25: April 5 in the US, May 4 nearly everywhere else. Seasons are ambiguous across hemispheres. Give a month or a quarter.

## Numbers

Spell out one through ten. Figures from 11. "Three retries", "27 nodes".

Always figures: percentages (5%, symbol closed up), money ($5, $1.2 million), measurements with a space before the unit (250 ms, 3 GB, 40 Mbps, except % and °), versions, ports, exit codes, HTTP statuses, parameters, numbered steps, anything in a table or a machine-read string, every quantity in machine-read text.

- Comma separators from four digits: 1,250. Decimal point, never a decimal comma.
- Money in prose spells the scale: $5 million, $3.2 billion. Tables may abbreviate: $5m, $3.2bn.
- Percentage points for a change in a rate: "from 3% to 5%, up two percentage points", not "up 2%".
- Never open a sentence with a numeral. "Twenty-seven nodes failed", or rewrite: "The outage took down 27 nodes."
- Round to the precision you can defend. 23%, not 23.47%, unless the decimals carry information.

## Grammar rulings

- Collective nouns singular: "the team is", "the company has".
- "different from", not "different than" or "different to".
- "try to", not "try and".
- "will", not "shall", in prose. *Shall* survives in contracts and in EARS acceptance criteria.
- "about", not "approximately".
- "compared with" for differences, "compared to" for likening.
- *That* introduces a restrictive clause, no comma: "the file that failed". *Which* introduces a non-restrictive clause, with a comma: "the config file, which we ship by default". STE depends on this, because the comma is the only signal of scope.
- Titles and roles lowercase unless directly before a name: "chairman of the Federal Reserve", but "Chairman Jerome Powell". Prefer the first.
- Full name at first mention, surname after. Be consistent.

## Capitalization

- Headings in sentence case. "Configuring the retry policy."
- Product and feature names take their owner's capitalization. Generic descriptions do not: "the Kubernetes scheduler", but "a scheduler".
- Institutions capitalized when specific, lowercase when generic: "the Federal Reserve", "the central bank".
- No capitalization for emphasis.
- Acronyms: spell out at first use with the acronym in parentheses, then use the acronym. Skip the expansion for acronyms the whole audience knows (API, HTTP, CPU). An acronym used once is not an acronym. Say the words.
