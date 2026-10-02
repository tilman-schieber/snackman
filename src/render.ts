import { Game, MENU, MUSIC_NAMES, NAME_LEN, INTRO_FRAMES } from './game';
import { World, Ghost, SnackKind, RECIPES, GHOST_COLORS, DX, DY, BW, Dir } from './world';
import { COLS, ROWS, TILE, WALL, DOOR, DOT, FRUIT_X, FRUIT_Y, cellAt, cx, cy } from './maze';
import { MODES, SPEED_NAMES, SPEED_POINTS } from './modes';
import { MAX_SCORES } from './scores';
import { HELP_PAGES, wrapText } from './help';
import { drawText, drawTextCentered, textWidth } from './font';
import { Ctx, W, H, WHITE, RED, GREY, LIGHT, DARK, YELLOW, GOLD, mix, drawBox, drawSprite, pad, hash } from './draw';

export { W, H };

/** Board origin on screen: the HUD takes the top 24 pixels. */
const BX = 8;
const BY = 28;
const BH = ROWS * TILE;

const SNACKMAN = '#f8d838';
const SCARED = '#2038ec';
const ICE = '#a8e4fc';
const DOT_COLOR = '#fcd8a8';
const POWER_COLORS: Record<SnackKind, string> = { burger: '#3858fc', icecream: ICE, coffee: '#d88028' };

// ---------- sprites ----------

const PALETTE: Record<string, string> = {
  b: '#e8a048', B: '#c87828', s: '#fcf0a0', p: '#8a4a20', P: '#5a2a10', y: '#f8d838', Y: '#d89800',
  k: '#f8a8d8', w: '#fcfcfc', r: '#e40058', g: '#58d854', c: '#3cbcfc', e: '#bcbcbc',
};
const SPRITES: Record<string, string[]> = {
  bun: ['........', '..bbbb..', '.bsbbsb.', 'bbbbbbbb', 'bbbbbbbb', '........', 'BBBBBBBB', '.BBBBBB.'],
  patty: ['........', '........', '.pppppp.', 'pPppPppp', 'pppppPpp', '.pppppp.', '........', '........'],
  cheese: ['........', '......yy', '....yyyy', '..yyyyYy', 'yyyYyyyy', 'yyyyyyYy', 'yYyyyyyy', 'yyyyyyyy'],
  cone: ['bbbbbbbb', '.bBbBbB.', '.BbBbBb.', '..bBbB..', '..BbBb..', '...bB...', '...Bb...', '........'],
  scoop: ['..kkkk..', '.kwkkkk.', 'kwkkkkkk', 'kkkkkkkk', 'kkkkkkkk', 'kkkkkkkk', '.kkkkkk.', '..k..k..'],
  cherry: ['.....g..', '....g...', '...g.g..', '..g...g.', '.rr..rr.', 'rwrrrwrr', 'rrrrrrrr', '.rr..rr.'],
  beans: ['........', '.pp.....', 'pPpp.pp.', 'ppPppPpp', '.pppppPp', '....ppp.', '........', '........'],
  milk: ['..wwww..', '.wwwwww.', '.wwwwww.', '.cccccc.', '.wwwwww.', '.wwccww.', '.wwwwww.', '.wwwwww.'],
  cup: ['........', 'wwwwww..', 'wwwwwwww', 'wwwwww.w', 'wwwwwwww', 'wwwwww..', '.wwww...', '........'],
  burger: ['..bbbb..', '.bsbbsb.', 'bbbbbbbb', 'gggggggg', 'pppppppp', 'yyyyyyyy', 'BBBBBBBB', '.BBBBBB.'],
  icecream: ['...r....', '..kkkk..', '.kwkkkk.', '.kkkkkk.', 'bbbbbbbb', '.bBbBb..', '..bBb...', '...b....'],
  coffee: ['..e.e...', '...e.e..', 'wwwwww..', 'wppppwww', 'wwwwww.w', 'wwwwwwww', 'wwwwww..', '.wwww...'],
};
const DIM: Record<string, string> = Object.fromEntries(Object.entries(PALETTE).map(([k, c]) => [k, mix(c, '#000000', 0.72)]));

