/**
 * Taste Quiz Configuration
 *
 * Defines quiz pair pools and selection algorithms for the onboarding taste quiz.
 *
 * Three phases:
 * 1. Fixed pairs (3) — identical for every user, cover broad dimensions
 * 2. Genre-responsive pairs (2) — chosen based on user's genre selections
 * 3. Adaptive pairs (5) — chosen based on interim vector to resolve ambiguity
 *
 * Each pair presents two titles and records which the user prefers.
 * The preference signal is used to refine the user's TasteVector.
 */

import {
  type TasteVector,
  createEmptyVector,
  GENRE_DIMENSIONS,
  META_DIMENSIONS,
  genreNameToKey,
} from './tasteVector';

// ── Interfaces ───────────────────────────────────────────────────

export interface QuizOption {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number;
  descriptor: string;
  vectorPosition: Partial<TasteVector>;
}

export interface QuizPair {
  id: string;
  phase: 'fixed' | 'genre-responsive' | 'adaptive';
  optionA: QuizOption;
  optionB: QuizOption;
  dimensionsTested: string[];
  triggerGenres?: string[];
}

// ── Fixed Pairs (3) ──────────────────────────────────────────────
// Shown to every user in order. Cover the broadest dimensional spread.

const FIXED_PAIRS: QuizPair[] = [
  {
    id: 'fixed-1',
    phase: 'fixed',
    dimensionsTested: ['tone', 'action', 'musical', 'intensity', 'pacing'],
    optionA: {
      tmdbId: 155,
      mediaType: 'movie',
      title: 'The Dark Knight',
      year: 2008,
      descriptor: 'Dark, intense superhero thriller',
      vectorPosition: {
        action: 1.0, crime: 1.0, drama: 1.0, thriller: 1.0,
        tone: -0.8, pacing: 0.7, era: 0.3, popularity: 0.9, intensity: 0.9,
      },
    },
    optionB: {
      tmdbId: 11631,
      mediaType: 'movie',
      title: 'Mamma Mia!',
      year: 2008,
      descriptor: 'Feel-good ABBA musical comedy',
      vectorPosition: {
        comedy: 1.0, musical: 1.0, romance: 1.0, family: 1.0,
        tone: 0.9, pacing: 0.5, era: 0.3, popularity: 0.7, intensity: -0.6,
      },
    },
  },
  {
    id: 'fixed-2',
    phase: 'fixed',
    dimensionsTested: ['scifi', 'romance', 'pacing', 'era', 'intensity'],
    optionA: {
      tmdbId: 27205,
      mediaType: 'movie',
      title: 'Inception',
      year: 2010,
      descriptor: 'Mind-bending sci-fi heist thriller',
      vectorPosition: {
        action: 1.0, scifi: 1.0, thriller: 1.0, adventure: 1.0,
        tone: -0.4, pacing: 0.8, era: 0.5, popularity: 0.9, intensity: 0.8,
      },
    },
    optionB: {
      tmdbId: 4348,
      mediaType: 'movie',
      title: 'Pride & Prejudice',
      year: 2005,
      descriptor: 'Elegant period romance drama',
      vectorPosition: {
        romance: 1.0, drama: 1.0,
        tone: 0.3, pacing: -0.6, era: -0.7, popularity: 0.5, intensity: -0.4,
      },
    },
  },
  {
    id: 'fixed-3',
    phase: 'fixed',
    dimensionsTested: ['scifi', 'horror', 'history', 'drama', 'pacing', 'era', 'popularity'],
    optionA: {
      tmdbId: 66732,
      mediaType: 'tv',
      title: 'Stranger Things',
      year: 2016,
      descriptor: 'Supernatural sci-fi horror series',
      vectorPosition: {
        scifi: 1.0, horror: 1.0, drama: 1.0, mystery: 1.0,
        tone: -0.5, pacing: 0.6, era: 0.6, popularity: 0.9, intensity: 0.7,
      },
    },
    optionB: {
      tmdbId: 65494,
      mediaType: 'tv',
      title: 'The Crown',
      year: 2016,
      descriptor: 'Lavish royal historical drama',
      vectorPosition: {
        drama: 1.0, history: 1.0,
        tone: -0.1, pacing: -0.7, era: -0.6, popularity: 0.7, intensity: -0.3,
      },
    },
  },
];

// ── Genre-Responsive Pool (~12 pairs) ────────────────────────────
// Selected based on user's genre picks not already covered by fixed pairs.

