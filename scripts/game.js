/**
 * Bingo Game: match flow and screen updates.
 *
 * Owns one match at a time: the cards, the deck, the round clock, lives, and the computer
 * opponent. Rules come from engine.js, so this file only turns them into state changes and DOM
 * updates. The clock measures real elapsed time, so a slow or throttled timer never shortens or
 * stretches a round, and a click that lands after the deadline is judged by the round it missed.
 */

import { CONFIG, DIFFICULTIES } from "./config.js";
import {
  SIZE,
  RANGE,
  COLUMNS,
  NUMBERS_PER_COLUMN,
  FREE,
  FREE_INDEX,
  createCard,
  createDeck,
  callName,
  letterFor,
  progress,
  roundResult,
} from "./engine.js";
import { createAudioController } from "./audio.js";
import { createStore } from "./storage.js";

const RESULT_TEXT = Object.freeze({
  win: { title: "Bingo! You win!", tone: "win" },
  lose: { title: "The computer got bingo first.", tone: "lose" },
  mistakes: { title: "Game over: three wrong marks.", tone: "lose" },
  draw: { title: "Draw! You both got bingo this round.", tone: "draw" },
  exhausted: { title: "All 75 balls called. It's a draw.", tone: "draw" },
});

// --- State ---
let dom = null;
let store = null;
let audio = null;
let match = null;
let ticker = null;
let paused = false;
let lastTick = 0;
let difficulty = CONFIG.DEFAULT_DIFFICULTY;
let playerCells = new Map(); // number → button on the player's card
let focusIndex = 0; // card square that receives focus when tabbing into the card

const $ = (id) => document.getElementById(id);

// --- Setup ---
/**
 * Connects the game to the page. Call once after the DOM is ready.
 * @param {{ storage?: Pick<Storage, "getItem" | "setItem"> | null }} [options]
 */
export function init({ storage } = {}) {
  dom = {
    setupScreen: $("setup-screen"),
    statsSummary: $("stats-summary"),
    startButton: $("start-button"),
    gameScreen: $("game-screen"),
    callBall: $("call-ball"),
    callLetter: $("call-letter"),
    callNumber: $("call-number"),
    countdown: $("countdown"),
    callCount: $("call-count"),
    roundTimer: $("round-timer"),
    playerCard: $("player-card"),
    playerCardBody: $("player-card-body"),
    playerProgress: $("player-progress"),
    message: $("game-message"),
    pauseButton: $("pause-button"),
    pauseLabel: $("pause-label"),
    pauseIcon: $("pause-icon"),
    musicButton: $("music-button"),
    effectsButton: $("effects-button"),
    effectsIcon: $("effects-icon"),
    computerCardBody: $("computer-card-body"),
    computerProgress: $("computer-progress"),
    lives: $("lives"),
    recentCalls: $("recent-calls"),
    calledBoardBody: $("called-board-body"),
    resultDialog: $("result-dialog"),
    resultArt: $("result-art"),
    resultTitle: $("result-title"),
    resultDetails: $("result-details"),
    playAgainButton: $("play-again-button"),
  };

  store = storage === undefined ? createStore() : createStore(storage);
  const saved = store.get();
  difficulty = saved.difficulty;
  audio = createAudioController({
    isActive: () => Boolean(match?.active),
    isPaused: () => paused,
    onBlocked: () =>
      message("The browser blocked the music. Turn Music off and on to retry."),
    music: saved.music,
    effects: saved.effects,
  });

  renderCalledBoard();
  renderToggle(dom.musicButton, saved.music);
  renderToggle(dom.effectsButton, saved.effects);
  setIcon(dom.effectsIcon, saved.effects ? "volume-high" : "volume-xmark");
  renderStats();

  // A match in a background tab would keep calling numbers nobody sees.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && match?.active && !paused) togglePause();
  });

  return { difficulty };
}

export function setDifficulty(level) {
  if (!(level in DIFFICULTIES)) return;
  difficulty = level;
  store.update({ difficulty });
}

