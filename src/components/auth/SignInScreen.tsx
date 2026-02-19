import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Popcorn } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';

interface SignInScreenProps {
  onForgotPassword: () => void;
  onGoToSignUp: () => void;
}

export default function SignInScreen({ onForgotPassword, onGoToSignUp }: SignInScreenProps) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length >= 8;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    }
  };

  return (
    <div className="size-full flex flex-col px-6 overflow-y-auto no-scrollbar">
      {/* Hero */}
      <div className="flex flex-col items-center pt-6" style={{ paddingBottom: '2rem' }}>
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.15 }}
          className="w-20 h-20 rounded-3xl mb-5 shadow-xl shadow-primary/30 bg-gradient-to-br from-primary to-orange-400 flex items-center justify-center"
        >
          <Popcorn className="text-white" style={{ width: 40, height: 40 }} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="text-foreground text-[26px] text-center mb-2"
          style={{ fontWeight: 700 }}
        >
          Welcome back
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="text-muted-foreground text-[14px] text-center max-w-[280px]"
        >
          Sign in to your VIDEX account
        </motion.p>
      </div>

      {/* Form */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="space-y-3"
      >
        {/* Email */}
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Mail className="w-4.5 h-4.5" />
          </div>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            className="w-full bg-secondary/60 border rounded-xl pl-11 pr-4 py-3.5 text-foreground text-[14px] placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            style={{ borderColor: 'var(--border-subtle)' }}
          />
        </div>

        {/* Password */}
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Lock className="w-4.5 h-4.5" />
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            className="w-full bg-secondary/60 border rounded-xl pl-11 pr-4 py-3.5 text-foreground text-[14px] placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            style={{ borderColor: 'var(--border-subtle)', paddingRight: '2.75rem' }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
          </button>
        </div>

        {/* Forgot password link */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-primary text-[13px]"
            style={{ fontWeight: 500 }}
          >
            Forgot password?
          </button>
        </div>

        {/* Error message */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-red-400 text-[13px] text-center"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Spacer */}
      <div className="flex-1" style={{ minHeight: '1rem' }} />

      {/* Bottom CTA */}
      <div className="pb-8">
        <motion.button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          whileTap={canSubmit && !submitting ? { scale: 0.97 } : undefined}
          className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[15px] transition-all duration-300 ${
            canSubmit && !submitting
              ? 'bg-primary text-white shadow-lg shadow-primary/25'
              : 'bg-secondary text-muted-foreground cursor-not-allowed'
          }`}
          style={{ fontWeight: 600 }}
        >
          {submitting ? 'Signing in…' : 'Sign In'}
          {!submitting && <ArrowRight style={{ width: '1.125rem', height: '1.125rem' }} />}
        </motion.button>

        <p className="text-muted-foreground text-[13px] text-center mt-4">
          Don't have an account?{' '}
          <button onClick={onGoToSignUp} className="text-primary" style={{ fontWeight: 600 }}>
            Create one
          </button>
        </p>
      </div>
    </div>
  );
}
