import type { ServiceId } from '@/lib/types/content';

// UK streaming services in display order (matches V2 Onboarding/Profile).
// Shared by onboarding Step 2 (StepServices) and Profile → Streaming
// Services so the list + descriptions stay in one place.
export const SERVICE_CATALOG: { id: ServiceId; name: string; description: string }[] = [
  { id: 'netflix', name: 'Netflix', description: 'Movies & Series' },
  { id: 'prime', name: 'Prime Video', description: 'Amazon Originals' },
  { id: 'disney', name: 'Disney+', description: 'Disney, Marvel, Star Wars' },
  { id: 'bbc', name: 'BBC iPlayer', description: 'BBC Originals & Live' },
  { id: 'itvx', name: 'ITVX', description: 'ITV Originals & Live' },
  { id: 'channel4', name: 'Channel 4', description: 'Channel 4 & Film4' },
  { id: 'now', name: 'NOW', description: 'Sky Cinema & HBO' },
  { id: 'skygo', name: 'Sky Go', description: 'Live TV & Sky Originals' },
  { id: 'apple', name: 'Apple TV+', description: 'Apple Originals' },
  { id: 'paramount', name: 'Paramount+', description: 'CBS & Paramount' },
];

export const ALL_SERVICE_IDS: ServiceId[] = SERVICE_CATALOG.map((s) => s.id);
