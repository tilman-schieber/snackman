# SNACKMAN

An arcade maze game in the style of the early eighties, built in TypeScript with no runtime dependencies. Runs entirely in the browser. A sibling of [Scales](https://github.com/tilman-schieber/scales): same screen, same font, same high score tables.

**Play:** https://gh.tschieber.de/snackman/

Eat every dot, keep away from the four ghosts. In ARCADE there are no power pellets: the three ingredients of a recipe lie around the maze, and together they make a snack that you keep until you need it.

## Modes

| Mode | Goal |
| --- | --- |
| ARCADE | A new procedural maze every level. No power pellets: you cook your own snacks. 3 lives, one more at 10000 points. |
| CLASSIC | One fixed maze, four power pellets, four ghosts, bonus fruit. Nothing else. |
| HAUNT | Classic, reversed. You are the red ghost and Snackman plays himself: catch him before he eats every dot. If he clears the maze you lose a life. |
| BLACKOUT | Arcade with the lights out. You get one look at the maze, then you only see what is near, and of the ghosts only the eyes. |

**Seed:** *Daily* gives everyone the same mazes for the day.

## Snacks

| Snack | Ingredients | What it does |
| --- | --- | --- |
| Burger | Bun, patty, cheese | Ghosts turn blue and can be eaten: 200, 400, 800, 1600 |
| Ice cream | Cone, scoop, cherry | Ghosts freeze and can't hurt you |
| Coffee | Beans, milk, cup | You are fast and dots count double; in BLACKOUT you see further |
| Birthday cake | Egg, flour, candle | Rare, and eaten on the spot: an extra life |

A finished snack waits in your pocket until you press Space. The next recipe starts as soon as the snack is eaten, and snacks wear off sooner on later levels.

## The ghosts

| Ghost | Habit |
| --- | --- |
| Ketchup (red) | Comes straight for you, and speeds up when the maze is nearly empty |
| Bubblegum (pink) | Aims ahead of you to cut you off |
| Slushie (blue) | Flanks you from the side Ketchup isn't on |
| Cheddar (orange) | Chases you, then loses his nerve up close |

Now and then they all turn round and head for their corners. In HAUNT you are Ketchup, with Bubblegum and Cheddar helping. Ghost rules apply to you too: you never stop and never turn back (unless you are blue and running), you only choose the turns. Snackman goes for the nearest dot he can reach before any ghost can, gets warier and faster every level, and bolder the hungrier he is.

## Mazes

Corridors run on a lattice of 10 by 8 crossings, mirrored left to right. The generator starts from the full grid and takes corridors out in mirrored pairs, as long as the maze stays in one piece, no crossing becomes a dead end and no wall block grows past three cells. The ghost house, the ring around it and the outer ring always stay; one or two rows get a tunnel that wraps around the sides. The CLASSIC maze is one such layout, picked and frozen as a picture in `src/levels.ts`.

## Music

A chiptune loop over four chords. Every maze gets its own melody and key from its seed; instruments join in and the tempo rises as the maze empties, and it breaks into a racing arpeggio while a snack works. MUSIC in the menu turns it on or off, and M mutes it at any time.

## Controls

| Key | Action |
| --- | --- |
| Arrows / W A S D | Turn (a turn is remembered until the next crossing) |
| Space / Shift / X | Eat your snack |
| Enter / Esc | Start / pause |
| Backspace | Quit to menu (while paused) |
| M | Music on/off |
| H | High scores (title screen) |

A gamepad works too: stick or d-pad to turn, A or X to eat your snack, B to pause or go back, Start to pause and Select to quit from the pause screen. In the menus A confirms, and on the title screen Y shows the high scores; when typing a name, Up/Down pick a letter, A enters it and B rubs one out.

On phones, swipe the screen or use the buttons below it.

High scores: the top 10 per mode, both worldwide and in your own browser (Up/Down switches between them on the score screen). World scores live in a small [Val Town](https://www.val.town/x/tilmanschieber/snackman-scores) val with a SQLite table; your own scores and settings stay in the browser's local storage, so they still work offline. Games finished while the server can't be reached wait in local storage and are sent the next time the score screen opens.

## Development

```sh
npm install
npm run dev
npm run build
```
