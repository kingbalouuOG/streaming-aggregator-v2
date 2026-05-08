/**
 * Taste Clusters
 *
 * 16 taste archetypes used in onboarding Step 4 and Profile "Your Taste".
 * Each cluster has curated representative titles for v2 bootstrap and
 * adjective/mood strings for the taste summary prose template.
 */

// ── Types ────────────────────────────────────────────────────────

export interface TasteCluster {
  id: string;
  name: string;
  description: string;
  emoji: string;
  adjective: string;
  mood: string;
  tmdbGenreIds: number[];
  representativeTmdbIds: { tmdbId: number; mediaType: 'movie' | 'tv' }[];
}

// ── Constants ────────────────────────────────────────────────────

export const MIN_CLUSTERS = 3;
export const MAX_CLUSTERS = 5;

/**
 * All 16 taste clusters, ordered for display (most universally appealing first).
 *
 * IMPORTANT: Only include a dimension if it carries meaningful signal.
 * - Omitting a dimension = "no opinion" (excluded from averaging)
 * - Setting 0.0 = "explicitly neutral" (included in averaging, drags others toward zero)
 *
 * Genre seed magnitudes are compressed (val >= 0.5 → val * 0.6 + 0.1)
 * to leave headroom for the quiz to refine without hitting cap collisions.
 */
