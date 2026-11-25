/**
 * Bingo Game: game rules.
 *
 * Pure functions with no DOM, timers, or audio, so the rules run the same in the browser and in
 * the Node test suite. Cards follow classic 75-ball bingo: each column draws from its own range
 * (B 1–15, I 16–30, N 31–45, G 46–60, O 61–75) and the centre square is free.
 */

export const SIZE = 5;
export const RANGE = 75;
export const COLUMNS = Object.freeze(["B", "I", "N", "G", "O"]);
export const NUMBERS_PER_COLUMN = RANGE / SIZE;

/** Board value of the free centre square. Real numbers are 1–75, so 0 never collides. */
export const FREE = 0;
export const FREE_INDEX = Math.floor((SIZE * SIZE) / 2);

/**
 * Returns a shuffled copy of the given values (Fisher–Yates).
 * @param {number[]} values
 * @param {() => number} [random] - returns a number in [0, 1), like Math.random
 */
export function shuffle(values, random = Math.random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** The 75 balls in random draw order. */
export function createDeck(random = Math.random) {
  return shuffle(
    Array.from({ length: RANGE }, (_, i) => i + 1),
    random,
  );
}

/**
 * A 5×5 card stored row by row: index = row × 5 + column.
 * Each column holds five different numbers from its own range; the centre is FREE.
 */
export function createCard(random = Math.random) {
  const columns = COLUMNS.map((_, column) => {
    const first = column * NUMBERS_PER_COLUMN + 1;
    const range = Array.from(
      { length: NUMBERS_PER_COLUMN },
      (_, i) => first + i,
    );
    return shuffle(range, random).slice(0, SIZE);
  });
  const card = Array.from({ length: SIZE * SIZE }, (_, index) => {
    return columns[index % SIZE][Math.floor(index / SIZE)];
  });
  card[FREE_INDEX] = FREE;
  return card;
}

/** Column letter of a ball, e.g. 7 → "B", 52 → "G". */
export function letterFor(number) {
  return COLUMNS[Math.floor((number - 1) / NUMBERS_PER_COLUMN)];
}

/** How a caller announces a ball, e.g. 7 → "B-7". */
export function callName(number) {
  return `${letterFor(number)}-${number}`;
}

/** Every winning line as card indexes: 5 rows, 5 columns, and 2 diagonals. */
export const LINES = Object.freeze([
  ...Array.from({ length: SIZE }, (_, row) =>
    Array.from({ length: SIZE }, (_, column) => row * SIZE + column),
  ),
  ...Array.from({ length: SIZE }, (_, column) =>
    Array.from({ length: SIZE }, (_, row) => row * SIZE + column),
  ),
  Array.from({ length: SIZE }, (_, i) => i * (SIZE + 1)),
  Array.from({ length: SIZE }, (_, i) => (i + 1) * (SIZE - 1)),
]);

/** True if the square at `index` counts as marked (the free square always does). */
export function isCovered(card, marks, index) {
  return card[index] === FREE || marks.has(card[index]);
}

/** Squares covered in the card's most complete line (0–5). */
export function progress(card, marks) {
  return Math.max(
    ...LINES.map(
      (line) => line.filter((index) => isCovered(card, marks, index)).length,
    ),
  );
}

/**
 * Decides a finished round. Both players get the whole round, so a line completed by either
 * one before the deadline counts, and lines completed in the same round are a draw.
 * @returns {"win" | "lose" | "draw" | null} null while nobody has a line
 */
export function roundResult(
  playerCard,
  playerMarks,
  computerCard,
  computerMarks,
) {
  const player = progress(playerCard, playerMarks) === SIZE;
  const computer = progress(computerCard, computerMarks) === SIZE;
  if (player && computer) return "draw";
  if (player) return "win";
  if (computer) return "lose";
  return null;
}
