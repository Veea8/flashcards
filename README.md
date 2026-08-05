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

Blank lines and lines starting with `#` are ignored. Lines that can't be parsed are
listed in the import preview instead of failing the import. Duplicate fronts are
dropped. `\n` inside a field becomes a real line break. Two sample files live in
`samples/`.

## Studying

| Key | Action |
|---|---|
| `space` | show answer, then rate Good |
| `1` `2` `3` `4` | Again / Hard / Good / Easy |
| `S` | mark the card important (★) |
| `D` | delete the card |
| `Z` | undo the last delete |
| `esc` | leave the session |

Each rating button shows the interval it will produce, so you're not guessing.
Deleting never asks for confirmation — it's undoable instead, and deletes are soft,
so a deleted card keeps its review history and can be restored.

Scheduling is [FSRS](https://github.com/open-spaced-repetition/ts-fsrs), the algorithm
current Anki uses. Starring is a label only; it never affects scheduling.

## Layout

```
src/db/       schema, Dexie instance, repository functions
src/lib/      parseTxt · scheduler (the only ts-fsrs consumer) · stats · viz colors
src/routes/   DeckList · Import · Study · Dashboard
src/components/
```

Progress stats derive entirely from the `reviews` table, which is written on every
rating — the dashboard has no separate state to keep in sync.

## Not built yet

Card editor, JSON export/import, restore UI for deleted cards, tags and search,
cloze deletion, media, markdown/LaTeX, cloud sync.
