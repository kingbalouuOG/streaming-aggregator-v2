import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ServiceBadge } from "./ServiceBadge";
import { serviceLabels, type ServiceId } from "./platformLogos";
import { submitReport, type ReportType } from "@/lib/reports/reportService";

interface ReportSheetProps {
  isOpen: boolean;
  onClose: () => void;
  tmdbId: number;
  mediaType: "movie" | "tv";
  services: ServiceId[];
  onReported: () => void;
}

const ISSUE_TYPES: { value: ReportType; label: string }[] = [
  { value: "not_available", label: "Not available on this service" },
  { value: "wrong_service", label: "Listed under wrong service" },
  { value: "other", label: "Other" },
];

export function ReportSheet({
  isOpen,
  onClose,
  tmdbId,
  mediaType,
  services,
  onReported,
}: ReportSheetProps) {
  const [selectedService, setSelectedService] = useState<string | null>(null); // null = "All"
  const [reportType, setReportType] = useState<ReportType | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = reportType !== null && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);

    const result = await submitReport({
      tmdb_id: tmdbId,
      media_type: mediaType,
      service_id: selectedService,
      report_type: reportType,
      notes: notes || undefined,
    });

    setSubmitting(false);

    if (result.success) {
      onReported();
    } else if (result.rateLimited) {
      toast("You've already reported this title today");
    } else {
      toast.error("Something went wrong. Please try again.");
    }
  }

  function handleClose() {
    if (!submitting) onClose();
  }

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: "var(--backdrop)" }}
            onClick={handleClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="relative w-full max-w-md bg-surface-elevated rounded-t-3xl max-h-[90vh] flex flex-col"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div
                className="w-10 h-1 rounded-full"
                style={{ background: "var(--drag-handle)" }}
              />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-4 pt-1">
              <h2
                className="text-foreground text-[20px]"
                style={{ fontWeight: 700 }}
              >
                Report a problem
              </h2>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 pb-4 no-scrollbar">
              {/* Which service? */}
              {services.length > 0 && (
                <div className="mb-5">
                  <p
                    className="text-muted-foreground text-[13px] mb-2.5"
                    style={{ fontWeight: 500 }}
                  >
                    Which service?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {/* "All" pill */}
                    <button
                      onClick={() => setSelectedService(null)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] transition-colors"
                      style={{
                        fontWeight: 500,
                        border:
                          selectedService === null
                            ? "1.5px solid #e85d25"
                            : "1px solid var(--border-subtle)",
                        background:
                          selectedService === null
                            ? "rgba(232, 93, 37, 0.08)"
                            : "transparent",
                        color:
                          selectedService === null
                            ? "#e85d25"
                            : "var(--muted-foreground)",
                      }}
                    >
                      All
                    </button>

                    {/* Service pills */}
                    {services.map((id) => (
                      <button
                        key={id}
                        onClick={() => setSelectedService(id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] transition-colors"
                        style={{
                          fontWeight: 500,
                          border:
                            selectedService === id
                              ? "1.5px solid #e85d25"
                              : "1px solid var(--border-subtle)",
                          background:
                            selectedService === id
                              ? "rgba(232, 93, 37, 0.08)"
                              : "transparent",
                          color:
                            selectedService === id
                              ? "var(--foreground)"
                              : "var(--muted-foreground)",
                        }}
                      >
                        <ServiceBadge service={id} size="sm" />
                        {serviceLabels[id] || id}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* What's wrong? */}
              <div className="mb-5">
                <p
                  className="text-muted-foreground text-[13px] mb-2.5"
                  style={{ fontWeight: 500 }}
                >
                  What's wrong?
                </p>
                <div className="flex flex-col gap-1">
                  {ISSUE_TYPES.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setReportType(value)}
                      className="flex items-center gap-3 py-3 px-1 text-left transition-colors"
                    >
                      {/* Radio circle */}
                      <span
                        className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center"
                        style={{
                          border:
                            reportType === value
                              ? "2px solid #e85d25"
                              : "2px solid var(--border-subtle)",
                        }}
                      >
                        {reportType === value && (
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ background: "#e85d25" }}
                          />
                        )}
                      </span>
                      <span
                        className={`text-[14px] ${
                          reportType === value
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }`}
                        style={{ fontWeight: reportType === value ? 600 : 400 }}
                      >
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="mb-2">
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add details (optional)"
                  className="w-full px-4 py-3 rounded-xl bg-secondary text-foreground text-[14px] placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/30"
                  style={{ border: "1px solid var(--border-subtle)" }}
                  maxLength={500}
                />
              </div>
            </div>

            {/* Submit button */}
            <div
              className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-3.5 rounded-2xl text-white text-[15px] transition-all flex items-center justify-center gap-2"
                style={{
                  fontWeight: 600,
                  background: canSubmit ? "#e85d25" : "rgba(232, 93, 37, 0.4)",
                  boxShadow: canSubmit
                    ? "0 4px 12px rgba(232, 93, 37, 0.3)"
                    : "none",
                  cursor: canSubmit ? "pointer" : "not-allowed",
                }}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Report
              </button>
            </div>
          </motion.div>

          <style>{`
            .no-scrollbar::-webkit-scrollbar { display: none; }
            .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          `}</style>
        </div>
      )}
    </AnimatePresence>
  );
}
