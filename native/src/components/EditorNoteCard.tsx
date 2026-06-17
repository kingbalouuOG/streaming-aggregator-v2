import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { EditorNote } from '@/lib/api/editorNote';
import { EditorNoteSheet } from './EditorNoteSheet';

// Editor's note strip (§5.2) — orange serif monogram, tracked kicker,
// one-line teaser, chevron. Taps open the full essay in a bottom sheet
// (EditorNoteSheet) with a Fraunces drop cap. Mirrors the web Home card.

interface EditorNoteCardProps {
  note: EditorNote;
}

export function EditorNoteCard({ note }: EditorNoteCardProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="mx-5 mt-6 flex-row items-center gap-3 rounded-card border border-border bg-card p-4 active:bg-secondary">
      <View className="h-9 w-9 items-center justify-center rounded-md bg-primary-soft">
        <Text className="font-display-bold text-section text-primary">A</Text>
      </View>
      <View className="flex-1">
        <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">
          {note.kicker}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 font-sans text-body text-foreground">
          {note.teaser}
        </Text>
      </View>
        <ChevronRight size={16} color="rgba(245,241,232,0.4)" />
      </Pressable>
      <EditorNoteSheet note={note} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