const GHOST_BODY = ['....####....', '..########..', '.##########.', '.##########.', '############', '############', '############', '############', '############', '############'];
const GHOST_FEET = [
  ['##.##..##.##', '#...#..#...#'],
  ['####.##.####', '.##..##..##.'],
];
const LIFE = ['..yyy..', '.yyyyy.', 'yyyy...', 'yyy....', 'yyyy...', '.yyyyy.', '..yyy..'];
const GHOST_LIFE = ['..rrr..', '.rrrrr.', 'rwwrwwr', 'rwcrwcr', 'rrrrrrr', 'rrrrrrr', 'r.rr.rr'];

/** Snackman, 12 pixels across, centred on (x, y). `gape` is the mouth's half-angle in radians. */
function drawPac(ctx: Ctx, x: number, y: number, dir: number, gape: number, color = SNACKMAN, eye = true) {
  const ox = Math.round(x) - 6, oy = Math.round(y) - 6;
  ctx.fillStyle = color;
  for (let py = 0; py < 12; py++)
    for (let px = 0; px < 12; px++) {
      const dx = px - 5.5, dy = py - 5.5;
      const r = Math.hypot(dx, dy);
      if (r > 6.1) continue;
      if (gape > 0 && Math.acos(Math.max(-1, Math.min(1, (dx * DX[dir] + dy * DY[dir]) / r))) < gape) continue;
      ctx.fillRect(ox + px, oy + py, 1, 1);
    }
  if (!eye) return;
  const [ex, ey] = [[3, 4], [6, 2], [3, 6], [5, 2]][dir];
  ctx.fillStyle = '#000';
  ctx.fillRect(ox + ex, oy + ey, 2, 2);
}

function drawGhostEyes(ctx: Ctx, ox: number, oy: number, dir: number) {
  for (const k of [0, 1]) {
    const ex = ox + 2 + k * 5 + DX[dir], ey = oy + 3 + DY[dir];
    ctx.fillStyle = WHITE;
    ctx.fillRect(ex, ey, 3, 4);
    ctx.fillStyle = '#2038ec';
    ctx.fillRect(ex + (DX[dir] > 0 ? 1 : DX[dir] < 0 ? 0 : 1 - k), ey + 1 + DY[dir], 2, 2);
  }
}

function drawScaredFace(ctx: Ctx, ox: number, oy: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(ox + 3, oy + 4, 2, 2);
  ctx.fillRect(ox + 7, oy + 4, 2, 2);
  for (let x = 2; x < 10; x++) ctx.fillRect(ox + x, oy + 8 - (x % 2), 1, 1);
}

/** A ghost centred on (x, y). `eyesOnly` is how it looks eaten, or in the dark. */
function drawGhost(ctx: Ctx, w: World, g: Ghost, x: number, y: number, frame: number, eyesOnly = false) {
  const ox = Math.round(x) - 6, oy = Math.round(y) - 6;
  const ending = !!w.power && w.power.timer < 120 && (frame >> 3) % 2 === 0;
  if (eyesOnly || g.state === 'eyes' || g.state === 'entering') {
    if (g.scared) drawScaredFace(ctx, ox, oy, ending ? WHITE : '#6888fc');
    else drawGhostEyes(ctx, ox, oy, g.dir);
    return;
  }
  const frozen = w.frozen;
  const body = g.scared ? (ending ? WHITE : SCARED) : frozen ? (ending ? WHITE : ICE) : GHOST_COLORS[g.id];
  const feet = GHOST_FEET[frozen ? 0 : (frame >> 3) % 2];
  drawSprite(ctx, [...GHOST_BODY, ...feet], ox, oy, { '#': body });
  if (g.scared) drawScaredFace(ctx, ox, oy, ending ? RED : DOT_COLOR);
  else drawGhostEyes(ctx, ox, oy, g.dir);
}

// ---------- the maze picture ----------

const mazeCache = new WeakMap<World, HTMLCanvasElement[]>();
/** Walls are drawn this much thinner than their tiles, so the corridors look wider. */
const INSET = 3;
const DISC: [number, number][] = [];
for (let dy = -INSET; dy <= INSET; dy++) for (let dx = -INSET; dx <= INSET; dx++) if (dx * dx + dy * dy <= INSET * INSET) DISC.push([dx, dy]);

