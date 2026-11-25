import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../scripts/storage.js";

function memoryStorage(initial) {
  const data = new Map(initial ? [["bingo-game:v1", initial]] : []);
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

const FRESH = {
  difficulty: "normal",
  music: true,
  effects: true,
  stats: { played: 0, wins: 0, losses: 0, draws: 0 },
};

test("starts from the defaults when nothing is saved or storage is unavailable", () => {
  assert.deepEqual(createStore(memoryStorage()).get(), FRESH);
  assert.deepEqual(createStore(null).get(), FRESH);
});

test("saved settings and stats survive a reload", () => {
  const storage = memoryStorage();
  const first = createStore(storage);
  first.update({ difficulty: "hard", music: false });
  first.recordResult("win");
  first.recordResult("mistakes");
  first.recordResult("exhausted");
  assert.deepEqual(createStore(storage).get(), {
    ...FRESH,
    difficulty: "hard",
    music: false,
    stats: { played: 3, wins: 1, losses: 1, draws: 1 },
  });
});

test("corrupted or tampered data falls back to safe values", () => {
  assert.deepEqual(createStore(memoryStorage("{not json")).get(), FRESH);
  const tampered = JSON.stringify({
    difficulty: "impossible",
    music: "yes",
    stats: { played: -4, wins: 2.5, losses: 3 },
  });
  assert.deepEqual(createStore(memoryStorage(tampered)).get(), {
    ...FRESH,
    stats: { ...FRESH.stats, losses: 3 },
  });
});

test("a storage that throws on write does not break the game", () => {
  const store = createStore({
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  });
  assert.doesNotThrow(() => store.recordResult("win"));
  assert.equal(
    store.get().stats.wins,
    1,
    "the result still counts for this visit",
  );
});

test("get() returns a copy, so callers cannot change the saved data by accident", () => {
  const store = createStore(memoryStorage());
  store.get().stats.wins = 99;
  assert.equal(store.get().stats.wins, 0);
});
