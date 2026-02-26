/**
 * Storage Adapter
 * Drop-in replacement for AsyncStorage using localStorage.
 * Matches AsyncStorage's API surface so ported modules work unchanged.
 */

const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      if (e instanceof DOMException && (e.code === 22 || e.name === 'QuotaExceededError')) {
        // Evict ~30% of cache entries (prefixed keys) and retry
        const cacheKeys = Object.keys(localStorage).filter(
          (k) => k.startsWith('tmdb_') || k.startsWith('omdb_') || k.startsWith('watchmode_'),
        );
        const toRemove = Math.max(1, Math.ceil(cacheKeys.length * 0.3));
        cacheKeys.slice(0, toRemove).forEach((k) => localStorage.removeItem(k));
        localStorage.setItem(key, value); // retry — let it throw if still full
      } else {
        throw e;
      }
    }
  },

  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key);
  },

  async getAllKeys(): Promise<string[]> {
    return Object.keys(localStorage);
  },

  async multiRemove(keys: string[]): Promise<void> {
    keys.forEach((key) => localStorage.removeItem(key));
  },
};

export default storage;

// ── Auth-state routing for dual-backend support ─────────────────

let _isAuthenticated = false;
let _userId: string | null = null;

/** Called by AuthContext when auth state changes */
export function setAuthState(authenticated: boolean, userId?: string | null): void {
  _isAuthenticated = authenticated;
  _userId = userId ?? null;
}

/** Check if Supabase should be used for storage operations */
export function isSupabaseActive(): boolean {
  return _isAuthenticated;
}

/** Get the current authenticated user's ID */
export function getAuthUserId(): string | null {
  return _userId;
}
