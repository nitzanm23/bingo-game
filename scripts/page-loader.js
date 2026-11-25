/**
 * Bingo Game: opening screen.
 *
 * Loaded in <head> without `defer`, so `.is-loading` is set on <html> before the first paint and
 * the game never flashes behind the logo. It also adds `.has-js`, which shows the Start button.
 * With JavaScript disabled neither class is added: the start screen appears at once with a note
 * that the game needs JavaScript. CSS failsafes in page-loader.css reveal the page even if this
 * script fails.
 */

(() => {
  const LOADER_DURATION_MS = 3000;
  const root = document.documentElement;

  root.classList.add("has-js", "is-loading");

  window.setTimeout(() => {
    root.classList.remove("is-loading");
    root.classList.add("is-loaded");
  }, LOADER_DURATION_MS);
})();
