# Prompt for generating decks with an AI

Paste the block below into any AI chat, along with your topic and source material,
to get a `.txt` file this app imports cleanly.

Two things to add when you use it:

- **Name your topics.** The tag column drives subdecks, so say "tag these as
  `Topic_Limits`, `Topic_Derivatives`, `Topic_Integrals`". Left to itself an AI
  often invents one tag per card, which produces 200 subdecks of one card each.
- **Check the tabs survived the copy.** Copying out of a chat UI sometimes turns
  tabs into spaces — the one failure that kills the whole import. If the preview
  shows 0 cards and every line flagged "no separator found", that is what happened.
  Ask for the file as a download, or switch the separator to ` | ` and change the
  header to `#separator:pipe`, since pipes survive any copy-paste.

---

````text
Output a flashcard deck as a plain .txt file in the following format. Follow it exactly.

STRUCTURE
- Start with these four header lines, verbatim:
  #separator:tab
  #html:true
  #tags column:3
  #deck:<Deck Name>
- Then one card per line, exactly three TAB-separated columns:
  <front><TAB><back><TAB><tag>
- One card = one line. Never wrap a card across lines.

HARD RULES (breaking these silently drops or corrupts cards)
- Use real TAB characters between columns, never spaces or commas.
- Never put a TAB inside the front, back, or tag text — it creates a phantom column.
- Never start a front with "#" — those lines are treated as comments and discarded.
- Every front must be unique. Duplicate fronts are dropped (case-insensitive).
- No LaTeX or MathJax. $...$, \(...\), \[...\] and \frac{}{} will NOT render — they
  appear as literal text. Use the HTML and Unicode below instead.

FORMATTING (HTML, inside the front and back columns)
- Line break: <br>   (not \n, not a real newline)
- Allowed tags: <b> <i> <u> <s> <sub> <sup> <ul> <li> <ol> <table> <tr> <td> <th>
  <pre> <code> <blockquote> <hr> <p> <span> <small> <mark> <h1>–<h4>
- ALL attributes are stripped. Do not use style, class, colspan, rowspan, width,
  href, or src — they will be removed. Tables must be plain <tr>/<td> grids.
- No images, audio, links, scripts, or CSS.

MATH AND SYMBOLS
- Subscripts/superscripts: a<sub>1</sub>, x<sup>2</sup>, e<sup>&minus;x</sup>
- Use HTML entities or literal Unicode for symbols:
  &cap; ∩   &cup; ∪   &empty; ∅   &isin; ∈   &notin; ∉   &sube; ⊆   &sub; ⊂
  &le; ≤   &ge; ≥   &ne; ≠   &asymp; ≈   &equiv; ≡   &plusmn; ±
  &rarr; →   &rArr; ⇒   &hArr; ⇔   &forall; ∀   &exist; ∃   &not; ¬
  &and; ∧   &or; ∨   &sum; ∑   &prod; ∏   &int; ∫   &radic; √   &infin; ∞
  &alpha; α   &beta; β   &theta; θ   &lambda; λ   &mu; μ   &pi; π   &sigma; σ
  &Delta; Δ   &Omega; Ω   &minus; −   &middot; ·   &times; ×   &hellip; …
  &#8469; ℕ   &#8484; ℤ   &#8477; ℝ   &#8474; ℚ
- Do not invent entity names — if unsure, paste the literal Unicode character.

TAGS (column 3)
- Exactly one tag per card, no spaces inside it (use underscores: Graph_Theory).
- The tag names the topic. Cards sharing a tag become one subdeck, so use a small
  consistent set of tags — roughly 5–15 cards per tag, not one tag per card.
- Give every card a tag. Use a shared prefix if you like (Topic_Algebra,
  Topic_Geometry); the app strips it automatically for display.

CARD WRITING
- Front = one specific question or prompt. Back = the complete answer, self-contained.
- Prefer many small cards over few dense ones; split multi-part answers into
  separate cards.
- Use <br> and <ul><li> to keep multi-line answers scannable.

OUTPUT
- Give the result as a single fenced code block containing only the file contents,
  with nothing before or after it, so it can be saved directly as deck.txt.
````
