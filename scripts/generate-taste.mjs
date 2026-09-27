#!/usr/bin/env node
// Publish only designated Daybook fields; never serialize vault notes.
//
// A value reaches taste.js only from a designated slot: a reading-log table cell
// under Book, Author, Finished, or Fav; the bold title of a Currently Reading
// line; a taste-table cell under an approved header; or a wishlist book's
// `title` and `authors`. Nothing else in the vault is read. Prose around those
// slots, including everything after the dash on a Currently Reading line, is
// never published.
// Generation fails, and writes nothing, if a public value would still carry a
// link, vault path, URI, or email address, or the name of a person who has a
// note in the vault but is not credited as an author.
//
// Usage: node scripts/generate-taste.mjs [daybook-dir]
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const defaultDaybook = "/home/phaedrus/development/moomooskycow/daybook";
const catalogs = {
  films: ["title", "qualifier"],
  shows: ["title", "qualifier"],
  games: ["title", "qualifier"],
  watchlist: ["title"],
  places: ["place", "region"],
  tools: ["name", "kind"],
  music: ["artist"],
  podcasts: ["title"],
};
const DATE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

function displayText(raw) {
  return raw.trim().replace(/\[\[([^\]]+)\]\]/g, (_, body) => {
    const parts = body.replace(/\\\|/g, "|").split("|");
    return parts.at(-1).trim();
  }).replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1").replace(/\\\|/g, "|");
}

// Ported from resources/reading/dashboard/parse.py: pipes inside wikilinks
// (escaped or not) are content, not cell boundaries.
function splitRow(row) {
  const body = row.trim().replace(/^\||\|$/g, "");
  const cells = [];
  let cell = "";
  let inLink = false;
  for (let i = 0; i < body.length; i++) {
    const pair = body.slice(i, i + 2);
    if (pair === "[[" || pair === "]]") {
      inLink = pair === "[[";
      cell += pair;
      i++;
    } else if (pair === "\\|") {
      cell += pair;
      i++;
    } else if (body[i] === "|" && !inLink) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += body[i];
    }
  }
  cells.push(cell.trim());
  return cells;
}

// Reading-log tables are read by header name, so an added or reordered column
// (Edition, Notes) can never land in a public field. The header is the row with
// Book and Author cells; a comment or blank line inside a table does not end it.
function headerColumns(cells) {
  const index = new Map(cells.map((cell, i) => [cell.trim().toLowerCase(), i]));
  if (!index.has("book") || !index.has("author")) return null;
  return { width: cells.length, book: index.get("book"), author: index.get("author"), finished: index.get("finished"), fav: index.get("fav") };
}

// The bold title of a Currently Reading line: a wikilink's alias, else its name.
function titleSlot(slot) {
  const link = slot.match(/\[\[([^\]]+)\]\]/);
  if (!link) return displayText(slot.replace(/[★⭐]/g, "").replace(/\(reread\)/g, ""));
  const [target, alias] = link[1].replace(/\\\|/g, "|").split("|");
  return (alias ?? target.split("/").at(-1)).trim();
}

function parseReadingLog(text) {
  const currentlyReading = [];
  const books = [];
  let section = null;
  let year = null;
  let columns = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      const match = heading[1].match(/^(\d{4})(?:\s*\(.*\))?$/);
      year = match ? Number(match[1]) : null;
      section = year ? "year" : heading[1] === "Currently Reading" ? "current" : null;
      columns = null;
      continue;
    }
    if (section === "current") {
      // Only the bold title is a field; whatever follows it is a note.
      const slot = line.trim().match(/^- \*\*(.+?)\*\*/)?.[1];
      if (slot) currentlyReading.push(titleSlot(slot));
    } else if (section === "year" && line.trim().startsWith("|")) {
      const cells = splitRow(line);
      if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
      const header = headerColumns(cells);
      if (header) {
        columns = header;
        continue;
      }
      if (!columns) throw new Error(`reading-log ${year}: a table row comes before a Book and Author header`);
      if (cells.length < columns.width) throw new Error(`reading-log ${year}: a table row has fewer cells than its header`);
      const cell = (name) => (columns[name] === undefined ? "" : cells[columns[name]] ?? "");
      const finished = cell("finished").trim();
      if (finished && !DATE.test(finished)) throw new Error(`reading-log ${year}: a Finished cell is not a date (M/D/YYYY)`);
      books.push({ title: displayText(cell("book")), author: displayText(cell("author")), finished,
        favorite: /[★⭐]/.test(cell("fav")), year });
    }
  }
  return { currentlyReading, books };
}

