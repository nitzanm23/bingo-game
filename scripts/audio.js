/**
 * Bingo Game: music and sound effects.
 *
 * The controller owns every Audio element and the player's on/off choices, while the game only
 * reports whether a match is running or paused. Music plays when it is switched on and a match is
 * active and not paused; the track keeps its position across pauses.
 */

const AUDIO_PATH = "./assets/audio";
// The track is mastered loud (about −7 LUFS), so this keeps it a few steps under the effects.
const MUSIC_VOLUME = 0.15;

/**
 * @param {object} options
 * @param {() => boolean} options.isActive - a match is in progress
 * @param {() => boolean} options.isPaused - the match is paused
 * @param {() => void} [options.onBlocked] - the browser refused to start the music
 * @param {boolean} [options.music] - initial music choice
 * @param {boolean} [options.effects] - initial sound effects choice
 */
export function createAudioController({
  isActive,
  isPaused,
  onBlocked = () => {},
  music: musicOn = true,
  effects: effectsOn = true,
}) {
  let music = null; // created on first use, so loading the page never downloads the track
  const effects = new Map();

  function getEffect(name) {
    if (!effects.has(name)) {
      const audio = new Audio(`${AUDIO_PATH}/${name}.mp3`);
      audio.preload = "auto";
      effects.set(name, audio);
    }
    return effects.get(name);
  }

  function getMusic() {
    if (!music) {
      music = new Audio(`${AUDIO_PATH}/background-music.mp3`);
      music.loop = true;
      music.volume = MUSIC_VOLUME;
    }
    return music;
  }

  function stopEffects() {
    for (const audio of effects.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  /** Plays or pauses the music to match the current choice and game state. */
  function syncMusic() {
    const shouldPlay = musicOn && isActive() && !isPaused();
    if (!shouldPlay) {
      music?.pause();
      return;
    }
    getMusic()
      .play()
      .catch(() => {
        if (musicOn && isActive() && !isPaused()) onBlocked();
      });
  }

  return {
    /** Starts downloading effects that are needed later, e.g. the result sounds. */
    prepare(names) {
      names.forEach(getEffect);
    },
    play(name) {
      if (!effectsOn) return;
      const audio = getEffect(name);
      audio.currentTime = 0;
      audio.play().catch(() => {}); // a missed effect is not worth interrupting the game for
    },
    stopEffects,
    syncMusic,
    /** Stops the music and rewinds it, for the end of a match. */
    rewindMusic() {
      music?.pause();
      if (music) music.currentTime = 0;
    },
    setMusic(on) {
      musicOn = on;
      syncMusic();
    },
    setEffects(on) {
      effectsOn = on;
      if (!on) stopEffects();
    },
    isMusicOn: () => musicOn,
    isEffectsOn: () => effectsOn,
  };
}
