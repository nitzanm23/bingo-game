import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FREE,
  FREE_INDEX,
  LINES,
  createCard,
  createDeck,
  shuffle,
  letterFor,
  callName,
  progress,
  roundResult,
} from "../scripts/engine.js";

/** A repeatable random source, so a failing test can be reproduced. */
function seeded(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}

const cardOf = (columns) => {
  const card = Array.from(
    { length: 25 },
    (_, i) => columns[i % 5][Math.floor(i / 5)],
  );
  card[FREE_INDEX] = FREE;
  return card;
};
const range = (from) => Array.from({ length: 5 }, (_, i) => from + i);
const CARD = cardOf([range(1), range(16), range(31), range(46), range(61)]);

test("the deck holds each of the 75 balls exactly once", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const deck = createDeck(seeded(seed));
    assert.deepEqual(
      [...deck].sort((a, b) => a - b),
      Array.from({ length: 75 }, (_, i) => i + 1),
    );
  }
});

test("shuffle returns a new array and leaves the input untouched", () => {
  const input = [1, 2, 3, 4, 5];
  const output = shuffle(input, seeded(7));
  assert.deepEqual(input, [1, 2, 3, 4, 5]);
  assert.notEqual(output, input);
  assert.deepEqual([...output].sort(), input);
});

test("cards use each column's range, never repeat, and have a free centre", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const card = createCard(seeded(seed));
    assert.equal(card.length, 25);
    assert.equal(card[FREE_INDEX], FREE);
    const numbers = card.filter((value) => value !== FREE);
    assert.equal(new Set(numbers).size, 24);
    card.forEach((value, index) => {
      if (value === FREE) return;
      const column = index % 5;
      assert.ok(
        value >= column * 15 + 1 && value <= column * 15 + 15,
        `${value} is outside column ${"BINGO"[column]}`,
      );
    });
  }
});

test("balls are announced with their column letter", () => {
  assert.equal(letterFor(1), "B");
  assert.equal(letterFor(15), "B");
  assert.equal(letterFor(16), "I");
  assert.equal(letterFor(45), "N");
  assert.equal(letterFor(46), "G");
  assert.equal(letterFor(75), "O");
  assert.equal(callName(7), "B-7");
  assert.equal(callName(64), "O-64");
});

test("there are 12 winning lines and each one completes the card", () => {
  assert.equal(LINES.length, 12);
  for (const line of LINES) {
    const marks = new Set(
      line.map((index) => CARD[index]).filter((value) => value !== FREE),
    );
    assert.equal(progress(CARD, marks), 5, `line ${line} should complete`);
  }
});

test("the free square counts toward every line through the centre", () => {
  const empty = new Set();
  assert.equal(progress(CARD, empty), 1);
  assert.equal(
    progress(CARD, new Set([3, 18, 48, 63])),
    5,
    "middle row with four marks",
  );
  assert.equal(
    progress(CARD, new Set([31, 32, 34, 35])),
    5,
    "N column with four marks",
  );
  assert.equal(progress(CARD, new Set([3, 18, 48])), 4);
});

test("scattered marks and numbers not on the card do not make a line", () => {
  // 1 and 17 share the diagonal with the free square; 33 is not on the card (its spot is FREE).
  assert.equal(progress(CARD, new Set([1, 17, 33, 47])), 3);
  assert.equal(progress(CARD, new Set([1, 20, 47])), 2);
  assert.equal(progress(CARD, new Set([6, 7, 8, 9, 10])), 1);
});

test("round results tell a win, a loss, a draw, and no result apart", () => {
  const full = new Set([1, 16, 31, 46, 61]);
  const none = new Set();
  assert.equal(roundResult(CARD, full, CARD, none), "win");
  assert.equal(roundResult(CARD, none, CARD, full), "lose");
  assert.equal(roundResult(CARD, full, CARD, full), "draw");
  assert.equal(roundResult(CARD, none, CARD, none), null);
});
