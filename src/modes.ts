export type ModeId = 'classic' | 'arcade' | 'haunt' | 'blackout';

export interface Mode {
  id: ModeId;
  name: string;
  /** Lives at the start. */
  lives: number;
  /** Mazes can use the daily seed. */
  usesSeed: boolean;
  /** Snacks are cooked from ingredients; otherwise power pellets lie in the corners. */
  recipes: boolean;
  dark: boolean;
  /** You play a ghost and hunt Snackman. */
  haunt: boolean;
  /** One line for the title screen. */
  blurb: string;
}

export const MODES: Mode[] = [
  { id: 'arcade', name: 'ARCADE', lives: 3, usesSeed: true, recipes: true, dark: false, haunt: false, blurb: 'NEW MAZES. COOK YOUR OWN SNACKS.' },
  { id: 'classic', name: 'CLASSIC', lives: 3, usesSeed: false, recipes: false, dark: false, haunt: false, blurb: 'JUST PELLETS AND GHOSTS.' },
  { id: 'haunt', name: 'HAUNT', lives: 3, usesSeed: true, recipes: false, dark: false, haunt: true, blurb: 'YOU ARE THE GHOST. CATCH HIM.' },
  { id: 'blackout', name: 'BLACKOUT', lives: 3, usesSeed: true, recipes: true, dark: true, haunt: false, blurb: 'ARCADE WITH THE LIGHTS OUT.' },
];

/** Pixels per frame at full speed, for SPEED 1-5. */
export const SPEEDS = [0.85, 1.05, 1.25, 1.45, 1.65];
/** Score multiplier for each speed: faster is riskier, so it pays more. */
export const SPEED_POINTS = [0.5, 0.75, 1, 1.5, 2];
export const SPEED_NAMES = ['CALM', 'EASY', 'NORMAL', 'FAST', 'FRANTIC'];