/** The walls as outlined shapes: [normal, flashing white]. */
function mazeImages(w: World) {
  let imgs = mazeCache.get(w);
  if (imgs) return imgs;
  const clamp = (v: number, n: number) => Math.max(0, Math.min(n - 1, v));
  // Beyond the edge the maze goes on as it ends, so tunnels stay open and the border stays shut.
  const wall = (px: number, py: number) => w.grid[cellAt(clamp(px >> 3, COLS), clamp(py >> 3, ROWS))] === WALL;
  const solid = new Uint8Array(BW * BH);
  for (let py = 0; py < BH; py++)
    for (let px = 0; px < BW; px++) solid[py * BW + px] = DISC.every(([dx, dy]) => wall(px + dx, py + dy)) ? 1 : 0;
  const at = (px: number, py: number) => solid[clamp(py, BH) * BW + clamp(px, BW)];

  imgs = [w.opt.theme.wall, WHITE].map((color) => {
    const c = document.createElement('canvas');
    c.width = BW;
    c.height = BH;
    const g = c.getContext('2d')!;
    const fill = mix(color, '#000000', 0.82);
    for (let py = 0; py < BH; py++)
      for (let px = 0; px < BW; px++) {
        if (!at(px, py)) continue;
        const edge = !at(px - 1, py) || !at(px + 1, py) || !at(px, py - 1) || !at(px, py + 1);
        g.fillStyle = edge ? color : fill;
        g.fillRect(px, py, 1, 1);
      }
    g.fillStyle = '#f8b8d8';
    for (let t = 0; t < w.grid.length; t++) if (w.grid[t] === DOOR) g.fillRect(cx(t) * TILE, cy(t) * TILE + 3, TILE, 2);
    return c;
  });
  mazeCache.set(w, imgs);
  return imgs;
}

// ---------- the board ----------

/** Light per tile for BLACKOUT: <= 0 black, 0-1 dim, >= 1 lit. Null when the lights are on. */
function lighting(w: World) {
  if (!w.opt.mode.dark || w.state === 'ready' || w.state === 'cleared' || w.state === 'done') return null;
  // One look at the maze, then the dark closes in.
  const base = w.power?.kind === 'coffee' ? 7 : 5;
  const r = Math.max(base, 30 - w.playTime * 0.5);
  const light = new Float32Array(w.grid.length);
  const p = w.pac;
  const it = w.ingredient;
  for (let c = 0; c < light.length; c++) {
    const x = cx(c) * TILE + 4, y = cy(c) * TILE + 4;
    // Light reaches through the tunnels too.
    const dx = Math.min(Math.abs(x - p.x), BW - Math.abs(x - p.x));
    let v = r - Math.hypot(dx, y - p.y) / TILE;
    if (it) v = Math.max(v, 1.8 - Math.hypot(cx(c) - cx(it.cell), cy(c) - cy(it.cell)));
    light[c] = v;
  }
  return light;
}

let ditherTile: HTMLCanvasElement | null = null;
function dither() {
  if (ditherTile) return ditherTile;
  ditherTile = document.createElement('canvas');
  ditherTile.width = ditherTile.height = 8;
  const g = ditherTile.getContext('2d')!;
  g.fillStyle = '#000';
  for (let y = 0; y < 8; y++) for (let x = y % 2; x < 8; x += 2) g.fillRect(x, y, 1, 1);
  return ditherTile;
}

/** Runs `draw` at x, and again on the far side when the sprite straddles a tunnel mouth. */
function wrapped(x: number, draw: (x: number) => void) {
  draw(x);
  if (x < 8) draw(x + BW);
  if (x > BW - 8) draw(x - BW);
}

function drawSnackman(ctx: Ctx, w: World, frame: number) {
  const p = w.pac;
  const caught = w.haunt && w.state === 'cleared';
  if (w.state === 'dead' || w.state === 'done' || (w.state === 'cleared' && !caught)) {
    if (w.state === 'cleared') drawPac(ctx, BX + p.x, BY + p.y, p.dir, 0);
    return;
  }
  if ((w.state === 'dying' && !w.haunt) || caught) {
    // He folds up and is gone.
    const t = w.stateTimer;
    if (t > 85) return;
    const gape = t < 25 ? 0.4 : 0.4 + ((t - 25) / 60) * (Math.PI - 0.4);
    return drawPac(ctx, BX + p.x, BY + p.y, 0, gape, SNACKMAN, false);
  }
  const chew = [0.15, 0.55, 0.95, 0.55][(frame >> 2) % 4];
  const gape = w.state === 'ready' ? 0 : p.moving ? chew : 0.55;
  // On coffee he leaves a blur behind.
  if (w.power?.kind === 'coffee' && p.moving)
    wrapped(p.x - DX[p.dir] * 5, (x) => drawPac(ctx, BX + x, BY + p.y - DY[p.dir] * 5, p.dir, gape, mix(SNACKMAN, '#000000', 0.6), false));
  // In HAUNT, the one who got away takes a bow.
  const hop = w.haunt && w.state === 'dying' ? -Math.abs(Math.round(Math.sin(w.stateTimer / 6) * 3)) : 0;
  wrapped(p.x, (x) => drawPac(ctx, BX + x, BY + p.y + hop, p.dir, gape));
}

