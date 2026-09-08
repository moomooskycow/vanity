const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");

const source = readFileSync(join(__dirname, "../quote-chyron.js"), "utf8");
const initial = ["The initial quotation.", "First author"];
const pool = [initial, ["A different complete quotation.", "Second author"]];

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

function createPage({ quotes = pool, reduced = false } = {}) {
  const nodes = new Map(
    [
      "chyron",
      "text",
      "attribution",
      "controls",
      "pause",
      "next",
      "announcement",
    ].map((name) => [
      `quote-${name}`,
      eventTarget({ textContent: "", hidden: false, setAttribute() {} }),
    ]),
  );
  const get = (name) => nodes.get(`quote-${name}`);
  get("text").textContent = initial[0];
  get("attribution").textContent = initial[1];
  get("controls").hidden = true;
  const descendants = new Set(nodes.values());
  let hovered = false;
  get("chyron").matches = () => hovered;
  get("chyron").contains = (node) => descendants.has(node);
  const document = eventTarget({
    hidden: false,
    activeElement: null,
    getElementById: (id) => nodes.get(id),
  });
  const motion = eventTarget({ matches: reduced });
  const timers = new Map();
  let now = 0;
  let timerId = 0;

  function focus(node) {
    if (document.activeElement === node) return;
    if (document.activeElement)
      get("chyron").emit("focusout", { relatedTarget: node });
    document.activeElement = node;
    if (node) get("chyron").emit("focusin");
  }
  for (const node of nodes.values()) node.focus = () => focus(node);

  runInNewContext(source, {
    document,
    window: {
      QUOTES: quotes,
      matchMedia: () => motion,
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
    quote: () => [get("text").textContent, get("attribution").textContent],
    announcement: () => get("announcement").textContent,
    controlsVisible: () => !get("controls").hidden,
    pauseVisible: () => !get("pause").hidden,
    focusedControl: () => document.activeElement,
    nextControl: get("next"),
    click(name) {
      focus(get(name));
      get(name).emit("click");
    },
    blur() {
      focus(null);
    },
    hover(value) {
      hovered = value;
      get("chyron").emit(value ? "pointerenter" : "pointerleave", {
        pointerType: "mouse",
      });
    },
    hide(value) {
      document.hidden = value;
      document.emit("visibilitychange");
    },
    reduce(value) {
      motion.matches = value;
      motion.emit("change");
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

test("explicit pause survives manual Next and temporary stop transitions", () => {
  const page = createPage();
  page.click("pause");
  page.click("next");
  const chosen = page.quote();
  assert.notDeepEqual(chosen, initial);
  page.hover(true);
  page.hide(true);
  page.reduce(true);
  page.blur();
  page.hide(false);
  page.hover(false);
  page.reduce(false);
  page.tick(60_000);
  assert.deepEqual(page.quote(), chosen);

  page.click("pause");
  page.blur();
  page.tick(19_999);
  assert.deepEqual(page.quote(), chosen);
  page.tick(1);
  assert.notDeepEqual(page.quote(), chosen);
});

test("reduced motion allows manual quotes and reacts while the page is open", () => {
  const page = createPage({ reduced: true });
  page.tick(60_000);
  assert.deepEqual(page.quote(), initial);
  assert.equal(page.pauseVisible(), false);
  page.click("next");
  const requested = page.quote();
  assert.notDeepEqual(requested, initial);
  assert.equal(page.announcement(), requested.join(" "));
  page.blur();
  page.tick(60_000);
  assert.deepEqual(page.quote(), requested);

  page.reduce(false);
  page.tick(20_000);
  assert.notDeepEqual(page.quote(), requested);
  assert.equal(page.announcement(), requested.join(" "));
  page.click("pause");
  page.reduce(true);
  assert.equal(page.focusedControl(), page.nextControl);
  page.blur();
  page.reduce(false);
  const paused = page.quote();
  page.tick(60_000);
  assert.deepEqual(page.quote(), paused);
});

test("overlapping hover, focus, and visibility stops restart one full reading interval", () => {
  const page = createPage();
  page.tick(19_000);
  page.hover(true);
  page.click("next");
  const requested = page.quote();
  page.hide(true);
  page.tick(60_000);
  page.hide(false);
  page.hover(false);
  page.tick(60_000);
  assert.deepEqual(page.quote(), requested);
  page.blur();
  page.tick(19_999);
  assert.deepEqual(page.quote(), requested);
  page.tick(1);
  assert.notDeepEqual(page.quote(), requested);
  page.tick(19_999);
  assert.notDeepEqual(page.quote(), requested);
  page.tick(1);
  assert.deepEqual(page.quote(), requested);
});

test("unavailable or single-entry pools leave the readable static quote without dead controls", () => {
  for (const quotes of [null, [], [initial]]) {
    const page = createPage({ quotes });
    page.tick(60_000);
    assert.deepEqual(page.quote(), initial);
    assert.equal(page.controlsVisible(), false);
  }
});
