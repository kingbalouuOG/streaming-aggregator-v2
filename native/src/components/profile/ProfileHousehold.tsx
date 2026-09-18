import { useRouter } from 'expo-router';
import { ChevronRight, Link2Off, LogOut, Share2, UserPlus } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { runShare } from '@/components/ShareButton';
import { useHousehold, useHouseholdActions } from '@/hooks/useHousehold';
import { useSharedList } from '@/hooks/useHouseholdList';
import { useHouseholdMembers } from '@/hooks/useHouseholdMembers';
import { countLabel } from '@/lib/format/plural';
import { MONTH_NAMES } from '@/lib/format/months';
import { householdErrorCode, householdErrorCopy } from '@/lib/household/errors';
import { HOUSEHOLD_MEMBER_CAP, HOUSEHOLD_NAME_MAX, validHouseholdName, type Household } from '@/lib/household/households';
import type { HouseholdMember } from '@/lib/household/rpc';
import { useAuth } from '@/providers/auth';
import { SubScreenHeader } from './SubScreenHeader';

// Profile → Household (Growth G2, H2). Create a household, see who is in
// each one, invite by link (owner), revoke the link (owner), remove a member
// (owner, migration 094) and leave. One card per household the person is in.

function joinedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `Joined ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function showError(title: string, e: unknown) {
  Alert.alert(title, householdErrorCopy(householdErrorCode(e)));
}

export function ProfileHousehold() {
  const { session } = useAuth();
  const { data: households, isLoading, isError, refetch } = useHousehold();

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <SubScreenHeader title="Household" subtitle={households?.length ? countLabel(households.length, 'household') : undefined} />
      <ScrollView contentContainerClassName="px-5 pb-10 pt-3" keyboardShouldPersistTaps="handled">
        {!session ? (
          <Text className="font-sans text-body text-muted-foreground">Sign in to create or join a household.</Text>
        ) : isLoading ? (
          <ActivityIndicator color="#e85d25" style={{ marginTop: 40 }} />
        ) : isError ? (
          <View className="items-center py-10">
            <Text className="text-center font-sans text-body text-muted-foreground">
              Couldn't load your households. Check your connection and try again.
            </Text>
            <Pressable onPress={() => refetch()} className="mt-3">
              <Text className="font-sans-bold text-body text-primary">Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {(households ?? []).length === 0 ? (
              <Text className="font-sans text-body leading-6 text-muted-foreground">
                A household shares one list. Invite people by link, add titles from any detail page and react to
                what's on it. Your own watchlist stays yours.
              </Text>
            ) : null}
            {(households ?? []).map((h) => (
              <HouseholdCard key={h.id} household={h} />
            ))}
            <CreateHousehold first={(households ?? []).length === 0} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CreateHousehold({ first }: { first: boolean }) {
  const { create } = useHouseholdActions();
  const [name, setName] = useState('');
  const valid = validHouseholdName(name);

  const onCreate = () => {
    if (!valid || create.isPending) return;
    create.mutate(valid, {
      onSuccess: () => setName(''),
      onError: (e) => showError("Couldn't create it", e),
    });
  };

  return (
    <View className="mt-6">
      <Text className="mb-2 font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
        {first ? 'Create a household' : 'Create another'}
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name, for example The Flat"
        placeholderTextColor="rgba(245,241,232,0.35)"
        maxLength={HOUSEHOLD_NAME_MAX}
        returnKeyType="done"
        onSubmitEditing={onCreate}
        className="h-12 rounded-card border border-border bg-card px-4 font-sans text-body text-foreground"
      />
      <Pressable
        onPress={onCreate}
        disabled={!valid || create.isPending}
        style={{ opacity: !valid || create.isPending ? 0.5 : 1 }}
        className="mt-3 h-12 items-center justify-center rounded-pill bg-primary active:opacity-90">
        <Text className="font-sans-bold text-body text-white">Create household</Text>
      </Pressable>
    </View>
  );
}

function HouseholdCard({ household }: { household: Household }) {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const { data: members, isLoading } = useHouseholdMembers(household.id);
  const { data: items } = useSharedList(household.watchlistId);
  const { leave, revoke, remove } = useHouseholdActions();
  const [inviting, setInviting] = useState(false);
  const alone = household.memberCount <= 1;

  const onInvite = async () => {
    if (!household.watchlistId || inviting) return;
    setInviting(true);
    try {
      await runShare({
        listId: household.watchlistId,
        listName: household.listName,
        householdName: household.name,
        count: items?.length ?? 0,
        householdId: household.id,
        isOwner: household.isOwner,
      });
    } catch {
      // The OS sheet failed or was dismissed: nothing to undo.
    } finally {
      setInviting(false);
    }
  };

  const onRevoke = () => {
    revoke.mutate(household.id, {
      onSuccess: (count) =>
        Alert.alert(
          count > 0 ? 'Invite link revoked' : 'No open invite link',
          count > 0 ? 'The link no longer lets anyone join. Send a new invite when you need one.' : 'There was no link to revoke.',
        ),
      onError: (e) => showError("Couldn't revoke it", e),
    });
  };

  const onRemove = (member: HouseholdMember) => {
    Alert.alert(
      `Remove ${member.username}?`,
      `They leave ${household.name}. Titles they added stay on the list without their name, and the current invite link stops working.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            remove.mutate(
              { householdId: household.id, userId: member.userId },
              { onError: (e) => showError("Couldn't remove them", e) },
            ),
        },
      ],
    );
  };

  const onLeave = () => {
    const after = alone
      ? `You're the only member, so ${household.name} and its list are deleted.`
      : `Titles you added stay on the list without your name, and your reactions are removed.${
          household.isOwner ? ' The member who joined first becomes the owner.' : ''
        }`;
    Alert.alert(`Leave ${household.name}?`, after, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => leave.mutate(household.id, { onError: (e) => showError("Couldn't leave", e) }),
      },
    ]);
  };

  return (
    <View className="mt-4 rounded-card border border-border bg-card px-4 pb-2 pt-3.5">
      <Pressable
        onPress={() =>
          household.watchlistId
            ? router.push({ pathname: '/list/[id]', params: { id: household.watchlistId } })
            : undefined
        }
        className="flex-row items-center gap-2 active:opacity-70">
        <View className="flex-1">
          <Text className="font-sans-bold text-section text-foreground">{household.name}</Text>
          <Text className="mt-0.5 font-sans text-meta text-muted-foreground">
            {countLabel(household.memberCount, 'member')} of {HOUSEHOLD_MEMBER_CAP} · {countLabel(items?.length ?? 0, 'title')}
          </Text>
        </View>
        <Text className="font-sans-medium text-meta text-primary">Open list</Text>
        <ChevronRight size={16} color="#e85d25" />
      </Pressable>

      <View className="mt-3" style={{ borderTopWidth: 0.5, borderTopColor: 'rgba(245,241,232,0.10)' }}>
        {isLoading ? <ActivityIndicator color="#e85d25" style={{ paddingVertical: 12 }} /> : null}
        {(members ?? []).map((m) => (
          <View key={m.userId} className="flex-row items-center gap-3 py-2.5">
            <View className="h-8 w-8 items-center justify-center rounded-full bg-secondary">
              <Text className="font-sans-bold text-meta text-foreground">{(m.username[0] ?? '?').toUpperCase()}</Text>
            </View>
            <View className="flex-1">
              <Text className="font-sans-bold text-body text-foreground">
                {m.username}
                {m.userId === userId ? ' (you)' : ''}
              </Text>
              <Text className="font-sans text-meta text-muted-foreground">
                {m.role === 'owner' ? 'Owner' : 'Member'} · {joinedLabel(m.joinedAt)}
              </Text>
            </View>
            {household.isOwner && m.userId !== userId ? (
              <Pressable onPress={() => onRemove(m)} hitSlop={8} accessibilityRole="button" className="active:opacity-60">
                <Text className="font-sans-medium text-meta text-muted-foreground">Remove</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>

      <View style={{ borderTopWidth: 0.5, borderTopColor: 'rgba(245,241,232,0.10)' }}>
        {household.isOwner ? (
          <>
            <ActionRow
              icon={<UserPlus size={17} color="#e85d25" />}
              label={household.memberCount >= HOUSEHOLD_MEMBER_CAP ? 'Household full' : 'Invite by link'}
              hint="Anyone with the link can join for 7 days. A new invite replaces the last."
              disabled={inviting || household.memberCount >= HOUSEHOLD_MEMBER_CAP}
              onPress={onInvite}
            />
            <ActionRow
              icon={<Link2Off size={17} color="rgba(245,241,232,0.62)" />}
              label="Revoke invite link"
              disabled={revoke.isPending}
              onPress={onRevoke}
            />
          </>
        ) : (
          <ActionRow
            icon={<Share2 size={17} color="rgba(245,241,232,0.62)" />}
            label="Share the list"
            hint="Only the owner can invite people. Anyone you share with can ask them for a link."
            disabled={inviting}
            onPress={onInvite}
          />
        )}
        <ActionRow
          icon={<LogOut size={17} color="rgba(245,241,232,0.62)" />}
          label="Leave household"
          disabled={leave.isPending}
          onPress={onLeave}
        />
      </View>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  hint,
  disabled,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{ opacity: disabled ? 0.5 : 1 }}
      className="flex-row items-center gap-3 py-3 active:opacity-60">
      {icon}
      <View className="flex-1">
        <Text className="font-sans-medium text-body text-foreground">{label}</Text>
        {hint ? <Text className="mt-0.5 font-sans text-meta text-muted-foreground">{hint}</Text> : null}
      </View>
    </Pressable>
  );
}