export function drawBoard(ctx: Ctx, w: World, frame: number, still = false) {
  const flash = !w.haunt && w.state === 'cleared' && w.stateTimer > 30 && (w.stateTimer >> 3) % 2 === 0;
  ctx.drawImage(mazeImages(w)[flash ? 1 : 0], BX, BY);
  ctx.save();
  ctx.beginPath();
  ctx.rect(BX, BY, BW, BH);
  ctx.clip();

  const light = still ? null : lighting(w);
  for (let c = 0; c < w.dots.length; c++) {
    const d = w.dots[c];
    if (!d) continue;
    const x = BX + cx(c) * TILE, y = BY + cy(c) * TILE;
    ctx.fillStyle = DOT_COLOR;
    if (d === DOT) ctx.fillRect(x + 3, y + 3, 2, 2);
    else if ((frame >> 3) % 2 || still) {
      ctx.fillRect(x + 2, y + 1, 4, 6);
      ctx.fillRect(x + 1, y + 2, 6, 4);
    }
  }
  if (still) return ctx.restore();

  if (w.fruit > 0 && (w.fruit > 120 || (frame >> 2) % 2)) drawSprite(ctx, SPRITES.cherry, BX + FRUIT_X - 4, BY + FRUIT_Y - 4, PALETTE);
  const it = w.ingredient;
  if (it) {
    const x = BX + cx(it.cell) * TILE, y = BY + cy(it.cell) * TILE - ((frame >> 4) % 2);
    drawSprite(ctx, SPRITES[it.id], x, y, PALETTE);
    // A glint, so it stands out from the dots.
    ctx.fillStyle = WHITE;
    const k = (frame >> 2) % 12;
    if (k < 4) ctx.fillRect(x - 1 + k * 3, y - 2, 1, 1);
  }

  const hideGhosts = (w.state === 'dying' && !w.haunt && w.stateTimer > 25) || (w.state === 'cleared' && !w.haunt) || w.state === 'dead' || w.state === 'done';
  const dark = (g: Ghost) => !!light && light[w.tileOf(g)] <= 0;
  if (!hideGhosts) for (const g of w.ghosts) if (!dark(g)) wrapped(g.x, (x) => drawGhost(ctx, w, g, BX + x, BY + g.y, frame));
  drawSnackman(ctx, w, frame);
  // In HAUNT an arrow marks which ghost is you.
  if (w.haunt && (w.state === 'ready' || (frame >> 4) % 4 === 0) && !hideGhosts) {
    const g = w.ghosts[0];
    ctx.fillStyle = WHITE;
    for (let k = 0; k < 3; k++) ctx.fillRect(BX + Math.round(g.x) - 3 + k, BY + Math.round(g.y) - 12 + k, 6 - 2 * k, 1);
  }

  if (light) {
    const dim = dither();
    ctx.fillStyle = '#000';
    for (let c = 0; c < light.length; c++) {
      const x = BX + cx(c) * TILE, y = BY + cy(c) * TILE;
      if (light[c] <= 0) {
        ctx.fillRect(x, y, TILE, TILE);
        // Dots glimmer through the dark now and then.
        if (w.dots[c] && hash(c * 7 + (frame >> 4)) % 50 === 0) {
          ctx.fillStyle = GREY;
          ctx.fillRect(x + 3, y + 3, 2, 2);
          ctx.fillStyle = '#000';
        }
      } else if (light[c] < 1) ctx.drawImage(dim, x, y);
    }
    // Eyes in the dark.
    if (!hideGhosts) for (const g of w.ghosts) if (dark(g)) wrapped(g.x, (x) => drawGhost(ctx, w, g, BX + x, BY + g.y, frame, true));
  }

  for (const p of w.particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(BX + p.x), Math.round(BY + p.y), p.size, p.size);
  }
  ctx.restore();
  for (const p of w.popups) {
    if (p.life < 15 && (frame >> 1) % 2) continue;
    const tw = textWidth(p.text);
    const x = Math.max(BX + 2, Math.min(BX + BW - tw - 2, Math.round(BX + p.x - tw / 2)));
    const y = Math.max(BY + 2, Math.round(BY + p.y - 10));
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 1, y - 1, tw + 2, 9);
    drawText(ctx, p.text, x, y, p.color);
  }
}

