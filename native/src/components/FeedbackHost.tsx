import { useFeedbackPrompt } from '@/hooks/useFeedbackPrompt';
import { FeedbackSheet } from './FeedbackSheet';

// Mounts the one-time timed feedback prompt across the signed-in tab area.
// The hook owns the trigger (cumulative foreground time); this just binds it
// to the sheet. Manual feedback is opened separately from Profile.
export function FeedbackHost() {
  const { visible, dismiss } = useFeedbackPrompt();
  return <FeedbackSheet visible={visible} surface="auto_prompt" onClose={dismiss} />;
}
