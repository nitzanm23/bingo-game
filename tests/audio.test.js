import { test } from "node:test";
import assert from "node:assert/strict";
import { createAudioController } from "../scripts/audio.js";

function mockAudio(context) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  context.after(() => {
    if (saved) Object.defineProperty(globalThis, "Audio", saved);
    else delete globalThis.Audio;
  });
  const created = [];
  globalThis.Audio = class {
    constructor(src) {
      Object.assign(this, { src, paused: true, currentTime: 0, playCount: 0 });
      created.push(this);
    }

    play() {
      this.playCount += 1;
      if (this.rejectPlay) return Promise.reject(new Error("blocked"));
      this.paused = false;
      return Promise.resolve();
    }

    pause() {
      this.paused = true;
    }
  };
  return created;
}

function controller(options = {}) {
  const state = { active: true, paused: false };
  const audio = createAudioController({
    isActive: () => state.active,
    isPaused: () => state.paused,
    ...options,
  });
  return { audio, state };
}

test("nothing is downloaded until a sound is needed", (t) => {
  const created = mockAudio(t);
  controller();
  assert.equal(created.length, 0);
});

test("music plays only while switched on, active, and not paused", (t) => {
  const created = mockAudio(t);
  const { audio, state } = controller();
  audio.syncMusic();
  const music = created.find((a) => a.src.endsWith("background-music.mp3"));
  assert.equal(music.paused, false);
  assert.equal(music.loop, true);
  assert.equal(music.volume, 0.15);

  state.paused = true;
  audio.syncMusic();
  assert.equal(music.paused, true);
  state.paused = false;
  audio.setMusic(false);
  assert.equal(music.paused, true);
  audio.syncMusic();
  assert.equal(music.paused, true, "the switch wins over the game state");
});

test("each effect is created once and replayed from the start", (t) => {
  const created = mockAudio(t);
  const { audio } = controller();
  audio.play("hit");
  created[0].currentTime = 1.2;
  audio.play("hit");
  assert.equal(created.length, 1);
  assert.equal(created[0].playCount, 2);
  assert.equal(created[0].currentTime, 0);
  audio.stopEffects();
  assert.equal(created[0].paused, true);
});

test("effects stay silent while switched off", (t) => {
  const created = mockAudio(t);
  const { audio } = controller({ effects: false });
  audio.play("hit");
  assert.equal(created.length, 0);
});

test("a blocked music start is reported once the browser refuses", async (t) => {
  const created = mockAudio(t);
  let blocked = 0;
  const { audio } = controller({ onBlocked: () => blocked++ });
  audio.prepare([]); // no effects needed
  audio.syncMusic();
  created[0].rejectPlay = true;
  created[0].paused = true;
  audio.syncMusic();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(blocked, 1);
});
