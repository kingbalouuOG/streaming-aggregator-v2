/**
 * Taste Profile Storage
 *
 * Persists the user's taste vector, quiz answers, and interaction log.
 * Routes to Supabase when authenticated, localStorage otherwise.
 */

import storage, { isSupabaseActive } from '../storage';
import {
  type TasteVector,
  createEmptyVector,
  createDefaultVector,
  clampVector,
  blendVector,
  blendVectorAway,
  ALL_DIMENSIONS,
  GENRE_DIMENSIONS,
} from '../taste/tasteVector';
import { contentToVector, type ContentMetadata } from '../taste/contentVectorMapping';
import * as supa from '../supabaseStorage';

// ── Storage key & version ───────────────────────────────────────

const STORAGE_KEY = '@taste_profile';
const SCHEMA_VERSION = 1;

// ── Interfaces (per spec Part 3) ────────────────────────────────

export interface TasteProfile {
  vector: TasteVector;
  quizCompleted: boolean;
  quizAnswers: QuizAnswer[];
  interactionLog: Interaction[];
  lastUpdated: string;   // ISO timestamp
  version: number;       // schema version
}

export interface QuizAnswer {
  pairId: string;
  chosenOption: 'A' | 'B' | 'neither' | 'skip' | 'both';
  phase: 'fixed' | 'genre-responsive' | 'adaptive';
  timestamp: string;
}

export interface Interaction {
  contentId: number;       // TMDb ID
  contentType: 'movie' | 'tv';
  action: 'thumbs_up' | 'thumbs_down' | 'watchlist_add' | 'watched' | 'removed';
  timestamp: string;
  contentVector: TasteVector;
}

// ── Interaction log cap ─────────────────────────────────────────

const MAX_INTERACTIONS = 500;

// ── Interaction weights (per spec Part 3) ───────────────────────

export const INTERACTION_WEIGHTS: Record<Interaction['action'], number> = {
  thumbs_up: 1.0,
  thumbs_down: 0.8,
  watchlist_add: 0.4,
  watched: 0.3,
  removed: 0.2,
};

const LEARNING_RATE = 0.1;

// ── Recency weights (per spec Part 3) ───────────────────────────

function getRecencyWeight(timestampStr: string): number {
  const age = Date.now() - new Date(timestampStr).getTime();
  const days = age / (1000 * 60 * 60 * 24);
  if (days <= 7) return 1.0;
  if (days <= 30) return 0.8;
  if (days <= 90) return 0.5;
  return 0.3;
}

// ── CRUD ────────────────────────────────────────────────────────

export async function getTasteProfile(): Promise<TasteProfile | null> {
  if (isSupabaseActive()) {
    try {
      return await supa.supaGetTasteProfile();
    } catch (error) {
      console.error('[TasteProfile] Supabase getTasteProfile failed, falling back:', error);
    }
  }
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const profile = JSON.parse(raw) as TasteProfile;
    return profile;
  } catch {
    return null;
  }
}

