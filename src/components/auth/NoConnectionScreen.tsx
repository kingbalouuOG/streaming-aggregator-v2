import { motion } from 'motion/react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { Network } from '@capacitor/network';

interface NoConnectionScreenProps {
  onRetry: () => void;
}

export default function NoConnectionScreen({ onRetry }: NoConnectionScreenProps) {
  const handleRetry = async () => {
    const status = await Network.getStatus();
    if (status.connected) {
      onRetry();
    }
  };

  return (
    <div
      className="size-full bg-background flex flex-col items-center justify-center px-6"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 12, stiffness: 200 }}
        className="w-20 h-20 rounded-3xl bg-secondary/60 flex items-center justify-center mb-6"
      >
        <WifiOff className="text-muted-foreground" style={{ width: 40, height: 40 }} />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-foreground text-[22px] text-center mb-2"
        style={{ fontWeight: 700 }}
      >
        No connection
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-muted-foreground text-[14px] text-center max-w-[280px] mb-6"
      >
        Check your internet connection and try again
      </motion.p>

      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        whileTap={{ scale: 0.97 }}
        onClick={handleRetry}
        className="flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl text-[15px] bg-primary text-white shadow-lg shadow-primary/25"
        style={{ fontWeight: 600 }}
      >
        <RefreshCw style={{ width: '1.125rem', height: '1.125rem' }} />
        Try Again
      </motion.button>
    </div>
  );
}
