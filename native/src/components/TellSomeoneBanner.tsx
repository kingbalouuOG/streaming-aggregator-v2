import { Share2, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { runShare, type ShareTarget } from './ShareButton';

// "Tell someone" (Growth S4, plan G1-3). Under the detail hero when a push
// tap opened this title: "Severance has just landed on Apple TV+. Tell
// someone." Tapping it opens the same share sheet as the top-right button;
// the close button hides it for the rest of the session. Card styling
// matches Toast.

export function TellSomeoneBanner({
  text,
  target,
  onDismiss,
}: {
  text: string;
  target: ShareTarget;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await runShare(target);
    } catch {
      // Cancelled or the OS sheet failed — non-fatal.
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="mt-4 flex-row items-center gap-3 rounded-card border border-border bg-card py-3 pl-4 pr-3">
      <Pressable
        onPress={onShare}
        disabled={busy}
        accessibilityRole="button"
        className="flex-1 flex-row items-center gap-2.5 active:opacity-80">
        <Share2 size={16} color="#e85d25" />
        <Text className="flex-1 font-sans-medium text-body text-foreground">{text}</Text>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={10} accessibilityLabel="Dismiss" accessibilityRole="button">
        <X size={16} color="rgba(245,241,232,0.62)" />
      </Pressable>
    </View>
  );
}
