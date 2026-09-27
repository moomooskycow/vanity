#!/usr/bin/env node
// Publish only the explicitly selected Daybook fields; never serialize vault notes.
// Usage: node scripts/generate-taste.mjs [daybook-dir]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
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

function parseReadingLog(text) {
  const currentlyReading = [];
  const books = [];
  let section = null;
  let year = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      const match = heading[1].match(/^(\d{4})(?:\s*\(.*\))?$/);
      year = match ? Number(match[1]) : null;
      section = year ? "year" : heading[1] === "Currently Reading" ? "current" : null;
      continue;
    }
    if (section === "current") {
      const match = line.trim().replace(/[★⭐]/g, "").replace(/\(reread\)/g, "")
        .match(/^- \*\*(.+?)\*\*\s*[—–-]\s*(.+)$/);
      if (match) currentlyReading.push({ title: displayText(match[1]), author: displayText(match[2]) });
    } else if (section === "year" && line.trim().startsWith("|")) {
      const cells = splitRow(line);
      if (cells.length < 4 || cells[0] === "Book" || /^:?-+:?$/.test(cells[0])) continue;
      const [title, author, finished, favorite] = cells;
      books.push({ title: displayText(title), author: displayText(author), finished,
        favorite: /[★⭐]/.test(favorite), year });
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

function parseWishlist(text) {
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!frontmatter) return null;
  const value = (key) => frontmatter.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"))?.[1] ?? "";
  if (scalar(value("type")) !== "book-wish" || scalar(value("status")) !== "wishlist") return null;
  const title = displayText(scalar(value("title")));
  if (!title) throw new Error("Wishlist book has no title");
  const authorValue = value("authors").trim();
  let authors;
  if (authorValue.startsWith("[") && !authorValue.startsWith("[[")) {
    // YAML flow lists used by the vault template, including quoted commas.
    authors = authorValue.slice(1, -1).match(/"(?:\\.|[^"\\])*"|'(?:''|[^'])*'|[^,]+/g) ?? [];
  } else if (authorValue) {
    authors = [authorValue];
  } else {
    const block = frontmatter.match(/^authors:[ \t]*\r?\n((?:[ \t]+- [^\n]*(?:\n|$))*)/m)?.[1] ?? "";
    authors = block.split(/\r?\n/).filter((line) => line.trim()).map((line) => line.replace(/^\s*-\s*/, ""));
  }
  return { title, authors: authors.map((author) => displayText(scalar(author))).filter(Boolean), status: "wishlist" };
}

export function generateTaste(daybookDir) {
  const resources = join(daybookDir, "resources");
  const load = (...parts) => readFileSync(join(resources, ...parts), "utf8");
  const taste = { generated: new Date().toISOString(), ...parseReadingLog(load("reading-log.md")) };
  for (const [name, fields] of Object.entries(catalogs)) taste[name] = parseCatalog(load("taste", `${name}.md`), fields);
  taste.wishlist = readdirSync(join(resources, "wishlist")).filter((file) => file.endsWith(".md")).sort()
    .map((file) => parseWishlist(load("wishlist", file))).filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title));
  return taste;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const taste = generateTaste(process.argv[2] ?? defaultDaybook);
  writeFileSync(join(here, "..", "taste.js"),
    `/* Generated by scripts/generate-taste.mjs. Only approved public catalog fields. */\nwindow.TASTE = ${JSON.stringify(taste, null, 2)};\n`);
  console.log(Object.entries(taste).filter(([, value]) => Array.isArray(value)).map(([key, value]) => `${key}: ${value.length}`).join("\n"));
}
