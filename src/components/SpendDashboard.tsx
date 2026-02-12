import React, { useState, useMemo } from "react";
import { PoundSterling, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getPlatform } from "./platformLogos";
import { PLATFORM_PRICING, getDefaultTier, type PricingTier } from "@/lib/data/platformPricing";

interface SpendDashboardProps {
  connectedServices: string[];
}

export function SpendDashboard({ connectedServices }: SpendDashboardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedTiers, setSelectedTiers] = useState<Record<string, string>>({});
  const [editingService, setEditingService] = useState<string | null>(null);

  // Calculate pricing for each service
  const serviceBreakdown = useMemo(() => {
    return connectedServices.map((serviceId) => {
      const pricing = PLATFORM_PRICING.find((p) => p.serviceId === serviceId);
      const platform = getPlatform(serviceId);
      if (!pricing || !platform) return null;

      const selectedTierName = selectedTiers[serviceId];
      const tier = selectedTierName
        ? pricing.tiers.find((t) => t.name === selectedTierName) || getDefaultTier(serviceId)
        : getDefaultTier(serviceId);

      return {
        serviceId,
        name: platform.name,
        logo: platform.logo,
        tiers: pricing.tiers,
        selectedTier: tier,
        isFree: tier ? tier.price === 0 : true,
      };
    }).filter(Boolean) as Array<{
      serviceId: string;
      name: string;
      logo: string;
      tiers: PricingTier[];
      selectedTier: PricingTier | null;
      isFree: boolean;
    }>;
  }, [connectedServices, selectedTiers]);

  const paidServices = serviceBreakdown.filter((s) => !s.isFree);
  const freeServices = serviceBreakdown.filter((s) => s.isFree);

  const totalMonthly = serviceBreakdown.reduce(
    (sum, s) => sum + (s.selectedTier?.price || 0),
    0
  );
  const totalAnnual = totalMonthly * 12;
  const dailyRate = totalMonthly / 30;

  const handleSelectTier = (serviceId: string, tierName: string) => {
    setSelectedTiers((prev) => ({ ...prev, [serviceId]: tierName }));
    setEditingService(null);
  };

  return (
    <div className="mb-6">
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        whileTap={{ scale: 0.985 }}
        className="w-full rounded-2xl border bg-secondary/40 p-4 text-left transition-colors"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <PoundSterling className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-foreground text-[14px]" style={{ fontWeight: 600 }}>
                Monthly Spend
              </h3>
              <p className="text-muted-foreground text-[12px]">
                {paidServices.length} paid · {freeServices.length} free
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-foreground text-[18px]" style={{ fontWeight: 700 }}>
              £{totalMonthly.toFixed(2)}
            </span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Quick stats - always visible */}
        {!isExpanded && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="flex-1 text-center">
              <p className="text-muted-foreground text-[11px]">Annual</p>
              <p className="text-foreground text-[13px]" style={{ fontWeight: 600 }}>
                £{totalAnnual.toFixed(0)}
              </p>
            </div>
            <div className="w-px h-6 bg-border" />
            <div className="flex-1 text-center">
              <p className="text-muted-foreground text-[11px]">Daily</p>
              <p className="text-foreground text-[13px]" style={{ fontWeight: 600 }}>
                £{dailyRate.toFixed(2)}
              </p>
            </div>
          </div>
        )}
      </motion.button>

      {/* Expanded breakdown */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-2xl border bg-secondary/40 overflow-hidden" style={{ borderColor: "var(--border-subtle)" }}>
              {/* Paid services */}
              {paidServices.map((service) => (
                <div key={service.serviceId}>
                  <div
                    className="flex items-center gap-3 px-4 py-3 border-b"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <img
                      src={service.logo}
                      alt={service.name}
                      className="w-8 h-8 rounded-lg object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground text-[13px]" style={{ fontWeight: 600 }}>
                        {service.name}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingService(
                            editingService === service.serviceId ? null : service.serviceId
                          );
                        }}
                        className="text-muted-foreground text-[11px] hover:text-foreground transition-colors"
                      >
                        {service.selectedTier?.name || "Select tier"}
                        {service.tiers.length > 1 && (
                          <ChevronDown className="w-3 h-3 inline ml-0.5 -mt-0.5" />
                        )}
                      </button>
                    </div>
                    <span className="text-foreground text-[14px] shrink-0" style={{ fontWeight: 600 }}>
                      £{(service.selectedTier?.price || 0).toFixed(2)}
                    </span>
                  </div>

                  {/* Tier selector */}
                  <AnimatePresence>
                    {editingService === service.serviceId && service.tiers.length > 1 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-background/50"
                      >
                        {service.tiers.map((tier) => (
                          <button
                            key={tier.name}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectTier(service.serviceId, tier.name);
                            }}
                            className={`w-full flex items-center justify-between px-4 py-2.5 pl-14 text-[12px] transition-colors ${
                              service.selectedTier?.name === tier.name
                                ? "text-primary bg-primary/5"
                                : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                            }`}
                            style={{ fontWeight: service.selectedTier?.name === tier.name ? 600 : 500 }}
                          >
                            <span className="flex items-center gap-2">
                              <div
                                className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                                  service.selectedTier?.name === tier.name
                                    ? "border-primary bg-primary"
                                    : "border-muted-foreground/30"
                                }`}
                              >
                                {service.selectedTier?.name === tier.name && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                )}
                              </div>
                              {tier.name}
                            </span>
                            <span>£{tier.price.toFixed(2)}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}

              {/* Free services divider */}
              {freeServices.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-background/30">
                    <span className="text-muted-foreground text-[10px] tracking-widest uppercase" style={{ fontWeight: 600 }}>
                      Free Services
                    </span>
                  </div>
                  {freeServices.map((service) => (
                    <div
                      key={service.serviceId}
                      className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
                      style={{ borderColor: "var(--border-subtle)" }}
                    >
                      <img
                        src={service.logo}
                        alt={service.name}
                        className="w-8 h-8 rounded-lg object-cover shrink-0"
                      />
                      <p className="text-foreground text-[13px] flex-1" style={{ fontWeight: 600 }}>
                        {service.name}
                      </p>
                      <span className="text-emerald-400 text-[13px]" style={{ fontWeight: 600 }}>
                        Free
                      </span>
                    </div>
                  ))}
                </>
              )}

              {/* Annual projection */}
              <div className="px-4 py-3 bg-primary/5 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-muted-foreground text-[12px]">Annual projection</span>
                  <span className="text-foreground text-[14px]" style={{ fontWeight: 700 }}>
                    £{totalAnnual.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[12px]">Daily rate</span>
                  <span className="text-foreground text-[13px]" style={{ fontWeight: 600 }}>
                    £{dailyRate.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
