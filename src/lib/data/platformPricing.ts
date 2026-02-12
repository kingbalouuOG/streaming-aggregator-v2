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
      { name: "Standard with Ads", price: 4.99 },
      { name: "Standard", price: 10.99 },
      { name: "Premium", price: 17.99 },
    ],
  },
  {
    serviceId: "prime",
    tiers: [
      { name: "Monthly", price: 8.99 },
      { name: "Annual (equiv.)", price: 7.92 },
    ],
  },
  {
    serviceId: "apple",
    tiers: [
      { name: "Standard", price: 8.99 },
      { name: "Apple One", price: 18.95 },
    ],
  },
  {
    serviceId: "disney",
    tiers: [
      { name: "Standard with Ads", price: 4.99 },
      { name: "Standard", price: 7.99 },
      { name: "Premium", price: 10.99 },
    ],
  },
  {
    serviceId: "now",
    tiers: [
      { name: "Entertainment", price: 9.99 },
      { name: "Cinema", price: 9.99 },
      { name: "Ent + Cinema", price: 14.99 },
      { name: "Sports", price: 34.99 },
    ],
  },
  {
    serviceId: "skygo",
    tiers: [
      { name: "Essential", price: 26.00 },
      { name: "Stream", price: 29.00 },
    ],
  },
  {
    serviceId: "paramount",
    tiers: [
      { name: "Standard", price: 6.99 },
    ],
  },
  {
    serviceId: "bbc",
    tiers: [
      { name: "Free (TV Licence)", price: 0.00 },
    ],
  },
  {
    serviceId: "itvx",
    tiers: [
      { name: "Free", price: 0.00 },
      { name: "Premium", price: 5.99 },
    ],
  },
  {
    serviceId: "channel4",
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