export async function saveTasteProfile(profile: TasteProfile): Promise<void> {
  if (isSupabaseActive()) {
    try {
      await supa.supaSaveTasteProfile(profile);
      return;
    } catch (error) {
      console.error('[TasteProfile] Supabase saveTasteProfile failed, falling back:', error);
    }
  }
  await storage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export async function clearTasteProfile(): Promise<void> {
  if (isSupabaseActive()) {
    try {
      await supa.supaClearTasteProfile();
      return;
    } catch (error) {
      console.error('[TasteProfile] Supabase clearTasteProfile failed, falling back:', error);
    }
  }
  await storage.removeItem(STORAGE_KEY);
}

// ── Initialization ──────────────────────────────────────────────

/** Create a taste profile seeded from genre selections (onboarding) */
export async function initializeFromGenres(selectedGenres: string[]): Promise<TasteProfile> {
  const existing = await getTasteProfile();
  if (existing) return existing; // Don't overwrite

  const profile: TasteProfile = {
    vector: createDefaultVector(selectedGenres),
    quizCompleted: false,
    quizAnswers: [],
    interactionLog: [],
    lastUpdated: new Date().toISOString(),
    version: SCHEMA_VERSION,
  };
  await saveTasteProfile(profile);
  return profile;
}

/** Create a taste profile seeded from cluster selections (onboarding V2.5) */
export async function initializeFromClusters(clusterIds: string[]): Promise<TasteProfile> {
  const existing = await getTasteProfile();
  if (existing) return existing; // Don't overwrite

  const { computeClusterSeedVector } = await import('../taste/tasteClusters');
  const seedVector = computeClusterSeedVector(clusterIds);
  const profile: TasteProfile = {
    vector: seedVector,
    quizCompleted: false,
    quizAnswers: [],
    interactionLog: [],
    lastUpdated: new Date().toISOString(),
    version: SCHEMA_VERSION,
  };

  // Supabase path: pass clusters so seed_vector gets stored
  if (isSupabaseActive()) {
    try {
      await supa.supaSaveTasteProfile(profile, clusterIds);
      return profile;
    } catch (error) {
      console.error('[TasteProfile] Supabase initializeFromClusters failed, falling back:', error);
    }
  }
  await storage.setItem(STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

/** Save quiz results into taste profile */
export async function saveQuizResults(
  quizAnswers: QuizAnswer[],
  quizVector: TasteVector
): Promise<TasteProfile> {
  const existing = await getTasteProfile();
  const profile: TasteProfile = {
    vector: quizVector,
    quizCompleted: true,
    quizAnswers,
    interactionLog: existing?.interactionLog || [],
    lastUpdated: new Date().toISOString(),
    version: SCHEMA_VERSION,
  };
  await saveTasteProfile(profile);
  return profile;
}

// ── Interaction logging ─────────────────────────────────────────

/**
 * Record a user interaction and update the taste vector.
 * Returns the updated profile.
 */
export async function recordInteraction(
  contentMeta: ContentMetadata & { contentId: number; contentType: 'movie' | 'tv' },
  action: Interaction['action']
): Promise<TasteProfile | null> {
  const profile = await getTasteProfile();
  if (!profile) return null;

  const contentVector = contentToVector(contentMeta);
  const weight = INTERACTION_WEIGHTS[action];
  const isNegative = action === 'thumbs_down' || action === 'removed';

  // Update vector using spec formula
  const newVector = isNegative
    ? blendVectorAway(profile.vector, contentVector, weight, LEARNING_RATE)
    : blendVector(profile.vector, contentVector, weight, LEARNING_RATE);

  // Append to interaction log
  const interaction: Interaction = {
    contentId: contentMeta.contentId,
    contentType: contentMeta.contentType,
    action,
    timestamp: new Date().toISOString(),
    contentVector,
  };

  const log = [...profile.interactionLog, interaction];
  // Enforce cap — prune oldest
  if (log.length > MAX_INTERACTIONS) {
    log.splice(0, log.length - MAX_INTERACTIONS);
  }

  const updated: TasteProfile = {
    ...profile,
    vector: newVector,
    interactionLog: log,
    lastUpdated: new Date().toISOString(),
  };
  await saveTasteProfile(updated);
  return updated;
}

// ── Recomputation from interaction log ──────────────────────────

/**
 * Full recomputation of the taste vector from the interaction log
 * with recency weights. Called on app launch if stale (>24h).
 */
export async function recomputeVector(): Promise<TasteProfile | null> {
  const profile = await getTasteProfile();
  if (!profile || profile.interactionLog.length === 0) return profile;

  // Start from quiz vector if available, otherwise from genre defaults
  let vector: TasteVector;
  if (profile.quizCompleted && profile.quizAnswers.length > 0) {
    vector = { ...profile.vector };
  } else {
    vector = createEmptyVector();
    for (const d of GENRE_DIMENSIONS) {
      if (profile.vector[d] > 0) vector[d] = 0.2;
    }
  }

  // Apply each interaction with recency weighting
  for (const interaction of profile.interactionLog) {
    const weight = INTERACTION_WEIGHTS[interaction.action];
    const recency = getRecencyWeight(interaction.timestamp);
    const effectiveWeight = weight * recency;
    const isNegative = interaction.action === 'thumbs_down' || interaction.action === 'removed';

    if (isNegative) {
      vector = blendVectorAway(vector, interaction.contentVector, effectiveWeight, LEARNING_RATE);
    } else {
      vector = blendVector(vector, interaction.contentVector, effectiveWeight, LEARNING_RATE);
    }
  }

  const updated: TasteProfile = {
    ...profile,
    vector: clampVector(vector),
    lastUpdated: new Date().toISOString(),
  };
  await saveTasteProfile(updated);
  return updated;
}

/** Check if recomputation is needed (last update > 24h ago) */
export function needsRecomputation(profile: TasteProfile): boolean {
  if (profile.interactionLog.length === 0) return false;
  const lastUpdate = new Date(profile.lastUpdated).getTime();
  const hours24 = 24 * 60 * 60 * 1000;
  return Date.now() - lastUpdate > hours24;
}

// ── Quiz retake support ─────────────────────────────────────────

/**
 * For retake: remove old quiz vector contribution and apply new quiz results.
 * Preserves interaction log and its contributions.
 */
export async function retakeQuiz(
  newAnswers: QuizAnswer[],
  newQuizVector: TasteVector
): Promise<TasteProfile> {
  const existing = await getTasteProfile();
  if (!existing) {
    return saveQuizResults(newAnswers, newQuizVector);
  }

  // Start from new quiz vector, then replay all interactions on top
  let vector = { ...newQuizVector };
  for (const interaction of existing.interactionLog) {
    const weight = INTERACTION_WEIGHTS[interaction.action];
    const recency = getRecencyWeight(interaction.timestamp);
    const effectiveWeight = weight * recency;
    const isNegative = interaction.action === 'thumbs_down' || interaction.action === 'removed';

    if (isNegative) {
      vector = blendVectorAway(vector, interaction.contentVector, effectiveWeight, LEARNING_RATE);
    } else {
      vector = blendVector(vector, interaction.contentVector, effectiveWeight, LEARNING_RATE);
    }
  }

  const updated: TasteProfile = {
    vector: clampVector(vector),
    quizCompleted: true,
    quizAnswers: newAnswers,
    interactionLog: existing.interactionLog,
    lastUpdated: new Date().toISOString(),
    version: SCHEMA_VERSION,
  };
  await saveTasteProfile(updated);
  return updated;
}

// ── Migration from legacy preferences ───────────────────────────

/**
 * For existing users: create a taste profile from their homeGenres.
 * Only creates if no profile exists.
 */
export async function migrateFromLegacyPreferences(homeGenreIds: number[]): Promise<TasteProfile | null> {
  const existing = await getTasteProfile();
  if (existing) return null; // Already has a profile

  // Map TMDb IDs back to genre names for createDefaultVector
  const { GENRE_NAMES } = await import('../constants/genres');
  const genreNames = homeGenreIds
    .map((id) => GENRE_NAMES[id])
    .filter(Boolean);

  const profile: TasteProfile = {
    vector: createDefaultVector(genreNames),
    quizCompleted: false,
    quizAnswers: [],
    interactionLog: [],
    lastUpdated: new Date().toISOString(),
    version: SCHEMA_VERSION,
  };
  await saveTasteProfile(profile);
  return profile;
}