// ---------- in play ----------

export function render(ctx: Ctx, game: Game, frame: number) {
  ctx.save();
  const shake = game.world?.shake ?? 0;
  if (shake > 0 && game.phase === 'play') ctx.translate(frame % 2 ? 1 : -1, Math.min(2, shake >> 2) * (frame % 4 < 2 ? 1 : -1));
  switch (game.phase) {
    case 'title':
      renderTitle(ctx, game, frame);
      break;
    case 'entry':
    case 'scores':
      renderScores(ctx, game, frame);
      break;
    case 'help':
      renderHelp(ctx, game, frame);
      break;
    default:
      renderPlay(ctx, game, frame);
  }
  ctx.restore();
}

function banner(ctx: Ctx, text: string, color: string) {
  const y = BY + FRUIT_Y - 3;
  ctx.fillStyle = '#000';
  ctx.fillRect(BX + FRUIT_X - textWidth(text) / 2 - 3, y - 2, textWidth(text) + 6, 11);
  drawTextCentered(ctx, text, BX + FRUIT_X, y, color);
}

function renderPlay(ctx: Ctx, game: Game, frame: number) {
  const w = game.world!;
  ctx.fillStyle = '#000';
  ctx.fillRect(-2, -2, W + 4, H + 4);
  drawBoard(ctx, w, frame);
  drawHud(ctx, game, w, frame);

  if (game.phase === 'intro') drawIntro(ctx, game, w);
  else if (game.phase === 'play' && game.paused) drawPause(ctx, game, w);
  else if (game.phase === 'play' && w.state === 'ready') banner(ctx, w.haunt ? 'GET HIM!' : 'READY!', YELLOW);
  else if (game.phase === 'play' && w.haunt && w.state === 'dying') banner(ctx, 'HE GOT AWAY', RED);
  if (game.phase === 'curtain' || game.phase === 'over') drawCurtain(ctx, game, w, frame);
}

function drawHud(ctx: Ctx, game: Game, w: World, frame: number) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, 24);
  drawText(ctx, 'SC', 4, 3, GREY);
  drawText(ctx, pad(game.score, 7), 18, 3);
  const best = Math.max(game.best()?.score ?? 0, game.score);
  drawText(ctx, 'HI', 98, 3, GREY);
  drawText(ctx, pad(best, 7), 112, 3, LIGHT);

  const value = pad(w.opt.level, 2);
  drawText(ctx, 'LV', 252 - textWidth(`LV ${value}`), 3, GREY);
  drawText(ctx, value, 252 - textWidth(value), 3);
  const lives = Math.max(0, game.lives - (w.state === 'dead' ? 1 : 0));
  const icon = w.haunt ? GHOST_LIFE : LIFE;
  const colors = { y: SNACKMAN, r: GHOST_COLORS[0], w: WHITE, c: '#2038ec' };
  if (lives > 4) {
    drawSprite(ctx, icon, 222, 13, colors);
    drawText(ctx, `X${lives}`, 232, 13);
  } else for (let i = 0; i < lives; i++) drawSprite(ctx, icon, 245 - i * 9, 13, colors);

  if (w.haunt) {
    drawText(ctx, 'DOTS', 4, 13, GREY);
    drawText(ctx, String(w.dotsLeft), 32, 13, w.dotsLeft < 40 && (frame >> 3) % 2 ? RED : YELLOW);
  } else if (w.opt.mode.recipes) {
    // The recipe: what's in the pan so far, and what it makes.
    const making = w.pocket ?? w.recipe;
    RECIPES[making].parts.forEach((id, i) => drawSprite(ctx, SPRITES[id], 4 + i * 10, 13, w.pocket || i < w.step ? PALETTE : DIM));
    drawText(ctx, '>', 35, 13, GREY);
    const ready = !!w.pocket;
    drawSprite(ctx, SPRITES[making], 43, 13, ready ? PALETTE : DIM);
    if (ready && (frame >> 4) % 2 === 0) drawText(ctx, 'SPACE', 55, 13, YELLOW);
  }

  // The snack at work, running down.
  if (w.power) {
    const left = w.power.timer / w.power.total;
    const color = POWER_COLORS[w.power.kind];
    drawSprite(ctx, SPRITES[w.power.kind], 98, 13, PALETTE);
    ctx.fillStyle = DARK;
    ctx.fillRect(110, 15, 80, 4);
    ctx.fillStyle = left < 0.28 && (frame >> 2) % 2 ? WHITE : color;
    ctx.fillRect(110, 15, Math.ceil(80 * left), 4);
  }
}

