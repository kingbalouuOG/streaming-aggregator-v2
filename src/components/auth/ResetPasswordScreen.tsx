import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, KeyRound, Lock, Eye, EyeOff, Check } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';

export default function ResetPasswordScreen() {
  const { resetPassword, clearPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const pwHasLength = password.length >= 8;
  const pwHasLower = /[a-z]/.test(password);
  const pwHasUpper = /[A-Z]/.test(password);
  const pwHasSpecial = /[^a-zA-Z0-9]/.test(password);
  const passwordValid = pwHasLength && pwHasLower && pwHasUpper && pwHasSpecial;
  const confirmValid = confirmPassword.length > 0 && confirmPassword === password;
  const canSubmit = passwordValid && confirmValid;

  const passwordBorderColor =
    password.length > 0 && passwordValid ? 'rgba(34, 197, 94, 0.5)' : undefined;

  const confirmBorderColor =
    confirmPassword.length > 0
      ? confirmValid ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.6)'
      : undefined;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await resetPassword(password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
    }
  };

  return (
    <div className="size-full flex flex-col px-6 overflow-y-auto no-scrollbar">
      <AnimatePresence mode="wait">
        {!success ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col flex-1"
          >
            {/* Hero */}
            <div className="flex flex-col items-center pt-6" style={{ paddingBottom: '2rem' }}>
              <div
                className="w-20 h-20 rounded-3xl mb-5 flex items-center justify-center border"
                style={{
                  background: 'linear-gradient(to bottom right, rgba(232,93,37,0.2), rgba(251,146,60,0.2))',
                  borderColor: 'rgba(232,93,37,0.3)',
                }}
              >
                <KeyRound className="text-primary" style={{ width: 40, height: 40 }} />
              </div>

              <h1
                className="text-foreground text-[26px] text-center mb-2"
                style={{ fontWeight: 700 }}
              >
                Set New Password
              </h1>
              <p className="text-muted-foreground text-[14px] text-center max-w-[280px]">
                Enter your new password below
              </p>
            </div>

            {/* Form */}
            <div className="space-y-3">
              {/* New password */}
              <div>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Lock className="w-4.5 h-4.5" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="New password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    className="w-full bg-secondary/60 border rounded-xl pl-11 py-3.5 text-foreground text-[14px] placeholder:text-muted-foreground/50 outline-none focus:ring-1 transition-all"
                    style={{
                      borderColor: passwordBorderColor || 'var(--border-subtle)',
                      paddingRight: '2.75rem',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="mt-1 space-y-0.5" style={{ marginLeft: 4 }}>
                    <p className={`text-[11px] ${pwHasLength ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                      {pwHasLength ? '✓' : '·'} At least 8 characters
                    </p>
                    <p className={`text-[11px] ${pwHasUpper ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                      {pwHasUpper ? '✓' : '·'} Uppercase letter
                    </p>
                    <p className={`text-[11px] ${pwHasLower ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                      {pwHasLower ? '✓' : '·'} Lowercase letter
                    </p>
                    <p className={`text-[11px] ${pwHasSpecial ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                      {pwHasSpecial ? '✓' : '·'} Special character
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Lock className="w-4.5 h-4.5" />
                  </div>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                    className="w-full bg-secondary/60 border rounded-xl pl-11 py-3.5 text-foreground text-[14px] placeholder:text-muted-foreground/50 outline-none focus:ring-1 transition-all"
                    style={{
                      borderColor: confirmBorderColor || 'var(--border-subtle)',
                      paddingRight: '2.75rem',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showConfirm ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>
                {confirmPassword.length > 0 && !confirmValid && (
                  <p className="text-red-400 text-[11px] mt-1" style={{ marginLeft: 4 }}>
                    Passwords don't match
                  </p>
                )}
              </div>

              {/* Error */}
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
            </div>

            {/* Spacer */}
            <div className="flex-1" style={{ minHeight: '1rem' }} />

            {/* Submit */}
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
                {submitting ? 'Updating…' : 'Update Password'}
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
            {/* Success */}
            <div className="flex flex-col items-center pt-6" style={{ paddingBottom: '2rem' }}>
              <div
                className="w-20 h-20 rounded-3xl mb-5 flex items-center justify-center border"
                style={{
                  background: 'linear-gradient(to bottom right, rgba(232,93,37,0.2), rgba(251,146,60,0.2))',
                  borderColor: 'rgba(232,93,37,0.3)',
                }}
              >
                <KeyRound className="text-primary" style={{ width: 40, height: 40 }} />
              </div>

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
                style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)' }}
              >
                <Check style={{ width: 28, height: 28, color: '#4ade80' }} />
              </motion.div>

              <h1
                className="text-foreground text-[26px] text-center mb-2"
                style={{ fontWeight: 700 }}
              >
                Password Updated
              </h1>
              <p className="text-muted-foreground text-[14px] text-center max-w-[280px]">
                Your password has been changed successfully
              </p>
            </div>

            {/* Spacer */}
            <div className="flex-1" style={{ minHeight: '1rem' }} />

            {/* Continue */}
            <div className="pb-8">
              <motion.button
                onClick={clearPasswordRecovery}
                whileTap={{ scale: 0.97 }}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[15px] bg-primary text-white shadow-lg shadow-primary/25 transition-all duration-300"
                style={{ fontWeight: 600 }}
              >
                Continue
                <ArrowRight style={{ width: '1.125rem', height: '1.125rem' }} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
