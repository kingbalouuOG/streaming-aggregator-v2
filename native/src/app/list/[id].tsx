import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, Users } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { sendGrowthEvent } from '@/attribution';
import { BackButton } from '@/components/BackButton';
import { SharedListView } from '@/components/household/SharedListView';
import { ShareButton } from '@/components/ShareButton';
import { Toast, type ToastState } from '@/components/Toast';
import { useHousehold, useHouseholdActions } from '@/hooks/useHousehold';
import { useSharedList } from '@/hooks/useHouseholdList';
import { buildPosterUrl } from '@/lib/api/imageUrls';
import { env } from '@/lib/env';
import { countLabel } from '@/lib/format/plural';
import { isUuid } from '@/lib/growth/uuid';
import { householdErrorCode, householdErrorCopy, type HouseholdFailure } from '@/lib/household/errors';
import type { Household } from '@/lib/household/households';
import { sharedListRoute } from '@/lib/household/links';
import { fetchListPreview, type ListPreview } from '@/lib/household/listPreview';
import { getSessionSrc } from '@/lib/instrumentation/sessionOrigin';
import { clearPendingLinkFor } from '@/pendingLink';
import { useAuth } from '@/providers/auth';

// A household's shared list (Growth G2, H2). Opened from
// https://videxstreaming.com/list/{id}?invite={token}&via=household (H3
// delivers the route with the param) or from the Watchlist tab / Profile.
//
//  - Signed in, a member: the list (reactions, who added what, "Tonight?").
//  - Signed in with ?invite=: join_household(token) at once. On success
//    (already a member or not) the pending link is cleared and the list
//    shows; a first join emits household_joined and says "You're in." On an
//    error code the copy shows with Back, and the pending link is KEPT so a
//    retry after sign-in still works (plan §11b: the list screen, not H3's
//    focus handler, owns clearing for list routes).
//  - Signed out: the public preview (H3's GET /v1/list/:id/preview) with
//    Join, which goes to sign-in; H3's pending-link resume brings the person
//    back here with the param.
//  - Signed in, not a member, no invite: the preview and "Ask for an invite
//    link".

type JoinState = { status: 'idle' | 'joining' | 'joined' } | { status: 'error'; code: HouseholdFailure };

function clearListPendingLink(listId: string, token: string | null) {
  const route = sharedListRoute(listId);
  clearPendingLinkFor(route);
  if (token) clearPendingLinkFor(`${route}?invite=${token}`);
}

