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
 * Each pair presents two titles. The user can pick A, B, Both, or Neither.
 * The preference signal is used to refine the user's TasteVector.
 */

import {
  type TasteVector,
  createEmptyVector,
  GENRE_DIMENSIONS,
  META_DIMENSIONS,
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
  triggerClusterIds?: string[];
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
        action: 0.8, crime: 0.5, drama: 0.4, thriller: 0.7,
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
        comedy: 0.6, musical: 0.8, romance: 0.5,
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
        action: 0.5, scifi: 0.8, thriller: 0.7, adventure: 0.4,
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
        romance: 0.8, drama: 0.7,
        tone: 0.3, pacing: -0.6, era: -0.7, popularity: 0.5, intensity: -0.4,
      },
    },
  },
  {
    id: 'fixed-3',
    phase: 'fixed',
    dimensionsTested: ['scifi', 'horror', 'history', 'drama', 'pacing', 'era'],
    optionA: {
      tmdbId: 66732,
      mediaType: 'tv',
      title: 'Stranger Things',
      year: 2016,
      descriptor: 'Supernatural sci-fi horror series',
      vectorPosition: {
        scifi: 0.7, horror: 0.7, drama: 0.5, mystery: 0.5,
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
        drama: 0.7, history: 0.8,
        tone: -0.1, pacing: -0.7, era: -0.6, popularity: 0.7, intensity: -0.3,
      },
    },
  },
];

