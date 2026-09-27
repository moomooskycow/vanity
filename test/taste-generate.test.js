const assert = require("node:assert/strict");
const test = require("node:test");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

test("taste publishes complete reading rows and keeps private wishlist fields and watchlist out of films", async (t) => {
  const { generateTaste } = await import("../scripts/generate-taste.mjs");
  const dir = mkdtempSync(join(tmpdir(), "taste-fixture-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const resources = join(dir, "resources");
  mkdirSync(join(resources, "taste"), { recursive: true });
  mkdirSync(join(resources, "wishlist"));
  writeFileSync(join(resources, "reading-log.md"), `# Reading Log
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
`);
  const tables = {
    films: "| Title | Qualifier | Source |\n| --- | --- | --- |\n| Seen film | especially frightening, special place | https://private.example/film |",
    shows: "| Title | Qualifier |\n| --- | --- |\n| Show | season 1 |",
    games: "| Title | Qualifier |\n| --- | --- |\n| Game | tentative |",
    watchlist: "| Title |\n| --- |\n| Unseen film |",
    places: "| Place | Region |\n| --- | --- |\n| City | Region |",
    tools: "| Name | Kind |\n| --- | --- |\n| Tool | editor |",
    music: "| Artist |\n| --- |\n| Artist |",
    podcasts: "| Title |\n| --- |\n| Podcast |",
  };
  for (const [name, markdown] of Object.entries(tables)) writeFileSync(join(resources, "taste", `${name}.md`), markdown);
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
  writeFileSync(join(resources, "wishlist", "wanted.md"), wish());
  writeFileSync(join(resources, "wishlist", "bought.md"), wish("", "purchased"));
  writeFileSync(join(resources, "wishlist", "nonbook.md"), wish("", "wishlist", "purchase-wish"));
  writeFileSync(join(resources, "wishlist", "inline.md"), `---
type: book-wish
status: wishlist
title: 'Another wish'
authors: ["[[One|One, Jr.]]", '[[Two]]']
---
`);
  const taste = generateTaste(dir);
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
  assert.doesNotMatch(JSON.stringify(taste), /private|https?:|"(?:price|source|url|cover|notes)"/i);
});
