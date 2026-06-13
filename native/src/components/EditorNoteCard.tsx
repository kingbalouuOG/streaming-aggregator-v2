import { ChevronRight } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import type { EditorNote } from '@/lib/api/editorNote';

// Editor's note strip (§5.2) — orange serif monogram, tracked kicker,
// one-line teaser, chevron. Mirrors the web Home card.

interface EditorNoteCardProps {
  note: EditorNote;
  onPress?: () => void;
}

export function EditorNoteCard({ note, onPress }: EditorNoteCardProps) {
  return (
    <Pressable
      onPress={onPress}
      className="mx-5 mt-6 flex-row items-center gap-3 rounded-card border border-border bg-card p-4 active:bg-secondary">
      <View className="h-9 w-9 items-center justify-center rounded-md bg-primary-soft">
        <Text className="font-display-bold text-section text-primary-on-soft">A</Text>
      </View>
      <View className="flex-1">
        <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary-on-soft">
          {note.kicker}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 font-sans text-body text-foreground">
          {note.teaser}
        </Text>
      </View>
      <ChevronRight size={16} color="rgba(245,241,232,0.4)" />
    </Pressable>
  );
}
