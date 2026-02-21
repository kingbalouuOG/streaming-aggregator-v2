import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Check, Sparkles, ArrowRight } from 'lucide-react';

interface SignUpSuccessProps {
  username: string | null;
  onContinue: () => void;
}

export default function SignUpSuccess({ username, onContinue }: SignUpSuccessProps) {
  const progressRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const firedRef = useRef(false);
  const onContinueRef = useRef(onContinue);
  onContinueRef.current = onContinue;

  useEffect(() => {
    startTimeRef.current = performance.now();
    firedRef.current = false;

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / 2600, 1);

      if (progressRef.current) {
        progressRef.current.style.width = `${progress * 100}%`;
      }

      if (progress >= 1 && !firedRef.current) {
        firedRef.current = true;
        onContinueRef.current();
        return;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div
      className="size-full bg-background flex flex-col items-center justify-center relative overflow-hidden px-6"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Checkmark */}
      <div className="relative mb-6">
        {/* Pulse ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: 'linear-gradient(to bottom right, #22c55e, #34d399)' }}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1.6, opacity: 0 }}
          transition={{ duration: 1.2, delay: 0.4, ease: 'easeOut' }}
        />
        {/* Main circle */}
        <motion.div
          className="relative rounded-full flex items-center justify-center"
          style={{
            width: 96,
            height: 96,
            background: 'linear-gradient(to bottom right, #22c55e, #34d399)',
          }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 12, stiffness: 200 }}
        >
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.3 }}
          >
            <Check className="text-white" style={{ width: 48, height: 48 }} strokeWidth={3} />
          </motion.div>
        </motion.div>
      </div>

      {/* Text */}
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="text-foreground text-[26px] text-center mb-2"
        style={{ fontWeight: 700 }}
      >
        You're all set, {username || 'there'}!
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65 }}
        className="text-muted-foreground text-[15px] text-center max-w-[280px] mb-6"
      >
        Your account has been created successfully
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="flex items-center gap-2 text-muted-foreground text-[13px]"
      >
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span>Setting up your experience</span>
        <motion.div
          animate={{ x: [0, 4, 0] }}
          transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </motion.div>
      </motion.div>

      {/* Progress bar — pinned to bottom */}
      <div className="absolute bottom-0 left-0 right-0" style={{ height: 4 }}>
        <div className="w-full h-full bg-secondary/40">
          <div
            ref={progressRef}
            className="h-full"
            style={{
              width: '0%',
              background: 'linear-gradient(to right, var(--color-primary), #fb923c)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
