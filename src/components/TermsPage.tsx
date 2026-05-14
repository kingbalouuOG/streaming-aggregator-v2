/**
 * Phase 5.5 C14 / IN-PX-34 — Terms of Service sheet.
 *
 * Renders docs/legal/terms-of-service.md via react-markdown. Source of
 * truth stays in docs/legal/. See PrivacyPolicyPage.tsx for the
 * pattern rationale.
 */

import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import termsMd from '../../docs/legal/terms-of-service.md?raw';

interface TermsPageProps {
  onClose: () => void;
}

export function TermsPage({ onClose }: TermsPageProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-stretch justify-center"
      style={{ background: 'color-mix(in srgb, var(--surface) 96%, transparent)' }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="flex flex-col w-full h-full overflow-hidden"
      >
        <div
          className="sticky top-0 z-10 backdrop-blur-xl flex items-start gap-3 px-5 pb-4"
          style={{
            background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
            paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 inline-flex items-center justify-center shrink-0 mt-1"
            style={{
              borderRadius: 'var(--r-md)',
              background: 'var(--surface-tint)',
              color: 'var(--fg-soft)',
            }}
            aria-label="Close terms of service"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <span className="t-kicker">LEGAL</span>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--t-title)',
                fontWeight: 700,
                fontVariationSettings: '"opsz" 36',
                letterSpacing: '-0.01em',
                color: 'var(--fg)',
                lineHeight: 1.15,
                margin: 0,
                marginTop: 2,
              }}
            >
              Terms of Service.
            </h1>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto px-5 pb-8"
          style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
        >
          <article
            className="prose prose-sm max-w-none"
            style={{
              color: 'var(--fg)',
              fontFamily: 'var(--font-ui)',
              fontSize: 14,
              lineHeight: 1.55,
            }}
          >
            <ReactMarkdown>{termsMd}</ReactMarkdown>
          </article>
        </div>
      </motion.div>
    </motion.div>
  );
}
