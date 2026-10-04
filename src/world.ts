// One maze in play: Snackman, the ghosts, the dots and whatever is cooking.
import { Rng } from './rng';
import { COLS, ROWS, TILE, FLOOR, PELLET, Layout, cellAt, cx, cy, DOOR_X, DOOR_Y, HOUSE_Y, DOOR_TILES, START_X, START_Y, FRUIT_X, FRUIT_Y } from './maze';
import type { Mode } from './modes';
import type { Theme } from './levels';
import { sfx } from './audio';

export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
const opposite = (d: number) => ((d + 2) % 4) as Dir;
/** Board width in pixels; x wraps around it through the tunnels. */
export const BW = COLS * TILE;

/** Positions are board pixels, at the middle of the sprite. */
export interface Actor {
  x: number;
  y: number;
  dir: Dir;
  /** Moved this frame (for animation). */
  moving: boolean;
}

/** In the house, on the way out, out in the maze, eaten and heading home, going back in. */
export type GhostState = 'house' | 'leaving' | 'roam' | 'eyes' | 'entering';

export interface Ghost extends Actor {
  /** 0 Ketchup, 1 Bubblegum, 2 Slushie, 3 Cheddar. */
  id: number;
  state: GhostState;
  scared: boolean;
  homeX: number;
  /** Frames left in the house. */
  wait: number;
}

export type SnackKind = 'burger' | 'icecream' | 'coffee';
export const RECIPES: Record<SnackKind, { name: string; parts: string[] }> = {
  burger: { name: 'BURGER', parts: ['bun', 'patty', 'cheese'] },
  icecream: { name: 'ICE CREAM', parts: ['cone', 'scoop', 'cherry'] },
  coffee: { name: 'COFFEE', parts: ['beans', 'milk', 'cup'] },
};

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  color: string;
  size: number;
}

export interface Popup {
  text: string;
  x: number;
  y: number;
  life: number;
  color: string;
}

export interface WorldOptions {
  rng: Rng;
  level: number;
  /** Pixels per frame at full speed. */
  speed: number;
  /** Score multiplier from the speed setting. */
  points: number;
  mode: Mode;
  theme: Theme;
}

export type WorldState = 'ready' | 'play' | 'dying' | 'dead' | 'cleared' | 'done';

export const READY_FRAMES = 110;
const SCATTER_CORNERS = [[COLS - 3, -3], [2, -3], [COLS - 1, ROWS + 1], [0, ROWS + 1]];
/** Frames of scatter, chase, scatter, ... ; after the last it's chase for good. */
const SCHEDULE = [420, 1200, 420, 1200, 300, 1200, 300];
const FRUIT_POINTS = [100, 300, 500, 700, 1000, 2000, 3000, 5000];
const FRUIT_TIME = 540;
const GHOST_COLORS = ['#f83800', '#f878f8', '#3cbcfc', '#fca044'];

export class World {
  grid: Uint8Array;
  dots: Uint8Array;
  dotsTotal = 0;
  dotsLeft = 0;
  haunt: boolean;

  pac: Actor = { x: START_X, y: START_Y, dir: 3, moving: false };
  /** The direction asked for; taken at the next crossing. */
  want: Dir | -1 = -1;
  /** HAUNT: which way the player's ghost last turned (1 right, 3 left), for corners with no press. */
  private lean: 1 | 3 = 3;
  ghosts: Ghost[] = [];

  /** Scatter/chase schedule. */
  private phase = 0;
  private phaseTimer = 0;
  /** A snack (or power pellet) at work. */
  power: { kind: SnackKind; timer: number; total: number } | null = null;
  /** Ghosts eaten on this snack. */
  private chain = 0;
  /** Everything holds still for a moment when a ghost is eaten. */
  freeze = 0;

  /** The recipe being collected, and how many of its parts are in. */
  recipe: SnackKind = 'burger';
  step = 0;
  ingredient: { cell: number; id: string } | null = null;
  private ingredientDelay = 60;
  /** A finished snack, eaten with SPACE. */
  pocket: SnackKind | null = null;
  /** Bonus fruit (CLASSIC): frames left, 0 when there is none. */
  fruit = 0;

