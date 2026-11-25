import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, freshImport } from "./helpers/fake-dom.js";
import { FREE, FREE_INDEX, RANGE } from "../scripts/engine.js";

// --- Scripted matches ---
/** Builds a card from five columns of five numbers (row by row, free centre). */
function card(columns) {
  const result = Array.from(
    { length: 25 },
    (_, i) => columns[i % 5][Math.floor(i / 5)],
  );
  result[FREE_INDEX] = FREE;
  return result;
}

const range = (from) => Array.from({ length: 5 }, (_, i) => from + i);
const PLAYER = card([range(1), range(16), range(31), range(46), range(61)]);
const COMPUTER = card([range(6), range(21), range(36), range(51), range(66)]);
const PLAYER_TOP_ROW = [1, 16, 31, 46, 61];
const COMPUTER_TOP_ROW = [6, 21, 36, 51, 66];

/** A full 75-ball deck that calls `first` in order, then everything else. */
function deck(first) {
  const rest = Array.from({ length: RANGE }, (_, i) => i + 1).filter(
    (n) => !first.includes(n),
  );
  return [...first, ...rest];
}

async function setup(context, { difficulty } = {}) {
  const env = installFakeDom(context);
  if (difficulty)
    env.storage.setItem("bingo-game:v1", JSON.stringify({ difficulty }));
  const game = await freshImport("scripts/game.js");
  game.init({ storage: env.storage });

  const square = (number) =>
    env
      .el("player-card-body")
      .descendants()
      .find((node) => node.dataset.number === String(number));
  const click = (number) => {
    const node = square(number);
    assert.ok(node, `${number} is on the player's card`);
    node.dispatch("click");
    return node;
  };
  const start = (options = {}) =>
    game.startGame({
      player: PLAYER,
      computer: COMPUTER,
      deck: deck([]),
      ...options,
    });
  const saved = () => JSON.parse(env.storage.getItem("bingo-game:v1"));
  return { ...env, game, square, click, start, saved };
}

// --- Start and rounds ---
test("a new match renders 24 number buttons plus the free square and one clock", async (t) => {
  const f = await setup(t);
  const scrolls = [];
  globalThis.scrollTo = (x, y) => scrolls.push([x, y]);
  t.after(() => delete globalThis.scrollTo);
  f.start({ deck: deck([7]) });
  assert.deepEqual(
    scrolls,
    [[0, 0]],
    "the match starts at the top of the page",
  );
  const squares = f
    .el("player-card-body")
    .descendants()
    .filter((n) => n.tagName === "BUTTON");
  assert.equal(squares.length, 24);
  const free = f
    .el("player-card-body")
    .descendants()
    .find((n) => n.classList.contains("is-free"));
  assert.ok(
    free?.classList.contains("is-marked"),
    "the free square starts marked",
  );
  assert.equal(f.el("call-letter").textContent, "B");
  assert.equal(f.el("call-number").textContent, "7");
  assert.equal(f.el("call-count").textContent, "1/75");
  assert.equal(
    f.el("player-progress").textContent,
    "1/5",
    "the free square counts",
  );
  assert.equal(f.timers.size, 1);
  assert.equal(f.el("game-screen").hidden, false);
  assert.equal(f.el("setup-screen").hidden, true);
});

test("the computer marks its card only after its reaction time", async (t) => {
  const f = await setup(t);
  f.start({ deck: deck([6]) });
  f.advance(1699);
  assert.equal(f.el("computer-progress").textContent, "1/5");
  f.advance(1);
  assert.equal(f.el("computer-progress").textContent, "2/5");
});

test("difficulty sets the round length and is remembered", async (t) => {
  const f = await setup(t, { difficulty: "easy" });
  f.start();
  f.advance(6999);
  assert.equal(f.el("call-count").textContent, "1/75");
  f.advance(1);
  assert.equal(f.el("call-count").textContent, "2/75");

  f.game.setDifficulty("hard");
  assert.equal(f.saved().difficulty, "hard");
  f.start();
  f.advance(3500);
  assert.equal(f.el("call-count").textContent, "2/75");
});

