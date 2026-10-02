// In-game help pages. Text uses only characters the pixel font has.

export interface HelpPage {
  title: string;
  /** Paragraphs, word-wrapped when drawn; '' adds a blank line. */
  text: string[];
}

export const HELP_PAGES: HelpPage[] = [
  {
    title: 'SNACKMAN',
    text: [
      'EAT EVERY DOT IN THE MAZE AND KEEP AWAY FROM THE FOUR GHOSTS.',
      '',
      'THE TUNNELS AT THE SIDES LEAD ROUND TO THE OTHER SIDE. GHOSTS ARE SLOW IN THEM.',
      '',
      'YOU HAVE 3 LIVES, AND WIN ONE MORE AT 10000 POINTS.',
      '',
      'EVERY MAZE IS FASTER THAN THE LAST, AND SNACKS WEAR OFF SOONER.',
    ],
  },
  {
    title: 'MODES',
    text: [
      'ARCADE: A NEW MAZE EVERY LEVEL. NO POWER PELLETS - YOU COOK YOUR OWN SNACKS.',
      '',
      'CLASSIC: ONE MAZE, POWER PELLETS, GHOSTS AND FRUIT. NOTHING ELSE.',
      '',
      'HAUNT: CLASSIC, REVERSED. YOU ARE THE RED GHOST.',
      '',
      'BLACKOUT: ARCADE WITH THE LIGHTS OUT.',
      '',
      'SEED DAILY: THE SAME MAZES FOR EVERYONE, ALL DAY.',
    ],
  },
  {
    title: 'SNACKS',
    text: [
      'INGREDIENTS TURN UP ONE AT A TIME. COLLECT ALL THREE AND THE SNACK IS YOURS.',
      '',
      'PRESS SPACE TO EAT IT WHEN NEEDED.',
      '',
      'BURGER: GHOSTS TURN BLUE AND YOU CAN EAT THEM.',
      'ICE CREAM: GHOSTS FREEZE AND CANNOT HURT YOU.',
      'COFFEE: YOU ARE FAST AND DOTS COUNT DOUBLE.',
      '',
      'THE NEXT RECIPE STARTS ONCE THE SNACK IS USED UP.',
    ],
  },
  {
    title: 'THE GHOSTS',
    text: [
      'KETCHUP, RED: COMES STRAIGHT FOR YOU, AND GETS ANGRY WHEN THE MAZE IS NEARLY EMPTY.',
      '',
      'BUBBLEGUM, PINK: AIMS AHEAD OF YOU TO CUT YOU OFF.',
      '',
      'SLUSHIE, BLUE: FLANKS YOU FROM THE SIDE KETCHUP IS NOT ON.',
      '',
      'CHEDDAR, ORANGE: CHASES YOU, THEN LOSES HIS NERVE UP CLOSE.',
      '',
      'NOW AND THEN THEY ALL TURN ROUND AND HEAD FOR THEIR CORNERS.',
    ],
  },
  {
    title: 'HAUNT',
    text: [
      'YOU ARE KETCHUP. CATCH SNACKMAN BEFORE HE EATS EVERY DOT. BUBBLEGUM AND CHEDDAR HELP.',
      '',
      'GHOSTS NEVER STOP AND NEVER TURN BACK. YOU ONLY CHOOSE THE TURNS.',
      '',
      'THE SOONER HE IS CAUGHT THE MORE IT PAYS - DOUBLE IF YOU DO IT YOURSELF.',
      '',
      'WHEN HE EATS A POWER PELLET, RUN.',
      '',
      'IF HE CLEARS THE MAZE YOU LOSE A LIFE.',
    ],
  },
  {
    title: 'BLACKOUT',
    text: [
      'YOU GET ONE LOOK AT THE MAZE, THEN THE LIGHTS GO OUT.',
      '',
      'YOU ONLY SEE WHAT IS NEAR. OF THE GHOSTS YOU SEE THE EYES. DOTS GLIMMER NOW AND THEN, AND INGREDIENTS GLOW.',
      '',
      'COFFEE LETS YOU SEE FURTHER.',
    ],
  },
  {
    title: 'SCORING',
    text: [
      'DOT: 10',
      'POWER PELLET: 50',
      'GHOSTS: 200, 400, 800, 1600',
      'INGREDIENT: 100',
      'SNACK COOKED: 400 MORE',
      'FRUIT: 100 AND UP',
      'HAUNT: 200 + 5 PER DOT LEFT, TIMES THE LEVEL',
      '',
      'FASTER SPEEDS PAY MORE: CALM X0.5, EASY X0.75, NORMAL X1, FAST X1.5, FRANTIC X2.',
    ],
  },
  {
    title: 'CONTROLS',
    text: [
      'ARROWS OR W A S D: TURN',
      'SPACE, SHIFT OR X: EAT YOUR SNACK',
      'ENTER OR ESC: PAUSE',
      'BACKSPACE: QUIT WHEN PAUSED',
      'M: MUSIC ON OR OFF',
      'H: HIGH SCORES - TITLE SCREEN',
      '',
      'A TURN IS REMEMBERED UNTIL THE NEXT CROSSING, SO PRESS EARLY.',
      '',
      'ON PHONES SWIPE THE SCREEN OR USE THE BUTTONS.',
    ],
  },
];

/** Splits paragraphs into lines of at most `width` characters. */
export function wrapText(paragraphs: string[], width: number) {
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(' ')) {
      if (line && line.length + 1 + word.length > width) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines;
}
