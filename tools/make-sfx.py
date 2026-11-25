"""
Bingo Game: sound effects generator.

Builds every sound effect in assets/audio from plain sine, square, and sawtooth waves, so the
game ships no third-party samples. Run it again after changing a sound:

    python3 tools/make-sfx.py assets/audio

Needs Python 3 with NumPy, and ffmpeg on the PATH (used to encode MP3).
"""
import numpy as np, wave, subprocess, os, sys
SR = 44100
OUT = sys.argv[1]

def t(d): return np.arange(int(SR * d)) / SR
def env(n, a=0.005, r=0.2, curve=4.0):
    x = np.linspace(0, 1, n); e = np.exp(-curve * x * (1 / max(r, 1e-3)) * (n / SR))
    att = min(n, int(SR * a)); e[:att] *= np.linspace(0, 1, att)
    return e
def bell(f, d, decay=6.0, partials=((1, 1), (2, 0.35), (3, 0.18), (4.2, 0.08))):
    tt = t(d); s = sum(a * np.sin(2 * np.pi * f * m * tt) * np.exp(-decay * m ** 0.6 * tt) for m, a in partials)
    att = int(SR * 0.004); s[:att] *= np.linspace(0, 1, att)
    rel = int(SR * 0.03); s[-rel:] *= np.linspace(1, 0, rel); return s
def marimba(f, d): return bell(f, d, decay=9.0, partials=((1, 1), (4, 0.25), (10, 0.05)))
def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR); y = np.zeros_like(x); p = 0.0
    for i, v in enumerate(x): p = (1 - a) * v + a * p; y[i] = p
    return y
def place(total, parts):
    out = np.zeros(int(SR * total))
    for start, sig in parts:
        i = int(SR * start); n = min(len(sig), len(out) - i); out[i:i + n] += sig[:n]
    return out
def note(n): return 440 * 2 ** ((n - 69) / 12)
def save(name, x, loudness=0.24):
    """Scales the loudest 300ms to the same RMS level in every effect, so a short blip and a long
    fanfare sound equally loud, then soft-clips any peaks that would go past full scale."""
    win = min(len(x), int(SR * 0.3))
    rms = np.sqrt(np.convolve(x ** 2, np.ones(win) / win, mode="valid").max())
    x = x / (rms + 1e-9) * loudness
    x = np.tanh(x / 0.9) * 0.9
    fade = int(SR * 0.01); x[-fade:] *= np.linspace(1, 0, fade)
    wav = f"/tmp/{name}.wav"
    with wave.open(wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "96k", os.path.join(OUT, f"{name}.mp3")], check=True)

# Ball drawn: a quick "pop" followed by a bright two-tone chime
pop = np.random.default_rng(1).normal(0, 1, int(SR * 0.03)) * np.exp(-t(0.03) * 120)
save("number-drawn", place(0.55, [(0, lowpass(pop, 2500) * 0.6), (0.02, bell(note(84), 0.5, 7)), (0.09, bell(note(91), 0.45, 8) * 0.7)]))
# Correct mark: two rising marimba notes
save("hit", place(0.45, [(0, marimba(note(79), 0.4)), (0.08, marimba(note(84), 0.37))]))
# Wrong mark (costs a life): short, soft low buzzer with a falling pitch
tt = t(0.42); f = 150 - 40 * tt
buzz = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-3.5 * tt)
save("miss", lowpass(buzz, 900), loudness=0.3)
# Already marked: two gentle low blips ("uh-uh")
save("error", place(0.36, [(0, marimba(note(62), 0.15)), (0.16, marimba(note(60), 0.2))]), loudness=0.22)
# Bingo: rising arpeggio into a held major chord
arp = [(i * 0.09, bell(note(n), 0.6, 5)) for i, n in enumerate([72, 76, 79, 84])]
chord = sum(bell(note(n), 1.2, 2.5) for n in [72, 76, 79, 84, 88]) * 0.5
save("bingo", place(1.7, arp + [(0.4, chord)]), loudness=0.3)
# Game lost: four falling "wah" notes, the last one wobbling
def wah(n, d, vib=0.0):
    tt = t(d); fr = note(n) * (1 + vib * np.sin(2 * np.pi * 6 * tt))
    ph = 2 * np.pi * np.cumsum(fr) / SR; saw = 2 * ((ph / (2 * np.pi)) % 1) - 1
    e = np.minimum(1, tt / 0.03) * np.exp(-1.2 * tt)
    rel = int(SR * 0.04); e[-rel:] *= np.linspace(1, 0, rel); return lowpass(saw * e, 1100)
save("lose", place(2.3, [(0, wah(67, 0.4)), (0.42, wah(66, 0.4)), (0.84, wah(65, 0.4)), (1.26, wah(64, 1.0, 0.02))]), loudness=0.26)
print("ok")
