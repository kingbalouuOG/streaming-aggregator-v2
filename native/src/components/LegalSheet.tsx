import { ArrowLeft } from 'lucide-react-native';
import { Fragment } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// In-app legal sheet (beta feedback 2026-07-09). Native counterpart of the
// web PrivacyPolicyPage / TermsPage overlay sheets. Renders the mirrored
// legal copy (src/legal/policyContent.ts) with a minimal markdown-to-Text
// pass — the app has no markdown dependency and the legal docs only use a
// small, fixed subset (h1/h2/h3, bullets, **bold**, paragraphs), so a tiny
// renderer is lighter than pulling in react-native-markdown-display.

interface LegalSheetProps {
  title: string;
  markdown: string;
  visible: boolean;
  onClose: () => void;
}

// Split a paragraph on **bold** runs and render each run with the right weight.
function InlineText({ text, className }: { text: string; className: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text className={className}>
      {parts.map((part, i) => {
        const bold = part.startsWith('**') && part.endsWith('**');
        return (
          <Text key={i} className={bold ? 'font-sans-bold text-foreground' : undefined}>
            {bold ? part.slice(2, -2) : part}
          </Text>
        );
      })}
    </Text>
  );
}

function renderMarkdown(markdown: string) {
  // The h1 is rendered as the sheet's own title in the header, so skip it here.
  const lines = markdown.split('\n');
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];

  const flushParagraph = (key: string) => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ').trim();
    paragraph = [];
    if (!text) return;
    if (text === '---') return;
    blocks.push(
      <InlineText
        key={key}
        text={text}
        className="mt-3 font-sans text-body leading-relaxed text-muted-foreground"
      />,
    );
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const key = `l${i}`;
    if (line.startsWith('# ')) {
      // top-level title — handled in the header, ignore
      flushParagraph(`${key}p`);
      return;
    }
    if (line.startsWith('### ')) {
      flushParagraph(`${key}p`);
      blocks.push(
        <Text key={key} className="mt-5 font-sans-bold text-body text-foreground">
          {line.slice(4)}
        </Text>,
      );
      return;
    }
    if (line.startsWith('## ')) {
      flushParagraph(`${key}p`);
      blocks.push(
        <Text
          key={key}
          className="mb-1 mt-6 font-display text-section text-foreground">
          {line.slice(3)}
        </Text>,
      );
      return;
    }
    if (line.startsWith('- ')) {
      flushParagraph(`${key}p`);
      blocks.push(
        <View key={key} className="mt-2 flex-row pr-1">
          <Text className="font-sans text-body text-muted-foreground">•  </Text>
          <View className="flex-1">
            <InlineText
              text={line.slice(2)}
              className="font-sans text-body leading-relaxed text-muted-foreground"
            />
          </View>
        </View>,
      );
      return;
    }
    if (line.trim() === '') {
      flushParagraph(`${key}p`);
      return;
    }
    paragraph.push(line);
  });
  flushParagraph('tail');

  return blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>);
}

export function LegalSheet({ title, markdown, visible, onClose }: LegalSheetProps) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
        <View className="flex-row items-start gap-3 px-5 pb-3 pt-2">
          <Pressable
            onPress={onClose}
            accessibilityLabel={`Close ${title}`}
            className="mt-1 h-9 w-9 items-center justify-center rounded-full bg-card active:bg-secondary">
            <ArrowLeft size={18} color="#f5f1e8" />
          </Pressable>
          <View className="flex-1">
            <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
              Legal
            </Text>
            <Text className="mt-0.5 font-display-bold text-title text-foreground">{title}.</Text>
          </View>
        </View>
        <ScrollView contentContainerClassName="px-5 pb-10 pt-1" showsVerticalScrollIndicator={false}>
          {renderMarkdown(markdown)}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
