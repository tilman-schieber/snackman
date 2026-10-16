// High scores, one table per mode, in this browser and worldwide (a Val Town val:
// tilmanschieber/snackman-scores). The tables themselves are arcade-kit's.
import { createScores } from 'arcade-kit/scores';
import { MODES, ModeId } from './modes';

export { load, save } from 'arcade-kit/storage';

export interface ScoreEntry {
  name: string;
  score: number;
  /** Level reached. */
  level: number;
  /** Ghosts eaten; in HAUNT, Snackmen you caught yourself. */
  ghosts: number;
  speed: number;
}

export type Tables = Record<ModeId, ScoreEntry[]>;

export const { MAX_SCORES, loadTables, saveTables, rankFor, fetchGlobal, submitGlobal, flushPending } = createScores<
  ModeId,
  ScoreEntry
>({
  game: 'snackman',
  tables: MODES.map((m) => m.id),
  url: 'https://tilmanschieber--01a0fd954428776fbe999013e3bd9011.web.val.run',
  normalize: (e) => ({
    name: e.name,
    score: e.score,
    level: Number(e.level) || 0,
    ghosts: Number(e.ghosts) || 0,
    speed: Number(e.speed) || 3,
  }),
});
