/**
 * Storage Adapter — React Native shadow of storage.ts (NATIVE-1 W3,
 * D-N6). Metro resolves this file instead of storage.ts; the web/
 * AsyncStorage-shaped interface is preserved so all lib consumers work
 * unchanged. Backed by MMKV (synchronous, no quota — the web version's
 * quota-eviction branch has no native equivalent).
 */

import { createMMKV } from 'react-native-mmkv';

const mmkv = createMMKV({ id: 'videx' });

const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return mmkv.getString(key) ?? null;
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    mmkv.set(key, value);
  },

  async removeItem(key: string): Promise<void> {
    mmkv.remove(key);
  },

  async getAllKeys(): Promise<string[]> {
    return mmkv.getAllKeys();
  },

  async multiRemove(keys: string[]): Promise<void> {
    keys.forEach((key) => mmkv.remove(key));
  },
};

export default storage;

// ── Auth-state routing for dual-backend support ─────────────────
// Same module-level contract as storage.ts — consumers import these
// from '@/lib/storage' and Metro lands them here.

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
