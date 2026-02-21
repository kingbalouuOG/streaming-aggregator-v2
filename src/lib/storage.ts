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
    localStorage.setItem(key, value);
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
