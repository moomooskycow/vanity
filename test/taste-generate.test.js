const assert = require("node:assert/strict");
const test = require("node:test");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");

const TABLES = {
  films: "| Title | Qualifier | Source |\n| --- | --- | --- |\n| Seen film | especially frightening, special place | https://private.example/film |",
  shows: "| Title | Qualifier |\n| --- | --- |\n| Show | season 1 |",
  games: "| Title | Qualifier |\n| --- | --- |\n| Game | tentative |",
  watchlist: "| Title |\n| --- |\n| Unseen film |",
  places: "| Place | Region |\n| --- | --- |\n| City | Region |",
  tools: "| Name | Kind |\n| --- | --- |\n| Tool | editor |",
  music: "| Artist |\n| --- |\n| Artist |",
  podcasts: "| Title |\n| --- |\n| Podcast |",
};

// A throwaway Daybook: the reading log, the taste tables, and any extra files.
function vault(t, readingLog, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "taste-fixture-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files = { "resources/reading-log.md": readingLog, ...extra };
  for (const [name, markdown] of Object.entries(TABLES)) files[`resources/taste/${name}.md`] ??= markdown;
  mkdirSync(join(dir, "resources", "wishlist"), { recursive: true });
  mkdirSync(join(dir, "person"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const generate = async (dir) => (await import("../scripts/generate-taste.mjs")).generateTaste(dir);

test("taste publishes complete reading rows and keeps private wishlist fields and watchlist out of films", async (t) => {
  const wish = (extra = "", status = "wishlist", type = "book-wish") => `---
type: "${type}"
status: "${status}"
title: "Wanted book"
authors:
  - "[[private/path|Author, One]]"
  - '[[Author Two]]'
price: "$89.90"
source: "https://private.example/shop"
url: "https://private.example/url"
cover: "https://private.example/cover"
notes: "Private health note"
${extra}---
Private journal body and family details
`;
  const dir = vault(t, `# Reading Log
## Currently Reading
- **[[current|Current book]]** — Reader (reread)
## Shelved
- **Private shelved book** — Private author
## 2026 (2 books)
| Book | Author | Finished | Fav | Edition |
|------|--------|----------|-----|---------|
| [[title\\|A title — with a dash]] | [[writer|Writer]] | 7/7/2026 | ★ | private edition |
| [[other|Another title]] | Other writer | 6/1/2026 | | |
## 2025 (1 book)
| Book | Author | Finished | Fav |
| --- | --- | --- | --- |
| Plain title | Author | 1/1/2025 | |
## Abandoned
| Private title | Private author | 2020 | 2021 | Private reason |
`, {
    "resources/reading/current.md": "---\ntype: book-note\nauthor: [\"Reader\"]\nrating: 5\n---\nPrivate reading notes\n",
    "resources/wishlist/wanted.md": wish(),
    "resources/wishlist/bought.md": wish("", "purchased"),
    "resources/wishlist/nonbook.md": wish("", "wishlist", "purchase-wish"),
    "resources/wishlist/inline.md": `---
type: book-wish
status: wishlist
title: 'Another wish'
authors: ["[[One|One, Jr.]]", '[[Two]]']
---
`,
  });
  const taste = await generate(dir);
  assert.deepEqual(taste.currentlyReading, [{ title: "Current book", author: "Reader" }]);
  assert.deepEqual(taste.books, [
    { title: "A title — with a dash", author: "Writer", finished: "7/7/2026", favorite: true, year: 2026 },
    { title: "Another title", author: "Other writer", finished: "6/1/2026", favorite: false, year: 2026 },
    { title: "Plain title", author: "Author", finished: "1/1/2025", favorite: false, year: 2025 },
  ]);
  assert.deepEqual(taste.films, [{ title: "Seen film", qualifier: "especially frightening, special place" }]);
  assert.deepEqual(taste.watchlist, [{ title: "Unseen film" }]);
  assert.deepEqual(taste.shows, [{ title: "Show", qualifier: "season 1" }]);
  assert.deepEqual(taste.wishlist, [
    { title: "Another wish", authors: ["One, Jr.", "Two"], status: "wishlist" },
    { title: "Wanted book", authors: ["Author, One", "Author Two"], status: "wishlist" },
  ]);
  assert.doesNotMatch(JSON.stringify(taste), /private|https?:|"(?:price|source|url|cover|notes|rating)"/i);
});

test("words after the dash in Currently Reading never become an author; authors come from a designated field", async (t) => {
  const dir = vault(t, `# Reading Log
## Currently Reading
Last verified today. Live:
- **[[lent|Lent book]]** — lent by [[person/Example Friend]], return by spring
- **[[paced|Paced book]]** — Paced Author (a few pages at a time)
- **Signed book** — Signed Copy From A Friend
- **[[plain-title|Plain title]]** — reading it again, slowly
## 2025 (1 book)
| Book | Author | Finished | Fav |
| --- | --- | --- | --- |
| Plain title | Table Author | 1/1/2025 | |
`, {
    "resources/reading/paced.md": "---\ntype: book-note\nauthor: Paced Author\n---\na few pages at a time\n",
    "person/Example Friend.md": "---\ntype: person\n---\n",
  });
  const taste = await generate(dir);
  assert.deepEqual(taste.currentlyReading, [
    { title: "Lent book", author: "" },
    { title: "Paced book", author: "Paced Author" },
    { title: "Signed book", author: "" },
    { title: "Plain title", author: "Table Author" },
  ]);
  assert.doesNotMatch(JSON.stringify(taste), /lent by|return by|Example Friend|person\/|few pages|Signed Copy|slowly|Last verified/);
});

test("reading-log tables are read by header, so a notes column cannot shift into a public field", async (t) => {
  const log = (finished) => `# Reading Log
## 2024 (1 book)
| Book | Notes | Author | Finished | Fav |
| --- | --- | --- | --- | --- |
| Moved columns | a private note about who lent it | Real Author | ${finished} | ★ |
`;
  const taste = await generate(vault(t, log("3/4/2024")));
  assert.deepEqual(taste.books, [{ title: "Moved columns", author: "Real Author", finished: "3/4/2024", favorite: true, year: 2024 }]);
  assert.doesNotMatch(JSON.stringify(taste), /private note|lent/);
  await assert.rejects(generate(vault(t, log("when I finish"))), /2024.*Finished/);
  const twoColumns = `# Reading Log
## 2024 (2 books)
| Book | Author |
| --- | --- |
| Two columns | Its Author |
`;
  const read = await generate(vault(t, twoColumns));
  assert.deepEqual(read.books, [{ title: "Two columns", author: "Its Author", finished: "", favorite: false, year: 2024 }]);
  await assert.rejects(generate(vault(t, `${twoColumns}| Missing author |\n`)), /2024: a table row has fewer cells than its header/);
});

test("generation fails closed when a public field would carry private note text", async (t) => {
  const log = (author, current = "") => `# Reading Log
## Currently Reading
${current}
## 2024 (1 book)
| Book | Author | Finished | Fav |
| --- | --- | --- | --- |
| A book | ${author} | 3/4/2024 | |
`;
  const people = {
    "person/Example Friend.md": "---\ntype: person\n---\n",
    "person/example-author.md": "---\ntype: person\n---\n",
    "person/Пример Друг.md": "---\ntype: person\n---\n",
  };
  const film = (qualifier) => ({ "resources/taste/films.md": `| Title | Qualifier |\n| --- | --- |\n| A film | ${qualifier} |` });
  const refuses = (dir, location) => assert.rejects(generate(dir), (error) => {
    assert.match(error.message, location);
    assert.doesNotMatch(error.message, /Example Friend|Пример|recommended|watched/);
    return true;
  });
  // A person with a note of their own is published when they are the book's author.
  const ok = await generate(vault(t, log("[[person/example-author\\|Example Author]]"), people));
  assert.equal(ok.books[0].author, "Example Author");
  // A friend named in another public field, in any script, or a raw link into the vault, stops generation.
  await refuses(vault(t, log("Example Author"), { ...people, ...film("watched with [[person/Example Friend|Example Friend]]") }), /films\[0\]\.qualifier/);
  await refuses(vault(t, log("Example Author"), { ...people, ...film("watched with Пример Друг") }), /films\[0\]\.qualifier/);
  await refuses(vault(t, log("[[person/Example Friend]]"), people), /books\[0\]\.author/);
  for (const uri of ["mailto:friend@example.org", "data:text/plain,a private note", "call tel:+15550100", "tel:5550100",
    "Data:text/plain,a private note", "HTTPS:private.example/path", "ask someone@example.org"]) {
    await refuses(vault(t, log("Example Author"), { ...people, ...film(uri) }), /films\[0\]\.qualifier/);
  }
  // Being named inside an author value does not make a friend an author.
  const note = { "resources/reading/lent.md": "---\ntype: book-note\nauthor: Public Writer (recommended by Example Friend)\n---\n" };
  await refuses(vault(t, log("Example Author", "- **[[lent|Lent book]]**"), { ...people, ...note }), /currentlyReading\[0\]\.author/);
  // Without the vault's person notes there is nothing to check names against.
  const dir = vault(t, log("Example Author"), film("watched with Example Friend"));
  rmSync(join(dir, "person"), { recursive: true });
  await assert.rejects(generate(dir), /person.*missing/);
});

test("frontmatter comments never reach a public field, and unreadable YAML stops generation", async (t) => {
  const log = `# Reading Log
## Currently Reading
- **[[commented|Commented book]]** — a note
- **[[nicknamed|Nicknamed book]]**
- **[[quoted|Quoted book]]**
`;
  const wish = (title) => `---\ntype: book-wish\nstatus: wishlist\ntitle: ${title}\nauthors:\n  - "Wish Author" # lent by a friend\n---\n`;
  const taste = await generate(vault(t, log, {
    "resources/reading/commented.md": "---\ntype: book-note\nauthor: Public O'Writer # private medical appointment\n---\n",
    "resources/reading/nicknamed.md": "---\ntype: book-note\nauthor: Public Writer, 'nickname # private medical appointment\n---\n",
    "resources/reading/quoted.md": "---\ntype: book-note\nauthor: 'Public O''Writer #1' # private medical appointment\n---\n",
    "resources/wishlist/wish.md": wish(`"Wanted book" # gift idea`),
  }));
  assert.deepEqual(taste.currentlyReading, [
    { title: "Commented book", author: "Public O'Writer" },
    { title: "Nicknamed book", author: "Public Writer, 'nickname" },
    { title: "Quoted book", author: "Public O'Writer #1" },
  ]);
  assert.deepEqual(taste.wishlist, [{ title: "Wanted book", authors: ["Wish Author"], status: "wishlist" }]);
  assert.doesNotMatch(JSON.stringify(taste), /medical|gift idea|lent by/);
  await assert.rejects(generate(vault(t, log, { "resources/wishlist/wish.md": wish(">\n  A folded private note") })),
    /wishlist\/wish\.md: `title` uses YAML syntax/);
  await assert.rejects(generate(vault(t, log, { "resources/wishlist/wish.md": wish("'Wanted book # a private note") })),
    /wishlist\/wish\.md: `title` has a quote that is never closed/);
});
