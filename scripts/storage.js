/**
 * Bingo Game: saved settings and statistics.
 *
 * Difficulty, music and sound choices, and the win/loss record are kept in localStorage between
 * visits. Storage can be blocked (private mode, strict settings), so every read and write is
 * guarded and the game simply starts from the defaults when nothing can be saved.
 */

import { CONFIG, DIFFICULTIES } from "./config.js";

const DEFAULTS = Object.freeze({
  difficulty: CONFIG.DEFAULT_DIFFICULTY,
  music: true,
  effects: true,
  stats: Object.freeze({ played: 0, wins: 0, losses: 0, draws: 0 }),
});

/** Maps a finished game to the statistic it counts toward. */
const RESULT_TO_STAT = Object.freeze({
  win: "wins",
  lose: "losses",
  mistakes: "losses",
  draw: "draws",
  exhausted: "draws",
});

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // some browsers throw just for reading localStorage when it is blocked
  }
}

/**
 * @param {Pick<Storage, "getItem" | "setItem"> | null} [storage]
 */
export function createStore(storage = defaultStorage()) {
  let data = load();

  function load() {
    try {
      const saved =
        JSON.parse(storage?.getItem(CONFIG.STORAGE_KEY) ?? "null") ?? {};
      return {
        difficulty:
          saved.difficulty in DIFFICULTIES
            ? saved.difficulty
            : DEFAULTS.difficulty,
        music: typeof saved.music === "boolean" ? saved.music : DEFAULTS.music,
        effects:
          typeof saved.effects === "boolean" ? saved.effects : DEFAULTS.effects,
        stats: { ...DEFAULTS.stats, ...sanitizeStats(saved.stats) },
      };
    } catch {
      return structuredClone(DEFAULTS); // corrupted JSON: start fresh
    }
  }

  function persist() {
    try {
      storage?.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Saving is a convenience; the game works without it.
    }
  }

  return {
    get: () => structuredClone(data),
    update(patch) {
      data = { ...data, ...patch };
      persist();
    },
    recordResult(result) {
      const key = RESULT_TO_STAT[result];
      if (!key) return;
      data.stats.played += 1;
      data.stats[key] += 1;
      persist();
    },
  };
}

function sanitizeStats(stats) {
  if (!stats || typeof stats !== "object") return {};
  return Object.fromEntries(
    Object.keys(DEFAULTS.stats)
      .filter((key) => Number.isInteger(stats[key]) && stats[key] >= 0)
      .map((key) => [key, stats[key]]),
  );
}
