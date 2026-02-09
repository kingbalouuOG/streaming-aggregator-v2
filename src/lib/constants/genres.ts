// TMDb Genre IDs
export const GENRES: Record<string, number> = {
  // Movies & TV
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  music: 10402,
  mystery: 9648,
  romance: 10749,
  sciFi: 878,
  thriller: 53,
  war: 10752,
  western: 37,

  // TV-specific
  actionAdventure: 10759,
  kids: 10762,
  news: 10763,
  reality: 10764,
  soap: 10766,
  talk: 10767,
  warPolitics: 10768,
};

// Genre display names
export const GENRE_NAMES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  10759: 'Action & Adventure',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
};

// Reverse mapping: display name → TMDb genre ID
export const GENRE_NAME_TO_ID: Record<string, number> = Object.fromEntries(
  Object.entries(GENRE_NAMES).map(([id, name]) => [name, Number(id)])
);

export const getGenreName = (id: number): string => {
  return GENRE_NAMES[id] || 'Unknown';
};
