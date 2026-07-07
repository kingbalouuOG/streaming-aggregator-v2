// Last verified: July 2026 (H0 Stream D, IN-XPS-007). Review quarterly. UK prices in GBP.
// Sources verified against official service pages July 2026. 2025–26 rises applied:
// Netflix (Q1 2026), Disney+ (Sep 2025), Apple TV (Aug 2025), Paramount+ (Nov 2024
// 3-tier), Prime Video standalone (now £7.99), NOW/Sky restructure (Sky Stream folded
// into Sky Essential/Ultimate TV; Sky Go is bundled free with Sky TV, not standalone).
// Parking lot IN-XPS-007: quarterly review cadence — next review ~Oct 2026.

export interface PricingTier {
  name: string;
  price: number; // GBP/month
}

export interface PlatformPricing {
  serviceId: string;
  tiers: PricingTier[];
}

export const PLATFORM_PRICING: PlatformPricing[] = [
  {
    serviceId: "netflix",
    tiers: [
      { name: "Standard with Ads", price: 5.99 },
      { name: "Standard", price: 12.99 },
      { name: "Premium", price: 18.99 },
    ],
  },
  {
    serviceId: "prime",
    // Prime Video standalone is £7.99/mo; most UK users get it via full
    // Amazon Prime (£8.99/mo or £95/yr ≈ £7.92/mo). Ads by default since
    // 2024; ad-free add-on £2.99/mo (not modelled — not a base tier).
    tiers: [
      { name: "Prime Video (standalone)", price: 7.99 },
      { name: "With Amazon Prime", price: 8.99 },
      { name: "Prime annual (equiv.)", price: 7.92 },
    ],
  },
  {
    serviceId: "apple",
    // Apple TV (rebranded from Apple TV+ Nov 2025). Monthly £9.99 since
    // Aug 2025; annual £89.99/yr ≈ £7.50/mo.
    tiers: [
      { name: "Standard", price: 9.99 },
      { name: "Annual (equiv.)", price: 7.5 },
      { name: "Apple One (Individual)", price: 18.95 },
    ],
  },
  {
    serviceId: "disney",
    tiers: [
      { name: "Standard with Ads", price: 5.99 },
      { name: "Standard", price: 9.99 },
      { name: "Premium", price: 14.99 },
    ],
  },
  {
    serviceId: "now",
    // Entertainment £7.99 (the old £9.99 line is now the Entertainment &
    // HBO Max tier). Cinema £9.99, Sports £34.99.
    tiers: [
      { name: "Entertainment", price: 7.99 },
      { name: "Cinema", price: 9.99 },
      { name: "Ent + Cinema", price: 13.99 },
      { name: "Sports", price: 34.99 },
    ],
  },
  {
    serviceId: "skygo",
    // Sky Go has no standalone price — it is bundled free with any Sky TV
    // subscription. These are the entry Sky TV packages (delivered via Sky
    // Stream/Glass) that grant access; "Sky Stream" is the device, not a
    // separate price line. New-customer advertised rates, July 2026.
    tiers: [
      { name: "Sky Essential TV", price: 15.00 },
      { name: "Sky Ultimate TV", price: 24.00 },
    ],
  },
  {
    serviceId: "paramount",
    // Three-tier since Nov 2024 (was a single £6.99 tier).
    tiers: [
      { name: "Basic with Ads", price: 4.99 },
      { name: "Standard", price: 7.99 },
      { name: "Premium", price: 10.99 },
    ],
  },
  {
    serviceId: "bbc",
    // Free to stream; requires a TV Licence (£180/yr from Apr 2026) which
    // is not a per-service subscription, so modelled as £0.
    tiers: [
      { name: "Free (TV Licence)", price: 0.00 },
    ],
  },
  {
    serviceId: "itvx",
    // Premium £5.99/mo verified July 2026 (unchanged).
    tiers: [
      { name: "Free", price: 0.00 },
      { name: "Premium", price: 5.99 },
    ],
  },
  {
    serviceId: "channel4",
    // Core service is free (ad-funded). An optional ad-free tier "Channel 4+"
    // exists at £3.99/mo but is not modelled here so the default stays Free —
    // the overwhelming-majority consumer experience.
    tiers: [
      { name: "Free", price: 0.00 },
    ],
  },
];

/**
 * Get pricing data for a service.
 * Returns null if service not found.
 */
export function getPlatformPricing(serviceId: string): PlatformPricing | null {
  return PLATFORM_PRICING.find((p) => p.serviceId === serviceId) || null;
}

/**
 * Get the default tier for a service.
 * Returns the first non-free tier, or the first tier if all are free.
 */
export function getDefaultTier(serviceId: string): PricingTier | null {
  const pricing = getPlatformPricing(serviceId);
  if (!pricing || pricing.tiers.length === 0) return null;
  return pricing.tiers.find((t) => t.price > 0) || pricing.tiers[0];
}
