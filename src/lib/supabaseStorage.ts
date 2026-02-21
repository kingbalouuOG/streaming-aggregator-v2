/**
 * Supabase Storage
 *
 * Typed CRUD operations for all Supabase tables.
 * Called by the routing layer in storage/*.ts when the user is authenticated.
 * RLS policies scope all queries to auth.uid() automatically.
 */

import { supabase } from './supabase';
import { getAuthUserId } from './storage';
import { vectorToArray, arrayToVector } from './taste/vectorSerialisation';
import { providerIdToServiceId, serviceIdToProviderId } from './adapters/platformAdapter';
import { UK_PROVIDERS_ARRAY } from './constants/platforms';
import type { ServiceId } from '@/components/platformLogos';
import type { TasteVector } from './taste/tasteVector';

// Re-use app types
import type { WatchlistItem, WatchlistItemMetadata } from './storage/watchlist';
import type { UserProfile, UserPreferences } from './storage/userPreferences';
import type { TasteProfile, QuizAnswer, Interaction } from './storage/tasteProfile';

// ── Rating conversion ───────────────────────────────────────────

function ratingToSupabase(rating: -1 | 0 | 1): string | null {
  if (rating === 1) return 'thumbs_up';
  if (rating === -1) return 'thumbs_down';
  return null;
}

function ratingFromSupabase(rating: string | null): -1 | 0 | 1 {
  if (rating === 'thumbs_up') return 1;
  if (rating === 'thumbs_down') return -1;
  return 0;
}

// ── Timestamp conversion ────────────────────────────────────────

function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}

function isoToMs(iso: string): number {
  return new Date(iso).getTime();
}

// ═══════════════════════════════════════════════════════════════
//  WATCHLIST
// ═══════════════════════════════════════════════════════════════

function supaRowToWatchlistItem(row: any): WatchlistItem {
  return {
    id: row.tmdb_id,
    type: row.media_type as 'movie' | 'tv',
    status: row.status as 'want_to_watch' | 'watched',
    rating: ratingFromSupabase(row.rating),
    addedAt: isoToMs(row.added_at),
    updatedAt: row.updated_at ? isoToMs(row.updated_at) : isoToMs(row.added_at),
    watchedAt: null, // Not stored in Supabase
    metadata: {
      title: row.title || 'Unknown Title',
      posterPath: row.poster_path || null,
      backdropPath: null,
      overview: '',
      releaseDate: '',
      voteAverage: 0,
      genreIds: row.genre_ids || [],
      runtime: null,
      numberOfSeasons: null,
    },
    syncStatus: 'synced',
    lastSyncedAt: Date.now(),
    version: 1,
  };
}

export async function supaGetWatchlist() {
  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .order('added_at', { ascending: false });

  if (error) {
    console.error('[SupaStorage] getWatchlist failed:', error.message);
    throw error;
  }

  return {
    items: (data || []).map(supaRowToWatchlistItem),
    lastModified: Date.now(),
    schemaVersion: 1,
  };
}

export async function supaGetWatchlistItem(id: number, type: string): Promise<WatchlistItem | null> {
  const userId = getAuthUserId();
  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .eq('user_id', userId)
    .eq('tmdb_id', id)
    .eq('media_type', type)
    .maybeSingle();

  if (error) {
    console.error('[SupaStorage] getWatchlistItem failed:', error.message);
    throw error;
  }

  return data ? supaRowToWatchlistItem(data) : null;
}

