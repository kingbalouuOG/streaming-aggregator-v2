import { useQuery } from '@tanstack/react-query';

import { useUserServices } from '@/hooks/useUserServices';
import { fetchPerServiceCharts } from '@/lib/recommendations-v2/rows/home/perServiceChart';
import type { PerServiceChartRow } from '@/lib/recommendations-v2/rows/home/perServiceChart';
import type { ContentItem, ServiceId } from '@/lib/types/content';

// Native Home feed hook (NATIVE-1 W4). Calls the SAME lib row-builder
// the web Home uses (fetchPerServiceCharts → Supabase content cache →
// titleAdapter). Thin by design: src/hooks is web-only, native hooks
// re-orchestrate lib directly (plan D-N4). NATIVE-3 W7: scored against
// the user's onboarding-saved services (useUserServices).

export interface HomeFeed {
  hero: ContentItem | null;
  rows: PerServiceChartRow[];
}

async function fetchHomeFeed(services: ServiceId[]): Promise<HomeFeed> {
  const charts = await fetchPerServiceCharts(services);

  // Hero = first row's lead title, pulled OUT of its row so the same
  // title doesn't lead the hero and row one. The MagazineHero renders
  // the 4:5 POSTER (design-system §4), so no backdrop requirement.
  let hero: ContentItem | null = null;
  const rows = charts.map((row) => ({ ...row, items: [...row.items] }));
  const firstWithItems = rows.find((row) => row.items.length > 0);
  if (firstWithItems) {
    const lead = firstWithItems.items.shift() ?? null;
    if (lead) {
      // The per-service chart guarantees this title is watchable on
      // firstWithItems.serviceId — surface it first so the hero's
      // "Play on {service}" pill + badge always render (the adapted
      // ContentItem.services can come back empty from the cache).
      const svc = firstWithItems.serviceId as ServiceId;
      const services = lead.services.includes(svc)
        ? lead.services
        : [svc, ...lead.services];
      hero = { ...lead, services };
    }
  }

  return { hero, rows };
}

export function useHomeFeed() {
  const { data: services } = useUserServices();
  return useQuery({
    queryKey: ['native', 'home', 'feed', services?.join(',') ?? ''],
    queryFn: () => fetchHomeFeed(services ?? []),
    enabled: !!services,
    staleTime: 30 * 60 * 1000,
  });
}
