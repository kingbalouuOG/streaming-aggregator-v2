import { useQuery } from '@tanstack/react-query';

import { fetchPerServiceCharts } from '@/lib/recommendations-v2/rows/home/perServiceChart';
import type { PerServiceChartRow } from '@/lib/recommendations-v2/rows/home/perServiceChart';
import type { ContentItem, ServiceId } from '@/lib/types/content';

// Native Home feed hook (NATIVE-1 W4). Calls the SAME lib row-builder
// the web Home uses (fetchPerServiceCharts → Supabase content cache →
// titleAdapter). Thin by design: src/hooks is web-only, native hooks
// re-orchestrate lib directly (plan D-N4).
//
// TODO(NATIVE-3): replace the dev service set with the user's
// onboarding picks once auth + preferences exist natively.
const DEV_SERVICES: ServiceId[] = ['netflix', 'prime', 'disney', 'apple', 'itvx', 'bbc'];

export interface HomeFeed {
  hero: ContentItem | null;
  rows: PerServiceChartRow[];
}

async function fetchHomeFeed(): Promise<HomeFeed> {
  const charts = await fetchPerServiceCharts(DEV_SERVICES);

  // Hero = first row's lead title, pulled OUT of its row so the same
  // title doesn't lead the hero and row one. The MagazineHero renders
  // the 4:5 POSTER (design-system §4), so no backdrop requirement.
  let hero: ContentItem | null = null;
  const rows = charts.map((row) => ({ ...row, items: [...row.items] }));
  const firstWithItems = rows.find((row) => row.items.length > 0);
  if (firstWithItems) {
    hero = firstWithItems.items.shift() ?? null;
  }

  return { hero, rows };
}

export function useHomeFeed() {
  return useQuery({
    queryKey: ['native', 'home', 'feed'],
    queryFn: fetchHomeFeed,
    staleTime: 30 * 60 * 1000,
  });
}