export async function supaAddToWatchlist(
  id: number,
  type: 'movie' | 'tv',
  metadata: any,
  status: 'want_to_watch' | 'watched' = 'want_to_watch'
): Promise<WatchlistItem> {
  const userId = getAuthUserId();
  const now = new Date().toISOString();

  const row = {
    user_id: userId,
    tmdb_id: id,
    media_type: type,
    status,
    rating: null as string | null,
    title: metadata?.title || metadata?.name || 'Unknown Title',
    poster_path: metadata?.posterPath || metadata?.poster_path || null,
    genre_ids: metadata?.genreIds || metadata?.genre_ids || [],
    added_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('watchlist')
    .upsert(row, { onConflict: 'user_id,tmdb_id,media_type' })
    .select()
    .single();

  if (error) {
    console.error('[SupaStorage] addToWatchlist failed:', error.message);
    throw error;
  }

  return supaRowToWatchlistItem(data);
}

export async function supaUpdateWatchlistItem(
  id: number,
  type: string,
  updates: Partial<WatchlistItem>
): Promise<WatchlistItem | null> {
  const userId = getAuthUserId();
  const now = new Date().toISOString();

  const row: Record<string, any> = { updated_at: now };

  if (updates.status !== undefined) row.status = updates.status;
  if (updates.rating !== undefined) row.rating = ratingToSupabase(updates.rating);
  if (updates.metadata?.title !== undefined) row.title = updates.metadata.title;
  if (updates.metadata?.posterPath !== undefined) row.poster_path = updates.metadata.posterPath;
  if (updates.metadata?.genreIds !== undefined) row.genre_ids = updates.metadata.genreIds;

  const { data, error } = await supabase
    .from('watchlist')
    .update(row)
    .eq('user_id', userId)
    .eq('tmdb_id', id)
    .eq('media_type', type)
    .select()
    .single();

  if (error) {
    console.error('[SupaStorage] updateWatchlistItem failed:', error.message);
    throw error;
  }

  return data ? supaRowToWatchlistItem(data) : null;
}

export async function supaRemoveFromWatchlist(id: number, type: string): Promise<boolean> {
  const userId = getAuthUserId();
  const { error, count } = await supabase
    .from('watchlist')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .eq('tmdb_id', id)
    .eq('media_type', type);

  if (error) {
    console.error('[SupaStorage] removeFromWatchlist failed:', error.message);
    throw error;
  }

  return (count ?? 0) > 0;
}

export async function supaClearWatchlist(): Promise<void> {
  const userId = getAuthUserId();
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('[SupaStorage] clearWatchlist failed:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
//  USER PROFILE (profiles table)
// ═══════════════════════════════════════════════════════════════

export async function supaGetUserProfile(): Promise<UserProfile | null> {
  const userId = getAuthUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[SupaStorage] getUserProfile failed:', error.message);
    throw error;
  }

  if (!data) return null;

  // Email lives in auth.users, not profiles — read from cached session
  const { data: { session } } = await supabase.auth.getSession();
  const email = session?.user?.email || '';

  return {
    userId,
    name: data.username || '',
    email,
    createdAt: data.created_at ? isoToMs(data.created_at) : Date.now(),
  };
}

export async function supaSaveUserProfile(
  profile: Partial<UserProfile> & { userId: string; name: string; email: string }
): Promise<void> {
  const userId = getAuthUserId();
  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      username: profile.name,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) {
    console.error('[SupaStorage] saveUserProfile failed:', error.message);
    throw error;
  }
}

export async function supaHasCompletedOnboarding(): Promise<boolean> {
  const userId = getAuthUserId();
  if (!userId) return false;

  const { data, error } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[SupaStorage] hasCompletedOnboarding failed:', error.message);
    throw error;
  }

  return data?.onboarding_completed === true;
}

