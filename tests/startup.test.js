import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, freshImport } from "./helpers/fake-dom.js";

test("startup wires every control, restores the difficulty, and sets the year", async (t) => {
  const env = installFakeDom(t);
  globalThis.localStorage = env.storage;
  t.after(() => delete globalThis.localStorage);
  env.storage.setItem("bingo-game:v1", JSON.stringify({ difficulty: "hard" }));

  await freshImport("scripts/index.js");

  const buttons = [
    "start-button",
    "play-again-button",
    "menu-button",
    "quit-button",
    "pause-button",
    "music-button",
    "effects-button",
  ];
  for (const id of buttons) {
    assert.equal(
      env.el(id).listeners.click?.length,
      1,
      `${id} has one click handler`,
    );
  }
  assert.equal(env.el("result-dialog").listeners.cancel?.length, 1);
  assert.deepEqual(
    env.radios.map((radio) => [radio.value, radio.checked]),
    [
      ["easy", false],
      ["normal", false],
      ["hard", true],
    ],
  );
  assert.equal(
    env.el("footer-year").textContent,
    String(new Date().getFullYear()),
  );

  env.radios[0].dispatch("change");
  assert.equal(
    JSON.parse(env.storage.getItem("bingo-game:v1")).difficulty,
    "easy",
  );
});

test("Escape on the result dialog returns to the menu instead of just closing it", async (t) => {
  const env = installFakeDom(t);
  globalThis.localStorage = env.storage;
  t.after(() => delete globalThis.localStorage);
  await freshImport("scripts/index.js");

  env.el("start-button").dispatch("click");
  assert.equal(env.el("game-screen").hidden, false);
  const event = env.el("result-dialog").dispatch("cancel", {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  });
  assert.equal(event.defaultPrevented, true);
  assert.equal(env.el("setup-screen").hidden, false);
  assert.equal(env.timers.size, 0);
});