const GENRE_RESPONSIVE_POOL: QuizPair[] = [
  {
    id: 'genre-animation',
    phase: 'genre-responsive',
    triggerGenres: ['animation'],
    dimensionsTested: ['animation', 'action', 'adventure', 'tone', 'era'],
    optionA: {
      tmdbId: 324857,
      mediaType: 'movie',
      title: 'Spider-Man: Into the Spider-Verse',
      year: 2018,
      descriptor: 'Stylish animated superhero adventure',
      vectorPosition: {
        animation: 1.0, action: 1.0, adventure: 1.0, scifi: 1.0,
        tone: 0.3, pacing: 0.8, era: 0.8, popularity: 0.8, intensity: 0.5,
      },
    },
    optionB: {
      tmdbId: 129,
      mediaType: 'movie',
      title: 'Spirited Away',
      year: 2001,
      descriptor: 'Enchanting hand-drawn fantasy masterpiece',
      vectorPosition: {
        animation: 1.0, anime: 1.0, fantasy: 1.0, adventure: 1.0, family: 1.0,
        tone: 0.2, pacing: -0.3, era: 0.0, popularity: 0.6, intensity: -0.1,
      },
    },
  },
  {
    id: 'genre-anime',
    phase: 'genre-responsive',
    triggerGenres: ['anime'],
    dimensionsTested: ['anime', 'action', 'family', 'tone', 'intensity'],
    optionA: {
      tmdbId: 1429,
      mediaType: 'tv',
      title: 'Attack on Titan',
      year: 2013,
      descriptor: 'Brutal dark fantasy anime action',
      vectorPosition: {
        anime: 1.0, animation: 1.0, action: 1.0, drama: 1.0, fantasy: 1.0,
        tone: -0.9, pacing: 0.8, era: 0.5, popularity: 0.7, intensity: 1.0,
      },
    },
    optionB: {
      tmdbId: 8392,
      mediaType: 'movie',
      title: 'My Neighbour Totoro',
      year: 1988,
      descriptor: 'Gentle whimsical anime for all ages',
      vectorPosition: {
        anime: 1.0, animation: 1.0, family: 1.0, fantasy: 1.0,
        tone: 0.9, pacing: -0.5, era: -0.3, popularity: 0.6, intensity: -0.8,
      },
    },
  },
  {
    id: 'genre-documentary',
    phase: 'genre-responsive',
    triggerGenres: ['documentary'],
    dimensionsTested: ['documentary', 'tone', 'pacing', 'intensity'],
    optionA: {
      tmdbId: 69769,
      mediaType: 'tv',
      title: 'Planet Earth II',
      year: 2016,
      descriptor: 'Breathtaking nature documentary',
      vectorPosition: {
        documentary: 1.0,
        tone: 0.4, pacing: -0.4, era: 0.6, popularity: 0.8, intensity: 0.1,
      },
    },
    optionB: {
      tmdbId: 63247,
      mediaType: 'tv',
      title: 'Making a Murderer',
      year: 2015,
      descriptor: 'Gripping true crime documentary',
      vectorPosition: {
        documentary: 1.0, crime: 1.0,
        tone: -0.7, pacing: -0.2, era: 0.5, popularity: 0.6, intensity: 0.5,
      },
    },
  },
  {
    id: 'genre-horror',
    phase: 'genre-responsive',
    triggerGenres: ['horror'],
    dimensionsTested: ['horror', 'comedy', 'tone', 'intensity', 'era'],
    optionA: {
      tmdbId: 578,
      mediaType: 'movie',
      title: 'Jaws',
      year: 1975,
      descriptor: 'Iconic suspense horror blockbuster',
      vectorPosition: {
        horror: 1.0, thriller: 1.0, adventure: 1.0,
        tone: -0.6, pacing: 0.4, era: -0.5, popularity: 0.9, intensity: 0.8,
      },
    },
    optionB: {
      tmdbId: 120467,
      mediaType: 'movie',
      title: 'The Grand Budapest Hotel',
      year: 2014,
      descriptor: 'Whimsical quirky comedy caper',
      vectorPosition: {
        comedy: 1.0, drama: 1.0, adventure: 1.0, crime: 1.0,
        tone: 0.5, pacing: 0.3, era: 0.4, popularity: 0.5, intensity: -0.3,
      },
    },
  },
  {
    id: 'genre-comedy-drama',
    phase: 'genre-responsive',
    triggerGenres: ['comedy', 'drama'],
    dimensionsTested: ['drama', 'comedy', 'tone', 'pacing', 'intensity'],
    optionA: {
      tmdbId: 278,
      mediaType: 'movie',
      title: 'The Shawshank Redemption',
      year: 1994,
      descriptor: 'Powerful prison drama about hope',
      vectorPosition: {
        drama: 1.0, crime: 1.0,
        tone: -0.3, pacing: -0.4, era: -0.2, popularity: 0.9, intensity: 0.5,
      },
    },
    optionB: {
      tmdbId: 8363,
      mediaType: 'movie',
      title: 'Superbad',
      year: 2007,
      descriptor: 'Raunchy teen comedy mayhem',
      vectorPosition: {
        comedy: 1.0,
        tone: 0.8, pacing: 0.6, era: 0.3, popularity: 0.7, intensity: -0.2,
      },
    },
  },
  {
    id: 'genre-family',
    phase: 'genre-responsive',
    triggerGenres: ['family'],
    dimensionsTested: ['family', 'animation', 'comedy', 'tone', 'era'],
    optionA: {
      tmdbId: 109445,
      mediaType: 'movie',
      title: 'Frozen',
      year: 2013,
      descriptor: 'Magical animated musical adventure',
      vectorPosition: {
        animation: 1.0, family: 1.0, musical: 1.0, fantasy: 1.0, adventure: 1.0,
        tone: 0.8, pacing: 0.3, era: 0.5, popularity: 0.9, intensity: -0.3,
      },
    },
    optionB: {
      tmdbId: 771,
      mediaType: 'movie',
      title: 'Home Alone',
      year: 1990,
      descriptor: 'Classic slapstick family comedy',
      vectorPosition: {
        comedy: 1.0, family: 1.0,
        tone: 0.9, pacing: 0.5, era: -0.3, popularity: 0.9, intensity: -0.1,
      },
    },
  },
  {
    id: 'genre-crime',
    phase: 'genre-responsive',
    triggerGenres: ['crime'],
    dimensionsTested: ['crime', 'mystery', 'tone', 'era', 'pacing'],
    optionA: {
      tmdbId: 238,
      mediaType: 'movie',
      title: 'The Godfather',
      year: 1972,
      descriptor: 'Epic mafia crime saga',
      vectorPosition: {
        crime: 1.0, drama: 1.0,
        tone: -0.8, pacing: -0.5, era: -0.7, popularity: 0.9, intensity: 0.7,
      },
    },
    optionB: {
      tmdbId: 546554,
      mediaType: 'movie',
      title: 'Knives Out',
      year: 2019,
      descriptor: 'Witty modern whodunit mystery',
      vectorPosition: {
        crime: 1.0, mystery: 1.0, comedy: 1.0, thriller: 1.0,
        tone: 0.3, pacing: 0.4, era: 0.8, popularity: 0.7, intensity: 0.2,
      },
    },
  },
  {
    id: 'genre-war-history',
    phase: 'genre-responsive',
    triggerGenres: ['war', 'history'],
    dimensionsTested: ['war', 'history', 'drama', 'intensity', 'pacing'],
    optionA: {
      tmdbId: 857,
      mediaType: 'movie',
      title: 'Saving Private Ryan',
      year: 1998,
      descriptor: 'Visceral WWII combat epic',
      vectorPosition: {
        war: 1.0, drama: 1.0, action: 1.0,
        tone: -0.8, pacing: 0.5, era: -0.2, popularity: 0.9, intensity: 1.0,
      },
    },
    optionB: {
      tmdbId: 205596,
      mediaType: 'movie',
      title: 'The Imitation Game',
      year: 2014,
      descriptor: 'Cerebral wartime code-breaking drama',
      vectorPosition: {
        drama: 1.0, history: 1.0, war: 1.0, thriller: 1.0,
        tone: -0.2, pacing: -0.3, era: 0.4, popularity: 0.7, intensity: -0.1,
      },
    },
  },
  {
    id: 'genre-fantasy',
    phase: 'genre-responsive',
    triggerGenres: ['fantasy'],
    dimensionsTested: ['fantasy', 'adventure', 'tone', 'intensity', 'popularity'],
    optionA: {
      tmdbId: 120,
      mediaType: 'movie',
      title: 'The Lord of the Rings: The Fellowship of the Ring',
      year: 2001,
      descriptor: 'Grand epic fantasy quest',
      vectorPosition: {
        fantasy: 1.0, adventure: 1.0, action: 1.0, drama: 1.0,
        tone: -0.2, pacing: 0.3, era: 0.0, popularity: 0.9, intensity: 0.7,
      },
    },
    optionB: {
      tmdbId: 671,
      mediaType: 'movie',
      title: "Harry Potter and the Philosopher's Stone",
      year: 2001,
      descriptor: 'Magical coming-of-age school adventure',
      vectorPosition: {
        fantasy: 1.0, adventure: 1.0, family: 1.0,
        tone: 0.5, pacing: 0.2, era: 0.0, popularity: 0.9, intensity: 0.1,
      },
    },
  },
  {
    id: 'genre-musical',
    phase: 'genre-responsive',
    triggerGenres: ['musical'],
    dimensionsTested: ['musical', 'drama', 'tone', 'era', 'popularity'],
    optionA: {
      tmdbId: 316029,
      mediaType: 'movie',
      title: 'The Greatest Showman',
      year: 2017,
      descriptor: 'Uplifting spectacle musical drama',
      vectorPosition: {
        musical: 1.0, drama: 1.0, romance: 1.0, family: 1.0,
        tone: 0.8, pacing: 0.5, era: 0.7, popularity: 0.8, intensity: 0.2,
      },
    },
    optionB: {
      tmdbId: 1574,
      mediaType: 'movie',
      title: 'Chicago',
      year: 2002,
      descriptor: 'Sassy crime-world jazz musical',
      vectorPosition: {
        musical: 1.0, comedy: 1.0, crime: 1.0, drama: 1.0,
        tone: 0.0, pacing: 0.4, era: 0.0, popularity: 0.6, intensity: 0.3,
      },
    },
  },
  {
    id: 'genre-western',
    phase: 'genre-responsive',
    triggerGenres: ['western'],
    dimensionsTested: ['western', 'action', 'tone', 'intensity', 'era'],
    optionA: {
      tmdbId: 68718,
      mediaType: 'movie',
      title: 'Django Unchained',
      year: 2012,
      descriptor: 'Explosive revisionist western revenge',
      vectorPosition: {
        western: 1.0, action: 1.0, drama: 1.0,
        tone: -0.5, pacing: 0.5, era: 0.4, popularity: 0.8, intensity: 0.9,
      },
    },
    optionB: {
      tmdbId: 44264,
      mediaType: 'movie',
      title: 'True Grit',
      year: 2010,
      descriptor: 'Gritty classic-style frontier western',
      vectorPosition: {
        western: 1.0, adventure: 1.0, drama: 1.0,
        tone: -0.4, pacing: -0.1, era: 0.3, popularity: 0.6, intensity: 0.4,
      },
    },
  },
  {
    id: 'genre-reality',
    phase: 'genre-responsive',
    triggerGenres: ['reality'],
    dimensionsTested: ['reality', 'tone', 'pacing', 'intensity'],
    optionA: {
      tmdbId: 46261,
      mediaType: 'tv',
      title: 'The Great British Bake Off',
      year: 2010,
      descriptor: 'Cosy wholesome baking competition',
      vectorPosition: {
        reality: 1.0,
        tone: 0.9, pacing: -0.2, era: 0.4, popularity: 0.7, intensity: -0.6,
      },
    },
    optionB: {
      tmdbId: 60625,
      mediaType: 'tv',
      title: "RuPaul's Drag Race",
      year: 2009,
      descriptor: 'Fierce glamorous performance competition',
      vectorPosition: {
        reality: 1.0,
        tone: 0.6, pacing: 0.4, era: 0.4, popularity: 0.7, intensity: 0.3,
      },
    },
  },
];

