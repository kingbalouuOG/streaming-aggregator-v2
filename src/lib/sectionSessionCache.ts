import type { ContentItem } from '@/components/ContentCard';

export interface SectionCacheEntry {
  displayItems: ContentItem[];
  buffer: ContentItem[];
  nextMoviePage: number;
  nextTVPage: number;
  hasMoreAPI: boolean;
}

const cache = new Map<string, SectionCacheEntry>();

export function getSectionCache(key: string): SectionCacheEntry | null {
  return cache.get(key) || null;
}

export function setSectionCache(key: string, entry: SectionCacheEntry): void {
  cache.set(key, entry);
}

export function clearSectionCache(): void {
  cache.clear();
}
