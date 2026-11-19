# Word list

`scripts/score-prose.mjs` reads the tables in this file, and so does the RFC checker of the optional rfc-six-pager skill. Each listed word or phrase is reported when it appears in prose, outside code, quotations, and block quotes. To ban a word, add it to a row. To allow one, delete it. A term that ends in `*` matches every word that starts with it. The first word of each heading is the rule name the scripts print.

A listed word that is the name of a feature, a product, or a field stays: put it in backticks.

The reasons behind these lists are in `craft.md` and `word-rulings.md`. These tables hold the terms a script can find.

## Weasel words

A size, a quality, or a time with no measurement. Give the number and its source, or say that the number is unknown and list it under Risks and open questions.

| Word or phrase | Write instead |
|---|---|
| many, several, various, numerous, a lot of, lots of, a number of, a variety of, a range of, countless | the count or the share |
| significant*, substantial*, considerable, considerably, notable, notably, dramatic*, massive*, huge | the measurement, with a comparison |
| soon, shortly, asap, recently, in the near future, in the coming months | the date |
| studies show, experts say, best practice*, industry standard, widely used, widely adopted, it is well known | the named source |

## Jargon

Words that sound like a claim and state none. Most machine-written drafts are full of them. Say the plain thing or the measurement.

| Word or phrase | Write instead |
|---|---|
| leverag*, utiliz*, harnessing, harness the power | use |
| delve*, deep dive, dive into, dig into, unpack* | examine, or cut |
| robust, seamless*, frictionless, effortless*, intuitive | what it withstands or what the person no longer does |
| scalable, performant, powerful, elegant | the load, the latency, or the property, with a number |
| holistic*, comprehensive*, end-to-end solution, synerg*, ecosystem play | what is included |
| cutting-edge, state-of-the-art, next-generation, world-class, best-in-class, industry-leading, groundbreaking, revolutionar*, transformative, innovative | the benchmark, or cut |
| crucial, pivotal, vital, paramount, mission-critical | why it matters, in the next clause |
| empower*, foster*, elevate*, supercharg*, turbocharg*, streamlin*, future-proof*, unlock the | what the person can now do |
| tapestry, testament, realm, landscape, myriad, plethora, multifaceted, intricate, nuanced, meticulous* | cut |
| underscor*, showcas*, spearhead*, bolster*, facilitat* | show, lead, support, help |
| stakeholders, learnings, going forward, net-net, value-add | the named people, lessons, from now on, the result, the benefit |

## Metaphors

A figure of speech makes the reader translate. Write the literal meaning.

| Word or phrase | Write instead |
|---|---|
| north star, north-star | the goal and its measure |
| low-hanging fruit, quick win* | the cheapest change and its cost |
| move the needle, moving the needle, moves the needle | how much it changes |
| tip of the iceberg | what is hidden, and how much |
| double-edged sword | both effects |
| silver bullet, holy grail, magic bullet | what it does not fix |
| boil the ocean | what is out of scope |
| heavy lifting | the work, and who does it |
| secret sauce, special sauce | the mechanism |
| pain point* | the problem and who has it |
| game-chang*, game chang*, paradigm shift, sea change, step change | what changes |
| table stakes | what is required, and by whom |
| at the end of the day, when all is said and done, the bottom line | cut |
| journey, path forward, bridge the gap, pave the way, lay the foundation, building block*, moving parts, under the hood | the steps, the parts, or the mechanism |
| single pane of glass, one-stop shop, swiss army knife | what it shows or does |
| perfect storm, uphill battle, slippery slope, can of worms, rabbit hole, elephant in the room | the causes or the risk, stated |
| ticking time bomb, looming, lurking | the trigger, the effect, and the date |

## Filler

Words that add length and no fact. Delete them.

| Word or phrase | Write instead |
|---|---|
| basically, essentially, actually, simply, really, very, extremely, quite, fairly, truly, incredibly | cut |
| in order to | to |
| it is important to note, it is worth noting, it should be noted, worth mentioning, needless to say, of course, obviously | cut, and state the fact |
| at this point in time, in terms of, when it comes to, with regard to, with respect to, due to the fact that | now, about, because |
| as mentioned, as noted above, as discussed, as stated earlier | repeat the fact in a clause, or cut |
| ultimately, fundamentally, at its core | cut |

## Signposts

Sentences that announce what the text will do. A six-pager has no room for them. Do the thing.

| Word or phrase | Write instead |
|---|---|
| this document will, this rfc will, this document aims, this rfc aims, this section will, in this section, the following section* | cut, and start with the point |
| in conclusion, in summary, to summarize, to sum up, to recap, in short | cut. A six-pager has no conclusion: the Introduction holds the ask |
| let's, let us, as we will see, we will explore, we will now, without further ado | cut |
| here is, here's, here are | cut |
| the question is, the answer is, the reality is, the truth is, the fact is | state it |

## Hedges

Throat-clearing that commits to nothing. Delete it. A word that states real uncertainty ("may", "is likely to", "we estimate") is not on this list: keep it, and say what the uncertainty is.

| Word or phrase | Write instead |
|---|---|
| arguably, it could be argued, to some extent, to a certain extent, somewhat, relatively, more or less, in some ways, in a sense, sort of, kind of | cut |
| it seems that, it appears that, it would seem, one might say, it is possible that, it may be the case that | the claim, with what makes it uncertain |
| generally speaking, for the most part, by and large | the share or the exceptions |
