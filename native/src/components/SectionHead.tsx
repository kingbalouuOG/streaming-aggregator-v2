import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

// Section header — tracked-uppercase kicker over a Fraunces title with a
// trailing full stop (design-system editorial voice). Web SectionHead
// equivalent.

interface SectionHeadProps {
  kicker: string;
  title: string;
  right?: ReactNode;
}

export function SectionHead({ kicker, title, right }: SectionHeadProps) {
  return (
    <View className="mb-3 flex-row items-end justify-between">
      <View>
        <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">
          {kicker}
        </Text>
        <Text className="mt-0.5 font-display-bold text-title text-foreground">{title}</Text>
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}
