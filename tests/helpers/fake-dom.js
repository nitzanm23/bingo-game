/**
 * Bingo Game tests: a small simulated browser.
 *
 * Builds one fake element for every id in index.html, plus a controllable clock, timers, Audio,
 * and storage, so the real game modules can run in Node. It checks behavior, not layout:
 * rendering and real-device audio are verified in the browser.
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);
const HTML = readFileSync(new URL("index.html", ROOT), "utf8");

export class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.textContent = "";
    this.hidden = false;
    this.inert = false;
    this.open = false;
    this.tabIndex = 0;
    const classes = new Set();
    this.classes = classes;
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, force = !classes.has(name)) => {
        if (force) classes.add(name);
        else classes.delete(name);
        return force;
      },
    };
  }

  set className(value) {
    this.classes.clear();
    value
      .split(" ")
      .filter(Boolean)
      .forEach((name) => this.classes.add(name));
  }

  get className() {
    return [...this.classes].join(" ");
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = nodes;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(type, callback) {
    (this.listeners[type] ??= []).push(callback);
  }

  dispatch(type, event = {}) {
    const full = { preventDefault() {}, ...event };
    for (const callback of this.listeners[type] ?? []) callback(full);
    return full;
  }

  focus() {
    globalThis.document.activeElement = this;
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
  }

  /** Every descendant, depth first. */
  descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
}

/**
 * Installs the fake browser for one test and restores the real globals afterwards.
 * @param {import("node:test").TestContext} context
 */
export function installFakeDom(context) {
  const names = [
    "document",
    "window",
    "Audio",
    "performance",
    "setInterval",
    "clearInterval",
  ];
  const saved = names.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ]);
  context.after(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });

  const elements = new Map();
  for (const match of HTML.matchAll(
    /<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g,
  )) {
    const [, tag, attributes, id] = match;
    const element = new FakeElement(tag);
    element.className = attributes.match(/class="([^"]*)"/)?.[1] ?? "";
    element.hidden = /\shidden(\s|$|=)/.test(attributes);
    elements.set(id, element);
  }
  const radios = [
    ...HTML.matchAll(/<input type="radio" name="difficulty" value="(\w+)"/g),
  ].map(([, value]) =>
    Object.assign(new FakeElement("input"), { value, checked: false }),
  );

  const documentListeners = {};
  globalThis.document = {
    hidden: false,
    activeElement: null,
    getElementById: (id) => elements.get(id) ?? null,
    createElement: (tag) => new FakeElement(tag),
    querySelectorAll: (selector) => {
      assert.equal(
        selector,
        'input[name="difficulty"]',
        `unexpected selector: ${selector}`,
      );
      return radios;
    },
    addEventListener: (type, callback) => {
      (documentListeners[type] ??= []).push(callback);
    },
  };
  globalThis.window = globalThis;

  const audio = [];
  globalThis.Audio = class {
    constructor(src) {
      assert.ok(existsSync(new URL(src, ROOT)), `missing audio file: ${src}`);
      Object.assign(this, {
        src,
        paused: true,
        currentTime: 0,
        playCount: 0,
        volume: 1,
      });
      audio.push(this);
    }

    play() {
      this.playCount += 1;
      if (this.rejectPlay) return Promise.reject(new Error("Playback blocked"));
      this.paused = false;
      return Promise.resolve();
    }

    pause() {
      this.paused = true;
    }
  };

  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  Object.defineProperty(globalThis, "performance", {
    value: { now: () => now },
    configurable: true,
  });
  globalThis.setInterval = (callback) => {
    timers.set(++nextTimer, callback);
    return nextTimer;
  };
  globalThis.clearInterval = (id) => timers.delete(id);

  const storageData = new Map();
  const storage = {
    getItem: (key) => storageData.get(key) ?? null,
    setItem: (key, value) => storageData.set(key, String(value)),
  };

  return {
    elements,
    radios,
    audio,
    timers,
    storage,
    el: (id) => elements.get(id),
    /** Moves the clock forward and runs every timer once, like the 100 ms ticker. */
    advance(ms) {
      now += ms;
      for (const callback of [...timers.values()]) callback();
    },
    /** Moves the clock without running timers, e.g. a tab that throttled them. */
    jump(ms) {
      now += ms;
    },
    fireDocument(type) {
      for (const callback of documentListeners[type] ?? []) callback({});
    },
    sound: (name) => audio.find((item) => item.src.endsWith(`/${name}.mp3`)),
  };
}

let instance = 0;

/** Imports a fresh copy of a module, so module-level state never leaks between tests. */
export function freshImport(path) {
  return import(`${new URL(path, ROOT).href}?test=${++instance}`);
}