// ── Adaptive Pool (~25 pairs) ────────────────────────────────────
// Selected based on which dimensions of the interim vector are most ambiguous.

const ADAPTIVE_POOL: QuizPair[] = [
  // ── Tone + intensity probes ─────────────────────────────────────
  {
    id: 'adaptive-1',
    phase: 'adaptive',
    dimensionsTested: ['tone', 'intensity', 'pacing', 'crime', 'comedy'],
    optionA: {
      tmdbId: 1396,
      mediaType: 'tv',
      title: 'Breaking Bad',
      year: 2008,
      descriptor: 'Tense dark crime transformation saga',
      vectorPosition: {
        crime: 1.0, drama: 1.0, thriller: 1.0,
        tone: -0.9, pacing: 0.4, era: 0.3, popularity: 0.9, intensity: 0.9,
      },
    },
    optionB: {
      tmdbId: 1668,
      mediaType: 'tv',
      title: 'Friends',
      year: 1994,
      descriptor: 'Classic feel-good sitcom',
      vectorPosition: {
        comedy: 1.0, romance: 1.0,
        tone: 0.9, pacing: 0.3, era: -0.2, popularity: 0.9, intensity: -0.7,
      },
    },
  },
  {
    id: 'adaptive-2',
    phase: 'adaptive',
    dimensionsTested: ['romance', 'scifi', 'era', 'tone'],
    optionA: {
      tmdbId: 597,
      mediaType: 'movie',
      title: 'Titanic',
      year: 1997,
      descriptor: 'Sweeping romantic disaster epic',
      vectorPosition: {
        romance: 1.0, drama: 1.0,
        tone: -0.1, pacing: 0.1, era: -0.3, popularity: 0.9, intensity: 0.6,
      },
    },
    optionB: {
      tmdbId: 603,
      mediaType: 'movie',
      title: 'The Matrix',
      year: 1999,
      descriptor: 'Revolutionary sci-fi action classic',
      vectorPosition: {
        scifi: 1.0, action: 1.0,
        tone: -0.5, pacing: 0.8, era: -0.2, popularity: 0.9, intensity: 0.8,
      },
    },
  },
  {
    id: 'adaptive-3',
    phase: 'adaptive',
    dimensionsTested: ['tone', 'intensity', 'era', 'crime', 'comedy'],
    optionA: {
      tmdbId: 60574,
      mediaType: 'tv',
      title: 'Peaky Blinders',
      year: 2013,
      descriptor: 'Stylish period gangster drama',
      vectorPosition: {
        crime: 1.0, drama: 1.0,
        tone: -0.7, pacing: 0.3, era: -0.4, popularity: 0.7, intensity: 0.7,
      },
    },
    optionB: {
      tmdbId: 97546,
      mediaType: 'tv',
      title: 'Ted Lasso',
      year: 2020,
      descriptor: 'Warm-hearted optimistic sports comedy',
      vectorPosition: {
        comedy: 1.0, drama: 1.0,
        tone: 0.9, pacing: 0.2, era: 0.8, popularity: 0.7, intensity: -0.5,
      },
    },
  },
  {
    id: 'adaptive-4',
    phase: 'adaptive',
    dimensionsTested: ['romance', 'thriller', 'tone', 'intensity'],
    optionA: {
      tmdbId: 11036,
      mediaType: 'movie',
      title: 'The Notebook',
      year: 2004,
      descriptor: 'Sweeping tearjerker love story',
      vectorPosition: {
        romance: 1.0, drama: 1.0,
        tone: 0.2, pacing: -0.4, era: 0.1, popularity: 0.8, intensity: 0.2,
      },
    },
    optionB: {
      tmdbId: 210577,
      mediaType: 'movie',
      title: 'Gone Girl',
      year: 2014,
      descriptor: 'Twisted psychological marriage thriller',
      vectorPosition: {
        thriller: 1.0, mystery: 1.0, drama: 1.0,
        tone: -0.9, pacing: 0.3, era: 0.5, popularity: 0.8, intensity: 0.8,
      },
    },
  },
  {
    id: 'adaptive-5',
    phase: 'adaptive',
    dimensionsTested: ['animation', 'horror', 'tone', 'family'],
    optionA: {
      tmdbId: 862,
      mediaType: 'movie',
      title: 'Toy Story',
      year: 1995,
      descriptor: 'Beloved animated family classic',
      vectorPosition: {
        animation: 1.0, family: 1.0, comedy: 1.0, adventure: 1.0,
        tone: 0.8, pacing: 0.3, era: -0.2, popularity: 0.9, intensity: -0.4,
      },
    },
    optionB: {
      tmdbId: 348,
      mediaType: 'movie',
      title: 'Alien',
      year: 1979,
      descriptor: 'Claustrophobic sci-fi horror landmark',
      vectorPosition: {
        horror: 1.0, scifi: 1.0, thriller: 1.0,
        tone: -0.9, pacing: 0.2, era: -0.5, popularity: 0.8, intensity: 0.9,
      },
    },
  },
  {
    id: 'adaptive-6',
    phase: 'adaptive',
    dimensionsTested: ['intensity', 'popularity', 'tone', 'comedy'],
    optionA: {
      tmdbId: 106646,
      mediaType: 'movie',
      title: 'The Wolf of Wall Street',
      year: 2013,
      descriptor: 'Excessive dark comedy crime saga',
      vectorPosition: {
        comedy: 1.0, crime: 1.0, drama: 1.0,
        tone: -0.2, pacing: 0.6, era: 0.5, popularity: 0.8, intensity: 0.7,
      },
    },
    optionB: {
      tmdbId: 194,
      mediaType: 'movie',
      title: 'Amélie',
      year: 2001,
      descriptor: 'Whimsical romantic French charm',
      vectorPosition: {
        comedy: 1.0, romance: 1.0,
        tone: 0.8, pacing: -0.1, era: 0.0, popularity: -0.2, intensity: -0.5,
      },
    },
  },
  {
    id: 'adaptive-7',
    phase: 'adaptive',
    dimensionsTested: ['fantasy', 'comedy', 'tone', 'intensity'],
    optionA: {
      tmdbId: 1399,
      mediaType: 'tv',
      title: 'Game of Thrones',
      year: 2011,
      descriptor: 'Brutal epic fantasy political drama',
      vectorPosition: {
        fantasy: 1.0, drama: 1.0, action: 1.0, adventure: 1.0,
        tone: -0.8, pacing: 0.4, era: 0.4, popularity: 0.9, intensity: 0.9,
      },
    },
    optionB: {
      tmdbId: 2316,
      mediaType: 'tv',
      title: 'The Office',
      year: 2005,
      descriptor: 'Awkward workplace mockumentary comedy',
      vectorPosition: {
        comedy: 1.0,
        tone: 0.7, pacing: 0.1, era: 0.2, popularity: 0.8, intensity: -0.6,
      },
    },
  },
  {
    id: 'adaptive-8',
    phase: 'adaptive',
    dimensionsTested: ['scifi', 'musical', 'tone', 'pacing'],
    optionA: {
      tmdbId: 157336,
      mediaType: 'movie',
      title: 'Interstellar',
      year: 2014,
      descriptor: 'Emotional epic space exploration',
      vectorPosition: {
        scifi: 1.0, drama: 1.0, adventure: 1.0,
        tone: -0.3, pacing: 0.1, era: 0.5, popularity: 0.9, intensity: 0.7,
      },
    },
    optionB: {
      tmdbId: 313369,
      mediaType: 'movie',
      title: 'La La Land',
      year: 2016,
      descriptor: 'Dreamy romantic musical drama',
      vectorPosition: {
        musical: 1.0, romance: 1.0, drama: 1.0, comedy: 1.0,
        tone: 0.4, pacing: 0.0, era: 0.7, popularity: 0.8, intensity: -0.2,
      },
    },
  },
  {
    id: 'adaptive-9',
    phase: 'adaptive',
    dimensionsTested: ['thriller', 'family', 'tone', 'popularity'],
    optionA: {
      tmdbId: 496243,
      mediaType: 'movie',
      title: 'Parasite',
      year: 2019,
      descriptor: 'Sharp social thriller dark comedy',
      vectorPosition: {
        thriller: 1.0, drama: 1.0, comedy: 1.0,
        tone: -0.6, pacing: 0.4, era: 0.8, popularity: 0.5, intensity: 0.7,
      },
    },
    optionB: {
      tmdbId: 346648,
      mediaType: 'movie',
      title: 'Paddington 2',
      year: 2017,
      descriptor: 'Charming wholesome family adventure',
      vectorPosition: {
        family: 1.0, comedy: 1.0, adventure: 1.0, animation: 1.0,
        tone: 0.9, pacing: 0.2, era: 0.7, popularity: 0.6, intensity: -0.6,
      },
    },
  },
  {
    id: 'adaptive-10',
    phase: 'adaptive',
    dimensionsTested: ['scifi', 'reality', 'tone', 'intensity'],
    optionA: {
      tmdbId: 42009,
      mediaType: 'tv',
      title: 'Black Mirror',
      year: 2011,
      descriptor: 'Disturbing technology dystopia anthology',
      vectorPosition: {
        scifi: 1.0, thriller: 1.0, drama: 1.0,
        tone: -0.9, pacing: 0.2, era: 0.5, popularity: 0.7, intensity: 0.8,
      },
    },
    optionB: {
      tmdbId: 67136,
      mediaType: 'tv',
      title: 'Queer Eye',
      year: 2018,
      descriptor: 'Uplifting feel-good lifestyle makeover',
      vectorPosition: {
        reality: 1.0,
        tone: 0.9, pacing: 0.1, era: 0.8, popularity: 0.6, intensity: -0.6,
      },
    },
  },
  // ── Psychological vs action thriller ─────────────────────────────
  {
    id: 'adaptive-11',
    phase: 'adaptive',
    dimensionsTested: ['thriller', 'action', 'pacing', 'intensity'],
    optionA: {
      tmdbId: 745,
      mediaType: 'movie',
      title: 'The Sixth Sense',
      year: 1999,
      descriptor: 'Creepy slow-burn psychological thriller',
      vectorPosition: {
        thriller: 1.0, mystery: 1.0, drama: 1.0,
        tone: -0.6, pacing: -0.4, era: -0.2, popularity: 0.8, intensity: 0.4,
      },
    },
    optionB: {
      tmdbId: 245891,
      mediaType: 'movie',
      title: 'John Wick',
      year: 2014,
      descriptor: 'Relentless stylish action revenge thriller',
      vectorPosition: {
        action: 1.0, thriller: 1.0, crime: 1.0,
        tone: -0.5, pacing: 0.9, era: 0.5, popularity: 0.8, intensity: 1.0,
      },
    },
  },
  // ── Romcom vs period romance ─────────────────────────────────────
  {
    id: 'adaptive-12',
    phase: 'adaptive',
    dimensionsTested: ['romance', 'comedy', 'tone', 'era', 'pacing'],
    optionA: {
      tmdbId: 70160,
      mediaType: 'movie',
      title: 'Bridesmaids',
      year: 2011,
      descriptor: 'Hilarious raunchy comedy with heart',
      vectorPosition: {
        comedy: 1.0, romance: 1.0,
        tone: 0.7, pacing: 0.5, era: 0.4, popularity: 0.7, intensity: -0.1,
      },
    },
    optionB: {
      tmdbId: 17473,
      mediaType: 'movie',
      title: 'Jane Eyre',
      year: 2011,
      descriptor: 'Atmospheric Gothic period romance',
      vectorPosition: {
        romance: 1.0, drama: 1.0,
        tone: -0.3, pacing: -0.6, era: -0.8, popularity: 0.3, intensity: 0.1,
      },
    },
  },
  // ── Era refinement: classic vs modern ────────────────────────────
  {
    id: 'adaptive-13',
    phase: 'adaptive',
    dimensionsTested: ['era', 'drama', 'tone', 'popularity'],
    optionA: {
      tmdbId: 389,
      mediaType: 'movie',
      title: '12 Angry Men',
      year: 1957,
      descriptor: 'Riveting classic courtroom drama',
      vectorPosition: {
        drama: 1.0, crime: 1.0,
        tone: -0.3, pacing: 0.1, era: -0.9, popularity: 0.6, intensity: 0.3,
      },
    },
    optionB: {
      tmdbId: 466420,
      mediaType: 'movie',
      title: 'Killers of the Flower Moon',
      year: 2023,
      descriptor: 'Sprawling modern crime epic',
      vectorPosition: {
        crime: 1.0, drama: 1.0, history: 1.0, thriller: 1.0,
        tone: -0.6, pacing: -0.3, era: 0.9, popularity: 0.7, intensity: 0.5,
      },
    },
  },
  // ── Adventure scope: grounded vs epic ────────────────────────────
  {
    id: 'adaptive-14',
    phase: 'adaptive',
    dimensionsTested: ['adventure', 'action', 'intensity', 'popularity'],
    optionA: {
      tmdbId: 361743,
      mediaType: 'movie',
      title: 'Top Gun: Maverick',
      year: 2022,
      descriptor: 'High-octane blockbuster action spectacle',
      vectorPosition: {
        action: 1.0, adventure: 1.0, drama: 1.0,
        tone: 0.1, pacing: 0.9, era: 0.9, popularity: 0.9, intensity: 0.8,
      },
    },
    optionB: {
      tmdbId: 8587,
      mediaType: 'movie',
      title: 'The Lion King',
      year: 1994,
      descriptor: 'Beloved animated coming-of-age fable',
      vectorPosition: {
        animation: 1.0, family: 1.0, drama: 1.0, adventure: 1.0, musical: 1.0,
        tone: 0.3, pacing: 0.2, era: -0.2, popularity: 0.9, intensity: 0.1,
      },
    },
  },
  // ── Comedy subtype: dark comedy vs slapstick ─────────────────────
  {
    id: 'adaptive-15',
    phase: 'adaptive',
    dimensionsTested: ['comedy', 'tone', 'intensity', 'pacing'],
    optionA: {
      tmdbId: 153,
      mediaType: 'movie',
      title: 'Lost in Translation',
      year: 2003,
      descriptor: 'Quiet melancholic comedy-drama',
      vectorPosition: {
        comedy: 1.0, drama: 1.0, romance: 1.0,
        tone: -0.1, pacing: -0.7, era: 0.1, popularity: 0.3, intensity: -0.6,
      },
    },
    optionB: {
      tmdbId: 950,
      mediaType: 'movie',
      title: 'Ice Age',
      year: 2002,
      descriptor: 'Fun animated slapstick adventure',
      vectorPosition: {
        animation: 1.0, comedy: 1.0, family: 1.0, adventure: 1.0,
        tone: 0.8, pacing: 0.4, era: 0.0, popularity: 0.8, intensity: -0.3,
      },
    },
  },
  // ── TV drama subtype: prestige slow-burn vs bingeable thriller ──
  {
    id: 'adaptive-16',
    phase: 'adaptive',
    dimensionsTested: ['drama', 'thriller', 'pacing', 'intensity', 'tone'],
    optionA: {
      tmdbId: 44217,
      mediaType: 'tv',
      title: 'Vikings',
      year: 2013,
      descriptor: 'Brutal historical action drama',
      vectorPosition: {
        drama: 1.0, action: 1.0, history: 1.0, war: 1.0, adventure: 1.0,
        tone: -0.7, pacing: 0.4, era: -0.5, popularity: 0.7, intensity: 0.8,
      },
    },
    optionB: {
      tmdbId: 1418,
      mediaType: 'tv',
      title: 'The Big Bang Theory',
      year: 2007,
      descriptor: 'Nerdy lighthearted sitcom',
      vectorPosition: {
        comedy: 1.0,
        tone: 0.7, pacing: 0.2, era: 0.3, popularity: 0.9, intensity: -0.6,
      },
    },
  },
  // ── Indie vs mainstream ──────────────────────────────────────────
  {
    id: 'adaptive-17',
    phase: 'adaptive',
    dimensionsTested: ['popularity', 'tone', 'drama', 'pacing'],
    optionA: {
      tmdbId: 68726,
      mediaType: 'movie',
      title: 'Pacific Rim',
      year: 2013,
      descriptor: 'Giant robot blockbuster spectacle',
      vectorPosition: {
        action: 1.0, scifi: 1.0, adventure: 1.0,
        tone: 0.1, pacing: 0.8, era: 0.5, popularity: 0.8, intensity: 0.7,
      },
    },
    optionB: {
      tmdbId: 9292,
      mediaType: 'movie',
      title: 'In the Mood for Love',
      year: 2000,
      descriptor: 'Exquisite restrained romantic drama',
      vectorPosition: {
        romance: 1.0, drama: 1.0,
        tone: -0.1, pacing: -0.8, era: 0.0, popularity: -0.5, intensity: -0.5,
      },
    },
  },
  // ── Mystery subtype: cosy vs dark ────────────────────────────────
  {
    id: 'adaptive-18',
    phase: 'adaptive',
    dimensionsTested: ['mystery', 'crime', 'tone', 'intensity'],
    optionA: {
      tmdbId: 37165,
      mediaType: 'movie',
      title: 'The Truman Show',
      year: 1998,
      descriptor: 'Thought-provoking satirical comedy-drama',
      vectorPosition: {
        comedy: 1.0, drama: 1.0, scifi: 1.0,
        tone: 0.1, pacing: 0.0, era: -0.2, popularity: 0.7, intensity: 0.1,
      },
    },
    optionB: {
      tmdbId: 680,
      mediaType: 'movie',
      title: 'Pulp Fiction',
      year: 1994,
      descriptor: 'Stylish non-linear crime anthology',
      vectorPosition: {
        crime: 1.0, thriller: 1.0, comedy: 1.0,
        tone: -0.5, pacing: 0.4, era: -0.2, popularity: 0.9, intensity: 0.7,
      },
    },
  },
  // ── Sci-fi subtype: cerebral vs action ───────────────────────────
  {
    id: 'adaptive-19',
    phase: 'adaptive',
    dimensionsTested: ['scifi', 'action', 'pacing', 'intensity'],
    optionA: {
      tmdbId: 335984,
      mediaType: 'movie',
      title: 'Blade Runner 2049',
      year: 2017,
      descriptor: 'Atmospheric philosophical sci-fi noir',
      vectorPosition: {
        scifi: 1.0, drama: 1.0, mystery: 1.0, thriller: 1.0,
        tone: -0.7, pacing: -0.5, era: 0.7, popularity: 0.5, intensity: 0.3,
      },
    },
    optionB: {
      tmdbId: 11,
      mediaType: 'movie',
      title: 'Star Wars: A New Hope',
      year: 1977,
      descriptor: 'Iconic space opera adventure',
      vectorPosition: {
        scifi: 1.0, action: 1.0, adventure: 1.0, fantasy: 1.0,
        tone: 0.3, pacing: 0.6, era: -0.5, popularity: 0.9, intensity: 0.5,
      },
    },
  },
  // ── Horror subtype: supernatural vs slasher ──────────────────────
  {
    id: 'adaptive-20',
    phase: 'adaptive',
    dimensionsTested: ['horror', 'thriller', 'tone', 'pacing'],
    optionA: {
      tmdbId: 493922,
      mediaType: 'movie',
      title: 'Hereditary',
      year: 2018,
      descriptor: 'Unsettling slow-burn psychological horror',
      vectorPosition: {
        horror: 1.0, thriller: 1.0, mystery: 1.0,
        tone: -1.0, pacing: -0.3, era: 0.7, popularity: 0.4, intensity: 0.9,
      },
    },
    optionB: {
      tmdbId: 4232,
      mediaType: 'movie',
      title: 'Scream',
      year: 1996,
      descriptor: 'Self-aware witty slasher horror',
      vectorPosition: {
        horror: 1.0, mystery: 1.0, thriller: 1.0,
        tone: -0.3, pacing: 0.6, era: -0.2, popularity: 0.8, intensity: 0.6,
      },
    },
  },
  // ── TV prestige: limited series vs long-running ──────────────────
  {
    id: 'adaptive-21',
    phase: 'adaptive',
    dimensionsTested: ['drama', 'pacing', 'era', 'tone'],
    optionA: {
      tmdbId: 100088,
      mediaType: 'tv',
      title: 'The Last of Us',
      year: 2023,
      descriptor: 'Emotional post-apocalyptic survival drama',
      vectorPosition: {
        drama: 1.0, action: 1.0, scifi: 1.0, adventure: 1.0,
        tone: -0.7, pacing: 0.3, era: 0.9, popularity: 0.9, intensity: 0.8,
      },
    },
    optionB: {
      tmdbId: 1405,
      mediaType: 'tv',
      title: 'Downton Abbey',
      year: 2010,
      descriptor: 'Elegant British period ensemble drama',
      vectorPosition: {
        drama: 1.0, romance: 1.0, history: 1.0,
        tone: 0.1, pacing: -0.6, era: -0.5, popularity: 0.7, intensity: -0.3,
      },
    },
  },
  // ── Documentary subtype: nature vs social ────────────────────────
  {
    id: 'adaptive-22',
    phase: 'adaptive',
    dimensionsTested: ['documentary', 'tone', 'intensity', 'pacing'],
    optionA: {
      tmdbId: 84360,
      mediaType: 'tv',
      title: 'Our Planet',
      year: 2019,
      descriptor: 'Stunning nature conservation documentary',
      vectorPosition: {
        documentary: 1.0,
        tone: 0.3, pacing: -0.5, era: 0.8, popularity: 0.7, intensity: 0.0,
      },
    },
    optionB: {
      tmdbId: 549,
      mediaType: 'movie',
      title: 'Bowling for Columbine',
      year: 2002,
      descriptor: 'Provocative social issue documentary',
      vectorPosition: {
        documentary: 1.0,
        tone: -0.6, pacing: 0.1, era: 0.0, popularity: 0.4, intensity: 0.5,
      },
    },
  },
  // ── Cross-dimensional: drama + action balance ────────────────────
  {
    id: 'adaptive-23',
    phase: 'adaptive',
    dimensionsTested: ['action', 'drama', 'pacing', 'tone', 'intensity'],
    optionA: {
      tmdbId: 550,
      mediaType: 'movie',
      title: 'Fight Club',
      year: 1999,
      descriptor: 'Anarchic twist-driven psychological thriller',
      vectorPosition: {
        drama: 1.0, thriller: 1.0,
        tone: -0.8, pacing: 0.5, era: -0.2, popularity: 0.8, intensity: 0.8,
      },
    },
    optionB: {
      tmdbId: 508442,
      mediaType: 'movie',
      title: 'Soul',
      year: 2020,
      descriptor: 'Existential animated musical journey',
      vectorPosition: {
        animation: 1.0, family: 1.0, comedy: 1.0, fantasy: 1.0, musical: 1.0,
        tone: 0.6, pacing: -0.1, era: 0.8, popularity: 0.7, intensity: -0.3,
      },
    },
  },
  // ── K-drama / international probe ────────────────────────────────
  {
    id: 'adaptive-24',
    phase: 'adaptive',
    dimensionsTested: ['thriller', 'drama', 'tone', 'popularity', 'intensity'],
    optionA: {
      tmdbId: 93405,
      mediaType: 'tv',
      title: 'Squid Game',
      year: 2021,
      descriptor: 'Brutal survival thriller sensation',
      vectorPosition: {
        thriller: 1.0, drama: 1.0, action: 1.0, mystery: 1.0,
        tone: -0.8, pacing: 0.7, era: 0.8, popularity: 0.9, intensity: 1.0,
      },
    },
    optionB: {
      tmdbId: 72879,
      mediaType: 'tv',
      title: 'Schitt\'s Creek',
      year: 2015,
      descriptor: 'Heartwarming quirky family comedy',
      vectorPosition: {
        comedy: 1.0,
        tone: 0.8, pacing: 0.1, era: 0.6, popularity: 0.5, intensity: -0.6,
      },
    },
  },
  // ── Crime subtype: heist vs detective ────────────────────────────
  {
    id: 'adaptive-25',
    phase: 'adaptive',
    dimensionsTested: ['crime', 'mystery', 'pacing', 'tone'],
    optionA: {
      tmdbId: 161,
      mediaType: 'movie',
      title: "Ocean's Eleven",
      year: 2001,
      descriptor: 'Slick stylish ensemble heist caper',
      vectorPosition: {
        crime: 1.0, thriller: 1.0, comedy: 1.0,
        tone: 0.4, pacing: 0.6, era: 0.0, popularity: 0.8, intensity: 0.2,
      },
    },
    optionB: {
      tmdbId: 194662,
      mediaType: 'movie',
      title: 'Zodiac',
      year: 2007,
      descriptor: 'Obsessive methodical serial killer investigation',
      vectorPosition: {
        crime: 1.0, mystery: 1.0, thriller: 1.0, drama: 1.0,
        tone: -0.7, pacing: -0.4, era: 0.2, popularity: 0.5, intensity: 0.5,
      },
    },
  },
];