const GOALS: Record<string, string[]> = {
  arcade: ['EAT EVERY DOT', 'COOK SNACKS - SPACE EATS THEM'],
  classic: ['EAT EVERY DOT', 'PELLETS TURN THE GHOSTS BLUE'],
  haunt: ['YOU ARE THE RED GHOST', 'CATCH SNACKMAN'],
  blackout: ['EAT EVERY DOT', 'THE LIGHTS GO OUT'],
};

function drawIntro(ctx: Ctx, game: Game, w: World) {
  const goals = GOALS[game.mode.id];
  const h = 70 + goals.length * 10;
  const y0 = BY + Math.round((BH - h) / 2);
  drawBox(ctx, 36, y0, 184, h);
  drawTextCentered(ctx, `${game.mode.name} - LEVEL ${w.opt.level}`, 128, y0 + 10, GREY);
  drawTextCentered(ctx, w.opt.theme.name, 128, y0 + 22, w.opt.theme.wall);
  goals.forEach((t, i) => drawTextCentered(ctx, t, 128, y0 + 38 + i * 10, i ? LIGHT : WHITE));
  // A bar that runs down until play starts.
  const left = 1 - Math.min(1, game.timer / INTRO_FRAMES);
  ctx.fillStyle = DARK;
  ctx.fillRect(56, y0 + h - 14, 144, 3);
  ctx.fillStyle = SNACKMAN;
  ctx.fillRect(56, y0 + h - 14, Math.round(144 * left), 3);
}

function drawPause(ctx: Ctx, game: Game, w: World) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 24, W, H - 24);
  drawBox(ctx, 52, 72, 152, 80);
  drawTextCentered(ctx, 'PAUSED', 128, 82, YELLOW);
  drawTextCentered(ctx, `${game.mode.name} - ${w.opt.theme.name}`, 128, 96);
  drawTextCentered(ctx, `LIVES ${game.lives}   DOTS ${w.dotsLeft}`, 128, 108, GREY);
  drawTextCentered(ctx, 'ENTER RESUME', 128, 124, LIGHT);
  drawTextCentered(ctx, 'BKSP QUIT', 128, 136, GREY);
}

function drawCurtain(ctx: Ctx, game: Game, w: World, frame: number) {
  // The maze is walled up, row by row.
  const rows = Math.min(25, game.curtainRow);
  const wall = w.opt.theme.wall;
  const fill = mix(wall, '#000000', 0.82);
  for (let y = 0; y < rows; y++) {
    const py = 24 + y * 8;
    ctx.fillStyle = fill;
    ctx.fillRect(0, py, W, 8);
    ctx.fillStyle = wall;
    for (let x = -1; x < 9; x++) {
      const px = x * 32 + (y % 2) * 16;
      ctx.fillRect(px + 1, py, 30, 1);
      ctx.fillRect(px + 1, py + 7, 30, 1);
      ctx.fillRect(px, py + 1, 1, 6);
      ctx.fillRect(px + 31, py + 1, 1, 6);
    }
  }
  if (game.phase !== 'over') return;
  drawBox(ctx, 52, 64, 152, 96);
  drawTextCentered(ctx, 'GAME OVER', 128, 74, RED);
  const stats: [string, string][] = [
    ['SCORE', String(game.score)],
    ['LEVEL', String(game.level)],
    [w.haunt ? 'CATCHES' : 'GHOSTS', String(game.ghosts)],
  ];
  stats.forEach(([k, v], i) => {
    drawText(ctx, k, 66, 92 + i * 12, GREY);
    drawText(ctx, v, 190 - textWidth(v), 92 + i * 12);
  });
  if (game.timer > 30 && (frame >> 5) % 2 === 0) drawTextCentered(ctx, 'PRESS ENTER', 128, 144, LIGHT);
}

