import { SERVICE_DISPLAY_NAMES, type ServiceId } from '@/lib/types/content';

// Small copy + type helpers shared by the service picker, the channel sheet,
// Profile and Where to Watch (IN-SC-006, services picker Direction B).

export function isServiceId(id: string): id is ServiceId {
  return id in SERVICE_DISPLAY_NAMES;
}

/** NOW sells passes; Prime Video and Apple TV+ sell channels. */
export function channelWord(parent: ServiceId, count: number): string {
  if (parent === 'now') return count === 1 ? 'pass' : 'passes';
  return count === 1 ? 'channel' : 'channels';
}

/** "5 services · 2 channels", dropping the channel part when there are none. */
export function servicesSummary(services: number, channels: number): string {
  const s = `${services} service${services === 1 ? '' : 's'}`;
  return channels > 0 ? `${s} · ${channels} channel${channels === 1 ? '' : 's'}` : s;
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