export default function ListRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; invite?: string }>();
  const listId = typeof params.id === 'string' ? params.id : '';
  const rawInvite = typeof params.invite === 'string' && params.invite ? params.invite : null;
  const insets = useSafeAreaInsets();
  const top = insets.top + 12;
  const { session, initializing } = useAuth();
  const households = useHousehold();
  const { join } = useHouseholdActions();
  const [joinState, setJoinState] = useState<JoinState>({ status: 'idle' });
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const attempted = useRef<string | null>(null);

  const household = households.data?.find((h) => h.watchlistId === listId) ?? null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // Join once per token, as soon as a session exists.
  const { mutateAsync: joinAsync } = join;
  useEffect(() => {
    if (!session || !rawInvite || attempted.current === rawInvite) return;
    attempted.current = rawInvite;
    if (!isUuid(rawInvite)) {
      setJoinState({ status: 'error', code: 'invite_invalid' });
      return;
    }
    setJoinState({ status: 'joining' });
    joinAsync(rawInvite)
      .then((result) => {
        clearListPendingLink(listId, rawInvite);
        if (!result.alreadyMember) {
          sendGrowthEvent({
            name: 'household_joined',
            object: { type: 'list', id: result.watchlistId },
            via: 'household',
            src: getSessionSrc(),
            metadata: { household_id: result.householdId },
          });
          setToast({ message: "You're in." });
        }
        setJoinState({ status: 'joined' });
        // The token names the household; its list is the one to show.
        if (result.watchlistId !== listId) router.replace({ pathname: '/list/[id]', params: { id: result.watchlistId } });
      })
      .catch((e: unknown) => setJoinState({ status: 'error', code: householdErrorCode(e) }));
  }, [session, rawInvite, listId, joinAsync, router]);

  // Shown to a signed-in person with no invite to resolve: the link is done.
  useEffect(() => {
    if (session && listId && !rawInvite) clearListPendingLink(listId, null);
  }, [session, listId, rawInvite]);

  const screen = <Stack.Screen options={{ animation: 'slide_from_right' }} />;

  if (initializing) return <Loading back={back} top={top} extra={screen} />;

  if (!session) {
    return (
      <>
        {screen}
        <PreviewScreen
          listId={listId}
          top={top}
          back={back}
          action={rawInvite ? { label: 'Join', onPress: () => router.replace('/auth') } : null}
          note={rawInvite ? 'Sign in or create an account to join.' : 'Ask someone in the household for an invite link.'}
        />
      </>
    );
  }

  if (joinState.status === 'error') {
    return (
      <View className="flex-1 bg-background">
        {screen}
        <BackButton onPress={back} top={top} />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center font-standfirst text-section text-foreground">Couldn't join</Text>
          <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
            {householdErrorCopy(joinState.code)}
          </Text>
          <Pressable onPress={back} className="mt-4">
            <Text className="font-sans-bold text-body text-primary">Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const settling =
    joinState.status === 'joining' ||
    households.isLoading ||
    (joinState.status === 'joined' && !household && households.isFetching);
  if (settling) return <Loading back={back} top={top} extra={screen} />;

  if (households.isError && !household) {
    return (
      <View className="flex-1 bg-background">
        {screen}
        <BackButton onPress={back} top={top} />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center font-sans text-body text-muted-foreground">
            Couldn't load this list. Check your connection and try again.
          </Text>
          <Pressable onPress={() => households.refetch()} className="mt-4">
            <Text className="font-sans-bold text-body text-primary">Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!household) {
    return (
      <>
        {screen}
        <PreviewScreen
          listId={listId}
          top={top}
          back={back}
          action={null}
          note="You're not in this household. Ask someone in it for an invite link."
        />
      </>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {screen}
      <MemberList household={household} top={top} />
      <BackButton onPress={back} top={top} />
      <Toast toast={toast} top={top + 48} onDismiss={dismissToast} />
    </View>
  );
}

function MemberList({ household, top }: { household: Household; top: number }) {
  const router = useRouter();
  const { data } = useSharedList(household.watchlistId);
  const count = data?.length ?? 0;
  return (
    <>
      <SharedListView
        household={household}
        contentTopPadding={top + 52}
        header={
          <View className="px-5 pb-2">
            <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">
              {household.listName}
            </Text>
            <Text className="mt-1 font-display text-headline text-foreground">{household.name}</Text>
            <Pressable
              onPress={() => router.push({ pathname: '/profile/[section]', params: { section: 'household' } })}
              accessibilityRole="button"
              className="mt-1.5 flex-row items-center gap-1.5 self-start active:opacity-70">
              <Users size={14} color="rgba(245,241,232,0.62)" />
              <Text className="font-sans text-body text-muted-foreground">
                {countLabel(household.memberCount, 'member')} · {countLabel(count, 'title')}
              </Text>
              <ChevronRight size={14} color="rgba(245,241,232,0.4)" />
            </Pressable>
          </View>
        }
      />
      {household.watchlistId ? (
        <ShareButton
          top={top}
          listId={household.watchlistId}
          listName={household.listName}
          householdName={household.name}
          count={count}
          householdId={household.id}
          isOwner={household.isOwner}
        />
      ) : null}
    </>
  );
}

function Loading({ back, top, extra }: { back: () => void; top: number; extra: ReactNode }) {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      {extra}
      <ActivityIndicator color="#e85d25" />
      <BackButton onPress={back} top={top} />
    </View>
  );
}

function PreviewScreen({
  listId,
  top,
  back,
  action,
  note,
}: {
  listId: string;
  top: number;
  back: () => void;
  action: { label: string; onPress: () => void } | null;
  note: string;
}) {
  const { data, isLoading, isError, refetch } = useQuery<ListPreview | null>({
    queryKey: ['native', 'listPreview', listId],
    queryFn: () => fetchListPreview(listId, { baseUrl: env.API_PROXY_URL }),
    enabled: !!listId,
    staleTime: 60 * 1000,
  });

  if (isLoading) return <Loading back={back} top={top} extra={null} />;

  return (
    <View className="flex-1 bg-background">
      <View className="flex-1 justify-center px-8">
        {data ? (
          <>
            <View className="flex-row flex-wrap justify-center gap-2">
              {data.posters.map((path) => (
                <View key={path} className="overflow-hidden rounded-md bg-card" style={{ width: 64 }}>
                  <Image
                    source={{ uri: buildPosterUrl(path) ?? '' }}
                    style={{ width: 64, aspectRatio: 2 / 3 }}
                    contentFit="cover"
                    transition={150}
                  />
                </View>
              ))}
            </View>
            <Text className="mt-5 text-center font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">
              {data.name}
            </Text>
            <Text className="mt-1 text-center font-display text-headline text-foreground">{data.household_name}</Text>
            <Text className="mt-1.5 text-center font-sans text-body text-muted-foreground">
              {countLabel(data.count, 'title')} · {countLabel(data.members, 'member')}
            </Text>
          </>
        ) : (
          <>
            <View className="h-16 w-16 items-center justify-center self-center rounded-2xl bg-card">
              <Users size={28} color="rgba(245,241,232,0.4)" />
            </View>
            <Text className="mt-4 text-center font-standfirst text-section text-foreground">A shared list on Videx</Text>
            {isError ? (
              <Pressable onPress={() => refetch()} className="mt-2 self-center">
                <Text className="font-sans-bold text-body text-primary">Try again</Text>
              </Pressable>
            ) : null}
          </>
        )}
        <Text className="mt-4 text-center font-sans text-body text-muted-foreground">{note}</Text>
        {action ? (
          <Pressable
            onPress={action.onPress}
            className="mt-5 h-12 items-center justify-center rounded-pill bg-primary active:opacity-90">
            <Text className="font-sans-bold text-body text-white">{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      <BackButton onPress={back} top={top} />
    </View>
  );
}