// ---------- title ----------

const LOGO = [
  ['###', '#..', '###', '..#', '###'],
  ['#..#', '##.#', '#.##', '#..#', '#..#'],
  ['###', '#.#', '###', '#.#', '#.#'],
  ['###', '#..', '#..', '#..', '###'],
  ['#.#', '#.#', '##.', '#.#', '#.#'],
  ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  ['###', '#.#', '###', '#.#', '#.#'],
  ['#..#', '##.#', '#.##', '#..#', '#..#'],
];
const LOGO_CELL = 5;
const LOGO_COLS = LOGO.reduce((n, l) => n + l[0].length + 1, -1);
const LOGO_X = Math.round((W - LOGO_COLS * LOGO_CELL) / 2);

/** The chase under the logo: ghosts after Snackman one way, Snackman after blue ghosts back. */
function drawParade(ctx: Ctx, w: World, frame: number, y: number) {
  const span = 208 + 120;
  const t = (frame * 0.9 + 80) % (span * 2);
  const back = t >= span;
  const x = back ? 232 + 40 - (t - span) : 24 - 40 + t;
  const dir: Dir = back ? 3 : 1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(28, y - 7, 200, 14);
  ctx.clip();
  const chew = [0.15, 0.55, 0.95, 0.55][(frame >> 2) % 4];
  drawPac(ctx, x, y, dir, chew);
  for (let k = 0; k < 4; k++) {
    const g: Ghost = { id: k, x: 0, y: 0, dir, moving: true, state: 'roam', scared: back, homeX: 0, wait: 0 };
    // Fleeing ghosts are slower, so he closes in.
    const gx = back ? x - 22 - k * 15 + (t - span) * 0.12 : x - 26 - k * 15;
    if (!back || gx < x - 8) drawGhost(ctx, w, g, gx, y, frame);
  }
  ctx.restore();
}

function renderTitle(ctx: Ctx, game: Game, frame: number) {
  const s = game.settings;
  const tw = game.titleWorld();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawBoard(ctx, tw, frame, true);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);

  drawBox(ctx, 24, 6, 208, 56);
  let col = 0;
  LOGO.forEach((letter) => {
    letter.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== '#') return;
        const px = LOGO_X + (col + x) * LOGO_CELL, py = 13 + y * LOGO_CELL;
        // A shine runs across the letters.
        const wave = (col + x + y - (frame >> 2) + 4000) % 46 < 2;
        ctx.fillStyle = wave ? WHITE : SNACKMAN;
        ctx.fillRect(px, py, LOGO_CELL - 1, LOGO_CELL - 1);
        ctx.fillStyle = GOLD;
        ctx.fillRect(px, py + LOGO_CELL - 2, LOGO_CELL - 1, 1);
      }),
    );
    col += letter[0].length + 1;
  });
  drawParade(ctx, tw, frame, 49);

  drawBox(ctx, 16, 68, 224, 76);
  const mode = game.mode;
  const values: Record<(typeof MENU)[number], string> = {
    MODE: mode.name,
    SPEED: `${s.speed + 1} ${SPEED_NAMES[s.speed]} X${SPEED_POINTS[s.speed]}`,
    SEED: mode.usesSeed ? (s.daily ? 'DAILY' : 'RANDOM') : '--',
    MUSIC: MUSIC_NAMES[s.music],
    HELP: 'HOW TO PLAY',
  };
  MENU.forEach((row, i) => {
    const y = 77 + i * 12;
    const on = i === game.menuRow;
    const enabled = game.rowEnabled(row);
    if (on) drawText(ctx, '>', 26, y, YELLOW);
    drawText(ctx, row, 36, y, on ? YELLOW : enabled ? WHITE : '#585858');
    const v = values[row];
    drawText(ctx, v, 90, y, !enabled ? '#585858' : on ? WHITE : LIGHT);
    if (on && enabled && row !== 'HELP') {
      drawText(ctx, '<', 82, y, GREY);
      drawText(ctx, '>', 92 + textWidth(v), y, GREY);
    }
  });

  drawBox(ctx, 8, 150, 240, 70);
  drawTextCentered(ctx, mode.blurb, 128, 159, YELLOW);
  const best = game.best();
  drawTextCentered(ctx, best ? `TOP ${pad(best.score, 7)} ${best.name}` : 'NO RECORD YET', 128, 173, RED);
  if ((frame >> 5) % 2 === 0) drawTextCentered(ctx, 'ENTER START   H SCORES   M MUSIC', 128, 189);
  drawTextCentered(ctx, mode.haunt ? 'ARROWS MOVE' : mode.recipes ? 'ARROWS MOVE   SPACE EAT SNACK' : 'ARROWS MOVE', 128, 203, GREY);
}

