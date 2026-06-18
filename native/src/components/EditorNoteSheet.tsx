import { X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { EditorNote } from '@/lib/api/editorNote';

// Editor's Note expanded modal (design system §editors-note): a bottom sheet
// with grabber + kicker header and the full essay set in Fraunces with a
// drop-cap initial. Shares the sheet chrome with ReportSheet. The collapsed
// one-line strip (EditorNoteCard) opens this.

export function EditorNoteSheet({
  note,
  visible,
  onClose,
}: {
  note: EditorNote;
  visible: boolean;
  onClose: () => void;
}) {
  const paragraphs = note.body.split('\n\n').map((p) => p.trim()).filter(Boolean);
  const [firstPara = '', ...rest] = paragraphs;
  const dropCap = firstPara.charAt(0);
  const firstRest = firstPara.slice(1);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/70">
        <SafeAreaView
          edges={['bottom']}
          className="max-h-[85%] rounded-t-[20px]"
          style={{ backgroundColor: '#13131a' }}>
          {/* grabber */}
          <View className="items-center pt-3">
            <View style={{ width: 38, height: 4, borderRadius: 999, backgroundColor: 'rgba(245,241,232,0.18)' }} />
          </View>

          {/* header */}
          <View
            className="flex-row items-start justify-between px-5 pb-3 pt-3"
            style={{ borderBottomWidth: 0.5, borderBottomColor: 'rgba(245,241,232,0.10)' }}>
            <View>
              <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">
                {note.kicker}
              </Text>
              <Text className="mt-0.5 font-sans text-meta text-muted-foreground">This week's issue</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} className="mt-1">
              <X size={20} color="rgba(245,241,232,0.62)" />
            </Pressable>
          </View>

          {/* essay */}
          <ScrollView contentContainerClassName="px-5 pb-8 pt-4" showsVerticalScrollIndicator={false}>
            <Text className="font-body-serif text-foreground" style={{ fontSize: 18, lineHeight: 28 }}>
              <Text style={{ fontFamily: 'Fraunces-Dropcap', fontSize: 46, color: '#e85d25' }}>
                {dropCap}
              </Text>
              {firstRest}
            </Text>
            {rest.map((p, i) => (
              <Text
                key={i}
                className="mt-3 font-body-serif text-foreground"
                style={{ fontSize: 18, lineHeight: 28 }}>
                {p}
              </Text>
            ))}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
