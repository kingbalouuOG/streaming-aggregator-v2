import type { ContentItem } from '@/components/ContentCard';

export interface SectionCacheEntry {
  displayItems: ContentItem[];
  buffer: ContentItem[];
  nextMoviePage: number;
  nextTVPage: number;
  hasMoreAPI: boolean;
}

const cache = new Map<string, SectionCacheEntry>();
const scrollPositions = new Map<string, number>();

export function getSectionCache(key: string): SectionCacheEntry | null {
  return cache.get(key) || null;
}

export function setSectionCache(key: string, entry: SectionCacheEntry): void {
  cache.set(key, entry);
}

export function getScrollPosition(key: string): number {
  return scrollPositions.get(key) || 0;
}

export function setScrollPosition(key: string, scrollLeft: number): void {
  scrollPositions.set(key, scrollLeft);
}

export function clearSectionCache(): void {
  cache.clear();
  scrollPositions.clear();
}
