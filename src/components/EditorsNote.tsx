import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Kicker } from "./Kicker";
import { CloseIcon } from "./icons";

interface EditorsNoteProps {
  /** Default "EDITOR'S NOTE". Pass a date or topic to override. */
  kicker?: string;
  /** One-line teaser shown collapsed. Tap expands to the full body. */
  teaser: string;
  /** Full essay shown in the modal. Plain text; first letter is dropcap. */
  body: string;
}

/**
 * EditorsNote per design-system.md §4.
 *
 *   Default state — a single-line strip with the "A" mark + kicker +
 *   1-sentence teaser. Tap → modal sheet with full essay, drop cap on
 *   first letter, close button. Modal uses var(--shadow-sheet) and
 *   slides up.
 *
 * The "A" mark is a stylised typographic glyph in Fraunces, rendered
 * in --primary, signalling editorial copy.
 */
export function EditorsNote({
  kicker = "EDITOR'S NOTE",
  teaser,
  body,
}: EditorsNoteProps) {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Esc closes the sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const dropCap = body.trim().charAt(0);
  const rest = body.trim().slice(1);

  return (
    <>
      {/* Collapsed strip */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-3 text-left cursor-pointer"
        style={{
          background: "var(--surface-elev)",
          border: "0.5px solid var(--hairline)",
          borderRadius: "var(--r-card)",
          color: "var(--fg)",
        }}
        aria-label={`${kicker}: ${teaser}`}
        aria-haspopup="dialog"
      >
        <span
          aria-hidden
          className="shrink-0 inline-flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            borderRadius: "var(--r-pill)",
            background: "var(--primary)",
            color: "#fff",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 16,
            fontVariationSettings: '"opsz" 36',
            letterSpacing: "-0.02em",
          }}
        >
          A
        </span>
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <Kicker>{kicker}</Kicker>
          <span
            className="line-clamp-1"
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "var(--t-body)",
              color: "var(--fg-soft)",
              lineHeight: 1.35,
            }}
          >
            {teaser}
          </span>
        </span>
      </button>

      {/* Modal sheet */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40"
              style={{ background: "var(--backdrop)" }}
            />
            <motion.div
              key="sheet"
              role="dialog"
              aria-modal="true"
              aria-label={kicker}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.28, ease: [0.34, 1.56, 0.64, 1] }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] flex flex-col"
              style={{
                background: "var(--surface-elev)",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                boxShadow: "var(--shadow-sheet)",
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
              }}
            >
              {/* Grabber pill */}
              <div className="flex justify-center pt-2 pb-1">
                <span
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: "var(--r-pill)",
                    background: "var(--hairline)",
                  }}
                />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3">
                <Kicker>{kicker}</Kicker>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 inline-flex items-center justify-center cursor-pointer"
                  style={{ color: "var(--fg-soft)" }}
                  aria-label="Close"
                >
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div
                className="flex-1 overflow-y-auto px-5 pb-8"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 18,
                  fontVariationSettings: '"opsz" 24',
                  color: "var(--fg)",
                  lineHeight: 1.55,
                }}
              >
                <p style={{ margin: 0 }}>
                  <span
                    aria-hidden
                    style={{
                      float: "left",
                      fontFamily: "var(--font-display)",
                      fontWeight: 800,
                      fontSize: 64,
                      fontVariationSettings: '"opsz" 144',
                      lineHeight: 0.85,
                      paddingTop: 6,
                      paddingRight: 8,
                      color: "var(--primary)",
                    }}
                  >
                    {dropCap}
                  </span>
                  {rest}
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
