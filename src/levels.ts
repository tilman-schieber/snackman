// What each level looks like: its maze and its colours.
import { Rng } from './rng';
import { Layout, generate, parse } from './maze';
import type { Mode } from './modes';

export interface Theme {
  name: string;
  wall: string;
}

/** Every level has a flavour. */
export const THEMES: Theme[] = [
  { name: 'BLUEBERRY', wall: '#3858fc' },
  { name: 'LIME', wall: '#58d854' },
  { name: 'GRAPE', wall: '#9878f8' },
  { name: 'CARAMEL', wall: '#d88028' },
  { name: 'MINT', wall: '#00c8a8' },
  { name: 'CHERRY', wall: '#e40058' },
  { name: 'LEMON', wall: '#d8c820' },
  { name: 'LIQUORICE', wall: '#bcbcbc' },
];

export const themeFor = (level: number) => THEMES[(level - 1) % THEMES.length];

/** The one maze of CLASSIC mode: four power pellets, one tunnel. */
const CLASSIC = [
  '##############################',
  '#............................#',
  '#.#####.##.########.##.#####.#',
  '#.#####.##.########.##.#####.#',
  '#o...##.##..........##.##...o#',
  '#.##.##.##.########.##.##.##.#',
  '#.##.##.##.########.##.##.##.#',
  '#.##....##..........##....##.#',
  '#.#####.##.###--###.##.#####.#',
  '#.#####.##.#HHHHHH#.##.#####.#',
  ' ..........#HHHHHH#.......... ',
  '#.##.#####.#HHHHHH#.#####.##.#',
  '#.##.#####.########.#####.##.#',
  '#.##.##................##.##.#',
  '#.##.##.#####.##.#####.##.##.#',
  '#.##.##.#####.##.#####.##.##.#',
  '#.##....##....  ....##....##.#',
  '#.##.##.##.########.##.##.##.#',
  '#.##.##.##.########.##.##.##.#',
  '#o...##................##...o#',
  '#.#####.##.########.##.#####.#',
  '#.#####.##.########.##.#####.#',
  '#............................#',
  '##############################',
];

export function levelLayout(mode: Mode, level: number, rng: Rng): Layout {
  if (mode.id === 'classic') return parse(CLASSIC);
  // Later mazes get a second tunnel.
  return generate(rng, { sparse: 0.5 + rng() * 0.5, tunnels: level >= 3 ? 2 : 1, pellets: !mode.recipes });
}
