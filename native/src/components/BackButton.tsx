import { ArrowLeft } from 'lucide-react-native';
import { Pressable } from 'react-native';

// Top-left back affordance over a full-bleed page (detail, room). Pair with
// ShareButton at the same `top` (insets.top + 12) on the right.
export function BackButton({ onPress, top }: { onPress: () => void; top: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Back"
      style={{ top }}
      className="absolute left-4 h-9 w-9 items-center justify-center rounded-md bg-[#14141c]/60 active:bg-[#14141c]">
      <ArrowLeft size={20} color="#ffffff" />
    </Pressable>
  );
}
