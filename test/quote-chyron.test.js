const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");

const source = readFileSync(join(__dirname, "../quote-chyron.js"), "utf8");
const initial = ["The initial quotation.", "First author"];
const second = ["A different complete quotation.", "Second author"];
const third = ["A third complete quotation.", "Third author"];
const pool = [initial, second, third];

function eventTarget(properties = {}) {
  const listeners = new Map();
  return {
    ...properties,
    addEventListener(type, callback) {
      const callbacks = listeners.get(type) || [];
      callbacks.push(callback);
      listeners.set(type, callbacks);
    },
    emit(type, event = {}) {
      for (const callback of listeners.get(type) || []) callback(event);
    },
  };
}

function createPage({ quotes = pool, hidden = false } = {}) {
  const nodes = new Map(
    ["text", "attribution"].map((name) => [
      `quote-${name}`,
      { textContent: "" },
    ]),
  );
  const get = (name) => nodes.get(`quote-${name}`);
  get("text").textContent = `  ${initial[0]}  `;
  get("attribution").textContent = `\n            ${initial[1]}\n          `;
  const document = eventTarget({
    hidden,
    getElementById: (id) => nodes.get(id),
  });
  const timers = new Map();
  let now = 0;
  let timerId = 0;

  runInNewContext(source, {
    document,
    window: {
      QUOTES: quotes,
      setTimeout(callback, delay) {
        const id = ++timerId;
        timers.set(id, { callback, at: now + delay });
        return id;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
    },
  });

  return {
    quote: () => [
      get("text").textContent.trim(),
      get("attribution").textContent.trim(),
    ],
    hide(value) {
      document.hidden = value;
      document.emit("visibilitychange");
    },
    tick(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        let earliest = null;
        for (const entry of timers) {
          if (entry[1].at <= end && (!earliest || entry[1].at < earliest[1].at))
            earliest = entry;
        }
        if (!earliest) break;
        now = earliest[1].at;
        timers.delete(earliest[0]);
        earliest[1].callback();
      }
      now = end;
    },
  };
}

test("autoplay walks the pool in order after each reading interval", () => {
  const page = createPage();
  page.tick(19_999);
  assert.deepEqual(page.quote(), initial);
  page.tick(1);
  assert.deepEqual(page.quote(), second);
  page.tick(20_000);
  assert.deepEqual(page.quote(), third);
  page.tick(20_000);
  assert.deepEqual(page.quote(), initial);
});

test("a hidden tab pauses and restarts one full reading interval", () => {
  const page = createPage();
  page.tick(10_000);
  page.hide(true);
  page.tick(60_000);
  assert.deepEqual(page.quote(), initial);
  page.hide(false);
  page.tick(19_999);
  assert.deepEqual(page.quote(), initial);
  page.tick(1);
  assert.deepEqual(page.quote(), second);
});

test("unavailable or single-entry pools leave the readable static quote", () => {
  for (const quotes of [null, [], [initial]]) {
    const page = createPage({ quotes });
    page.tick(60_000);
    assert.deepEqual(page.quote(), initial);
  }
});
