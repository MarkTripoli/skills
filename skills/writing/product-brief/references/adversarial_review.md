# Adversarial review

Run the four reviews in parallel, each in a fresh child worker that has not seen the drafting. Give each one the rendered page or its extracted text, the screenshots of every sketch, and the prompt below. Give none of them the sources, so that each gap in the brief appears as a guess.

When the runtime has no worker support, apply each role as a separate inline pass. Report that the review was not independent. When screenshots cannot be captured, review the HTML and extracted text and leave visual checks explicitly unverified.

## 1. Coding agent

> You are a coding agent. This page is the only description you have of a feature you must build in an app you do not know. Read it, then report:
> 1. Your build plan, in numbered steps.
> 2. Every guess you would have to make, with the guess you would choose. Mark a guess **Wrong** when a rule in the page contradicts your choice.
> 3. Anything you would misread or over-apply: a sketch detail you would copy literally, an aside you would build, a link you cannot open.
> 4. The number of tests you can derive from the page alone.

## 2. Unfamiliar engineer

> You are a senior engineer new to this product. Review the page as the only input to your build. Tag each finding [H] if it would make you build the wrong thing, [M] if it forces a guess, [L] if it is noise or polish. For each finding, quote the text and say what you would build from it. Check that the principles, the sketches, and the functional specifications agree, including every name and count.

## 3. Sentence editor

> Read every sentence of the page on its own, with only the sentence before it as context. List each sentence that:
> - uses a name, label, or abbreviation defined far away on the page, without saying what it is.
> - names a role or action without saying who acts ("Admin, or the Group Lead of a Group the person waits in" with no subject).
> - is a slogan, a signpost ("This brief explains"), a rhythm line, or a "not X but Y" frame.
> - uses a weasel word (many, several, most, some) where a number or a name fits.
> - states invented precision, such as a numbered range larger than the list.
> Give a rewrite for each one.

## 4. Domain newcomer

> You have heard of this product but never used this feature, and you know none of its jargon. Read the page once, top to bottom, and stop at each place you get lost. Tag each finding [H] if you cannot say what the page means, [M] if you can only guess, [L] if it is detail you did not need. List:
> - each term, setting, or abbreviation you met before the page explained what it means. Spelling out an abbreviation does not count as explaining it.
> - each principle heading you cannot restate in your own words.
> - each person in Who's who whose case you cannot state as what they can or cannot see or do.
> - each detail that changed nothing you understood: an ID, a code, a surname, a value list.
> - each principle that reads as specification: field lists, value lists, limits, dialog copy.
> - each principle you would have understood faster from a sketch you had not yet reached.
> Say what you guessed for each one.

## Using the findings

1. Fix every [H] finding and every **Wrong** guess in the brief itself. Do not answer them in chat.
2. A guess that the brief should settle becomes a principle sentence, a rule, a sketch note, or a functional specification. Pick the one layer it belongs to.
3. A finding that needs an owner decision becomes a question to the user. Put each one with options and a recommendation.
4. Rerun the review that raised the finding after a fix, until no [H] findings and no **Wrong** guesses remain.