export async function supaSetOnboardingCompleted(completed: boolean): Promise<void> {
  const userId = getAuthUserId();
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed: completed, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    console.error('[SupaStorage] setOnboardingCompleted failed:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
//  USER SERVICES (user_services table)
// ═══════════════════════════════════════════════════════════════

/** Get services as platform objects matching the app's UserPreferences.platforms shape */
export async function supaGetServices(): Promise<Array<{ id: number; name: string; selected: boolean }>> {
  const userId = getAuthUserId();
  const { data, error } = await supabase
    .from('user_services')
    .select('service_id')
    .eq('user_id', userId);

  if (error) {
    console.error('[SupaStorage] getServices failed:', error.message);
    throw error;
  }

  return (data || []).map((row) => {
    const serviceId = row.service_id as ServiceId;
    const providerId = serviceIdToProviderId(serviceId);
    const provider = UK_PROVIDERS_ARRAY.find((p) => p.id === providerId);
    return { id: providerId, name: provider?.name || serviceId, selected: true };
  });
}

/** Get services as provider ID numbers (for getSelectedPlatforms) */
export async function supaGetSelectedPlatforms(): Promise<number[]> {
  const platforms = await supaGetServices();
  return platforms.map((p) => p.id);
}

/** Replace all user services (delete-then-insert) */
export async function supaSetServices(serviceIds: string[]): Promise<void> {
  const userId = getAuthUserId();

  // Delete existing
  const { error: delError } = await supabase
    .from('user_services')
    .delete()
    .eq('user_id', userId);

  if (delError) {
    console.error('[SupaStorage] setServices delete failed:', delError.message);
    throw delError;
  }

  // Insert new
  if (serviceIds.length > 0) {
    const rows = serviceIds.map((sid) => ({
      user_id: userId,
      service_id: sid,
    }));

    const { error: insError } = await supabase
      .from('user_services')
      .insert(rows);

    if (insError) {
      console.error('[SupaStorage] setServices insert failed:', insError.message);
      throw insError;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  USER GENRES (user_genres table)
// ═══════════════════════════════════════════════════════════════

export async function supaGetGenres(): Promise<Array<{ genreId: string; rank: number }>> {
  const userId = getAuthUserId();
  const { data, error } = await supabase
    .from('user_genres')
    .select('genre_id, rank')
    .eq('user_id', userId)
    .order('rank', { ascending: true });

  if (error) {
    console.error('[SupaStorage] getGenres failed:', error.message);
    throw error;
  }

  return (data || []).map((row) => ({ genreId: row.genre_id, rank: row.rank }));
}

/** Replace all user genres (delete-then-insert) */
export async function supaSetGenres(genres: Array<{ genreId: string; rank: number }>): Promise<void> {
  const userId = getAuthUserId();

  const { error: delError } = await supabase
    .from('user_genres')
    .delete()
    .eq('user_id', userId);

  if (delError) {
    console.error('[SupaStorage] setGenres delete failed:', delError.message);
    throw delError;
  }

  if (genres.length > 0) {
    const rows = genres.map((g) => ({
      user_id: userId,
      genre_id: g.genreId,
      rank: g.rank,
    }));

    const { error: insError } = await supabase
      .from('user_genres')
      .insert(rows);

    if (insError) {
      console.error('[SupaStorage] setGenres insert failed:', insError.message);
      throw insError;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  USER PREFERENCES (assembled from multiple tables)
// ═══════════════════════════════════════════════════════════════

export async function supaGetUserPreferences(): Promise<UserPreferences | null> {
  const userId = getAuthUserId();
  if (!userId) return null;

  // Fetch services, profile (for region), and taste_profiles (for homeGenres, selectedClusters) in parallel
  const [servicesResult, profileResult, tasteResult] = await Promise.all([
    supabase.from('user_services').select('service_id').eq('user_id', userId),
    supabase.from('profiles').select('region').eq('id', userId).maybeSingle(),
    supabase.from('taste_profiles').select('home_genres, selected_clusters').eq('user_id', userId).maybeSingle(),
  ]);

  if (servicesResult.error) {
    console.error('[SupaStorage] getPreferences services failed:', servicesResult.error.message);
    throw servicesResult.error;
  }

  // Build platforms array from services
  const platforms = (servicesResult.data || []).map((row) => {
    const serviceId = row.service_id as ServiceId;
    const providerId = serviceIdToProviderId(serviceId);
    const provider = UK_PROVIDERS_ARRAY.find((p) => p.id === providerId);
    return { id: providerId, name: provider?.name || serviceId, selected: true };
  });

  return {
    region: profileResult.data?.region || 'GB',
    platforms,
    homeGenres: tasteResult.data?.home_genres || undefined,
    selectedClusters: tasteResult.data?.selected_clusters || undefined,
  };
}

export async function supaSaveUserPreferences(preferences: UserPreferences): Promise<void> {
  const userId = getAuthUserId();
  if (!userId) return;

  // Convert platforms to service IDs
  const serviceIds = preferences.platforms
    .filter((p) => p.selected !== false)
    .map((p) => {
      const sid = providerIdToServiceId(p.id);
      return sid || p.name; // Fallback to name if no mapping
    })
    .filter(Boolean) as string[];

  // Update services
  await supaSetServices(serviceIds);

  // Update region in profiles
  await supabase
    .from('profiles')
    .update({ region: preferences.region || 'GB', updated_at: new Date().toISOString() })
    .eq('id', userId);

  // Update homeGenres and selectedClusters in taste_profiles (if they exist)
  if (preferences.homeGenres || preferences.selectedClusters) {
    const tasteUpdate: Record<string, any> = { last_updated: new Date().toISOString() };
    if (preferences.homeGenres) tasteUpdate.home_genres = preferences.homeGenres;
    if (preferences.selectedClusters) tasteUpdate.selected_clusters = preferences.selectedClusters;

    // UPSERT in case taste_profiles row doesn't exist yet
    await supabase
      .from('taste_profiles')
      .upsert({
        user_id: userId,
        ...tasteUpdate,
      }, { onConflict: 'user_id' });
  }
}

// ═══════════════════════════════════════════════════════════════
//  TASTE PROFILE (taste_profiles table)
// ═══════════════════════════════════════════════════════════════

export async function supaGetTasteProfile(): Promise<TasteProfile | null> {
  const userId = getAuthUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('taste_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[SupaStorage] getTasteProfile failed:', error.message);
    throw error;
  }

  if (!data || !data.vector) return null;

  return {
    vector: arrayToVector(data.vector),
    quizCompleted: data.quiz_completed || false,
    quizAnswers: (data.quiz_answers as QuizAnswer[]) || [],
    interactionLog: (data.interaction_log as Interaction[]) || [],
    lastUpdated: data.last_updated || new Date().toISOString(),
    version: data.version || 1,
  };
}

export async function supaSaveTasteProfile(
  profile: TasteProfile,
  selectedClusters?: string[]
): Promise<void> {
  const userId = getAuthUserId();
  if (!userId) return;

  const row: Record<string, any> = {
    user_id: userId,
    vector: vectorToArray(profile.vector),
    quiz_completed: profile.quizCompleted,
    quiz_answers: profile.quizAnswers,
    interaction_log: profile.interactionLog,
    version: profile.version,
    last_updated: profile.lastUpdated || new Date().toISOString(),
  };

  // Compute and store seed_vector if clusters are provided
  if (selectedClusters && selectedClusters.length > 0) {
    const { computeClusterSeedVector } = await import('./taste/tasteClusters');
    row.seed_vector = vectorToArray(computeClusterSeedVector(selectedClusters));
    row.selected_clusters = selectedClusters;
  } else {
    // Preserve existing seed_vector, selected_clusters, and home_genres.
    // If seed_vector is null but clusters exist, compute it now (self-healing).
    const { data: existing } = await supabase
      .from('taste_profiles')
      .select('seed_vector, selected_clusters, home_genres')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      if (existing.selected_clusters?.length > 0) {
        if (!existing.seed_vector) {
          const { computeClusterSeedVector } = await import('./taste/tasteClusters');
          row.seed_vector = vectorToArray(computeClusterSeedVector(existing.selected_clusters));
        } else {
          row.seed_vector = existing.seed_vector;
        }
        row.selected_clusters = existing.selected_clusters;
      }
      if (existing.home_genres) row.home_genres = existing.home_genres;
    }
  }

  const { error } = await supabase
    .from('taste_profiles')
    .upsert(row, { onConflict: 'user_id' });

  if (error) {
    console.error('[SupaStorage] saveTasteProfile failed:', error.message);
    throw error;
  }
}

export async function supaClearTasteProfile(): Promise<void> {
  const userId = getAuthUserId();
  if (!userId) return;

  const { error } = await supabase
    .from('taste_profiles')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('[SupaStorage] clearTasteProfile failed:', error.message);
    throw error;
  }
}

// ── Home genres (stored in taste_profiles) ──────────────────────

const DEFAULT_HOME_GENRES = [28, 35, 18, 53, 878, 27, 10749, 80];

export async function supaGetHomeGenres(): Promise<number[]> {
  const userId = getAuthUserId();
  if (!userId) return DEFAULT_HOME_GENRES;

  const { data, error } = await supabase
    .from('taste_profiles')
    .select('home_genres')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[SupaStorage] getHomeGenres failed:', error.message);
    throw error;
  }

  return data?.home_genres?.length ? data.home_genres : DEFAULT_HOME_GENRES;
}

export async function supaSetHomeGenres(genreIds: number[]): Promise<void> {
  const userId = getAuthUserId();
  if (!userId) return;

  const { error } = await supabase
    .from('taste_profiles')
    .upsert({
      user_id: userId,
      home_genres: genreIds,
      last_updated: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) {
    console.error('[SupaStorage] setHomeGenres failed:', error.message);
    throw error;
  }
}
