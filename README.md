# Flashcards

Drop in a text file, get a deck, study it with modern spaced repetition. Everything
runs in the browser — no account, no server, works offline.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # parser, stats and db integration tests
npm run build
```

## File format

One card per line, front and back separated by a **tab**, `|`, `;` or `,`. The
separator is detected automatically — tab first (so Anki exports import as-is),
comma last (so commas inside an answer survive).

```
bonjour	hello
capital of France | Paris
primary colours,red, yellow, blue
```

Blank lines and comment lines starting with `#` are ignored. Lines that can't be
parsed are listed in the import preview instead of failing the import. Duplicate
fronts are dropped. `\n` inside a field becomes a real line break. Two sample files
live in `samples/`.

### Anki exports

Anki's own `.txt` export drops in unchanged. Its header directives are honored:

- `#separator:tab` (also `comma`, `semicolon`, `pipe`, `space`, `colon`)
- `#html:true` — card markup (`<b>`, `<sub>`, `<sup>`, `<br>`, tables, lists, `<pre>`)
  and HTML entities like `&cap;` are rendered rather than printed
- `#tags column:3` — that column becomes tags instead of being glued onto the answer

- `#deck column:N` / `#deck:Name` — deck names, with `::` for nesting

A tab file with a consistent third column is treated as `front / back / tags` even
without the header. Imported HTML is sanitized on render: tags are allowlisted and
every attribute is stripped, so a file can't carry scripts or tracking into the app.

### Generating a deck with an AI

`samples/AI_PROMPT.md` holds a prompt to paste into any AI chat that produces a file
in exactly this format — correct separator, HTML formatting, and one topic tag per
card so the import splits into subdecks.

## Subdecks

If a file carries deck names or tags, the import screen offers to split it into
subdecks nested under one parent — an 11-tag Anki export becomes a parent deck with
11 children. You can untick any group (its cards fall back to the parent) or turn
the split off entirely.

Grouping uses deck names when they actually divide the file — a single `#deck:` line
names the whole export rather than splitting it, so in that case the tags are used
instead and the deck name becomes the parent's. Otherwise it's the card's **first** tag; a
card lands in exactly one subdeck, since duplicating it would schedule the same
material several times over. A shared prefix is trimmed from the names, so
`AW_Probability` and `AW_Cycles` become `Probability` and `Cycles`. Anki's `::`
syntax nests further.

Parent decks show rolled-up counts, and studying a parent covers every card beneath
it. Deleting a deck deletes its subdecks too.

## Studying

| Key | Action |
|---|---|
| `space` | show answer, then rate Good |
| `1` `2` `3` `4` | Again / Hard / Good / Easy |
| `S` | mark the card important (★) |
| `D` | delete the card |
| `Z` / `backspace` | go back to the previous card |
| `esc` | leave the session |

Each rating button shows the interval it will produce, so you're not guessing.
Deleting never asks for confirmation — it's undoable instead, and deletes are soft,
so a deleted card keeps its review history and can be restored.

Going back un-rates the card: its schedule is restored exactly and the review log is
deleted, so the dashboard never counts an answer you took back. The last 20 steps of
a session are undoable.

Scheduling is [FSRS](https://github.com/open-spaced-repetition/ts-fsrs), the algorithm
current Anki uses. Starring is a label only; it never affects scheduling.

## Cram mode

For the week before an exam, when spaced repetition is optimizing for the wrong
horizon. Cram ignores due dates, shuffles the deck, and drills it in **sets of six**:
the next six are locked until every card in the current set has been answered
correctly, and a card you miss needs two clean passes before it graduates. Answers
are Got it / Missed it — there is no interval to grade.

A run is saved after every answer, so leaving mid-deck costs nothing: the deck list
shows which set you're on, and opening Cram again picks up exactly there rather than
re-drilling the sets you already cleared. Finishing the deck clears the run, and the
checkpoint screen has a **Start over** if you want a fresh shuffle.

Cram never writes scheduling state, so a week of drilling leaves the long-term
schedule untouched. Its answers are logged, so they still count toward your streak,
time studied and activity heatmap, but they're excluded from the retention figure —
that number measures whether the scheduler picked good intervals, which cramming
doesn't test.

## Browsing cards

A deck's name or card count opens its card list, as do the Due / Reviewed today /
Important tiles on the progress page. Search matches rendered text, so HTML cards
find on what you can actually read. The **Deleted** filter restores soft-deleted
cards.

## Layout

```
src/db/       schema, Dexie instance, repository functions
src/lib/      parseTxt · scheduler (the only ts-fsrs consumer) · cram · stats · viz colors
src/routes/   DeckList · Import · Study · Cram · Cards · Dashboard
src/components/
```

Progress stats derive entirely from the `reviews` table, which is written on every
rating — the dashboard has no separate state to keep in sync.

## Not built yet

Card editor, JSON export/import, a new-card limit for normal study, cloze deletion,
media, markdown/LaTeX, cloud sync.
