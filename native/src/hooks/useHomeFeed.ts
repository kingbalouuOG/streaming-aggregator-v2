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

  // Hero = first backdrop-bearing item; it's pulled OUT of its row so
  // the same title doesn't lead the hero and row one.
  let hero: ContentItem | null = null;
  const rows = charts.map((row) => ({ ...row, items: [...row.items] }));
  outer: for (const row of rows) {
    for (let i = 0; i < row.items.length; i++) {
      if (row.items[i].backdrop) {
        hero = row.items[i];
        row.items.splice(i, 1);
        break outer;
      }
    }
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
