import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Popcorn, User, Check, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';

type UsernameStatus = 'idle' | 'too-short' | 'invalid' | 'checking' | 'available' | 'taken';

interface SignUpScreenProps {
  onGoToSignIn: () => void;
  onSignUpSuccess?: (username: string) => void;
}

export default function SignUpScreen({ onGoToSignIn, onSignUpSuccess }: SignUpScreenProps) {
  const { signUp, checkUsernameAvailable } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const latestUsernameRef = useRef('');

  // Username validation pipeline
  const handleUsernameChange = useCallback((raw: string) => {
    const cleaned = raw.toLowerCase().replace(/\s/g, '').slice(0, 20);
    setUsername(cleaned);
    setError(null);
    latestUsernameRef.current = cleaned;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (cleaned.length === 0) {
      setUsernameStatus('idle');
      return;
    }
    if (cleaned.length < 3) {
      setUsernameStatus('too-short');
      return;
    }
    if (!/^[a-z0-9]([a-z0-9_.]*[a-z0-9])?$/.test(cleaned) || /[_.]{2}/.test(cleaned)) {
      setUsernameStatus('invalid');
      return;
    }

    setUsernameStatus('checking');
    debounceRef.current = setTimeout(async () => {
      const available = await checkUsernameAvailable(cleaned);
      // Only update if this is still the latest username
      if (latestUsernameRef.current === cleaned) {
        setUsernameStatus(available ? 'available' : 'taken');
      }
    }, 600);
  }, [checkUsernameAvailable]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const pwHasLength = password.length >= 8;
  const pwHasLower = /[a-z]/.test(password);
  const pwHasUpper = /[A-Z]/.test(password);
  const pwHasSpecial = /[^a-zA-Z0-9]/.test(password);
  const passwordValid = pwHasLength && pwHasLower && pwHasUpper && pwHasSpecial;
  const confirmValid = confirmPassword.length > 0 && confirmPassword === password;
  const canSubmit = emailValid && usernameStatus === 'available' && passwordValid && confirmValid;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await signUp(email, password, username);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else {
      onSignUpSuccess?.(username);
    }
  };

  const usernameBorderColor =
    usernameStatus === 'available' ? 'rgba(34, 197, 94, 0.5)'
    : usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'rgba(239, 68, 68, 0.6)'
    : undefined;

  const confirmBorderColor =
    confirmPassword.length > 0
      ? confirmValid ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.6)'
      : undefined;

  const emailBorderColor =
    email.length > 0
      ? emailValid ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.6)'
      : undefined;

  const passwordBorderColor =
    password.length > 0 && passwordValid ? 'rgba(34, 197, 94, 0.5)' : undefined;

  return (
    <div className="size-full flex flex-col px-6 overflow-y-auto no-scrollbar">
      {/* Hero */}
      <div className="flex flex-col items-center pt-6 pb-5">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.15 }}
          className="w-16 h-16 rounded-2xl mb-4 shadow-xl shadow-primary/30 bg-gradient-to-br from-primary to-orange-400 flex items-center justify-center"
        >
          <Popcorn className="text-white" style={{ width: 32, height: 32 }} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="text-foreground text-[24px] text-center mb-1"
          style={{ fontWeight: 700 }}
        >
          Create Account
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="text-muted-foreground text-[14px] text-center"
        >
          Join VIDEX and start discovering
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
        <div>
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Mail className="w-4.5 h-4.5" />
            </div>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              className="w-full bg-secondary/60 border rounded-xl pl-11 pr-4 py-3.5 text-foreground text-[14px] placeholder:text-muted-foreground/50 outline-none focus:ring-1 transition-all"
              style={{ borderColor: emailBorderColor || 'var(--border-subtle)' }}
            />
          </div>
          {email.length > 0 && !emailValid && (
            <p className="text-red-400 text-[11px] mt-1" style={{ marginLeft: 4 }}>
              Enter a valid email address
            </p>
          )}
        </div>

        {/* Username */}
        <div>
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              <User className="w-4.5 h-4.5" />
            </div>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              className="w-full bg-secondary/60 border rounded-xl pl-11 py-3.5 text-foreground text-[14px] placeholder:text-muted-foreground/50 outline-none focus:ring-1 transition-all"
              style={{
                borderColor: usernameBorderColor || 'var(--border-subtle)',
                paddingRight: '2.75rem',
              }}
            />
            {/* Status indicator */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <AnimatePresence mode="wait">
                {usernameStatus === 'checking' && (
                  <motion.div key="checking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    >
                      <Loader2 className="w-4.5 h-4.5 text-muted-foreground" />
                    </motion.div>
                  </motion.div>
                )}
                {usernameStatus === 'available' && (
                  <motion.div
                    key="available"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)' }}
                  >
                    <Check style={{ width: 12, height: 12, color: '#22c55e' }} />
                  </motion.div>
                )}
                {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                  <motion.div
                    key="error"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="w-5 h-5 rounded-full flex items-center justify-center bg-red-500/10"
                  >
                    <X style={{ width: 12, height: 12, color: '#ef4444' }} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          {/* Username feedback */}
          {usernameStatus === 'too-short' && (
            <p className="text-muted-foreground text-[11px] mt-1" style={{ marginLeft: 4 }}>
              Username must be at least 3 characters
            </p>
          )}
          {usernameStatus === 'invalid' && (
            <p className="text-red-400 text-[11px] mt-1" style={{ marginLeft: 4 }}>
              Only lowercase letters, numbers, underscores, and dots
            </p>
          )}
          {usernameStatus === 'available' && (
            <p className="text-emerald-400 text-[11px] mt-1" style={{ marginLeft: 4 }}>
              Username is available
            </p>
          )}
          {usernameStatus === 'taken' && (
            <p className="text-red-400 text-[11px] mt-1" style={{ marginLeft: 4 }}>
              Username is already taken
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Lock className="w-4.5 h-4.5" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
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
              placeholder="Confirm password"
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
          {submitting ? 'Creating account…' : 'Create Account'}
          {!submitting && <ArrowRight style={{ width: '1.125rem', height: '1.125rem' }} />}
        </motion.button>

        <p className="text-muted-foreground text-[13px] text-center mt-4">
          Already have an account?{' '}
          <button onClick={onGoToSignIn} className="text-primary" style={{ fontWeight: 600 }}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