// --- Marking ---
test("correct, repeated, and earlier calls follow the rules", async (t) => {
  const f = await setup(t);
  f.start({ deck: deck([1, 16]) });
  f.advance(5000); // B-1 stays valid after I-16 is called
  const square = f.click(1);
  assert.ok(square.classList.contains("is-marked"));
  assert.equal(square.getAttribute("aria-label"), "B-1, marked");
  assert.equal(f.el("player-progress").textContent, "2/5");

  f.click(1);
  assert.match(f.el("game-message").textContent, /already marked/);
  assert.equal(f.el("lives").getAttribute("aria-label"), "3 of 3 lives left");
  assert.equal(f.sound("error").playCount, 1);
});

test("a wrong mark costs a life, and three end the game as a loss", async (t) => {
  const f = await setup(t);
  f.start();
  f.click(2);
  assert.match(
    f.el("game-message").textContent,
    /B-2 has not been called yet\. 2 lives left/,
  );
  f.click(2);
  f.click(2);
  assert.match(f.el("result-title").textContent, /three wrong marks/);
  assert.equal(f.el("result-dialog").open, true);
  assert.equal(f.el("result-art").dataset.tone, "lose");
  assert.equal(f.timers.size, 0);
  assert.equal(f.el("player-card").inert, true);
  assert.deepEqual(f.saved().stats, {
    played: 1,
    wins: 0,
    losses: 1,
    draws: 0,
  });
  assert.equal(
    f.el("stats-summary").textContent,
    "Played 1 · Wins 0 · Losses 1 · Draws 0",
  );

  f.click(1); // ignored after the game is over
  assert.equal(f.el("player-progress").textContent, "1/5");
});

// --- Results ---
test("a completed line wins only when the round ends", async (t) => {
  const f = await setup(t);
  // The middle row needs only four calls, thanks to the free square.
  f.start({ deck: deck([3, 18, 48, 63]) });
  for (const [i, n] of [3, 18, 48, 63].entries()) {
    f.click(n);
    if (i < 3) f.advance(5000);
  }
  assert.match(f.el("game-message").textContent, /counts when this round ends/);
  assert.equal(f.el("result-dialog").open, false);
  f.advance(4999);
  assert.equal(f.el("result-dialog").open, false);
  f.advance(1);
  assert.match(f.el("result-title").textContent, /You win/);
  assert.equal(f.el("result-art").dataset.tone, "win");
  assert.equal(document.activeElement, f.el("play-again-button"));
  assert.equal(f.saved().stats.wins, 1);
});

test("both players completing a line in the same round is a draw", async (t) => {
  const f = await setup(t);
  // The player leaves 63 unmarked until the round in which the computer completes with 68.
  f.start({ deck: deck([3, 8, 18, 23, 48, 53, 63, 68]) });
  for (const n of [3, 8, 18, 23, 48, 53, 63]) {
    if ([3, 18, 48].includes(n)) f.click(n);
    f.advance(5000);
  }
  f.advance(1700);
  assert.equal(f.el("computer-progress").textContent, "5/5");
  assert.equal(
    f.el("result-dialog").open,
    false,
    "the player can still catch up this round",
  );
  f.click(63); // called a round earlier, so still valid
  f.advance(3300);
  assert.match(f.el("result-title").textContent, /Draw/);
  assert.equal(f.saved().stats.draws, 1);
});

test("a click after the deadline cannot overturn the computer's win", async (t) => {
  const f = await setup(t);
  f.start({ deck: deck([8, 23, 53, 68, 3]) });
  for (let i = 0; i < 3; i++) f.advance(5000);
  f.jump(5000); // the fourth round ended, but no timer has run yet
  f.click(3);
  assert.match(f.el("result-title").textContent, /computer got bingo/);
});

test("with no line after all 75 calls the match is a draw", async (t) => {
  const f = await setup(t);
  const computer = card([
    range(11),
    range(26),
    range(41),
    range(56),
    range(71),
  ]);
  f.start({ computer, deck: deck([]).filter((n) => !computer.includes(n)) });
  for (let i = 0; i < RANGE && f.timers.size; i++) f.advance(5000);
  assert.match(f.el("result-title").textContent, /draw/);
});