function parseCatalog(text, fields) {
  const result = [];
  let headers = null;
  let inTable = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) {
      headers = null;
      inTable = false;
      continue;
    }
    const cells = splitRow(line);
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) {
      inTable = headers !== null && fields.every((field) => headers.includes(field));
      continue;
    }
    if (!inTable) {
      headers = cells.map((cell) => cell.toLowerCase());
      continue;
    }
    const item = Object.fromEntries(fields.map((field) => [field, displayText(cells[headers.indexOf(field)] ?? "")]));
    if (item[fields[0]]) result.push(item);
  }
  return result;
}

function scalar(value) {
  value = value.trim();
  if (value.startsWith('"')) return JSON.parse(value);
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  return value;
}

function frontmatterOf(text) {
  return text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? null;
}

// YAML: a quote opens a quoted scalar only at the start of the value, or of an
// item in a flow list; inside single quotes '' is an apostrophe. Outside quotes,
// " #" starts a comment, which is never published. A quote left open stops
// generation, since everything after it would otherwise be published.
function stripComment(raw, where) {
  const text = raw.trim();
  const flow = text.startsWith("[") && !text.startsWith("[[");
  let quote = null;
  let itemStart = true;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (quote === '"' && char === "\\") i++;
      else if (quote === "'" && char === "'" && text[i + 1] === "'") i++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "#" && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i).trim();
    if (/\s/.test(char)) continue;
    if (itemStart && (char === '"' || char === "'")) quote = char;
    itemStart = flow && (char === "[" || char === ",");
  }
  if (quote) throw new Error(`${where} has a quote that is never closed`);
  return text;
}

// Only plain and quoted scalars and flow or block lists are read. Anything else
// (a block scalar, tag, anchor, alias, or a flow list split across lines) stops
// generation rather than guessing what the value is.
function field(frontmatter, key, where) {
  const value = stripComment(frontmatter.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"))?.[1] ?? "", `${where}: \`${key}\``);
  if (/^[|>!&*]/.test(value) || (value.startsWith("[") && !value.startsWith("[[") && !value.endsWith("]"))) {
    throw new Error(`${where}: \`${key}\` uses YAML syntax the generator does not read`);
  }
  return value;
}

// A scalar, a YAML flow list (quoted commas included), or a block list, as the
// vault templates write them.
function listField(frontmatter, key, where) {
  const raw = field(frontmatter, key, where);
  let items;
  if (raw.startsWith("[") && !raw.startsWith("[[")) {
    items = raw.slice(1, -1).match(/"(?:\\.|[^"\\])*"|'(?:''|[^'])*'|[^,]+/g) ?? [];
  } else if (raw) {
    items = [raw];
  } else {
    const block = frontmatter.match(new RegExp(`^${key}:[ \\t]*\\r?\\n((?:[ \\t]+- [^\\n]*(?:\\n|$))*)`, "m"))?.[1] ?? "";
    items = block.split(/\r?\n/).filter((line) => line.trim()).map((line) => stripComment(line.replace(/^\s*-\s*/, ""), `${where}: \`${key}\``));
  }
  return items.map((item) => displayText(scalar(item))).filter(Boolean);
}

function parseWishlist(text, file) {
  const frontmatter = frontmatterOf(text);
  if (!frontmatter) return null;
  const where = `wishlist/${file}`;
  if (scalar(field(frontmatter, "type", where)) !== "book-wish" || scalar(field(frontmatter, "status", where)) !== "wishlist") return null;
  const title = displayText(scalar(field(frontmatter, "title", where)));
  if (!title) throw new Error(`${where}: wishlist book has no title`);
  return { title, authors: listField(frontmatter, "authors", where), status: "wishlist" };
}

