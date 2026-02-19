import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import SignInScreen from './SignInScreen';
import SignUpScreen from './SignUpScreen';
import ForgotPasswordScreen from './ForgotPasswordScreen';

type AuthView = 'sign-in' | 'sign-up' | 'forgot-password';

// Navigation order for direction: sign-in → sign-up → forgot-password
const VIEW_ORDER: AuthView[] = ['sign-in', 'sign-up', 'forgot-password'];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
  }),
};

interface AuthScreenProps {
  onSignUpSuccess?: (username: string) => void;
}

export default function AuthScreen({ onSignUpSuccess }: AuthScreenProps) {
  const [view, setView] = useState<AuthView>('sign-in');
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = back

  const navigateTo = useCallback((target: AuthView) => {
    const currentIdx = VIEW_ORDER.indexOf(view);
    const targetIdx = VIEW_ORDER.indexOf(target);
    setDirection(targetIdx > currentIdx ? 1 : -1);
    setView(target);
  }, [view]);

  return (
    <div className="size-full bg-background text-foreground overflow-hidden">
      <div className="size-full max-w-md mx-auto">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={view}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="size-full"
          >
            {view === 'sign-in' && (
              <SignInScreen
                onForgotPassword={() => navigateTo('forgot-password')}
                onGoToSignUp={() => navigateTo('sign-up')}
              />
            )}
            {view === 'sign-up' && (
              <SignUpScreen
                onGoToSignIn={() => navigateTo('sign-in')}
                onSignUpSuccess={onSignUpSuccess}
              />
            )}
            {view === 'forgot-password' && (
              <ForgotPasswordScreen
                onBack={() => navigateTo('sign-in')}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
