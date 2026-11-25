/**
 * Bingo Game: startup.
 *
 * Connects the buttons and settings on the page to the game module and restores the saved
 * difficulty. Kept separate from game.js so the match logic can be imported by the tests
 * without a browser.
 */

import {
  init,
  startGame,
  setDifficulty,
  togglePause,
  toggleMusic,
  toggleEffects,
  backToMenu,
} from "./game.js";

const { difficulty } = init();

const clicks = {
  "start-button": () => startGame(),
  "play-again-button": () => startGame(),
  "menu-button": backToMenu,
  "quit-button": backToMenu,
  "pause-button": togglePause,
  "music-button": toggleMusic,
  "effects-button": toggleEffects,
};
for (const [id, handler] of Object.entries(clicks)) {
  document.getElementById(id).addEventListener("click", handler);
}

// Escape on the result dialog goes back to the menu instead of leaving a finished board open.
document.getElementById("result-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  backToMenu();
});

for (const radio of document.querySelectorAll('input[name="difficulty"]')) {
  radio.checked = radio.value === difficulty;
  radio.addEventListener("change", () => setDifficulty(radio.value));
}

document.getElementById("footer-year").textContent = String(
  new Date().getFullYear(),
);
