import { MODES, Mode, SPEEDS, SPEED_POINTS } from './modes';
import { loadTables, saveTables, rankFor, ScoreEntry, Tables, MAX_SCORES, load, save, fetchGlobal, submitGlobal, flushPending } from './scores';
import { sfx, music, TUNE } from './audio';
import { hashString, makeRng, randomSeed, today } from './rng';
import { levelLayout, themeFor } from './levels';
import { World, Dir } from './world';
import { HELP_PAGES } from './help';

export type Action = 'up' | 'down' | 'left' | 'right' | 'snack' | 'start' | 'back' | 'quit' | 'mute' | 'scores';

export interface Input {
  held: Set<Action>;
  pressed: Set<Action>;
  /** Direction presses this frame, in order. */
  dirs: Dir[];
  /** Raw A-Z / 0-9 / Backspace / Enter, for name entry. */
  typed: string[];
}

export type Phase = 'title' | 'intro' | 'play' | 'curtain' | 'over' | 'entry' | 'scores' | 'help';

export interface Settings {
  mode: number;
  /** 0-4, shown as 1-5. */
  speed: number;
  daily: boolean;
  /** Index into MUSIC_NAMES. */
  music: number;
  /** M mutes without changing the selection. */
  muted: boolean;
}

export const MUSIC_NAMES = ['ON', 'OFF'];
const MUSIC_OFF = 1;

export const MENU = ['MODE', 'SPEED', 'SEED', 'MUSIC', 'HELP'] as const;
export const NAME_LEN = 6;
const NAME_CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DEFAULT_SETTINGS: Settings = { mode: 0, speed: 2, daily: false, music: 0, muted: false };
/** An extra life at this score. */
export const BONUS_LIFE = 10000;

/** Frames the level card shows before play. */
export const INTRO_FRAMES = 150;