// ── Genre-Responsive Pool (13 pairs) ────────────────────────────
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
        animation: 0.8, action: 0.6, adventure: 0.5, scifi: 0.3,
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
        animation: 0.8, fantasy: 0.7, adventure: 0.5,
        tone: 0.2, pacing: -0.3, era: 0.0, popularity: 0.6, intensity: -0.1,
      },
    },
  },
  {
    id: 'genre-anime',
    phase: 'genre-responsive',
    triggerGenres: ['animation'],
    dimensionsTested: ['animation', 'action', 'tone', 'intensity'],
    optionA: {
      tmdbId: 1429,
      mediaType: 'tv',
      title: 'Attack on Titan',
      year: 2013,
      descriptor: 'Brutal dark fantasy anime action',
      vectorPosition: {
        animation: 0.8, action: 0.7, drama: 0.5, fantasy: 0.6,
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
        animation: 0.8, fantasy: 0.7,
        tone: 0.9, pacing: -0.5, era: -0.3, popularity: 0.6, intensity: -0.8,
      },
    },
  },
  {
    id: 'genre-documentary',
    phase: 'genre-responsive',
    triggerGenres: ['documentary'],
    dimensionsTested: ['documentary', 'tone', 'pacing'],
    optionA: {
      tmdbId: 68595,
      mediaType: 'tv',
      title: 'Planet Earth II',
      year: 2016,
      descriptor: 'Breathtaking nature documentary',
      vectorPosition: {
        documentary: 0.8,
        tone: 0.4, pacing: -0.4, era: 0.6, popularity: 0.8, intensity: 0.1,
      },
    },
    optionB: {
      tmdbId: 64439,
      mediaType: 'tv',
      title: 'Making a Murderer',
      year: 2015,
      descriptor: 'Gripping true crime documentary',
      vectorPosition: {
        documentary: 0.8, crime: 0.5,
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
      tmdbId: 23827,
      mediaType: 'movie',
      title: 'Paranormal Activity',
      year: 2007,
      descriptor: 'Low-budget found-footage supernatural horror',
      vectorPosition: {
        horror: 0.8, thriller: 0.5, mystery: 0.3,
        tone: -0.8, pacing: -0.3, era: 0.3, popularity: 0.7, intensity: 0.9,
      },
    },
    optionB: {
      tmdbId: 120467,
      mediaType: 'movie',
      title: 'The Grand Budapest Hotel',
      year: 2014,
      descriptor: 'Whimsical quirky comedy caper',
      vectorPosition: {
        comedy: 0.7, drama: 0.5, adventure: 0.4, crime: 0.4,
        tone: 0.5, pacing: 0.3, era: 0.4, popularity: 0.5, intensity: -0.3,
      },
    },
  },
  {
    id: 'genre-comedy-drama',
    phase: 'genre-responsive',
    triggerGenres: ['comedy', 'drama'],
    dimensionsTested: ['drama', 'comedy', 'tone', 'pacing'],
    optionA: {
      tmdbId: 278,
      mediaType: 'movie',
      title: 'The Shawshank Redemption',
      year: 1994,
      descriptor: 'Powerful prison drama about hope',
      vectorPosition: {
        drama: 0.8, crime: 0.5,
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
        comedy: 0.8,
        tone: 0.8, pacing: 0.6, era: 0.3, popularity: 0.7, intensity: -0.2,
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
        crime: 0.8, drama: 0.7,
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
        crime: 0.6, mystery: 0.7, comedy: 0.5, thriller: 0.4,
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
        war: 0.8, drama: 0.6, action: 0.7,
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
        drama: 0.7, history: 0.7, war: 0.4, thriller: 0.4,
        tone: -0.2, pacing: -0.3, era: 0.4, popularity: 0.7, intensity: -0.1,
      },
    },
  },
  {
    id: 'genre-fantasy',
    phase: 'genre-responsive',
    triggerGenres: ['fantasy'],
    dimensionsTested: ['fantasy', 'adventure', 'tone', 'popularity'],
    optionA: {
      tmdbId: 120,
      mediaType: 'movie',
      title: 'The Lord of the Rings: The Fellowship of the Ring',
      year: 2001,
      descriptor: 'Grand epic fantasy quest',
      vectorPosition: {
        fantasy: 0.8, adventure: 0.7, action: 0.6, drama: 0.5,
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
        fantasy: 0.8, adventure: 0.6,
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
        musical: 0.8, drama: 0.5, romance: 0.4,
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
        musical: 0.8, comedy: 0.4, crime: 0.5, drama: 0.5,
        tone: 0.0, pacing: 0.4, era: 0.0, popularity: 0.6, intensity: 0.3,
      },
    },
  },
  {
    id: 'genre-reality',
    phase: 'genre-responsive',
    triggerGenres: ['reality'],
    dimensionsTested: ['reality', 'tone', 'pacing'],
    optionA: {
      tmdbId: 87012,
      mediaType: 'tv',
      title: 'The Great British Bake Off',
      year: 2010,
      descriptor: 'Cosy wholesome baking competition',
      vectorPosition: {
        reality: 0.8,
        tone: 0.9, pacing: -0.2, era: 0.4, popularity: 0.7, intensity: -0.6,
      },
    },
    optionB: {
      tmdbId: 8514,
      mediaType: 'tv',
      title: "RuPaul's Drag Race",
      year: 2009,
      descriptor: 'Fierce glamorous performance competition',
      vectorPosition: {
        reality: 0.8,
        tone: 0.6, pacing: 0.4, era: 0.4, popularity: 0.7, intensity: 0.3,
      },
    },
  },
  {
    id: 'genre-family',
    phase: 'genre-responsive',
    triggerGenres: ['family'],
    dimensionsTested: ['family', 'animation', 'comedy', 'tone'],
    optionA: {
      tmdbId: 109445,
      mediaType: 'movie',
      title: 'Frozen',
      year: 2013,
      descriptor: 'Magical animated musical adventure',
      vectorPosition: {
        animation: 0.8, family: 0.8, adventure: 0.5, musical: 0.6,
        tone: 0.7, pacing: 0.3, era: 0.6, popularity: 0.9, intensity: -0.2,
      },
    },
    optionB: {
      tmdbId: 771,
      mediaType: 'movie',
      title: 'Home Alone',
      year: 1990,
      descriptor: 'Slapstick family comedy classic',
      vectorPosition: {
        comedy: 0.8, family: 0.7,
        tone: 0.8, pacing: 0.5, era: -0.3, popularity: 0.9, intensity: -0.3,
      },
    },
  },
  {
    id: 'genre-western',
    phase: 'genre-responsive',
    triggerGenres: ['western'],
    dimensionsTested: ['western', 'action', 'drama', 'tone'],
    optionA: {
      tmdbId: 68718,
      mediaType: 'movie',
      title: 'Django Unchained',
      year: 2012,
      descriptor: 'Stylish violent revenge western',
      vectorPosition: {
        western: 0.8, action: 0.7, drama: 0.6,
        tone: -0.6, pacing: 0.3, era: 0.5, popularity: 0.8, intensity: 0.9,
      },
    },
    optionB: {
      tmdbId: 44264,
      mediaType: 'movie',
      title: 'True Grit',
      year: 2010,
      descriptor: 'Gritty frontier justice adventure',
      vectorPosition: {
        western: 0.8, adventure: 0.6, drama: 0.6,
        tone: -0.3, pacing: 0.0, era: 0.4, popularity: 0.7, intensity: 0.5,
      },
    },
  },
  {
    id: 'genre-cult-indie',
    phase: 'genre-responsive',
    triggerClusterIds: ['cult-indie'],
    dimensionsTested: ['romance', 'crime', 'tone', 'popularity'],
    optionA: {
      tmdbId: 194,
      mediaType: 'movie',
      title: 'Amélie',
      year: 2001,
      descriptor: 'Whimsical arthouse romantic charm',
      vectorPosition: {
        comedy: 0.6, romance: 0.7,
        tone: 0.8, pacing: -0.1, era: 0.0, popularity: -0.2, intensity: -0.5,
      },
    },
    optionB: {
      tmdbId: 115,
      mediaType: 'movie',
      title: 'The Big Lebowski',
      year: 1998,
      descriptor: 'Shaggy cult comedy classic',
      vectorPosition: {
        comedy: 0.8, crime: 0.4,
        tone: 0.3, pacing: -0.1, era: -0.2, popularity: 0.3, intensity: -0.2,
      },
    },
  },
];