// ── Genres covered by fixed pairs ────────────────────────────────
// Used to determine which user genres still need probing.

const FIXED_PAIR_GENRES = new Set<string>([
  'action', 'scifi', 'thriller', 'horror', 'romance', 'drama', 'musical', 'history',
]);

// ── Selection Functions ──────────────────────────────────────────

/**
 * Returns the 3 fixed pairs shown to every user.
 */
export function getFixedPairs(): QuizPair[] {
  return [...FIXED_PAIRS];
}

/**
 * Select 2 genre-responsive pairs based on user's genre picks.
 *
 * Strategy:
 * 1. Convert display genre names to keys (e.g. "Sci-Fi" -> "scifi")
 * 2. Find user genres NOT already covered by fixed pairs
 * 3. Match uncovered genres to pool via triggerGenres
 * 4. Pick 2 pairs with best coverage and no title overlap
 * 5. If all user genres are covered, pick within-genre subtype pairs
 */
export function selectGenreResponsivePairs(
  userGenres: string[],
  fixedPairIds: string[]
): QuizPair[] {
  const userGenreKeys = userGenres.map((g) => genreNameToKey(g));
  const fixedIds = new Set(fixedPairIds);

  // Find user genres not covered by the fixed pairs
  const uncoveredGenres = userGenreKeys.filter((g) => !FIXED_PAIR_GENRES.has(g));

  // Collect all TMDb IDs from fixed pairs to avoid title repeats
  const usedTmdbIds = new Set<number>();
  for (const pair of FIXED_PAIRS) {
    if (fixedIds.has(pair.id)) {
      usedTmdbIds.add(pair.optionA.tmdbId);
      usedTmdbIds.add(pair.optionB.tmdbId);
    }
  }

  // Score each genre-responsive pair by how many uncovered genres it triggers
  const scoredPairs = GENRE_RESPONSIVE_POOL.map((pair) => {
    const triggers = pair.triggerGenres || [];
    let score = 0;
    for (const trigger of triggers) {
      if (uncoveredGenres.includes(trigger)) {
        score += 2; // Strong match: user picked this genre and it's uncovered
      } else if (userGenreKeys.includes(trigger)) {
        score += 1; // Weaker match: user picked it but fixed pairs already cover it
      }
    }
    return { pair, score };
  });

  // Sort by score descending
  scoredPairs.sort((a, b) => b.score - a.score);

  // Pick top pairs avoiding title overlap
  const selected: QuizPair[] = [];
  const selectedTmdbIds = new Set(usedTmdbIds);

  for (const { pair } of scoredPairs) {
    if (selected.length >= 2) break;

    const aId = pair.optionA.tmdbId;
    const bId = pair.optionB.tmdbId;

    // Skip if either title was already used
    if (selectedTmdbIds.has(aId) || selectedTmdbIds.has(bId)) continue;

    selected.push(pair);
    selectedTmdbIds.add(aId);
    selectedTmdbIds.add(bId);
  }

  // If we couldn't find 2 (all genres covered), fall back to highest-scored
  // available pairs even if the genres are already covered
  if (selected.length < 2) {
    for (const { pair } of scoredPairs) {
      if (selected.length >= 2) break;
      if (selected.some((s) => s.id === pair.id)) continue;

      const aId = pair.optionA.tmdbId;
      const bId = pair.optionB.tmdbId;
      if (selectedTmdbIds.has(aId) || selectedTmdbIds.has(bId)) continue;

      selected.push(pair);
      selectedTmdbIds.add(aId);
      selectedTmdbIds.add(bId);
    }
  }

  // Last resort: take any available pair
  if (selected.length < 2) {
    for (const pair of GENRE_RESPONSIVE_POOL) {
      if (selected.length >= 2) break;
      if (selected.some((s) => s.id === pair.id)) continue;

      const aId = pair.optionA.tmdbId;
      const bId = pair.optionB.tmdbId;
      if (selectedTmdbIds.has(aId) || selectedTmdbIds.has(bId)) continue;

      selected.push(pair);
      selectedTmdbIds.add(aId);
      selectedTmdbIds.add(bId);
    }
  }

  return selected;
}

