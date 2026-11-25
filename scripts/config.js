/**
 * Bingo Game: settings.
 *
 * Every timing and limit in one place. The computer always marks every called number, so the
 * difficulty is how long you have to find and mark each call before the round ends.
 */

export const CONFIG = Object.freeze({
  COMPUTER_DELAY_MS: 1700, // the computer "reacts" this long after each call
  MAX_LIVES: 3,
  TICK_MS: 100,
  RECENT_CALLS: 5, // calls read out in the screen reader summary
  STORAGE_KEY: "bingo-game:v1", // name:version; bump v1 if the saved shape changes
  DEFAULT_DIFFICULTY: "normal",
});

export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ label: "Easy", roundMs: 7000 }),
  normal: Object.freeze({ label: "Normal", roundMs: 5000 }),
  hard: Object.freeze({ label: "Hard", roundMs: 3500 }),
});