// ── Adaptive Pool (32 pairs) ────────────────────────────────────
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
        crime: 0.7, drama: 0.6, thriller: 0.7,
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
        comedy: 0.8, romance: 0.4,
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
        romance: 0.8, drama: 0.6,
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
        scifi: 0.8, action: 0.7,
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
        crime: 0.7, drama: 0.6,
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
        comedy: 0.7, drama: 0.5,
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
        romance: 0.8, drama: 0.6,
        tone: 0.2, pacing: -0.4, era: 0.1, popularity: 0.8, intensity: 0.2,
      },
    },
    optionB: {
      tmdbId: 807,
      mediaType: 'movie',
      title: 'Se7en',
      year: 1995,
      descriptor: 'Disturbing serial-killer psychological thriller',
      vectorPosition: {
        thriller: 0.8, mystery: 0.6, crime: 0.6, drama: 0.5,
        tone: -0.9, pacing: 0.3, era: -0.2, popularity: 0.8, intensity: 0.9,
      },
    },
  },
  {
    id: 'adaptive-5',
    phase: 'adaptive',
    dimensionsTested: ['western', 'crime', 'tone', 'mystery'],
    optionA: {
      tmdbId: 73586,
      mediaType: 'tv',
      title: 'Yellowstone',
      year: 2018,
      descriptor: 'Gritty modern western family power drama',
      vectorPosition: {
        western: 0.8, drama: 0.7, crime: 0.4,
        tone: -0.5, pacing: 0.2, era: 0.7, popularity: 0.8, intensity: 0.6,
      },
    },
    optionB: {
      tmdbId: 43982,
      mediaType: 'tv',
      title: 'Line of Duty',
      year: 2012,
      descriptor: 'Tense British police corruption thriller',
      vectorPosition: {
        crime: 0.8, mystery: 0.7, thriller: 0.6, drama: 0.5,
        tone: -0.6, pacing: 0.5, era: 0.6, popularity: 0.7, intensity: 0.7,
      },
    },
  },
  {
    id: 'adaptive-6',
    phase: 'adaptive',
    dimensionsTested: ['popularity', 'tone', 'comedy', 'musical'],
    optionA: {
      tmdbId: 106646,
      mediaType: 'movie',
      title: 'The Wolf of Wall Street',
      year: 2013,
      descriptor: 'Excessive dark comedy crime saga',
      vectorPosition: {
        comedy: 0.5, crime: 0.7, drama: 0.6,
        tone: -0.2, pacing: 0.6, era: 0.5, popularity: 0.8, intensity: 0.7,
      },
    },
    optionB: {
      tmdbId: 621,
      mediaType: 'movie',
      title: 'Grease',
      year: 1978,
      descriptor: 'Iconic feel-good musical romance',
      vectorPosition: {
        comedy: 0.6, romance: 0.6, musical: 0.7,
        tone: 0.8, pacing: 0.4, era: -0.7, popularity: 0.8, intensity: -0.5,
      },
    },
  },
  {
    id: 'adaptive-7',
    phase: 'adaptive',
    dimensionsTested: ['war', 'history', 'fantasy', 'adventure'],
    optionA: {
      tmdbId: 530915,
      mediaType: 'movie',
      title: '1917',
      year: 2019,
      descriptor: 'Immersive single-shot WWI survival thriller',
      vectorPosition: {
        war: 0.9, history: 0.8, drama: 0.7, action: 0.5,
        tone: -0.8, pacing: 0.6, era: 0.7, popularity: 0.7, intensity: 0.9,
      },
    },
    optionB: {
      tmdbId: 71912,
      mediaType: 'tv',
      title: 'The Witcher',
      year: 2019,
      descriptor: 'Dark epic fantasy monster-hunting adventure',
      vectorPosition: {
        fantasy: 0.8, adventure: 0.7, action: 0.6, drama: 0.5,
        tone: -0.5, pacing: 0.5, era: -0.3, popularity: 0.8, intensity: 0.7,
      },
    },
  },
  {
    id: 'adaptive-8',
    phase: 'adaptive',
    dimensionsTested: ['reality', 'documentary', 'tone', 'pacing'],
    optionA: {
      tmdbId: 66636,
      mediaType: 'tv',
      title: 'Love Island',
      year: 2015,
      descriptor: 'Addictive reality dating competition',
      vectorPosition: {
        reality: 0.9, romance: 0.4,
        tone: 0.6, pacing: 0.3, era: 0.8, popularity: 0.8, intensity: -0.3,
      },
    },
    optionB: {
      tmdbId: 79525,
      mediaType: 'tv',
      title: 'The Last Dance',
      year: 2020,
      descriptor: 'Epic Michael Jordan basketball documentary',
      vectorPosition: {
        documentary: 0.9, drama: 0.4,
        tone: 0.2, pacing: 0.4, era: 0.6, popularity: 0.8, intensity: 0.5,
      },
    },
  },
  {
    id: 'adaptive-9',
    phase: 'adaptive',
    dimensionsTested: ['thriller', 'comedy', 'animation', 'family', 'tone', 'popularity'],
    optionA: {
      tmdbId: 496243,
      mediaType: 'movie',
      title: 'Parasite',
      year: 2019,
      descriptor: 'Sharp social thriller dark comedy',
      vectorPosition: {
        thriller: 0.7, drama: 0.6, comedy: 0.4,
        tone: -0.6, pacing: 0.4, era: 0.8, popularity: 0.5, intensity: 0.7,
      },
    },
    optionB: {
      tmdbId: 808,
      mediaType: 'movie',
      title: 'Shrek',
      year: 2001,
      descriptor: 'Irreverent animated fairy-tale comedy',
      vectorPosition: {
        animation: 0.8, comedy: 0.7, adventure: 0.5, fantasy: 0.5, family: 0.7,
        tone: 0.7, pacing: 0.4, era: 0.0, popularity: 0.9, intensity: -0.4,
      },
    },
  },
  {
    id: 'adaptive-10',
    phase: 'adaptive',
    dimensionsTested: ['scifi', 'reality', 'tone'],
    optionA: {
      tmdbId: 42009,
      mediaType: 'tv',
      title: 'Black Mirror',
      year: 2011,
      descriptor: 'Disturbing technology dystopia anthology',
      vectorPosition: {
        scifi: 0.7, thriller: 0.6, drama: 0.5,
        tone: -0.9, pacing: 0.2, era: 0.5, popularity: 0.7, intensity: 0.8,
      },
    },
    optionB: {
      tmdbId: 76922,
      mediaType: 'tv',
      title: 'Queer Eye',
      year: 2018,
      descriptor: 'Uplifting feel-good lifestyle makeover',
      vectorPosition: {
        reality: 0.8,
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
        thriller: 0.7, mystery: 0.6, drama: 0.5,
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
        action: 0.8, thriller: 0.6, crime: 0.4,
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
      tmdbId: 55721,
      mediaType: 'movie',
      title: 'Bridesmaids',
      year: 2011,
      descriptor: 'Hilarious raunchy comedy with heart',
      vectorPosition: {
        comedy: 0.8, romance: 0.4,
        tone: 0.7, pacing: 0.5, era: 0.4, popularity: 0.7, intensity: -0.1,
      },
    },
    optionB: {
      tmdbId: 38684,
      mediaType: 'movie',
      title: 'Jane Eyre',
      year: 2011,
      descriptor: 'Atmospheric Gothic period romance',
      vectorPosition: {
        romance: 0.7, drama: 0.7,
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
      tmdbId: 1398,
      mediaType: 'tv',
      title: 'The Sopranos',
      year: 1999,
      descriptor: 'Definitive crime family drama saga',
      vectorPosition: {
        crime: 0.8, drama: 0.7,
        tone: -0.7, pacing: -0.1, era: -0.3, popularity: 0.8, intensity: 0.7,
      },
    },
    optionB: {
      tmdbId: 466420,
      mediaType: 'movie',
      title: 'Killers of the Flower Moon',
      year: 2023,
      descriptor: 'Sprawling modern crime epic',
      vectorPosition: {
        crime: 0.6, drama: 0.7, history: 0.6, thriller: 0.4,
        tone: -0.6, pacing: -0.3, era: 0.9, popularity: 0.7, intensity: 0.5,
      },
    },
  },
  // ── Adventure scope: grounded vs epic ────────────────────────────
  {
    id: 'adaptive-14',
    phase: 'adaptive',
    dimensionsTested: ['adventure', 'action', 'animation', 'family', 'popularity'],
    optionA: {
      tmdbId: 361743,
      mediaType: 'movie',
      title: 'Top Gun: Maverick',
      year: 2022,
      descriptor: 'High-octane blockbuster action spectacle',
      vectorPosition: {
        action: 0.8, adventure: 0.5, drama: 0.4,
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
        animation: 0.8, drama: 0.5, adventure: 0.5, musical: 0.5, family: 0.7,
        tone: 0.3, pacing: 0.2, era: -0.2, popularity: 0.9, intensity: 0.1,
      },
    },
  },
  // ── Comedy subtype: teen vs animated ─────────────────────────────
  {
    id: 'adaptive-15',
    phase: 'adaptive',
    dimensionsTested: ['comedy', 'animation', 'family', 'tone', 'pacing'],
    optionA: {
      tmdbId: 10625,
      mediaType: 'movie',
      title: 'Mean Girls',
      year: 2004,
      descriptor: 'Iconic sharp teen comedy satire',
      vectorPosition: {
        comedy: 0.8, romance: 0.3,
        tone: 0.6, pacing: 0.5, era: 0.1, popularity: 0.8, intensity: -0.3,
      },
    },
    optionB: {
      tmdbId: 425,
      mediaType: 'movie',
      title: 'Ice Age',
      year: 2002,
      descriptor: 'Fun animated slapstick adventure',
      vectorPosition: {
        animation: 0.7, comedy: 0.6, adventure: 0.5, family: 0.6,
        tone: 0.8, pacing: 0.4, era: 0.0, popularity: 0.8, intensity: -0.3,
      },
    },
  },
  // ── TV drama subtype: historical action vs lighthearted sitcom ──
  {
    id: 'adaptive-16',
    phase: 'adaptive',
    dimensionsTested: ['drama', 'action', 'history', 'pacing', 'tone'],
    optionA: {
      tmdbId: 44217,
      mediaType: 'tv',
      title: 'Vikings',
      year: 2013,
      descriptor: 'Brutal historical action drama',
      vectorPosition: {
        drama: 0.7, action: 0.7, history: 0.7, war: 0.6, adventure: 0.5,
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
        comedy: 0.8,
        tone: 0.7, pacing: 0.2, era: 0.3, popularity: 0.9, intensity: -0.6,
      },
    },
  },
  // ── Indie vs mainstream ──────────────────────────────────────────
  {
    id: 'adaptive-17',
    phase: 'adaptive',
    dimensionsTested: ['history', 'romance', 'musical', 'tone', 'pacing', 'popularity'],
    optionA: {
      tmdbId: 98,
      mediaType: 'movie',
      title: 'Gladiator',
      year: 2000,
      descriptor: 'Epic historical action drama',
      vectorPosition: {
        action: 0.7, drama: 0.7, history: 0.7, adventure: 0.5,
        tone: -0.3, pacing: 0.4, era: -0.5, popularity: 0.9, intensity: 0.8,
      },
    },
    optionB: {
      tmdbId: 88,
      mediaType: 'movie',
      title: 'Dirty Dancing',
      year: 1987,
      descriptor: 'Feel-good romantic musical drama',
      vectorPosition: {
        romance: 0.7, drama: 0.5, musical: 0.6,
        tone: 0.6, pacing: 0.2, era: -0.5, popularity: 0.8, intensity: -0.2,
      },
    },
  },
  // ── Mystery subtype: cosy vs dark ────────────────────────────────
  {
    id: 'adaptive-18',
    phase: 'adaptive',
    dimensionsTested: ['mystery', 'crime', 'tone'],
    optionA: {
      tmdbId: 37165,
      mediaType: 'movie',
      title: 'The Truman Show',
      year: 1998,
      descriptor: 'Thought-provoking satirical comedy-drama',
      vectorPosition: {
        comedy: 0.6, drama: 0.6, scifi: 0.4,
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
        crime: 0.8, thriller: 0.5, comedy: 0.4,
        tone: -0.5, pacing: 0.4, era: -0.2, popularity: 0.9, intensity: 0.7,
      },
    },
  },
  // ── Sci-fi subtype: cerebral vs action ───────────────────────────
  {
    id: 'adaptive-19',
    phase: 'adaptive',
    dimensionsTested: ['scifi', 'action', 'adventure', 'pacing', 'popularity'],
    optionA: {
      tmdbId: 19995,
      mediaType: 'movie',
      title: 'Avatar',
      year: 2009,
      descriptor: 'Visually stunning sci-fi blockbuster spectacle',
      vectorPosition: {
        scifi: 0.7, action: 0.7, adventure: 0.7,
        tone: 0.1, pacing: 0.5, era: 0.5, popularity: 0.9, intensity: 0.6,
      },
    },
    optionB: {
      tmdbId: 11,
      mediaType: 'movie',
      title: 'Star Wars: A New Hope',
      year: 1977,
      descriptor: 'Iconic space opera adventure',
      vectorPosition: {
        scifi: 0.7, action: 0.7, adventure: 0.7, fantasy: 0.5,
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
      tmdbId: 346364,
      mediaType: 'movie',
      title: 'IT',
      year: 2017,
      descriptor: 'Blockbuster supernatural coming-of-age horror',
      vectorPosition: {
        horror: 0.8, thriller: 0.5, drama: 0.4,
        tone: -0.7, pacing: 0.4, era: 0.7, popularity: 0.9, intensity: 0.8,
      },
    },
    optionB: {
      tmdbId: 4232,
      mediaType: 'movie',
      title: 'Scream',
      year: 1996,
      descriptor: 'Self-aware witty slasher horror',
      vectorPosition: {
        horror: 0.7, mystery: 0.5, thriller: 0.5,
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
        drama: 0.7, action: 0.6, scifi: 0.5, adventure: 0.5,
        tone: -0.7, pacing: 0.3, era: 0.9, popularity: 0.9, intensity: 0.8,
      },
    },
    optionB: {
      tmdbId: 33907,
      mediaType: 'tv',
      title: 'Downton Abbey',
      year: 2010,
      descriptor: 'Elegant British period ensemble drama',
      vectorPosition: {
        drama: 0.8, romance: 0.4, history: 0.7,
        tone: 0.1, pacing: -0.6, era: -0.5, popularity: 0.7, intensity: -0.3,
      },
    },
  },
  // ── Documentary subtype: nature vs social ────────────────────────
  {
    id: 'adaptive-22',
    phase: 'adaptive',
    dimensionsTested: ['documentary', 'tone', 'pacing'],
    optionA: {
      tmdbId: 83880,
      mediaType: 'tv',
      title: 'Our Planet',
      year: 2019,
      descriptor: 'Stunning nature conservation documentary',
      vectorPosition: {
        documentary: 0.8,
        tone: 0.3, pacing: -0.5, era: 0.8, popularity: 0.7, intensity: 0.0,
      },
    },
    optionB: {
      tmdbId: 656690,
      mediaType: 'movie',
      title: 'The Social Dilemma',
      year: 2020,
      descriptor: 'Alarming tech-industry investigative documentary',
      vectorPosition: {
        documentary: 0.8,
        tone: -0.5, pacing: 0.2, era: 0.9, popularity: 0.6, intensity: 0.4,
      },
    },
  },
  // ── Cross-dimensional: drama + action balance ────────────────────
  {
    id: 'adaptive-23',
    phase: 'adaptive',
    dimensionsTested: ['drama', 'animation', 'family', 'pacing', 'tone'],
    optionA: {
      tmdbId: 550,
      mediaType: 'movie',
      title: 'Fight Club',
      year: 1999,
      descriptor: 'Anarchic twist-driven psychological thriller',
      vectorPosition: {
        drama: 0.6, thriller: 0.7,
        tone: -0.8, pacing: 0.5, era: -0.2, popularity: 0.8, intensity: 0.8,
      },
    },
    optionB: {
      tmdbId: 20352,
      mediaType: 'movie',
      title: 'Despicable Me',
      year: 2010,
      descriptor: 'Colourful animated family comedy',
      vectorPosition: {
        animation: 0.8, comedy: 0.6, family: 0.7,
        tone: 0.7, pacing: 0.4, era: 0.5, popularity: 0.9, intensity: -0.4,
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
        thriller: 0.8, drama: 0.6, action: 0.5, mystery: 0.5,
        tone: -0.8, pacing: 0.7, era: 0.8, popularity: 0.9, intensity: 1.0,
      },
    },
    optionB: {
      tmdbId: 61662,
      mediaType: 'tv',
      title: 'Schitt\'s Creek',
      year: 2015,
      descriptor: 'Heartwarming quirky family comedy',
      vectorPosition: {
        comedy: 0.8,
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
        crime: 0.7, thriller: 0.4, comedy: 0.5,
        tone: 0.4, pacing: 0.6, era: 0.0, popularity: 0.8, intensity: 0.2,
      },
    },
    optionB: {
      tmdbId: 1949,
      mediaType: 'movie',
      title: 'Zodiac',
      year: 2007,
      descriptor: 'Obsessive methodical serial killer investigation',
      vectorPosition: {
        crime: 0.7, mystery: 0.7, thriller: 0.6, drama: 0.5,
        tone: -0.7, pacing: -0.4, era: 0.2, popularity: 0.5, intensity: 0.5,
      },
    },
  },
  // ── New pairs: expanded coverage ─────────────────────────────────
  {
    id: 'adaptive-26',
    phase: 'adaptive',
    dimensionsTested: ['animation', 'romance', 'tone', 'era'],
    optionA: {
      tmdbId: 13916,
      mediaType: 'tv',
      title: 'Death Note',
      year: 2006,
      descriptor: 'Dark cerebral supernatural anime thriller',
      vectorPosition: {
        animation: 0.8, thriller: 0.7, mystery: 0.6, crime: 0.5,
        tone: -0.8, pacing: 0.6, era: 0.4, popularity: 0.7, intensity: 0.8,
      },
    },
    optionB: {
      tmdbId: 91239,
      mediaType: 'tv',
      title: 'Bridgerton',
      year: 2020,
      descriptor: 'Lavish Regency-era romance drama',
      vectorPosition: {
        romance: 0.8, drama: 0.7, history: 0.4,
        tone: 0.4, pacing: 0.2, era: -0.3, popularity: 0.8, intensity: 0.1,
      },
    },
  },
  {
    id: 'adaptive-27',
    phase: 'adaptive',
    dimensionsTested: ['animation', 'crime', 'tone', 'intensity', 'pacing'],
    optionA: {
      tmdbId: 129,
      mediaType: 'movie',
      title: 'Spirited Away',
      year: 2001,
      descriptor: 'Enchanting hand-drawn fantasy masterpiece',
      vectorPosition: {
        animation: 0.8, fantasy: 0.7, adventure: 0.5,
        tone: 0.2, pacing: -0.3, era: 0.0, popularity: 0.6, intensity: -0.1,
      },
    },
    optionB: {
      tmdbId: 69740,
      mediaType: 'tv',
      title: 'Ozark',
      year: 2017,
      descriptor: 'Gripping dark money-laundering crime thriller',
      vectorPosition: {
        crime: 0.8, drama: 0.7, thriller: 0.6,
        tone: -0.8, pacing: 0.3, era: 0.7, popularity: 0.7, intensity: 0.8,
      },
    },
  },
  {
    id: 'adaptive-28',
    phase: 'adaptive',
    dimensionsTested: ['documentary', 'comedy', 'drama', 'tone'],
    optionA: {
      tmdbId: 100698,
      mediaType: 'tv',
      title: 'Tiger King',
      year: 2020,
      descriptor: 'Outrageous true crime documentary sensation',
      vectorPosition: {
        documentary: 0.8, crime: 0.4,
        tone: -0.3, pacing: 0.3, era: 0.8, popularity: 0.8, intensity: 0.5,
      },
    },
    optionB: {
      tmdbId: 67070,
      mediaType: 'tv',
      title: 'Fleabag',
      year: 2016,
      descriptor: 'Razor-sharp witty comedy-drama',
      vectorPosition: {
        comedy: 0.8, drama: 0.6,
        tone: 0.3, pacing: 0.3, era: 0.8, popularity: 0.6, intensity: -0.2,
      },
    },
  },
  {
    id: 'adaptive-29',
    phase: 'adaptive',
    dimensionsTested: ['war', 'comedy', 'tone', 'intensity', 'era'],
    optionA: {
      tmdbId: 4613,
      mediaType: 'tv',
      title: 'Band of Brothers',
      year: 2001,
      descriptor: 'Harrowing WWII brotherhood miniseries',
      vectorPosition: {
        war: 0.8, drama: 0.7, action: 0.6, history: 0.7,
        tone: -0.8, pacing: 0.5, era: -0.3, popularity: 0.8, intensity: 0.9,
      },
    },
    optionB: {
      tmdbId: 1400,
      mediaType: 'tv',
      title: 'Seinfeld',
      year: 1989,
      descriptor: 'Legendary observational comedy classic',
      vectorPosition: {
        comedy: 0.8,
        tone: 0.8, pacing: 0.3, era: -0.3, popularity: 0.9, intensity: -0.7,
      },
    },
  },
  {
    id: 'adaptive-30',
    phase: 'adaptive',
    dimensionsTested: ['reality', 'drama', 'tone', 'popularity'],
    optionA: {
      tmdbId: 14658,
      mediaType: 'tv',
      title: 'Survivor',
      year: 2000,
      descriptor: 'Iconic strategic survival competition',
      vectorPosition: {
        reality: 0.8, adventure: 0.3,
        tone: 0.2, pacing: 0.4, era: 0.0, popularity: 0.7, intensity: 0.3,
      },
    },
    optionB: {
      tmdbId: 76331,
      mediaType: 'tv',
      title: 'Succession',
      year: 2018,
      descriptor: 'Ruthless media dynasty power drama',
      vectorPosition: {
        drama: 0.8, comedy: 0.3,
        tone: -0.5, pacing: -0.1, era: 0.8, popularity: 0.7, intensity: 0.5,
      },
    },
  },
  {
    id: 'adaptive-31',
    phase: 'adaptive',
    dimensionsTested: ['history', 'animation', 'comedy', 'tone'],
    optionA: {
      tmdbId: 87108,
      mediaType: 'tv',
      title: 'Chernobyl',
      year: 2019,
      descriptor: 'Devastating nuclear disaster historical drama',
      vectorPosition: {
        drama: 0.8, history: 0.8, thriller: 0.5,
        tone: -0.9, pacing: -0.2, era: 0.8, popularity: 0.7, intensity: 0.9,
      },
    },
    optionB: {
      tmdbId: 60625,
      mediaType: 'tv',
      title: 'Rick and Morty',
      year: 2013,
      descriptor: 'Anarchic animated sci-fi comedy',
      vectorPosition: {
        animation: 0.8, comedy: 0.7, scifi: 0.6, adventure: 0.4,
        tone: 0.3, pacing: 0.6, era: 0.7, popularity: 0.8, intensity: 0.3,
      },
    },
  },
  {
    id: 'adaptive-32',
    phase: 'adaptive',
    dimensionsTested: ['scifi', 'drama', 'pacing', 'era'],
    optionA: {
      tmdbId: 335984,
      mediaType: 'movie',
      title: 'Blade Runner 2049',
      year: 2017,
      descriptor: 'Atmospheric philosophical sci-fi noir',
      vectorPosition: {
        scifi: 0.8, drama: 0.5, mystery: 0.5, thriller: 0.3,
        tone: -0.7, pacing: -0.5, era: 0.7, popularity: 0.5, intensity: 0.3,
      },
    },
    optionB: {
      tmdbId: 627,
      mediaType: 'movie',
      title: 'Trainspotting',
      year: 1996,
      descriptor: 'Raw cult British drama',
      vectorPosition: {
        drama: 0.7, comedy: 0.4, crime: 0.3,
        tone: -0.6, pacing: 0.5, era: -0.3, popularity: 0.3, intensity: 0.7,
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
 * Select 2 genre-responsive pairs based on user's top genre dimensions.
 *
 * Strategy:
 * 1. Accepts genre dimension keys directly (e.g. "scifi", "thriller")
 * 2. Find user genres NOT already covered by fixed pairs
 * 3. Match uncovered genres to pool via triggerGenres
 * 4. Pick 2 pairs with best coverage and no title overlap
 * 5. If all user genres are covered, pick within-genre subtype pairs
 */
export function selectGenreResponsivePairs(
  userGenreKeys: string[],
  fixedPairIds: string[],
  selectedClusterIds: string[] = [],
): QuizPair[] {
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

  // Score each genre-responsive pair by genre coverage + cluster match
  const scoredPairs = GENRE_RESPONSIVE_POOL.map((pair) => {
    const triggers = pair.triggerGenres || [];
    const clusterTriggers = pair.triggerClusterIds || [];
    let score = 0;
    for (const trigger of triggers) {
      if (uncoveredGenres.includes(trigger)) {
        score += 2; // Strong match: user picked this genre and it's uncovered
      } else if (userGenreKeys.includes(trigger)) {
        score += 1; // Weaker match: user picked it but fixed pairs already cover it
      }
    }
    // Cluster-based scoring: explicit cluster selection is a stronger signal
    // than derived genre keys. Score 3 guarantees a slot unless a genre pair
    // matches 2+ uncovered genres (score 4).
    for (const clusterId of clusterTriggers) {
      if (selectedClusterIds.includes(clusterId)) {
        score += 3;
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