// ---------- high scores ----------

function renderScores(ctx: Ctx, game: Game, frame: number) {
  const entering = game.phase === 'entry';
  const mode = MODES[game.scoresView];
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawBoard(ctx, game.world ?? game.titleWorld(), frame, true);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);

  drawBox(ctx, 24, 12, 208, 176);
  // The name is typed into your own table; afterwards the world table shows by default.
  const world = game.scoresGlobal && !entering;
  const title = entering ? 'NEW RECORD!' : world ? 'WORLD SCORES' : 'LOCAL SCORES';
  drawTextCentered(ctx, title, 128, 20, entering ? YELLOW : WHITE);
  drawTextCentered(ctx, entering ? mode.name : `< ${mode.name} >`, 128, 32, LIGHT);
  const cols: [string, number][] = [['NAME', 50], ['SCORE', 94], ['LV', 146], [mode.haunt ? 'CT' : 'GH', 170], ['S', 200]];
  for (const [label, x] of cols) drawText(ctx, label, x, 44, GREY);
  ctx.fillStyle = '#585858';
  ctx.fillRect(34, 53, 188, 1);

  const blink = (frame >> 4) % 2 === 0;
  if (world && !game.global) {
    drawTextCentered(ctx, game.globalState === 'loading' ? 'LOADING...' : 'OFFLINE', 128, 110, game.globalState === 'loading' ? LIGHT : RED);
  }
  const list = world ? (game.global?.[mode.id] ?? []) : game.tables[mode.id];
  const myRow = world ? game.globalRank : game.entryRank;
  for (let i = 0; i < MAX_SCORES && (!world || game.global); i++) {
    const y = 58 + i * 12;
    const e = list[i];
    const mine = i === myRow && game.scoresView === game.settings.mode;
    const color = mine ? (entering || blink ? YELLOW : WHITE) : i < 3 ? WHITE : LIGHT;
    const n = String(i + 1);
    drawText(ctx, n, 45 - textWidth(n), y, mine ? color : GREY);
    if (!e) {
      drawText(ctx, '------', 50, y, DARK);
      continue;
    }
    if (mine && entering) {
      drawText(ctx, game.entryName.join(''), 50, y, color);
      if (blink) {
        ctx.fillStyle = WHITE;
        ctx.fillRect(50 + game.entryCursor * 6, y + 8, 5, 1);
      }
    } else drawText(ctx, e.name.slice(0, NAME_LEN), 50, y, color);
    drawText(ctx, pad(e.score, 7), 94, y, color);
    drawText(ctx, pad(e.level, 2), 146, y, color);
    drawText(ctx, pad(e.ghosts, 3), 170, y, color);
    drawText(ctx, String(e.speed), 200, y, GREY);
  }

  drawBox(ctx, 24, 194, 208, 24);
  if (entering) drawTextCentered(ctx, 'TYPE NAME  THEN ENTER', 128, 202);
  else drawTextCentered(ctx, `< > MODE   UP ${world ? 'LOCAL' : 'WORLD'}   ENTER`, 128, 202, blink ? WHITE : LIGHT);
}

// ---------- help ----------

function renderHelp(ctx: Ctx, game: Game, frame: number) {
  const page = HELP_PAGES[game.helpPage];
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawBoard(ctx, game.titleWorld(), frame, true);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  drawBox(ctx, 16, 8, 224, 182);
  drawTextCentered(ctx, `< ${page.title} >`, 128, 16, YELLOW);
  ctx.fillStyle = '#585858';
  ctx.fillRect(26, 27, 204, 1);
  wrapText(page.text, 34).forEach((line, i) => drawText(ctx, line, 26, 34 + i * 10));
  drawBox(ctx, 16, 194, 224, 24);
  const blink = (frame >> 4) % 2 === 0;
  drawTextCentered(ctx, `< > PAGE ${game.helpPage + 1}/${HELP_PAGES.length}    ENTER BACK`, 128, 202, blink ? WHITE : LIGHT);
}