function loadSettings(): Settings {
  try {
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(load('snackman.settings') ?? '{}') };
    s.mode = Math.min(MODES.length - 1, Math.max(0, s.mode | 0));
    s.speed = Math.min(SPEEDS.length - 1, Math.max(0, s.speed | 0));
    s.daily = !!s.daily;
    s.music = Math.min(MUSIC_NAMES.length - 1, Math.max(0, s.music | 0));
    s.muted = !!s.muted;
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export class Game {
  phase: Phase = 'title';
  settings = loadSettings();
  menuRow = 0;
  paused = false;
  timer = 0;
  curtainRow = 0;

  world: World | null = null;
  score = 0;
  lives = 0;
  /** 1-based. */
  level = 1;
  /** Ghosts eaten this run; in HAUNT, catches of your own. */
  ghosts = 0;
  private bonusGiven = false;
  private seed = 0;
  private musicOn = false;

  tables: Tables = loadTables();
  /** World top 10s from the server; null until loaded or while offline. */
  global: Tables | null = null;
  globalState: 'loading' | 'ok' | 'offline' = 'loading';
  /** Show the world table (true) or this browser's own (false). */
  scoresGlobal = true;
  /** Row of the last game in the world table, or -1. */
  globalRank = -1;
  scoresView = 0;
  entryRank = -1;
  entryName: string[] = [];
  entryCursor = 0;
  private entryFresh = false;

  helpPage = 0;
  private preview: { key: string; world: World } | null = null;

  constructor() {
    music.enabled = !this.settings.muted;
    this.refreshGlobal();
  }

  private async refreshGlobal() {
    // Games queued while offline go first, so the table includes them.
    await flushPending();
    const tables = await fetchGlobal();
    if (tables) this.global = tables;
    this.globalState = this.global ? 'ok' : 'offline';
  }

  /** Posts a finished game to the world table and marks where it landed. */
  private async submitGlobal(e: ScoreEntry) {
    const mode = this.mode.id;
    const res = await submitGlobal(mode, e);
    if (!res) return;
    this.global ??= Object.fromEntries(MODES.map((m) => [m.id, []])) as unknown as Tables;
    this.global[mode] = res.top;
    this.globalState = 'ok';
    if (this.settings.mode === MODES.findIndex((m) => m.id === mode)) this.globalRank = res.rank;
  }

  get mode(): Mode {
    return MODES[this.settings.mode];
  }

  best(modeIdx = this.settings.mode): ScoreEntry | undefined {
    return this.tables[MODES[modeIdx].id]?.[0];
  }

  private newWorld(mode: Mode, level: number, seed: number) {
    const rng = makeRng(seed ^ hashString(`${mode.id}:${level}`));
    const layout = levelLayout(mode, level, rng);
    return new World(layout, {
      rng,
      level,
      speed: SPEEDS[this.settings.speed],
      points: SPEED_POINTS[this.settings.speed],
      mode,
      theme: themeFor(level),
    });
  }

  /** A fixed maze of the selected mode, drawn behind the title menu. */
  titleWorld() {
    const key = this.mode.id;
    if (this.preview?.key !== key) this.preview = { key, world: this.newWorld(this.mode, 1, 1234) };
    return this.preview.world;
  }

  step(input: Input) {
    const { pressed } = input;
    if (this.phase === 'entry') return this.stepEntry(input);
    if (pressed.has('mute')) this.toggleMusic();

    switch (this.phase) {
      case 'title':
        return this.stepTitle(pressed);
      case 'intro':
        return this.stepIntro(input);
      case 'play':
        return this.stepPlay(input);
      case 'curtain':
        if (++this.timer % 3 === 0) this.curtainRow++;
        if (this.curtainRow > 26) {
          this.phase = 'over';
          this.timer = 0;
        }
        return;
      case 'over':
        if (++this.timer > 30 && pressed.has('start')) {
          if (this.entryRank >= 0) this.phase = 'entry';
          else this.showScores();
          sfx.select();
        }
        return;
      case 'scores':
        return this.stepScores(pressed);
      case 'help':
        return this.stepHelp(pressed);
    }
  }

  // ---------- menu ----------

  private saveSettings() {
    save('snackman.settings', JSON.stringify(this.settings));
  }

  private toggleMusic() {
    this.settings.muted = !music.toggle();
    this.saveSettings();
  }

  /** The tune under the MUSIC setting, or -1 for none. */
  private get tune() {
    return this.settings.music === MUSIC_OFF ? -1 : TUNE.GROOVE;
  }

  private titleMusic() {
    const want = this.tune;
    if (want < 0) return music.stop();
    if (music.running && music.tune === want) return;
    music.setKey(0);
    music.setIntensity(2);
    music.setTempo(1);
    music.setPower(false);
    music.setMelody(1);
    music.play(want, music.tune !== want);
  }

  rowEnabled(row: (typeof MENU)[number]) {
    if (row === 'SEED') return this.mode.usesSeed;
    return true;
  }

  private stepTitle(pressed: Set<Action>) {
    const s = this.settings;
    this.titleMusic();
    if (pressed.has('up')) this.menuRow = (this.menuRow + MENU.length - 1) % MENU.length;
    if (pressed.has('down')) this.menuRow = (this.menuRow + 1) % MENU.length;
    if (pressed.has('up') || pressed.has('down')) sfx.move();

    const d = (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0);
    const row = MENU[this.menuRow];
    if (row === 'HELP' && (d || pressed.has('start'))) {
      this.helpPage = 0;
      this.phase = 'help';
      sfx.select();
      return;
    }
    if (d && this.rowEnabled(row)) {
      const wrap = (v: number, n: number) => (v + d + n) % n;
      if (row === 'MODE') s.mode = wrap(s.mode, MODES.length);
      if (row === 'SPEED') s.speed = wrap(s.speed, SPEEDS.length);
      if (row === 'SEED') s.daily = !s.daily;
      if (row === 'MUSIC') s.music = wrap(s.music, MUSIC_NAMES.length);
      sfx.select();
      this.saveSettings();
    }
    if (pressed.has('scores')) {
      this.refreshGlobal();
      this.scoresView = s.mode;
      this.entryRank = -1;
      this.globalRank = -1;
      this.phase = 'scores';
      sfx.select();
    } else if (pressed.has('start')) this.startGame();
  }

  private stepHelp(pressed: Set<Action>) {
    const d = (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0);
    if (d) {
      this.helpPage = (this.helpPage + d + HELP_PAGES.length) % HELP_PAGES.length;
      sfx.move();
    }
    if (pressed.has('start') || pressed.has('back') || pressed.has('quit')) {
      this.phase = 'title';
      sfx.select();
    }
  }

  // ---------- a run ----------

  startGame() {
    const s = this.settings;
    const mode = this.mode;
    this.seed = s.daily && mode.usesSeed ? hashString(`${today()}:${mode.id}`) : randomSeed();
    this.score = 0;
    this.lives = mode.lives;
    this.level = 1;
    this.ghosts = 0;
    this.bonusGiven = false;
    this.entryRank = -1;
    this.paused = false;
    this.loadLevel();
  }

  private loadLevel() {
    this.world = this.newWorld(this.mode, this.level, this.seed);
    music.stop();
    this.musicOn = false;
    this.phase = 'intro';
    this.timer = 0;
  }

  /** The music starts with play and stops whenever Snackman does. */
  private stepMusic(w: World) {
    const tune = this.tune;
    if (w.state !== 'play') {
      if (this.musicOn) music.stop();
      this.musicOn = false;
      return;
    }
    if (tune < 0) return;
    const eaten = 1 - w.dotsLeft / w.dotsTotal;
    music.setIntensity(Math.min(5, Math.floor(eaten * 6)));
    music.setTempo(0.95 + this.settings.speed * 0.04 + eaten * 0.2);
    music.setPower(!!w.power);
    if (this.musicOn) return;
    this.musicOn = true;
    // A new key and a new melody for every maze.
    music.setKey((this.level - 1) * 5);
    music.setMelody(this.seed ^ hashString(`tune:${this.level}`));
    music.play(tune, true);
  }

  private stepIntro({ pressed, dirs }: Input) {
    this.timer++;
    const skip = this.timer > 20 && (pressed.has('start') || dirs.length > 0);
    if (this.timer >= INTRO_FRAMES || skip) {
      this.phase = 'play';
      sfx.start();
    }
  }

  private stepPlay(input: Input) {
    const { pressed } = input;
    const w = this.world!;
    if (pressed.has('start') || pressed.has('back')) {
      this.paused = !this.paused;
      sfx.pause();
      if (this.paused) music.halt();
      else music.resume();
      return;
    }
    if (this.paused) {
      if (pressed.has('quit')) this.toTitle();
      return;
    }
    w.update(input.dirs, pressed.has('snack'));
    this.score += w.gained;
    w.gained = 0;
    this.ghosts += w.ghostsEaten;
    w.ghostsEaten = 0;
    this.lives += w.livesWon;
    w.livesWon = 0;
    if (!this.bonusGiven && this.score >= BONUS_LIFE) {
      this.bonusGiven = true;
      this.lives++;
      sfx.oneUp();
    }
    this.stepMusic(w);

    if (w.state === 'done') {
      this.level++;
      this.loadLevel();
    } else if (w.state === 'dead') {
      if (--this.lives <= 0) this.gameOver();
      // In HAUNT the maze is empty by now: the same one is laid out again.
      else if (w.haunt) this.loadLevel();
      else w.respawn();
    }
  }

  private gameOver() {
    this.phase = 'curtain';
    this.timer = 0;
    this.curtainRow = 0;
    music.stop();
    sfx.over();
    this.prepareEntry();
  }

  private toTitle() {
    this.phase = 'title';
    this.world = null;
    this.paused = false;
    this.entryRank = -1;
    music.stop();
    sfx.select();
  }

  // ---------- high scores ----------

  private prepareEntry() {
    this.entryRank = -1;
    this.globalRank = -1;
    this.scoresView = this.settings.mode;
    this.scoresGlobal = true;
    if (this.score <= 0) return;
    const entry: ScoreEntry = {
      name: '',
      score: this.score,
      level: this.level,
      ghosts: this.ghosts,
      speed: this.settings.speed + 1,
    };
    const list = this.tables[this.mode.id];
    const at = rankFor(list, entry);
    const last = (load('snackman.name') ?? '').slice(0, NAME_LEN);
    if (at < 0) {
      // Not a personal record, but it still goes to the world table under the last name used.
      if (last.trim()) this.submitGlobal({ ...entry, name: last.trim() });
      return;
    }
    list.splice(at, 0, entry);
    list.length = Math.min(list.length, MAX_SCORES);
    this.entryRank = at;
    this.entryName = last.padEnd(NAME_LEN, ' ').split('');
    this.entryCursor = Math.min(NAME_LEN - 1, last.length);
    this.entryFresh = last.length > 0;
  }

  private stepEntry({ pressed, typed }: Input) {
    const name = this.entryName;
    const cycle = (d: number) => {
      const i = NAME_CHARS.indexOf(name[this.entryCursor]);
      name[this.entryCursor] = NAME_CHARS[(i + d + NAME_CHARS.length) % NAME_CHARS.length];
      sfx.move();
    };
    if (pressed.has('up')) cycle(1);
    if (pressed.has('down')) cycle(-1);
    if (pressed.has('left') && this.entryCursor > 0) this.entryCursor--;
    if (pressed.has('right') && this.entryCursor < NAME_LEN - 1) this.entryCursor++;

    for (const key of typed) {
      if (key === 'Enter') return this.commitName();
      if (key === 'Backspace') {
        if (name[this.entryCursor] === ' ' && this.entryCursor > 0) this.entryCursor--;
        name[this.entryCursor] = ' ';
      } else {
        // A suggested name is replaced as soon as you type.
        if (this.entryFresh) {
          name.fill(' ');
          this.entryCursor = 0;
        }
        name[this.entryCursor] = key;
        this.entryCursor = Math.min(NAME_LEN - 1, this.entryCursor + 1);
      }
      this.entryFresh = false;
      sfx.move();
    }
    if (pressed.size) this.entryFresh = false;
  }

  private commitName() {
    const name = this.entryName.join('').trim() || '------';
    const entry = this.tables[this.mode.id][this.entryRank];
    entry.name = name;
    saveTables(this.tables);
    save('snackman.name', name);
    this.submitGlobal(entry);
    this.phase = 'scores';
    this.timer = 0;
    sfx.oneUp();
  }

  private showScores() {
    this.refreshGlobal();
    this.scoresView = this.settings.mode;
    this.phase = 'scores';
    this.timer = 0;
  }

  private stepScores(pressed: Set<Action>) {
    const d = (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0);
    if (d) {
      this.scoresView = (this.scoresView + d + MODES.length) % MODES.length;
      this.entryRank = -1;
      this.globalRank = -1;
      sfx.select();
    }
    if (pressed.has('up') || pressed.has('down')) {
      this.scoresGlobal = !this.scoresGlobal;
      sfx.move();
    }
    if (pressed.has('start') || pressed.has('back') || pressed.has('scores')) this.toTitle();
  }
}
