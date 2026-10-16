// SNACKMAN's sounds and music on arcade-kit's chiptune engine: SFX, and music that swells as the maze
// empties: a groove whose melody is made up afresh for every maze.
import { audioNow, arp, createMusic, midiHz, noise, perc, tone, Tune } from 'arcade-kit/audio';
import { makeRng } from 'arcade-kit/rng';

export { unlockAudio } from 'arcade-kit/audio';

export const sfx = {
  move: () => tone(1400, 0.02, 'square', 0.12),
  select: () => tone(988, 0.04, 'square', 0.18),
  start: () => arp([67, 72, 76, 79, 0, 76, 79, 84, 0, 83, 86, 91], 0.07, 0.2),
  pause: () => arp([84, 79], 0.06, 0.18),
  /** Munching: two alternating chirps. */
  waka: (k: number) => (k % 2 ? tone(520, 0.07, 'triangle', 0.5, 0, 260) : tone(260, 0.07, 'triangle', 0.5, 0, 520)),
  power: () => arp([60, 67, 72, 79, 84, 91], 0.035, 0.24),
  /** Each ghost in a row rings higher. */
  eatGhost: (n: number) => {
    tone(200 + n * 80, 0.3, 'square', 0.22, 0, 1600 + n * 300);
    noise(0.12, 0.3, 1800);
  },
  eyesHome: () => tone(900, 0.08, 'sine', 0.3, 0, 300),
  die: () => {
    const t = audioNow();
    if (t === null) return;
    for (let k = 0; k < 9; k++) tone(700 - k * 60, 0.11, 'triangle', 0.4, t + k * 0.1, 500 - k * 50);
    tone(180, 0.12, 'square', 0.2, t + 1.0, 500);
    tone(180, 0.12, 'square', 0.2, t + 1.15, 500);
  },
  /** The k-th ingredient of a recipe. */
  ingredient: (k: number) => arp([76 + k * 4, 83 + k * 4], 0.06, 0.24, 'triangle'),
  snackReady: () => arp([72, 76, 79, 84, 0, 84, 88], 0.06, 0.24),
  freeze: () => {
    noise(0.5, 0.35, 6000, 0, 'highpass');
    tone(2400, 0.5, 'sine', 0.2, 0, 600);
  },
  coffee: () => arp([60, 64, 67, 72, 76, 79, 84, 88, 91], 0.025, 0.2),
  thaw: () => tone(500, 0.15, 'triangle', 0.25, 0, 1200),
  fruit: () => arp([79, 84, 88, 91], 0.05, 0.22, 'triangle'),
  oneUp: () => arp([76, 79, 88, 84, 86, 91], 0.07, 0.22),
  cleared: () => arp([72, 76, 79, 84, 79, 84, 88, 91], 0.07, 0.22),
  over: () => arp([67, 63, 60, 55, 51, 48], 0.12, 0.22),
  /** HAUNT: Snackman got away with every dot. */
  escaped: () => arp([84, 79, 76, 72, 67, 64, 60], 0.08, 0.22, 'triangle'),
};

// ---------- music ----------
// Intensity 0-5 comes from how much of the maze is eaten: instruments join as it empties.

// --- Groove: four bars of sixteenths over Am F C G. The melody comes from the maze's seed.
const CHORDS = [
  [45, 0, 3, 7],
  [41, 0, 4, 7],
  [48, 0, 4, 7],
  [43, 0, 4, 7],
];
const PENTATONIC = [0, 3, 5, 7, 10, 12, 15, 17];
/** Midi note per unit, 0 for a rest. */
let melody: number[] = [];
let power = false;

function compose(seed: number) {
  const rng = makeRng(seed);
  const bar = () => {
    const out: number[] = [];
    let d = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < 8; k++) {
      d = Math.max(0, Math.min(PENTATONIC.length - 1, d + [-2, -1, -1, 0, 1, 1, 2][Math.floor(rng() * 7)]));
      // Eighth notes, with a rest now and then; the downbeat always sounds.
      out.push(k === 0 || rng() < 0.72 ? 69 + PENTATONIC[d] : 0, 0);
    }
    return out;
  };
  const a = bar(), b = bar(), c = bar();
  melody = [...a, ...b, ...a, ...c];
}
compose(1);

const GROOVE: Tune = {
  name: 'GROOVE',
  unit: 60 / 116 / 4,
  length: 64,
  play(i, t, lv, tr, u) {
    const [root, ...triad] = CHORDS[i >> 4];
    const s = i % 16;
    if (s % 2 === 0) tone(midiHz(root + tr + (s % 4 === 2 ? 12 : 0)), u * 1.7, 'triangle', 0.3, t);
    if (lv >= 1 && s % 8 === 0) perc.kick(t, 0.45);
    if (lv >= 2 && s % 8 === 4) perc.snare(t, 0.11);
    if (lv >= 3 && s % 2 === 1) perc.hat(t, 0.045);
    if (lv >= 4 && (s === 10 || s === 14)) perc.kick(t, 0.3);
    if (power) {
      // A snack is working: the tune gives way to a racing arpeggio.
      tone(midiHz(root + 24 + tr + triad[i % 3] + 12 * ((i >> 1) % 2)), u * 0.9, 'square', 0.07, t);
      return;
    }
    if (lv >= 2) tone(midiHz(root + 12 + tr + triad[(i >> 1) % 3]), u * 0.8, 'square', 0.025 + lv * 0.004, t);
    const m = melody[i];
    if (m) {
      tone(midiHz(m + tr), u * 1.8, lv >= 3 ? 'square' : 'triangle', lv >= 3 ? 0.08 : 0.26, t);
      if (lv >= 3) tone(midiHz(m + tr), u * 1.5, 'triangle', 0.14, t + u * 3);
      if (lv >= 5) tone(midiHz(m + tr + 12), u * 1.5, 'square', 0.03, t);
    }
  },
};

export const TUNES = [GROOVE];
export const TUNE = { GROOVE: 0 } as const;

const player = createMusic(TUNES);

export const music = Object.assign(player, {
  /** Semitones up or down from A minor, kept within a tritone. */
  setKey(semis: number) {
    player.setTranspose(((semis + 18) % 12) - 6);
  },
  /** The groove's melody for this maze. */
  setMelody(seed: number) {
    compose(seed);
  },
  /** While a snack works the tune races. */
  setPower(on: boolean) {
    power = on;
  },
});
