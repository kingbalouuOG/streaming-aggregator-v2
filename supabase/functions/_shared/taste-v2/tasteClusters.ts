// Mirror of src/lib/taste-v2/tasteClusters.ts — IN-466 / ADR-011.
// Pure data; bit-for-bit copy. Drift enforced by shared-tree-drift CI check.

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

export const MIN_CLUSTERS = 3;
export const MAX_CLUSTERS = 5;

export const TASTE_CLUSTERS: TasteCluster[] = [
  {
    id: 'feel-good-funny',
    name: 'Feel-Good & Funny',
    description: 'Light comedies, sitcoms, and uplifting stories',
    emoji: '😍',
    adjective: 'feel-good',
    mood: 'light-hearted comedy and uplifting stories',
    tmdbGenreIds: [35, 18],
    representativeTmdbIds: [
      { tmdbId: 18785, mediaType: 'movie' },
      { tmdbId: 8363, mediaType: 'movie' },
      { tmdbId: 10625, mediaType: 'movie' },
      { tmdbId: 55721, mediaType: 'movie' },
    ],
  },
  {
    id: 'action-adrenaline',
    name: 'Action & Adrenaline',
    description: 'Explosions, fights, and high-stakes chases',
    emoji: '🚀',
    adjective: 'intense',
    mood: 'high-stakes action and adrenaline',
    tmdbGenreIds: [28, 12, 53],
    representativeTmdbIds: [
      { tmdbId: 562, mediaType: 'movie' },
      { tmdbId: 680, mediaType: 'movie' },
      { tmdbId: 857, mediaType: 'movie' },
    ],
  },
  {
    id: 'dark-thrillers',
    name: 'Dark Thrillers',
    description: 'Tense, gritty crime and suspense',
    emoji: '🔪',
    adjective: 'dark',
    mood: 'gritty crime and tense suspense',
    tmdbGenreIds: [53, 80, 9648],
    representativeTmdbIds: [
      { tmdbId: 807, mediaType: 'movie' },
      { tmdbId: 210577, mediaType: 'movie' },
      { tmdbId: 146233, mediaType: 'movie' },
      { tmdbId: 273481, mediaType: 'movie' },
    ],
  },
  {
    id: 'rom-coms-love-stories',
    name: 'Rom-Coms & Love',
    description: 'Romantic comedies and sweeping romances',
    emoji: '💕',
    adjective: 'romantic',
    mood: 'sweeping romances and charming comedy',
    tmdbGenreIds: [10749, 35, 18],
    representativeTmdbIds: [
      { tmdbId: 11036, mediaType: 'movie' },
      { tmdbId: 455207, mediaType: 'movie' },
      { tmdbId: 4348, mediaType: 'movie' },
      { tmdbId: 13, mediaType: 'movie' },
    ],
  },
  {
    id: 'epic-scifi-fantasy',
    name: 'Epic Sci-Fi & Fantasy',
    description: 'Grand worlds, speculative stories, and mythic adventures',
    emoji: '🔮',
    adjective: 'cerebral',
    mood: 'speculative worlds and grand adventures',
    tmdbGenreIds: [878, 14, 12],
    representativeTmdbIds: [
      { tmdbId: 157336, mediaType: 'movie' },
      { tmdbId: 335984, mediaType: 'movie' },
      { tmdbId: 329865, mediaType: 'movie' },
    ],
  },
  {
    id: 'horror-supernatural',
    name: 'Horror & Supernatural',
    description: 'Scary, creepy, and unsettling',
    emoji: '👻',
    adjective: 'unsettling',
    mood: 'creepy horror and supernatural dread',
    tmdbGenreIds: [27, 53, 9648],
    representativeTmdbIds: [
      { tmdbId: 419430, mediaType: 'movie' },
      { tmdbId: 447332, mediaType: 'movie' },
      { tmdbId: 126889, mediaType: 'movie' },
    ],
  },
  {
    id: 'mind-bending-mysteries',
    name: 'Mind-Bending',
    description: 'Psychological puzzles and twist-driven stories',
    emoji: '🧠',
    adjective: 'cerebral',
    mood: 'psychological depth and twist-driven puzzles',
    tmdbGenreIds: [9648, 53, 878],
    representativeTmdbIds: [
      { tmdbId: 27205, mediaType: 'movie' },
      { tmdbId: 11324, mediaType: 'movie' },
      { tmdbId: 1124, mediaType: 'movie' },
      { tmdbId: 77, mediaType: 'movie' },
    ],
  },
  {
    id: 'heartfelt-drama',
    name: 'Heartfelt Drama',
    description: 'Character-driven emotional stories',
    emoji: '💚',
    adjective: 'heartfelt',
    mood: 'slow-burn character dramas and emotional depth',
    tmdbGenreIds: [18, 10749],
    representativeTmdbIds: [
      { tmdbId: 278, mediaType: 'movie' },
      { tmdbId: 238, mediaType: 'movie' },
      { tmdbId: 13, mediaType: 'movie' },
    ],
  },
  {
    id: 'true-crime-real-stories',
    name: 'True Crime',
    description: 'Documentaries, docuseries, and based-on-true-events',
    emoji: '📰',
    adjective: 'gripping',
    mood: 'true crime investigations and real-world stories',
    tmdbGenreIds: [99, 80, 36],
    representativeTmdbIds: [
      { tmdbId: 1430, mediaType: 'movie' },
      { tmdbId: 64439, mediaType: 'tv' },
    ],
  },
  {
    id: 'anime-animation',
    name: 'Anime & Animation',
    description: 'Anime, animated series, and animated films',
    emoji: '🍥',
    adjective: 'vibrant',
    mood: 'animated worlds and visual storytelling',
    tmdbGenreIds: [16, 28, 14],
    representativeTmdbIds: [
      { tmdbId: 324857, mediaType: 'movie' },
      { tmdbId: 129, mediaType: 'movie' },
      { tmdbId: 862, mediaType: 'movie' },
      { tmdbId: 150540, mediaType: 'movie' },
    ],
  },
  {
    id: 'prestige-award-winners',
    name: 'Award-Winners',
    description: 'Critically acclaimed, Oscar- and BAFTA-calibre',
    emoji: '🏆',
    adjective: 'acclaimed',
    mood: 'critically praised cinema and prestige storytelling',
    tmdbGenreIds: [18, 36, 99],
    representativeTmdbIds: [
      { tmdbId: 581734, mediaType: 'movie' },
      { tmdbId: 278, mediaType: 'movie' },
    ],
  },
  {
    id: 'history-war',
    name: 'History & War',
    description: 'Period pieces, historical epics, and war stories',
    emoji: '⚔️',
    adjective: 'epic',
    mood: 'historical epics and wartime drama',
    tmdbGenreIds: [36, 10752, 18],
    representativeTmdbIds: [
      { tmdbId: 857, mediaType: 'movie' },
      { tmdbId: 374720, mediaType: 'movie' },
      { tmdbId: 16869, mediaType: 'movie' },
    ],
  },
  {
    id: 'reality-entertainment',
    name: 'Reality & Entertainment',
    description: 'Competition shows, reality TV, and entertainment',
    emoji: '📺',
    adjective: 'entertaining',
    mood: 'competition shows and unscripted entertainment',
    tmdbGenreIds: [10764, 35],
    representativeTmdbIds: [
      { tmdbId: 37678, mediaType: 'tv' },
    ],
  },
  {
    id: 'cult-indie',
    name: 'Cult & Indie',
    description: 'Off-beat, niche, and under-the-radar gems',
    emoji: '🎬',
    adjective: 'offbeat',
    mood: 'cult favourites and indie discoveries',
    tmdbGenreIds: [18, 35],
    representativeTmdbIds: [
      { tmdbId: 550, mediaType: 'movie' },
      { tmdbId: 680, mediaType: 'movie' },
    ],
  },
  {
    id: 'family-kids',
    name: 'Family & Kids',
    description: 'Animated films, family adventures, and kid-friendly fun',
    emoji: '👨‍👩‍👧‍👦',
    adjective: 'family-friendly',
    mood: 'fun adventures for all ages',
    tmdbGenreIds: [10751, 16, 35, 12],
    representativeTmdbIds: [
      { tmdbId: 12, mediaType: 'movie' },
      { tmdbId: 8587, mediaType: 'movie' },
      { tmdbId: 277834, mediaType: 'movie' },
      { tmdbId: 862, mediaType: 'movie' },
    ],
  },
  {
    id: 'westerns-frontier',
    name: 'Westerns & Frontier',
    description: 'Cowboys, outlaws, and rugged frontier tales',
    emoji: '🤠',
    adjective: 'rugged',
    mood: 'frontier tales and outlaw drama',
    tmdbGenreIds: [37, 28, 12],
    representativeTmdbIds: [
      { tmdbId: 429, mediaType: 'movie' },
      { tmdbId: 68718, mediaType: 'movie' },
      { tmdbId: 281957, mediaType: 'movie' },
      { tmdbId: 6977, mediaType: 'movie' },
    ],
  },
];
