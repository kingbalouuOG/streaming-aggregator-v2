import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, KeyRound, Mail, Check } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';

interface ForgotPasswordScreenProps {
  onBack: () => void;
}

export default function ForgotPasswordScreen({ onBack }: ForgotPasswordScreenProps) {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = async () => {
    if (!emailValid || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await forgotPassword(email);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
    } else {
      setSent(true);
      setSubmitting(false);
    }
  };

  const handleTryAgain = () => {
    setSent(false);
    // Keep email pre-filled
  };

  return (
    <div className="size-full flex flex-col px-6 overflow-y-auto no-scrollbar">
      {/* Back button */}
      <div className="pt-4 pb-4">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
        >
          <ArrowLeft className="w-4.5 h-4.5 text-foreground" />
        </button>
      </div>

      <AnimatePresence mode="wait">
        {!sent ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col flex-1"
          >
            {/* Icon */}
            <div className="flex flex-col items-center" style={{ paddingBottom: '2rem' }}>
              <div
                className="w-20 h-20 rounded-3xl mb-5 flex items-center justify-center border"
                style={{
                  background: 'linear-gradient(to bottom right, rgba(232,93,37,0.2), rgba(251,146,60,0.2))',
                  borderColor: 'rgba(232,93,37,0.3)',
                }}
              >
                <KeyRound className="text-primary" style={{ width: 40, height: 40 }} />
              </div>

              <span className="t-kicker text-center" style={{ marginBottom: 12 }}>
                RESET PASSWORD
              </span>
              <h1
                className="text-center"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--t-headline)",
                  fontWeight: 600,
                  fontVariationSettings: '"opsz" 48',
                  letterSpacing: "-0.01em",
                  color: "var(--fg)",
                  lineHeight: 1.15,
                  margin: 0,
                  marginBottom: 8,
                }}
              >
                Forgot it? Easy fix.
              </h1>
              <p
                className="text-center max-w-[280px]"
                style={{
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                  fontSize: "var(--t-body)",
                  color: "var(--fg-soft)",
                  lineHeight: 1.4,
                }}
              >
                Enter your email and we'll send a reset link.
              </p>
            </div>

            {/* Email input */}
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Mail className="w-4.5 h-4.5" />
              </div>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                className="w-full bg-secondary/60 border rounded-xl pl-11 pr-4 py-3.5 text-foreground text-[14px] placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                style={{ borderColor: 'var(--border-subtle)' }}
              />
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-red-400 text-[13px] text-center mt-3"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Spacer */}
            <div className="flex-1" style={{ minHeight: '1rem' }} />

            {/* Submit */}
            <div className="pb-8">
              <motion.button
                onClick={handleSubmit}
                disabled={!emailValid || submitting}
                whileTap={emailValid && !submitting ? { scale: 0.97 } : undefined}
                className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[15px] transition-all duration-300 ${
                  emailValid && !submitting
                    ? 'bg-primary text-white shadow-lg shadow-primary/25'
                    : 'bg-secondary text-muted-foreground cursor-not-allowed'
                }`}
                style={{ fontWeight: 600 }}
              >
                {submitting ? 'Sending…' : 'Send Reset Link'}
                {!submitting && <ArrowRight style={{ width: '1.125rem', height: '1.125rem' }} />}
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="success"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex flex-col flex-1"
          >
            {/* Icon */}
            <div className="flex flex-col items-center" style={{ paddingBottom: '2rem' }}>
              <div
                className="w-20 h-20 rounded-3xl mb-5 flex items-center justify-center border"
                style={{
                  background: 'linear-gradient(to bottom right, rgba(232,93,37,0.2), rgba(251,146,60,0.2))',
                  borderColor: 'rgba(232,93,37,0.3)',
                }}
              >
                <KeyRound className="text-primary" style={{ width: 40, height: 40 }} />
              </div>

              {/* Success badge */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
                style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)' }}
              >
                <Check style={{ width: 28, height: 28, color: '#4ade80' }} />
              </motion.div>

              <span className="t-kicker text-center" style={{ marginBottom: 12 }}>
                LINK SENT
              </span>
              <h1
                className="text-center"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--t-headline)",
                  fontWeight: 600,
                  fontVariationSettings: '"opsz" 48',
                  letterSpacing: "-0.01em",
                  color: "var(--fg)",
                  lineHeight: 1.15,
                  margin: 0,
                  marginBottom: 8,
                }}
              >
                Check your email.
              </h1>
              <p
                className="text-center max-w-[280px]"
                style={{
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                  fontSize: "var(--t-body)",
                  color: "var(--fg-soft)",
                  lineHeight: 1.4,
                }}
              >
                We've sent a password reset link to{' '}
                <span style={{ color: "var(--fg)", fontStyle: "normal", fontWeight: 600 }}>{email}</span>.
              </p>
            </div>

            {/* Spacer */}
            <div className="flex-1" style={{ minHeight: '1rem' }} />

            {/* Back to Sign In */}
            <div className="pb-8">
              <motion.button
                onClick={onBack}
                whileTap={{ scale: 0.97 }}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[15px] bg-primary text-white shadow-lg shadow-primary/25 transition-all duration-300"
                style={{ fontWeight: 600 }}
              >
                Back to Sign In
                <ArrowRight style={{ width: '1.125rem', height: '1.125rem' }} />
              </motion.button>

              <p className="text-muted-foreground text-[13px] text-center mt-4">
                Didn't receive it? Check your spam folder or{' '}
                <button onClick={handleTryAgain} className="text-primary" style={{ fontWeight: 600 }}>
                  try again
                </button>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