  state: WorldState = 'ready';
  frames = 0;
  stateTimer = 0;
  /** Frames of actual play since the last READY. */
  playTime = 0;
  /** Points scored since the game last collected them. */
  gained = 0;
  /** Ghosts eaten since the game last counted them. */
  ghostsEaten = 0;
  /** HAUNT: you made the catch yourself. */
  ownCatch = false;
  shake = 0;
  particles: Particle[] = [];
  popups: Popup[] = [];
  private munch = 0;
  /** HAUNT: frames since Snackman last ate. */
  private hunger = 0;
  private homeDist: Int16Array;

  constructor(layout: Layout, public opt: WorldOptions) {
    this.grid = layout.grid;
    this.dots = layout.dots.slice();
    for (const d of this.dots) if (d) this.dotsTotal++;
    this.dotsLeft = this.dotsTotal;
    this.haunt = opt.mode.haunt;
    this.homeDist = this.distances(DOOR_TILES);
    this.respawn();
  }

  /** Everyone back to their places, at the start and after a life is lost. */
  respawn() {
    const lv = this.opt.level;
    this.pac = { x: START_X, y: START_Y, dir: 3, moving: false };
    this.want = -1;
    const hurry = Math.max(0.4, 1 - 0.1 * (lv - 1));
    const waits = this.haunt ? [0, 60, 0, 300] : [0, 30, 240, 480];
    // In HAUNT you are Ketchup, with two helpers.
    const ids = this.haunt ? [0, 1, 3] : [0, 1, 2, 3];
    this.ghosts = ids.map((id) => ({
      id,
      x: id === 0 ? DOOR_X : [0, DOOR_X, DOOR_X - 16, DOOR_X + 16][id],
      y: id === 0 ? DOOR_Y : HOUSE_Y,
      dir: 3 as Dir,
      moving: false,
      state: id === 0 ? 'roam' : 'house',
      scared: false,
      homeX: [DOOR_X, DOOR_X, DOOR_X - 16, DOOR_X + 16][id],
      wait: Math.round(waits[id] * hurry),
    }));
    this.phase = 0;
    this.phaseTimer = 0;
    this.power = null;
    this.chain = 0;
    this.freeze = 0;
    this.fruit = 0;
    this.state = 'ready';
    this.stateTimer = 0;
    this.playTime = 0;
  }

  // ---------- map queries ----------

  tileOf(a: { x: number; y: number }) {
    return cellAt(Math.min(COLS - 1, Math.max(0, Math.floor(a.x / TILE))), Math.floor(a.y / TILE));
  }

  open(c: number) {
    return c >= 0 && this.grid[c] === FLOOR;
  }

  /** Neighbour of c in direction d (wrapping sideways), or -1 off the top or bottom. */
  next(c: number, d: number) {
    const y = cy(c) + DY[d];
    if (y < 0 || y >= ROWS) return -1;
    return cellAt((cx(c) + DX[d] + COLS) % COLS, y);
  }