// --- Rendering ---
/** "1 ball", "3 balls". */
function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function message(text) {
  dom.message.textContent = text;
}

function renderToggle(button, on) {
  button.setAttribute("aria-pressed", String(on));
}

function setIcon(use, name) {
  use.setAttribute("href", `./assets/icons/icons.svg#${name}`);
}

function renderStats() {
  const { played, wins, losses, draws } = store.get().stats;
  dom.statsSummary.textContent =
    played === 0
      ? "No games played yet."
      : `Played ${played} · Wins ${wins} · Losses ${losses} · Draws ${draws}`;
}

/** The caller's board: all 75 balls in B–I–N–G–O rows, lit up as they are called. */
function renderCalledBoard() {
  dom.calledBoardBody.replaceChildren();
  dom.calledCells = new Map();
  COLUMNS.forEach((letter, column) => {
    const row = document.createElement("tr");
    const head = document.createElement("th");
    head.textContent = letter;
    row.append(head);
    for (let i = 1; i <= NUMBERS_PER_COLUMN; i++) {
      const number = column * NUMBERS_PER_COLUMN + i;
      const cell = document.createElement("td");
      cell.textContent = String(number);
      dom.calledCells.set(number, cell);
      row.append(cell);
    }
    dom.calledBoardBody.append(row);
  });
}

/**
 * Builds a card as table rows. The player's squares are buttons; the computer's are text.
 * @param {HTMLElement} body - the card's <tbody>
 * @param {number[]} card
 * @param {{ interactive?: boolean }} [options]
 */
function renderCard(body, card, { interactive = false } = {}) {
  body.replaceChildren();
  const cells = new Map();
  for (let row = 0; row < SIZE; row++) {
    const tr = document.createElement("tr");
    for (let column = 0; column < SIZE; column++) {
      const index = row * SIZE + column;
      const value = card[index];
      const td = document.createElement("td");
      td.className = "bingo-card__cell";

      if (value === FREE) {
        const free = document.createElement("span");
        free.className = "bingo-card__square is-free is-marked";
        free.textContent = "Free";
        td.append(free);
      } else {
        const square = document.createElement(interactive ? "button" : "span");
        square.className = "bingo-card__square";
        square.textContent = String(value);
        square.dataset.number = String(value);
        square.dataset.index = String(index);
        if (interactive) {
          square.type = "button";
          square.tabIndex = index === focusIndex ? 0 : -1;
          square.setAttribute("aria-label", `${callName(value)}, not marked`);
          square.addEventListener("click", () => markNumber(value));
          square.addEventListener("keydown", (event) =>
            moveFocus(event, index),
          );
        }
        cells.set(value, square);
        td.append(square);
      }
      tr.append(td);
    }
    body.append(tr);
  }
  return cells;
}

function renderStatus() {
  const lives = match.lives;
  dom.lives.textContent =
    "♥".repeat(lives) + "♡".repeat(CONFIG.MAX_LIVES - lives);
  dom.lives.setAttribute(
    "aria-label",
    `${lives} of ${CONFIG.MAX_LIVES} lives left`,
  );
  dom.playerProgress.textContent = `${progress(match.player, match.playerMarks)}/${SIZE}`;
  dom.computerProgress.textContent = `${progress(match.computer, match.computerMarks)}/${SIZE}`;
  dom.callCount.textContent = `${match.called.length}/${RANGE}`;
  const recent = match.called
    .slice(-CONFIG.RECENT_CALLS)
    .reverse()
    .map(callName);
  dom.recentCalls.textContent = recent.length
    ? `Latest calls: ${recent.join(", ")}`
    : "";
}

function renderClock() {
  const left = Math.max(0, DIFFICULTIES[difficulty].roundMs - match.elapsed);
  dom.countdown.textContent = (left / 1000).toFixed(1);
  dom.roundTimer.value = left;
}