export const TASTE_CLUSTERS: TasteCluster[] = [
  // 1. Feel-Good & Funny
  {
    id: 'feel-good-funny',
    name: 'Feel-Good & Funny',
    description: 'Light comedies, sitcoms, and uplifting stories',
    emoji: '😍',
    adjective: 'feel-good',
    mood: 'light-hearted comedy and uplifting stories',
    tmdbGenreIds: [35, 18],
    representativeTmdbIds: [
      { tmdbId: 18785, mediaType: 'movie' }, // The Hangover
      { tmdbId: 8363, mediaType: 'movie' },  // Superbad
      { tmdbId: 10625, mediaType: 'movie' }, // Mean Girls
      { tmdbId: 55721, mediaType: 'movie' }, // Bridesmaids
      { tmdbId: 2316, mediaType: 'tv' },     // The Office
      { tmdbId: 48891, mediaType: 'tv' },    // Brooklyn Nine-Nine
      { tmdbId: 97546, mediaType: 'tv' },    // Ted Lasso
      { tmdbId: 66573, mediaType: 'tv' },    // The Good Place
      { tmdbId: 1421, mediaType: 'tv' },     // Modern Family
    ],
  },
  // 2. Action & Adrenaline
  {
    id: 'action-adrenaline',
    name: 'Action & Adrenaline',
    description: 'Explosions, fights, and high-stakes chases',
    emoji: '🚀',
    adjective: 'intense',
    mood: 'high-stakes action and adrenaline',
    tmdbGenreIds: [28, 12, 53],
    representativeTmdbIds: [
      // Pulp Fiction → cult-indie only; Saving Private Ryan → history-war only
      // (deduplicated to avoid centroid blur across overlapping clusters)
      { tmdbId: 562, mediaType: 'movie' },    // Die Hard
      { tmdbId: 353081, mediaType: 'movie' }, // Mission: Impossible - Fallout
      { tmdbId: 155, mediaType: 'movie' },    // The Dark Knight
      { tmdbId: 49026, mediaType: 'movie' },  // The Dark Knight Rises
    ],
  },
  // 3. Dark Thrillers
  {
    id: 'dark-thrillers',
    name: 'Dark Thrillers',
    description: 'Tense, gritty crime and suspense',
    emoji: '🔪',
    adjective: 'dark',
    mood: 'gritty crime and tense suspense',
    tmdbGenreIds: [53, 80, 9648],
    representativeTmdbIds: [
      { tmdbId: 807, mediaType: 'movie' },    // Se7en
      { tmdbId: 210577, mediaType: 'movie' }, // Gone Girl
      { tmdbId: 146233, mediaType: 'movie' }, // Prisoners
      { tmdbId: 273481, mediaType: 'movie' }, // Sicario
    ],
  },
  // 4. Rom-Coms & Love Stories
  {
    id: 'rom-coms-love-stories',
    name: 'Rom-Coms & Love',
    description: 'Romantic comedies and sweeping romances',
    emoji: '💕',
    adjective: 'romantic',
    mood: 'sweeping romances and charming comedy',
    tmdbGenreIds: [10749, 35, 18],
    representativeTmdbIds: [
      // Forrest Gump → heartfelt-drama only (deduplicated)
      { tmdbId: 11036, mediaType: 'movie' }, // The Notebook
      { tmdbId: 455207, mediaType: 'movie' }, // Crazy Rich Asians
      { tmdbId: 4348, mediaType: 'movie' },  // Pride & Prejudice
    ],
  },
  // 5. Epic Sci-Fi & Fantasy
  {
    id: 'epic-scifi-fantasy',
    name: 'Epic Sci-Fi & Fantasy',
    description: 'Grand worlds, speculative stories, and mythic adventures',
    emoji: '🔮',
    adjective: 'cerebral',
    mood: 'speculative worlds and grand adventures',
    tmdbGenreIds: [878, 14, 12],
    representativeTmdbIds: [
      { tmdbId: 157336, mediaType: 'movie' }, // Interstellar
      { tmdbId: 335984, mediaType: 'movie' }, // Blade Runner 2049
      { tmdbId: 329865, mediaType: 'movie' }, // Arrival
    ],
  },
  // 6. Horror & Supernatural
  {
    id: 'horror-supernatural',
    name: 'Horror & Supernatural',
    description: 'Scary, creepy, and unsettling',
    emoji: '👻',
    adjective: 'unsettling',
    mood: 'creepy horror and supernatural dread',
    tmdbGenreIds: [27, 53, 9648],
    representativeTmdbIds: [
      { tmdbId: 419430, mediaType: 'movie' }, // Get Out
      { tmdbId: 447332, mediaType: 'movie' }, // A Quiet Place
      { tmdbId: 126889, mediaType: 'movie' }, // Alien: Covenant
    ],
  },
  // 7. Mind-Bending Mysteries
  {
    id: 'mind-bending-mysteries',
    name: 'Mind-Bending',
    description: 'Psychological puzzles and twist-driven stories',
    emoji: '🧠',
    adjective: 'cerebral',
    mood: 'psychological depth and twist-driven puzzles',
    tmdbGenreIds: [9648, 53, 878],
    representativeTmdbIds: [
      { tmdbId: 27205, mediaType: 'movie' }, // Inception
      { tmdbId: 11324, mediaType: 'movie' }, // Shutter Island
      { tmdbId: 1124, mediaType: 'movie' },  // The Prestige
      { tmdbId: 77, mediaType: 'movie' },    // Memento
    ],
  },
  // 8. Heartfelt Drama
  {
    id: 'heartfelt-drama',
    name: 'Heartfelt Drama',
    description: 'Character-driven emotional stories',
    emoji: '💚',
    adjective: 'heartfelt',
    mood: 'slow-burn character dramas and emotional depth',
    tmdbGenreIds: [18, 10749],
    representativeTmdbIds: [
      // Shawshank stays here only (removed from prestige to dedupe)
      { tmdbId: 278, mediaType: 'movie' },    // The Shawshank Redemption
      { tmdbId: 238, mediaType: 'movie' },    // The Godfather
      { tmdbId: 13, mediaType: 'movie' },     // Forrest Gump
    ],
  },
  // 9. True Crime & Real Stories
  {
    id: 'true-crime-real-stories',
    name: 'True Crime',
    description: 'Documentaries, docuseries, and based-on-true-events',
    emoji: '📰',
    adjective: 'gripping',
    mood: 'true crime investigations and real-world stories',
    tmdbGenreIds: [99, 80, 36],
    representativeTmdbIds: [
      { tmdbId: 1430, mediaType: 'movie' },  // Bowling for Columbine
      { tmdbId: 64439, mediaType: 'tv' },    // Making a Murderer
    ],
  },
  // 10. Anime & Animation
  {
    id: 'anime-animation',
    name: 'Anime & Animation',
    description: 'Anime, animated series, and animated films',
    emoji: '🍥',
    adjective: 'vibrant',
    mood: 'animated worlds and visual storytelling',
    tmdbGenreIds: [16, 28, 14],
    representativeTmdbIds: [
      // Toy Story → family-kids only (deduplicated)
      { tmdbId: 324857, mediaType: 'movie' }, // Spider-Man: Into the Spider-Verse
      { tmdbId: 129, mediaType: 'movie' },    // Spirited Away
      { tmdbId: 150540, mediaType: 'movie' }, // Inside Out
      { tmdbId: 31910, mediaType: 'tv' },     // Naruto Shippūden
      { tmdbId: 85937, mediaType: 'tv' },     // Demon Slayer: Kimetsu no Yaiba
      { tmdbId: 95479, mediaType: 'tv' },     // JUJUTSU KAISEN
      { tmdbId: 120089, mediaType: 'tv' },    // SPY x FAMILY
      { tmdbId: 209867, mediaType: 'tv' },    // Frieren: Beyond Journey's End
    ],
  },
  // 11. Prestige & Award-Winners
  {
    id: 'prestige-award-winners',
    name: 'Award-Winners',
    description: 'Critically acclaimed, Oscar- and BAFTA-calibre',
    emoji: '🏆',
    adjective: 'acclaimed',
    mood: 'critically praised cinema and prestige storytelling',
    tmdbGenreIds: [18, 36, 99],
    representativeTmdbIds: [
      // Shawshank → heartfelt-drama only (deduplicated)
      { tmdbId: 581734, mediaType: 'movie' }, // Nomadland
      { tmdbId: 426426, mediaType: 'movie' }, // Roma
      { tmdbId: 68734, mediaType: 'movie' },  // Argo
      { tmdbId: 399055, mediaType: 'movie' }, // The Shape of Water
    ],
  },
  // 12. History & War
  {
    id: 'history-war',
    name: 'History & War',
    description: 'Period pieces, historical epics, and war stories',
    emoji: '⚔️',
    adjective: 'epic',
    mood: 'historical epics and wartime drama',
    tmdbGenreIds: [36, 10752, 18],
    representativeTmdbIds: [
      { tmdbId: 857, mediaType: 'movie' },    // Saving Private Ryan
      { tmdbId: 374720, mediaType: 'movie' }, // Dunkirk
      { tmdbId: 16869, mediaType: 'movie' },  // Inglourious Basterds
    ],
  },
  // 13. Reality & Entertainment
  {
    id: 'reality-entertainment',
    name: 'Reality & Entertainment',
    description: 'Competition shows, reality TV, and entertainment',
    emoji: '📺',
    adjective: 'entertaining',
    mood: 'competition shows and unscripted entertainment',
    tmdbGenreIds: [10764, 35],
    representativeTmdbIds: [
      { tmdbId: 37678, mediaType: 'tv' },  // The Voice
      { tmdbId: 2370, mediaType: 'tv' },   // Hell's Kitchen
      { tmdbId: 40290, mediaType: 'tv' },  // MasterChef
    ],
  },
  // 14. Cult & Indie
  {
    id: 'cult-indie',
    name: 'Cult & Indie',
    description: 'Off-beat, niche, and under-the-radar gems',
    emoji: '🎬',
    adjective: 'offbeat',
    mood: 'cult favourites and indie discoveries',
    tmdbGenreIds: [18, 35],
    representativeTmdbIds: [
      // Pulp Fiction stays here only (removed from action-adrenaline)
      { tmdbId: 550, mediaType: 'movie' },  // Fight Club
      { tmdbId: 680, mediaType: 'movie' },  // Pulp Fiction
    ],
  },
  // 15. Family & Kids
  {
    id: 'family-kids',
    name: 'Family & Kids',
    description: 'Animated films, family adventures, and kid-friendly fun',
    emoji: '👨‍👩‍👧‍👦',
    adjective: 'family-friendly',
    mood: 'fun adventures for all ages',
    tmdbGenreIds: [10751, 16, 35, 12],
    representativeTmdbIds: [
      // Toy Story stays here only (removed from anime-animation)
      { tmdbId: 12, mediaType: 'movie' },     // Finding Nemo
      { tmdbId: 8587, mediaType: 'movie' },   // The Lion King
      { tmdbId: 277834, mediaType: 'movie' }, // Moana
      { tmdbId: 862, mediaType: 'movie' },    // Toy Story
      { tmdbId: 246, mediaType: 'tv' },       // Avatar: The Last Airbender
      { tmdbId: 40075, mediaType: 'tv' },     // Gravity Falls
      { tmdbId: 82728, mediaType: 'tv' },     // Bluey
      { tmdbId: 387, mediaType: 'tv' },       // SpongeBob SquarePants
      { tmdbId: 15260, mediaType: 'tv' },     // Adventure Time
    ],
  },
  // 16. Westerns & Frontier
  {
    id: 'westerns-frontier',
    name: 'Westerns & Frontier',
    description: 'Cowboys, outlaws, and rugged frontier tales',
    emoji: '🤠',
    adjective: 'rugged',
    mood: 'frontier tales and outlaw drama',
    tmdbGenreIds: [37, 28, 12],
    representativeTmdbIds: [
      { tmdbId: 429, mediaType: 'movie' },    // The Good, the Bad and the Ugly
      { tmdbId: 68718, mediaType: 'movie' },  // Django Unchained
      { tmdbId: 281957, mediaType: 'movie' }, // The Revenant
      { tmdbId: 6977, mediaType: 'movie' },   // No Country for Old Men
    ],
  },
];