  /** Breadth-first distances over the corridors from any of `from`; -1 where there is no way. */
  distances(from: number[]) {
    const dist = new Int16Array(this.grid.length).fill(-1);
    const q: number[] = [];
    for (const c of from) {
      if (dist[c] === 0) continue;
      dist[c] = 0;
      q.push(c);
    }
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      for (let d = 0; d < 4; d++) {
        const n = this.next(c, d);
        if (n < 0 || dist[n] >= 0 || this.grid[n] !== FLOOR) continue;
        dist[n] = dist[c] + 1;
        q.push(n);
      }
    }
    return dist;
  }

  private inTunnel(a: Actor) {
    const c = this.tileOf(a);
    const x = cx(c);
    return (x < 2 || x >= COLS - 2) && this.grid[cellAt(0, cy(c))] === FLOOR;
  }

  /** The player's piece: Snackman, or Ketchup in HAUNT. */
  get player(): Actor {
    return this.haunt ? this.ghosts[0] : this.pac;
  }

  // ---------- speeds ----------

  private get pacSpeed() {
    const lv = this.opt.level;
    if (this.haunt) return this.opt.speed * Math.min(1, 0.72 + 0.03 * lv) * (this.power ? 1.1 : 1);
    const coffee = this.power?.kind === 'coffee' ? 1.35 : 1;
    return this.opt.speed * (lv === 1 ? 0.8 : lv < 5 ? 0.9 : 1) * coffee;
  }

  private ghostSpeed(g: Ghost) {
    const lv = this.opt.level;
    const s = this.opt.speed;
    if (g.state === 'eyes') return s * 1.8;
    if (g.scared) return s * 0.5;
    if (this.inTunnel(g)) return s * 0.45;
    if (this.haunt) return s * (g.id === 0 ? 0.85 : 0.7);
    // Ketchup gets angry when the maze is nearly empty.
    const angry = g.id === 0 && this.dotsLeft < this.dotsTotal * 0.15 ? 1.08 : 1;
    return s * (lv === 1 ? 0.75 : lv < 5 ? 0.85 : 0.95) * angry;
  }

  private get powerTime() {
    return Math.max(120, 440 - (this.opt.level - 1) * 40);
  }

  // ---------- stepping ----------

  update(dirs: Dir[], snack: boolean) {
    this.frames++;
    this.stateTimer++;
    if (this.shake > 0) this.shake--;
    this.stepEffects();
    if (dirs.length) this.want = dirs[dirs.length - 1];

    switch (this.state) {
      case 'ready':
        if (this.stateTimer >= READY_FRAMES) this.state = 'play';
        return;
      case 'dying':
        if (this.stateTimer > 110) this.state = 'dead';
        return;
      case 'cleared':
        if (this.stateTimer > 130) this.state = 'done';
        return;
      case 'done':
      case 'dead':
        return;
    }
    if (this.freeze > 0) {
      this.freeze--;
      return;
    }
    this.playTime++;
    if (snack) this.useSnack();
    this.stepPower();
    this.stepPhase();
    this.stepRecipe();
    if (this.fruit > 0) this.fruit--;

    this.hunger++;
    this.movePac();
    this.eat();
    if (this.state !== 'play') return;
    this.collide();
    if (this.state !== 'play' || this.freeze) return;
    for (const g of this.ghosts) this.moveGhost(g);
    this.collide();
  }

  /**
   * Moves an actor `dist` pixels along the corridors. At each tile centre `choose` picks the
   * direction; returning false ends the move there.
   */
  private travel(a: Actor, dist: number, choose: (tile: number) => boolean | void) {
    a.moving = false;
    for (let guard = 0; dist > 0 && guard < 8; guard++) {
      if ((a.x - 4) % TILE === 0 && (a.y - 4) % TILE === 0) {
        const tile = this.tileOf(a);
        if (choose(tile) === false) return;
        if (!this.open(this.next(tile, a.dir))) return;
      }
      const horizontal = a.dir % 2 === 1;
      const p = horizontal ? a.x : a.y;
      const forward = a.dir === 1 || a.dir === 2;
      const rel = (p - 4) / TILE;
      const target = (forward ? Math.floor(rel) + 1 : Math.ceil(rel) - 1) * TILE + 4;
      const need = Math.abs(target - p);
      const np = need <= dist ? target : p + (forward ? dist : -dist);
      dist -= Math.min(need, dist);
      if (horizontal) a.x = ((np % BW) + BW) % BW;
      else a.y = np;
      a.moving = true;
    }
  }

  /** Snackman under the player's thumb: he turns when the way is open, and turns back at any time. */
  private steer(a: Actor, speed: number) {
    const want = this.want;
    if (want === -1) return this.travel(a, speed, () => {});
    if (want === opposite(a.dir)) a.dir = want;
    this.travel(a, speed, (tile) => {
      if (this.open(this.next(tile, want))) a.dir = want;
    });
  }

  /**
   * HAUNT: the player's ghost lives by ghost rules. It never stops and never turns back (unless
   * it is blue and running). A press is kept until the next crossing where that turn is open,
   * then used up; where it must turn and nothing is pressed, it turns the way it last turned.
   */
  private steerGhost(g: Ghost) {
    let want = this.want;
    const take = (d: Dir) => {
      if (d !== g.dir) this.lean = ((d - g.dir + 4) % 4) as 1 | 3;
      g.dir = d;
      want = this.want = -1;
    };
    if (g.scared && want !== -1 && want === opposite(g.dir)) take(want);
    this.travel(g, this.ghostSpeed(g), (tile) => {
      if (want !== -1 && want !== opposite(g.dir) && this.open(this.next(tile, want))) return take(want);
      if (this.open(this.next(tile, g.dir))) return;
      for (const turn of [this.lean, (4 - this.lean) as 1 | 3, 2]) {
        const d = ((g.dir + turn) % 4) as Dir;
        if (this.open(this.next(tile, d))) return void (g.dir = d);
      }
    });
  }

  private movePac() {
    if (!this.haunt) return this.steer(this.pac, this.pacSpeed);
    this.travel(this.pac, this.pacSpeed, (tile) => this.aiChoose(tile));
  }

  private eat() {
    const p = this.pac;
    const c = this.tileOf(p);
    const d = this.dots[c];
    if (d) {
      this.dots[c] = 0;
      this.dotsLeft--;
      this.hunger = 0;
      if (d === PELLET) {
        if (!this.haunt) this.score(50);
        this.startPower('burger');
      } else {
        if (!this.haunt) this.score(this.power?.kind === 'coffee' ? 20 : 10);
        sfx.waka(this.munch++);
      }
      // Bonus fruit turns up twice a maze.
      const eaten = this.dotsTotal - this.dotsLeft;
      if (this.opt.mode.id === 'classic' && (eaten === Math.round(this.dotsTotal * 0.3) || eaten === Math.round(this.dotsTotal * 0.65)))
        this.fruit = FRUIT_TIME;
      if (this.dotsLeft === 0) return this.haunt ? this.escaped() : this.cleared();
    }
    if (this.ingredient && this.ingredient.cell === c) this.collect();
    if (this.fruit > 0 && Math.abs(p.x - FRUIT_X) < 6 && Math.abs(p.y - FRUIT_Y) < 6) {
      this.fruit = 0;
      const pts = this.score(FRUIT_POINTS[Math.min(FRUIT_POINTS.length - 1, this.opt.level - 1)]);
      this.popup(String(pts), FRUIT_X, FRUIT_Y, '#f878f8');
      sfx.fruit();
    }
  }

  private score(n: number) {
    const pts = Math.round(n * this.opt.points);
    this.gained += pts;
    return pts;
  }

  private cleared() {
    this.state = 'cleared';
    this.stateTimer = 0;
    this.power = null;
    sfx.cleared();
  }

  // ---------- snacks ----------

  private stepRecipe() {
    if (!this.opt.mode.recipes || this.ingredient || this.pocket) return;
    if (--this.ingredientDelay > 0) return;
    // A short walk away from Snackman: not under his nose, not across the maze.
    const dist = this.distances([this.tileOf(this.pac)]);
    const near: number[] = [];
    const any: number[] = [];
    for (let c = 0; c < dist.length; c++) {
      if (dist[c] < 4 || cx(c) === 0 || cx(c) === COLS - 1) continue;
      any.push(c);
      if (dist[c] >= 6 && dist[c] <= 14) near.push(c);
    }
    const pool = near.length ? near : any;
    if (!pool.length) return;
    const cell = pool[Math.floor(this.opt.rng() * pool.length)];
    this.ingredient = { cell, id: RECIPES[this.recipe].parts[this.step] };
  }

  private collect() {
    const it = this.ingredient!;
    const r = RECIPES[this.recipe];
    const x = cx(it.cell) * TILE + 4, y = cy(it.cell) * TILE + 4;
    this.ingredient = null;
    this.ingredientDelay = 30;
    this.score(100);
    this.burst(x, y, '#f8d838', 8);
    if (++this.step < r.parts.length) {
      sfx.ingredient(this.step - 1);
      this.popup(it.id.toUpperCase(), x, y, '#fcfcfc');
      return;
    }
    this.score(400);
    this.pocket = this.recipe;
    this.popup(`${r.name}!`, x, y, '#f8d838');
    sfx.snackReady();
    this.step = 0;
    const roll = this.opt.rng();
    this.recipe = roll < 0.5 ? 'burger' : roll < 0.75 ? 'icecream' : 'coffee';
  }

  private useSnack() {
    if (!this.pocket || this.power) return;
    const kind = this.pocket;
    this.pocket = null;
    this.ingredientDelay = 30;
    this.startPower(kind);
    this.popup(RECIPES[kind].name, this.pac.x, this.pac.y, '#f8d838');
  }

  private startPower(kind: SnackKind) {
    this.power = { kind, timer: this.powerTime, total: this.powerTime };
    this.chain = 0;
    if (kind === 'burger') {
      sfx.power();
      for (const g of this.ghosts) {
        if (g.state === 'eyes' || g.state === 'entering') continue;
        g.scared = true;
        if (g.state === 'roam' && !this.playerGhost(g)) g.dir = opposite(g.dir);
      }
    } else if (kind === 'icecream') sfx.freeze();
    else sfx.coffee();
  }

  private stepPower() {
    const p = this.power;
    if (!p || --p.timer > 0) return;
    this.power = null;
    for (const g of this.ghosts) g.scared = false;
    if (p.kind === 'icecream') sfx.thaw();
  }

  /** Ice cream stops every ghost that still has a body. */
  get frozen() {
    return this.power?.kind === 'icecream';
  }

  // ---------- ghosts ----------

  private stepPhase() {
    // The clock stops while a snack works.
    if (this.power || this.phase >= SCHEDULE.length) return;
    if (++this.phaseTimer < SCHEDULE[this.phase] * (this.opt.level >= 5 && this.phase % 2 === 0 ? 0.7 : 1)) return;
    this.phase++;
    this.phaseTimer = 0;
    for (const g of this.ghosts) if (g.state === 'roam' && !g.scared && !this.playerGhost(g)) g.dir = opposite(g.dir);
  }

  get scatter() {
    return this.phase < SCHEDULE.length && this.phase % 2 === 0;
  }

  private playerGhost(g: Ghost) {
    return this.haunt && g.id === 0;
  }

  /** The tile a ghost is after, as [x, y]; it may lie outside the maze. */
  private target(g: Ghost): [number, number] {
    if (this.scatter) return SCATTER_CORNERS[g.id] as [number, number];
    const p = this.pac;
    const px = Math.floor(p.x / TILE), py = Math.floor(p.y / TILE);
    if (g.id === 1) return [px + 4 * DX[p.dir], py + 4 * DY[p.dir]];
    if (g.id === 2) {
      // Slushie flanks: as far beyond Snackman as Ketchup is short of him.
      const k = this.ghosts[0];
      const ax = px + 2 * DX[p.dir], ay = py + 2 * DY[p.dir];
      return [2 * ax - Math.floor(k.x / TILE), 2 * ay - Math.floor(k.y / TILE)];
    }
    if (g.id === 3) {
      // Cheddar loses his nerve up close.
      const near = Math.hypot(px - g.x / TILE, py - g.y / TILE) < 8;
      return near ? (SCATTER_CORNERS[3] as [number, number]) : [px, py];
    }
    return [px, py];
  }

  private moveGhost(g: Ghost) {
    g.moving = false;
    if (this.frozen && g.state !== 'eyes' && g.state !== 'entering') return;
    switch (g.state) {
      case 'house':
        g.y = HOUSE_Y + Math.round(Math.sin((this.frames + g.id * 21) / 9) * 2);
        if (--g.wait <= 0) {
          g.state = 'leaving';
          g.y = HOUSE_Y;
        }
        return;
      case 'leaving':
        g.moving = true;
        if (g.x !== DOOR_X) g.x += Math.sign(DOOR_X - g.x) * Math.min(0.5, Math.abs(DOOR_X - g.x));
        else if (g.y > DOOR_Y) g.y = Math.max(DOOR_Y, g.y - 0.5);
        else {
          g.state = 'roam';
          g.dir = this.playerGhost(g) && this.want === 1 ? 1 : this.opt.rng() < 0.5 || this.playerGhost(g) ? 3 : 1;
        }
        return;
      case 'entering':
        g.moving = true;
        if (g.x !== DOOR_X) g.x += Math.sign(DOOR_X - g.x) * Math.min(1, Math.abs(DOOR_X - g.x));
        else if (g.y < HOUSE_Y) g.y = Math.min(HOUSE_Y, g.y + 1);
        else {
          g.state = 'leaving';
          sfx.eyesHome();
        }
        return;
      case 'eyes':
        return this.travel(g, this.ghostSpeed(g), (tile) => {
          if (DOOR_TILES.includes(tile)) {
            g.state = 'entering';
            return false;
          }
          this.pick(g, tile, (n) => -this.homeDist[n], true);
        });
    }
    if (this.playerGhost(g)) return this.steerGhost(g);
    this.travel(g, this.ghostSpeed(g), (tile) => {
      if (g.scared) return this.pick(g, tile, () => this.opt.rng());
      const [tx, ty] = this.target(g);
      this.pick(g, tile, (n) => -((cx(n) - tx) ** 2 + (cy(n) - ty) ** 2));
    });
  }

  /** Turns a ghost the way that scores best; it only turns back when there is no other way. */
  private pick(g: Ghost, tile: number, value: (next: number) => number, mayReverse = false) {
    let best = -1;
    let bestValue = -Infinity;
    // Ties go up, left, down, right, as in the arcade.
    for (const d of [0, 3, 2, 1] as Dir[]) {
      if (!mayReverse && d === opposite(g.dir)) continue;
      const n = this.next(tile, d);
      if (!this.open(n)) continue;
      const v = value(n);
      if (v > bestValue) {
        bestValue = v;
        best = d;
      }
    }
    g.dir = best >= 0 ? (best as Dir) : opposite(g.dir);
  }

  private collide() {
    const p = this.pac;
    for (const g of this.ghosts) {
      if (g.state !== 'roam' || Math.abs(g.x - p.x) >= 6 || Math.abs(g.y - p.y) >= 6) continue;
      if (g.scared) this.eatGhost(g);
      else if (!this.frozen) return this.haunt ? this.caught(g) : this.die();
    }
  }

  private eatGhost(g: Ghost) {
    g.state = 'eyes';
    g.scared = false;
    this.freeze = 28;
    this.shake = 6;
    sfx.eatGhost(this.chain);
    this.burst(g.x, g.y, GHOST_COLORS[g.id], 14);
    if (this.haunt) return this.popup(this.playerGhost(g) ? 'OUCH!' : 'CHOMP', g.x, g.y, '#58f8f8');
    this.ghostsEaten++;
    const pts = this.score(200 * 2 ** Math.min(3, this.chain++));
    this.popup(String(pts), g.x, g.y, '#58f8f8');
  }

  private die() {
    this.state = 'dying';
    this.stateTimer = 0;
    this.shake = 10;
    this.power = null;
    sfx.die();
  }

  // ---------- HAUNT: Snackman plays himself ----------

  /**
   * How many steps each ghost needs to reach each tile, given that ghosts don't turn back:
   * the tiles right behind one are a long way off for it.
   */
  private ghostReach(ghosts: Ghost[]) {
    const n = this.grid.length;
    const reach = new Int16Array(n).fill(-1);
    for (const g of ghosts) {
      const seen = new Uint8Array(n * 4);
      const start = this.tileOf(g);
      let frontier = [start * 4 + g.dir];
      seen[frontier[0]] = 1;
      reach[start] = 0;
      for (let steps = 1; frontier.length; steps++) {
        const nextFrontier: number[] = [];
        for (const s of frontier) {
          const c = s >> 2, dir = s & 3;
          for (let d = 0; d < 4; d++) {
            if (d === opposite(dir)) continue;
            const t = this.next(c, d);
            if (!this.open(t) || seen[t * 4 + d]) continue;
            seen[t * 4 + d] = 1;
            if (reach[t] < 0 || steps < reach[t]) reach[t] = steps;
            nextFrontier.push(t * 4 + d);
          }
        }
        frontier = nextFrontier;
      }
    }
    return reach;
  }

  /**
   * Snackman's own brain. He goes for the nearest dot he can reach before any ghost can, and
   * on a pellet for the nearest blue ghost; with nothing safe to eat he keeps his distance.
   */
  private aiChoose(tile: number) {
    const p = this.pac;
    const roaming = this.ghosts.filter((g) => g.state === 'roam');
    const reach = this.ghostReach(roaming.filter((g) => !g.scared));
    const prey = new Set(this.power && this.power.timer > 60 ? roaming.filter((g) => g.scared).map((g) => this.tileOf(g)) : []);
    // The head start he wants over a ghost: more on later levels, less the hungrier he gets.
    const margin = Math.max(0, Math.min(3.5, 1.2 + 0.3 * this.opt.level) - this.hunger / 240);
    const safe = (c: number, steps: number) => reach[c] < 0 || reach[c] > steps + margin;

    const dist = new Int16Array(this.grid.length).fill(-1);
    const first = new Int8Array(this.grid.length);
    dist[tile] = 0;
    const q = [tile];
    const order = [p.dir, (p.dir + 1) % 4, (p.dir + 3) % 4, opposite(p.dir)];
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      if (c !== tile && (this.dots[c] || prey.has(c))) {
        p.dir = first[c] as Dir;
        return;
      }
      for (const d of order) {
        const n = this.next(c, d);
        if (!this.open(n) || dist[n] >= 0 || !safe(n, dist[c] + 1)) continue;
        dist[n] = dist[c] + 1;
        first[n] = c === tile ? d : first[c];
        q.push(n);
      }
    }
    // Nothing safe to eat: away from the ghosts.
    let best = -1;
    let bestValue = -1;
    for (const d of order) {
      const n = this.next(tile, d);
      if (!this.open(n)) continue;
      const v = reach[n] < 0 ? 999 : reach[n];
      if (v > bestValue) {
        bestValue = v;
        best = d;
      }
    }
    if (best >= 0) p.dir = best as Dir;
  }

  private caught(g: Ghost) {
    this.ownCatch = this.playerGhost(g);
    this.state = 'cleared';
    this.stateTimer = 0;
    this.shake = 10;
    this.power = null;
    // The earlier the catch, the more it pays; your own counts double.
    const pts = this.score((200 + this.dotsLeft * 5) * this.opt.level * (this.ownCatch ? 2 : 1));
    this.popup(this.ownCatch ? `CAUGHT! ${pts}` : `${pts}`, this.pac.x, this.pac.y, '#f8d838');
    if (this.ownCatch) this.ghostsEaten++;
    sfx.die();
  }

  private escaped() {
    this.state = 'dying';
    this.stateTimer = 0;
    this.power = null;
    this.popup('HE ATE IT ALL!', this.pac.x, this.pac.y, '#f83800');
    sfx.escaped();
  }

  // ---------- effects ----------

  popup(text: string, x: number, y: number, color: string) {
    this.popups.push({ text, x, y: y - 4, life: 60, color });
  }

  burst(x: number, y: number, color: string, n: number) {
    for (let k = 0; k < n; k++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 2.5 - 0.3,
        gravity: 0.12,
        life: 25 + Math.random() * 20,
        color,
        size: 2,
      });
    }
  }

  private stepEffects() {
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life--;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.popups) {
      p.life--;
      if (p.life > 30) p.y -= 0.4;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
  }
}

export { GHOST_COLORS };