// --- Keyboard navigation on the player's card ---
/** Arrow keys, Home and End move between squares; the free centre square is skipped. */
function moveFocus(event, index) {
  const steps = {
    ArrowUp: -SIZE,
    ArrowDown: SIZE,
    ArrowLeft: -1,
    ArrowRight: 1,
  };
  let next = null;
  if (event.key === "Home") next = 0;
  else if (event.key === "End") next = SIZE * SIZE - 1;
  else if (event.key in steps) {
    const step = steps[event.key];
    const sameRow = (a, b) => Math.floor(a / SIZE) === Math.floor(b / SIZE);
    next = index + step;
    if (next === FREE_INDEX) next += step;
    const horizontal = Math.abs(step) === 1;
    const outside =
      next < 0 || next >= SIZE * SIZE || (horizontal && !sameRow(index, next));
    if (outside) next = null;
  }
  if (next === null) return;
  event.preventDefault();
  const target = [...playerCells.values()].find(
    (cell) => Number(cell.dataset.index) === next,
  );
  if (!target) return;
  for (const cell of playerCells.values()) cell.tabIndex = -1;
  target.tabIndex = 0;
  focusIndex = next;
  target.focus();
}

// --- Match ---
/**
 * Starts a new match. The cards and deck can be passed in so tests can play scripted games.
 * @param {{ player?: number[], computer?: number[], deck?: number[] }} [setup]
 */
export function startGame(setup = {}) {
  stopClock();
  audio.stopEffects();
  audio.prepare(["bingo", "lose"]); // download result sounds now, not at the final moment
  paused = false;
  focusIndex = 0;
  match = {
    player: setup.player ?? createCard(),
    computer: setup.computer ?? createCard(),
    deck: [...(setup.deck ?? createDeck())],
    called: [],
    playerMarks: new Set(),
    computerMarks: new Set(),
    lives: CONFIG.MAX_LIVES,
    active: true,
    elapsed: 0,
    computerMoved: false,
    difficulty,
  };

  closeResult();
  dom.setupScreen.hidden = true;
  dom.gameScreen.hidden = false;
  dom.playerCard.inert = false;
  dom.roundTimer.max = DIFFICULTIES[difficulty].roundMs;
  renderPauseButton();

  playerCells = renderCard(dom.playerCardBody, match.player, {
    interactive: true,
  });
  dom.computerCells = renderCard(dom.computerCardBody, match.computer);
  for (const cell of dom.calledCells.values())
    cell.classList.remove("is-called");

  audio.syncMusic();
  nextCall();
  // The start screen may have been scrolled; begin the match with the current call in view.
  window.scrollTo?.(0, 0);
  dom.pauseButton.focus({ preventScroll: true });
  lastTick = performance.now();
  ticker = setInterval(tick, CONFIG.TICK_MS);
}

function nextCall() {
  match.elapsed = 0;
  match.computerMoved = false;
  const number = match.deck.shift();
  match.called.push(number);

  dom.callLetter.textContent = letterFor(number);
  dom.callNumber.textContent = String(number);
  dom.callBall.dataset.letter = letterFor(number);
  dom.calledCells.get(number)?.classList.add("is-called");
  renderClock();
  renderStatus();
  message(`${callName(number)}! Mark it if it is on your card.`);
  audio.play("number-drawn");
}

function computerTurn() {
  match.computerMoved = true;
  for (const number of match.called) {
    if (match.computer.includes(number)) match.computerMarks.add(number);
  }
  for (const [number, cell] of dom.computerCells) {
    cell.classList.toggle("is-marked", match.computerMarks.has(number));
  }
  renderStatus();
}

function tick() {
  const now = performance.now();
  const delta = now - lastTick;
  lastTick = now;
  if (!match?.active || paused) return;

  match.elapsed += delta;
  if (!match.computerMoved && match.elapsed >= CONFIG.COMPUTER_DELAY_MS)
    computerTurn();
  renderClock();
  if (match.elapsed < DIFFICULTIES[match.difficulty].roundMs) return;

  // The round is over for both players at once, so the order of events cannot decide a winner.
  if (!match.computerMoved) computerTurn();
  const result = roundResult(
    match.player,
    match.playerMarks,
    match.computer,
    match.computerMarks,
  );
  if (result) return finish(result);
  if (match.deck.length === 0) return finish("exhausted");
  nextCall();
}

