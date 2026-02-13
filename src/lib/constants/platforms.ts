// UK Platform configurations with TMDb provider IDs
export const UK_PROVIDERS: Record<string, { id: number; name: string; color: string }> = {
  netflix: { id: 8, name: 'Netflix', color: '#E50914' },
  amazonPrime: { id: 9, name: 'Amazon Prime Video', color: '#00A8E1' },
  appleTv: { id: 350, name: 'Apple TV+', color: '#000000' },
  disneyPlus: { id: 337, name: 'Disney+', color: '#113CCF' },
  nowTV: { id: 39, name: 'Now TV', color: '#00E0FF' },
  bbcIplayer: { id: 38, name: 'BBC iPlayer', color: '#FF0000' },
  itvx: { id: 54, name: 'ITVX', color: '#000000' },
  channel4: { id: 103, name: 'Channel 4', color: '#0095D9' },
  paramount: { id: 582, name: 'Paramount+', color: '#0064FF' },
  skyGo: { id: 29, name: 'Sky Go', color: '#0072C9' },
};

export const UK_PROVIDERS_ARRAY = Object.values(UK_PROVIDERS);

export const getProviderById = (id: number) => {
  return UK_PROVIDERS_ARRAY.find((provider) => provider.id === id);
};

// Mapping from rent/buy store IDs to subscription platform equivalents
export const RENT_BUY_TO_SUBSCRIPTION_MAP: Record<number, number> = {
  10: 9,    // Amazon Video (rent/buy) -> Amazon Prime Video
  2: 350,   // Apple TV (rent/buy store) -> Apple TV+
  130: 39,  // Sky Store (rent/buy) -> Now TV / Sky
};

export const mapRentBuyToSubscription = (providerId: number): number => {
  return RENT_BUY_TO_SUBSCRIPTION_MAP[providerId] || providerId;
};

export const rentBuyMatchesUserPlatform = (rentBuyProviderId: number, userPlatformIds: number[]): boolean => {
  const mappedId = mapRentBuyToSubscription(rentBuyProviderId);
  return userPlatformIds.includes(mappedId) || userPlatformIds.includes(rentBuyProviderId);
};

// Platform name normalization
export const PLATFORM_NAME_VARIANTS: Record<string, string> = {
  'Netflix Standard with Ads': 'Netflix',
  'Netflix basic with Ads': 'Netflix',
  'Netflix Basic with Ads': 'Netflix',
  'Netflix basic': 'Netflix',
  'Amazon Prime Video with Ads': 'Amazon Prime Video',
  'Amazon Video': 'Amazon Prime Video',
  'Disney Plus': 'Disney+',
  'Disney+ Basic with Ads': 'Disney+',
  'Disney+ with Ads': 'Disney+',
  'Apple TV Plus': 'Apple TV+',
  'Apple iTunes': 'Apple TV+',
  'Apple TV': 'Apple TV+',
  'Paramount+ with SHOWTIME': 'Paramount+',
  'Paramount Plus': 'Paramount+',
  'Paramount+ Amazon Channel': 'Paramount+',
  'NOW': 'Now TV',
  'ITVX Free': 'ITVX',
  'ITV Hub': 'ITVX',
  'Channel 4 Free': 'Channel 4',
  'All 4': 'Channel 4',
  'My5': 'Channel 5',
};

// Mapping from variant provider IDs to canonical platform IDs
export const PROVIDER_ID_VARIANTS: Record<number, number> = {
  83: 103,   // All 4 -> Channel 4
  1854: 103, // Channel 4 Free -> Channel 4
  41: 54,    // ITV Hub -> ITVX
  2087: 54,  // ITVX Free -> ITVX
  591: 39,   // NOW -> Now TV
  10: 9,     // Amazon Video (rent/buy) -> Amazon Prime Video
  2: 350,    // Apple iTunes (rent/buy) -> Apple TV+
  130: 39,   // Sky Store (rent/buy) -> Now TV / Sky
  1796: 8,   // Netflix basic with Ads -> Netflix
  2100: 9,   // Amazon Prime Video with Ads -> Amazon Prime Video
  1899: 337, // Disney+ Basic with Ads -> Disney+
};

export const mapProviderIdToCanonical = (providerId: number): number => {
  return PROVIDER_ID_VARIANTS[providerId] || providerId;
};

// Network name → TMDb provider ID (fallback when watch/providers is empty)
// TMDb "networks" = production/broadcast network, not streaming availability.
// Used as a last resort for new content where JustWatch data hasn't propagated yet.
const NETWORK_TO_PROVIDER_ID: Record<string, number> = {
  'Netflix': 8,
  'Amazon': 9,
  'Disney+': 337,
  'Apple TV+': 350,
  'BBC One': 38, 'BBC Two': 38, 'BBC Three': 38, 'BBC iPlayer': 38, 'BBC Four': 38, 'CBBC': 38, 'CBeebies': 38,
  'ITV': 54, 'ITV1': 54, 'ITV2': 54, 'ITVX': 54, 'ITV4': 54, 'ITVBe': 54,
  'Channel 4': 103, 'E4': 103, 'More4': 103, 'Film4': 103,
  'Sky Atlantic': 39, 'Sky One': 39, 'Sky Max': 39, 'Sky Arts': 39,
  'Paramount+': 582,
};

export const networkNameToProviderId = (networkName: string): number | null => {
  return NETWORK_TO_PROVIDER_ID[networkName] ?? null;
};

export const normalizePlatformName = (name: string): string => {
  if (!name) return name;
  if (PLATFORM_NAME_VARIANTS[name]) return PLATFORM_NAME_VARIANTS[name];
  const lowerName = name.toLowerCase();
  for (const [variant, canonical] of Object.entries(PLATFORM_NAME_VARIANTS)) {
    if (lowerName === variant.toLowerCase()) return canonical;
  }
  return name;
};
