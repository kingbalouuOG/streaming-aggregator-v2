import { Check, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ServiceBadge } from '@/components/ServiceBadge';
import { SERVICE_DISPLAY_NAMES, type ServiceId } from '@/lib/types/content';
import { submitReport } from '@/lib/reports/reportService';

// Availability report sheet (NATIVE polish W1). Mirrors the web
// ReportSheet → submitReport (availability_reports table, 1/title/24h).

type ReportType = 'not_available' | 'wrong_service' | 'other';

const REPORT_TYPES: { id: ReportType; label: string }[] = [
  { id: 'not_available', label: "It's not available to stream" },
  { id: 'wrong_service', label: "It's on a different service" },
  { id: 'other', label: 'Something else' },
];

interface ReportSheetProps {
  visible: boolean;
  onClose: () => void;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  services: ServiceId[];
  onReported: () => void;
}

export function ReportSheet({ visible, onClose, tmdbId, mediaType, services, onReported }: ReportSheetProps) {
  const [service, setService] = useState<ServiceId | null>(null);
  const [type, setType] = useState<ReportType>('not_available');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await submitReport({
        tmdb_id: tmdbId,
        media_type: mediaType,
        service_id: service,
        report_type: type,
        notes: notes.trim() || undefined,
      });
      onReported();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <SafeAreaView edges={['bottom']} className="rounded-t-[20px] bg-card">
          <View className="flex-row items-center justify-between px-5 pt-4">
            <Text className="font-display-bold text-section text-foreground">Report availability</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color="rgba(245,241,232,0.62)" />
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="px-5 pb-4 pt-3">
            <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
              Which service?
            </Text>
            <View className="mt-2 flex-row flex-wrap gap-2">
              <Pill label="All" active={service === null} onPress={() => setService(null)} />
              {services.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setService(s)}
                  className={
                    service === s
                      ? 'flex-row items-center gap-1.5 rounded-pill border border-primary bg-primary-soft px-3 py-1.5'
                      : 'flex-row items-center gap-1.5 rounded-pill border border-border bg-background px-3 py-1.5'
                  }>
                  <ServiceBadge service={s} size="sm" />
                  <Text
                    className={
                      service === s
                        ? 'font-sans-medium text-meta text-primary-on-soft'
                        : 'font-sans-medium text-meta text-muted-foreground'
                    }>
                    {SERVICE_DISPLAY_NAMES[s]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text className="mt-5 font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
              What&apos;s wrong?
            </Text>
            <View className="mt-2 gap-2">
              {REPORT_TYPES.map((rt) => (
                <Pressable
                  key={rt.id}
                  onPress={() => setType(rt.id)}
                  className={
                    type === rt.id
                      ? 'flex-row items-center gap-3 rounded-card border border-primary bg-primary-soft px-4 py-3'
                      : 'flex-row items-center gap-3 rounded-card border border-border bg-background px-4 py-3'
                  }>
                  <Text
                    className={
                      type === rt.id
                        ? 'flex-1 font-sans-medium text-body text-foreground'
                        : 'flex-1 font-sans text-body text-muted-foreground'
                    }>
                    {rt.label}
                  </Text>
                  {type === rt.id ? (
                    <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
                      <Check size={12} color="#ffffff" strokeWidth={3} />
                    </View>
                  ) : (
                    <View className="h-5 w-5 rounded-full border-2 border-border" />
                  )}
                </Pressable>
              ))}
            </View>

            <TextInput
              value={notes}
              onChangeText={(t) => setNotes(t.slice(0, 500))}
              placeholder="Add a note (optional)"
              placeholderTextColor="rgba(245,241,232,0.4)"
              multiline
              className="mt-4 min-h-[64px] rounded-card border border-border bg-background px-4 py-3 font-sans text-body text-foreground"
            />

            <Pressable
              onPress={submit}
              disabled={busy}
              className="mt-4 h-14 items-center justify-center rounded-card bg-primary active:opacity-90">
              <Text className="font-sans-bold text-section text-white">
                {busy ? 'Sending…' : 'Submit report'}
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={
        active
          ? 'rounded-pill border border-primary bg-primary-soft px-3.5 py-1.5'
          : 'rounded-pill border border-border bg-background px-3.5 py-1.5'
      }>
      <Text
        className={active ? 'font-sans-medium text-meta text-primary-on-soft' : 'font-sans-medium text-meta text-muted-foreground'}>
        {label}
      </Text>
    </Pressable>
  );
}