function stopClock() {
  clearInterval(ticker);
  ticker = null;
}

export function markNumber(number) {
  if (!match?.active || paused) return;
  tick(); // settle a round that ended just before this click
  if (!match.active) return;

  const cell = playerCells.get(number);
  if (match.playerMarks.has(number)) {
    audio.play("error");
    message(`${callName(number)} is already marked. No life lost.`);
    return;
  }
  if (!match.called.includes(number)) {
    match.lives -= 1;
    audio.play("miss");
    renderStatus();
    if (match.lives === 0) return finish("mistakes");
    message(
      `${callName(number)} has not been called yet. ${plural(match.lives, "life", "lives")} left.`,
    );
    return;
  }

  match.playerMarks.add(number);
  cell?.classList.add("is-marked");
  cell?.setAttribute("aria-label", `${callName(number)}, marked`);
  audio.play("hit");
  renderStatus();
  const best = progress(match.player, match.playerMarks);
  message(
    best === SIZE
      ? "Bingo line complete! It counts when this round ends."
      : `Marked ${callName(number)}. Closest line: ${best}/${SIZE}.`,
  );
}

function finish(result) {
  match.active = false;
  stopClock();
  audio.rewindMusic();
  audio.stopEffects();
  audio.play(
    result === "win"
      ? "bingo"
      : RESULT_TEXT[result].tone === "lose"
        ? "lose"
        : "hit",
  );
  store.recordResult(result);
  renderStats();

  const { title, tone } = RESULT_TEXT[result];
  dom.resultArt.dataset.tone = tone;
  dom.resultTitle.textContent = title;
  dom.resultDetails.textContent = [
    plural(match.called.length, "ball") + " called",
    plural(match.playerMarks.size, "mark"),
    plural(match.lives, "life", "lives") + " left",
    DIFFICULTIES[match.difficulty].label,
  ].join(" · ");
  message(title);
  dom.playerCard.inert = true;
  dom.resultDialog.showModal();
  dom.playAgainButton.focus();
}

function closeResult() {
  if (dom.resultDialog.open) dom.resultDialog.close();
}

// --- Controls ---
function renderPauseButton() {
  dom.pauseButton.setAttribute("aria-pressed", String(paused));
  dom.pauseLabel.textContent = paused ? "Resume" : "Pause";
  setIcon(dom.pauseIcon, paused ? "play" : "pause");
}

export function togglePause() {
  if (!match?.active) return;
  if (!paused) tick(); // a round that just ended is settled before the clock freezes
  if (!match.active) return;
  paused = !paused;
  lastTick = performance.now();
  renderPauseButton();
  dom.playerCard.inert = paused;
  message(paused ? "Paused. The clock and both cards are frozen." : "Resumed.");
  if (paused) audio.stopEffects();
  audio.syncMusic();
}

export function toggleMusic() {
  const on = !audio.isMusicOn();
  audio.setMusic(on);
  renderToggle(dom.musicButton, on);
  store.update({ music: on });
}

export function toggleEffects() {
  const on = !audio.isEffectsOn();
  audio.setEffects(on);
  renderToggle(dom.effectsButton, on);
  setIcon(dom.effectsIcon, on ? "volume-high" : "volume-xmark");
  store.update({ effects: on });
}

/** Leaves the match (or the result dialog) and returns to the start screen. */
export function backToMenu() {
  stopClock();
  audio.stopEffects();
  if (match) match.active = false;
  paused = false;
  audio.rewindMusic();
  closeResult();
  dom.playerCard.inert = false;
  dom.gameScreen.hidden = true;
  dom.setupScreen.hidden = false;
  dom.startButton.focus();
}