// Lowercase words of any script, accents and punctuation removed.
const nameKey = (text) => String(text).normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Wikilink and Markdown link syntax, anything with ://, and email addresses.
const LINK = /\[\[|\]\]|\]\(|:\/\/|[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i;
// A URI scheme without slashes: a lowercase scheme touching its first character
// (mailto:, data:, tel:+1...), or a well-known one in any case. A title such as
// "Javascript: The Good Parts" has a space after the colon and passes.
const URI = [/(^|[^\p{L}\p{N}])[a-z][a-z0-9+.-]*:(?=[^\s\d])/u, /(^|[^\p{L}\p{N}])(?:mailto|data|tel|sms|file|javascript|obsidian|https?|ftp|urn):(?=\S)/iu];

// Public values that would carry private note text: a link, vault path, URI, or
// email address, or the full name of a person with a note in the vault who is not credited as
// an author. Credited means an entire author value, or one author in a list
// joined by commas, "and", or "&"; a name inside other words (a "recommended by"
// aside) is not a credit. Reports locations, never the text.
function privateTextIssues(taste, daybookDir) {
  const personDir = join(daybookDir, "person");
  if (!existsSync(personDir)) {
    return [`${personDir} is missing, so names from the vault's private notes cannot be checked`];
  }
  const credited = new Set();
  const credit = (value) => {
    credited.add(nameKey(value));
    for (const one of value.split(/\s*(?:,|&|\band\b)\s*/)) credited.add(nameKey(one));
  };
  for (const book of [...taste.books, ...taste.currentlyReading]) credit(book.author);
  for (const book of taste.wishlist) book.authors.forEach(credit);
  const people = [...new Set(readdirSync(personDir).filter((file) => file.endsWith(".md"))
    .map((file) => nameKey(file.slice(0, -3).replace(/\([^)]*\)/g, " "))))]
    .filter((name) => name.split(" ").length > 1 && !credited.has(name));
  const folders = readdirSync(daybookDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => new RegExp(`(^|[^\\p{L}\\p{N}])${entry.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`, "iu"));
  const issues = [];
  const inspect = (where, value) => {
    if (typeof value !== "string" || !value) return;
    if (LINK.test(value) || URI.some((scheme) => scheme.test(value)) || folders.some((folder) => folder.test(value))) {
      issues.push(`${where} carries a link, path, URI, or email address`);
    } else if (people.some((name) => ` ${nameKey(value)} `.includes(` ${name} `))) {
      issues.push(`${where} names a person from the vault's private notes`);
    }
  };
  for (const [catalog, rows] of Object.entries(taste)) {
    if (!Array.isArray(rows)) continue;
    rows.forEach((row, i) => {
      for (const [key, value] of Object.entries(row)) {
        if (Array.isArray(value)) value.forEach((item, j) => inspect(`${catalog}[${i}].${key}[${j}]`, item));
        else inspect(`${catalog}[${i}].${key}`, value);
      }
    });
  }
  return issues;
}

export function generateTaste(daybookDir) {
  const resources = join(daybookDir, "resources");
  const load = (...parts) => readFileSync(join(resources, ...parts), "utf8");
  const log = parseReadingLog(load("reading-log.md"));
  const taste = { generated: new Date().toISOString(), currentlyReading: [], books: log.books };
  for (const [name, fields] of Object.entries(catalogs)) taste[name] = parseCatalog(load("taste", `${name}.md`), fields);
  taste.wishlist = readdirSync(join(resources, "wishlist")).filter((file) => file.endsWith(".md")).sort()
    .map((file) => parseWishlist(load("wishlist", file), file)).filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title));
  // A book being read takes its author from a finished row or a wishlist entry
  // with the same title; otherwise the author stays empty.
  const key = (title) => title.toLowerCase().replace(/\s+/g, " ").trim();
  const tableAuthors = new Map();
  for (const book of taste.books) if (book.author && !tableAuthors.has(key(book.title))) tableAuthors.set(key(book.title), book.author);
  const wishAuthors = new Map();
  for (const book of taste.wishlist) if (book.authors.length && !wishAuthors.has(key(book.title))) wishAuthors.set(key(book.title), book.authors.join(", "));
  taste.currentlyReading = log.currentlyReading.map((title) => ({
    title,
    author: tableAuthors.get(key(title)) || wishAuthors.get(key(title)) || "",
  }));
  const issues = privateTextIssues(taste, daybookDir);
  if (issues.length) {
    throw new Error(`Refusing to generate taste.js: ${issues.length} public value(s) would carry private note text.\n  ${issues.join("\n  ")}`);
  }
  return taste;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const taste = generateTaste(process.argv[2] ?? defaultDaybook);
  writeFileSync(join(here, "..", "taste.js"),
    `/* Generated by scripts/generate-taste.mjs. Only approved public catalog fields. */\nwindow.TASTE = ${JSON.stringify(taste, null, 2)};\n`);
  console.log(Object.entries(taste).filter(([, value]) => Array.isArray(value)).map(([key, value]) => `${key}: ${value.length}`).join("\n"));
  const unnamed = taste.currentlyReading.filter((book) => !book.author).length;
  if (unnamed) console.log(`currentlyReading without an author: ${unnamed} (no finished row or wishlist entry names one)`);
}