// --- Pause, tabs, menu ---
test("pause freezes the clock and both cards; resume keeps the remaining time", async (t) => {
  const f = await setup(t);
  f.start({ deck: deck([1, 6]) });
  f.advance(1000);
  f.game.togglePause();
  assert.equal(f.el("pause-button").getAttribute("aria-pressed"), "true");
  assert.equal(f.el("pause-label").textContent, "Resume");
  assert.match(f.el("pause-icon").getAttribute("href"), /#play$/);
  f.advance(20000);
  f.click(1);
  assert.equal(
    f.el("player-progress").textContent,
    "1/5",
    "clicks are ignored while paused",
  );
  assert.equal(f.el("countdown").textContent, "4.0");
  f.game.togglePause();
  f.advance(4000);
  assert.equal(f.el("call-count").textContent, "2/75");
});

test("switching tabs pauses the match, and coming back does not resume it", async (t) => {
  const f = await setup(t);
  f.start();
  document.hidden = true;
  f.fireDocument("visibilitychange");
  f.advance(20000);
  document.hidden = false;
  f.fireDocument("visibilitychange");
  assert.equal(f.el("pause-label").textContent, "Resume");
  assert.equal(f.el("call-count").textContent, "1/75");
});

test("back to menu closes the result and stops the clock", async (t) => {
  const f = await setup(t);
  f.start();
  f.click(2);
  f.click(2);
  f.click(2);
  f.game.backToMenu();
  assert.equal(f.el("result-dialog").open, false);
  assert.equal(f.el("setup-screen").hidden, false);
  assert.equal(f.el("game-screen").hidden, true);
  assert.equal(document.activeElement, f.el("start-button"));
  assert.equal(f.timers.size, 0);
});

test("restarting many times leaves one clock and a clean match", async (t) => {
  const f = await setup(t);
  f.start();
  f.click(2);
  f.game.togglePause();
  for (let i = 0; i < 5; i++) f.start();
  assert.equal(f.timers.size, 1);
  assert.equal(f.el("lives").getAttribute("aria-label"), "3 of 3 lives left");
  assert.equal(f.el("player-card").inert, false);
  f.advance(5000);
  assert.equal(f.el("call-count").textContent, "2/75");
});

// --- Keyboard ---
test("arrow keys move focus across the card and skip the free square", async (t) => {
  const f = await setup(t);
  f.start();
  const at = (index) =>
    f
      .el("player-card-body")
      .descendants()
      .find((n) => n.dataset.index === String(index));
  const press = (index, key) => at(index).dispatch("keydown", { key });

  press(0, "ArrowRight");
  assert.equal(document.activeElement, at(1));
  assert.equal(at(1).tabIndex, 0);
  assert.equal(at(0).tabIndex, -1, "only one square is in the tab order");
  press(7, "ArrowDown");
  assert.equal(
    document.activeElement,
    at(17),
    "jumps over the free square at index 12",
  );
  press(4, "ArrowRight");
  assert.equal(document.activeElement, at(17), "no wrap past the end of a row");
  press(17, "Home");
  assert.equal(document.activeElement, at(0));
});

// --- Audio ---
test("music follows pause and the Music switch, and the choice is saved", async (t) => {
  const f = await setup(t);
  f.start();
  const music = f.sound("background-music");
  assert.equal(music.paused, false);
  music.currentTime = 12.5;
  f.game.togglePause();
  assert.equal(music.paused, true);
  f.game.togglePause();
  assert.equal(music.currentTime, 12.5, "resumes where it stopped");

  f.game.toggleMusic();
  assert.equal(music.paused, true);
  assert.equal(f.el("music-button").getAttribute("aria-pressed"), "false");
  assert.equal(f.saved().music, false);
  f.game.togglePause();
  f.game.togglePause();
  assert.equal(
    music.paused,
    true,
    "a paused game does not override the Music switch",
  );
});

test("the Sounds switch silences effects", async (t) => {
  const f = await setup(t);
  f.game.toggleEffects();
  f.start();
  f.click(2);
  assert.equal(f.sound("miss")?.playCount ?? 0, 0);
  assert.equal(f.saved().effects, false);
  assert.match(f.el("effects-icon").getAttribute("href"), /#volume-xmark$/);
});

test("result sounds are downloaded early and the bingo sound plays on a win", async (t) => {
  const f = await setup(t);
  f.start({ deck: deck([3, 18, 48, 63]) });
  const bingo = f.sound("bingo");
  assert.equal(bingo.preload, "auto");
  assert.equal(bingo.playCount, 0);
  for (const n of [3, 18, 48, 63]) {
    f.click(n);
    f.advance(5000);
  }
  assert.equal(bingo.playCount, 1);
  assert.equal(
    f.sound("background-music").currentTime,
    0,
    "music rewinds after the match",
  );
});