/**
 * Select adaptive pairs to resolve the most ambiguous dimensions.
 *
 * Strategy:
 * 1. Identify 2-3 most ambiguous dimensions:
 *    - Genre dims: closest to 0.5 (most uncertain)
 *    - Meta dims: closest to 0.0 (most neutral/undecided)
 * 2. Score each adaptive pair by coverage of ambiguous dimensions
 * 3. Pick top `count` pairs with no title overlap with previously used pairs
 */
export function selectAdaptivePairs(
  interimVector: TasteVector,
  usedPairIds: Set<string>,
  count = 5
): QuizPair[] {
  // ── Step 1: Find most ambiguous dimensions ──

  // Genre dimensions: ambiguity = closeness to 0.5
  const genreAmbiguity = GENRE_DIMENSIONS.map((dim) => ({
    dim: dim as string,
    ambiguity: 1.0 - Math.abs(interimVector[dim] - 0.5) * 2, // 1.0 = most ambiguous (at 0.5)
  }));

  // Meta dimensions: ambiguity = closeness to 0.0
  const metaAmbiguity = META_DIMENSIONS.map((dim) => ({
    dim: dim as string,
    ambiguity: 1.0 - Math.abs(interimVector[dim]), // 1.0 = most ambiguous (at 0.0)
  }));

  // Combine and sort by ambiguity descending
  const allAmbiguity = [...genreAmbiguity, ...metaAmbiguity];
  allAmbiguity.sort((a, b) => b.ambiguity - a.ambiguity);

  // Take top 3 most ambiguous dimensions (minimum 2)
  const ambiguousCount = Math.min(3, allAmbiguity.length);
  const ambiguousDims = new Set(
    allAmbiguity.slice(0, ambiguousCount).map((a) => a.dim)
  );

  // Also include dimensions with ambiguity > 0.7 (very uncertain)
  for (const entry of allAmbiguity) {
    if (entry.ambiguity > 0.7) {
      ambiguousDims.add(entry.dim);
    }
    if (ambiguousDims.size >= 6) break; // Cap at 6 to keep focused
  }

  // ── Step 2: Collect all TMDb IDs from used pairs ──

  const usedTmdbIds = new Set<number>();
  const allPools = [...FIXED_PAIRS, ...GENRE_RESPONSIVE_POOL, ...ADAPTIVE_POOL];
  for (const pair of allPools) {
    if (usedPairIds.has(pair.id)) {
      usedTmdbIds.add(pair.optionA.tmdbId);
      usedTmdbIds.add(pair.optionB.tmdbId);
    }
  }

  // ── Step 3: Score each adaptive pair ──

  const scoredPairs = ADAPTIVE_POOL
    .filter((pair) => !usedPairIds.has(pair.id))
    .map((pair) => {
      let score = 0;
      for (const dim of pair.dimensionsTested) {
        if (ambiguousDims.has(dim)) {
          score += 2; // Directly resolves an ambiguous dimension
        }
      }

      // Bonus: pairs that test more dimensions get a small boost
      score += pair.dimensionsTested.length * 0.1;

      // Bonus: prefer pairs where option A and B have large spread on
      // ambiguous dimensions (they resolve ambiguity more effectively)
      for (const dim of pair.dimensionsTested) {
        if (ambiguousDims.has(dim)) {
          const aVal = pair.optionA.vectorPosition[dim as keyof TasteVector];
          const bVal = pair.optionB.vectorPosition[dim as keyof TasteVector];
          if (aVal !== undefined && bVal !== undefined) {
            score += Math.abs(aVal - bVal) * 0.5; // Wider spread = better signal
          }
        }
      }

      return { pair, score };
    });

  // Sort by score descending
  scoredPairs.sort((a, b) => b.score - a.score);

  // ── Step 4: Pick top pairs avoiding title overlap ──

  const selected: QuizPair[] = [];
  const selectedTmdbIds = new Set(usedTmdbIds);

  for (const { pair } of scoredPairs) {
    if (selected.length >= count) break;

    const aId = pair.optionA.tmdbId;
    const bId = pair.optionB.tmdbId;

    // Skip if either title was already used
    if (selectedTmdbIds.has(aId) || selectedTmdbIds.has(bId)) continue;

    selected.push(pair);
    selectedTmdbIds.add(aId);
    selectedTmdbIds.add(bId);
  }

  // If we couldn't fill the count, relax title overlap constraint
  if (selected.length < count) {
    for (const { pair } of scoredPairs) {
      if (selected.length >= count) break;
      if (selected.some((s) => s.id === pair.id)) continue;

      selected.push(pair);
    }
  }

  return selected;
}

// ── Exports for testing / direct access ──────────────────────────

export { FIXED_PAIRS, GENRE_RESPONSIVE_POOL, ADAPTIVE_POOL, FIXED_PAIR_GENRES };
