/**
 * Phase 5.5 C16 / IN-PX-35 — user-data export.
 *
 * Calls the export_user_data RPC (migration 043) and delivers the
 * resulting JSON either as a browser Blob download (web / dev
 * server) or as a file in the device's Documents directory
 * (Capacitor native).
 *
 * Both paths produce the same JSON object — the caller doesn't need
 * to branch.
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { supabase } from '../supabase';

// Workaround: migration 043 (export_user_data) lives in the repo but
// is not yet applied to remote, so `database.types.ts` (regenerated
// at C1 time) doesn't list this RPC. Drop this cast after the next
// gen-types run post-apply; the typegen-check CI will flag the stale
// types on any PR that touches migrations until then.
type SupabaseRpc = typeof supabase.rpc;
const rpc = supabase.rpc as unknown as (
  fn: 'export_user_data',
) => ReturnType<SupabaseRpc>;

export interface ExportResult {
  /** Friendly description of where the file landed. Use in toast. */
  destination: string;
  /** The exported JSON payload, for logging or further processing. */
  data: string;
}

/**
 * Triggers a complete user-data export. Returns the destination string
 * for the success toast, or throws on failure (toast the error).
 *
 * The RPC enforces auth.uid() scoping server-side; a caller can ONLY
 * receive their own data. This is the load-bearing guarantee that
 * makes the C16 privacy smoke test meaningful.
 */
export async function exportUserData(): Promise<ExportResult> {
  const { data, error } = await rpc('export_user_data');
  if (error) {
    throw new Error(error.message || 'Export failed');
  }
  if (data == null) {
    throw new Error('Export returned no data');
  }

  const json = JSON.stringify(data, null, 2);
  const filename = `videx-export-${new Date().toISOString().split('T')[0]}.json`;

  if (Capacitor.isNativePlatform()) {
    // Native (Android Capacitor): write to Documents. Filesystem plugin
    // handles scoped-storage on Android 11+; older Android falls back
    // to the public Documents directory via the plugin's compat shim.
    await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    return {
      destination: `Saved to Documents/${filename}`,
      data: json,
    };
  }

  // Web fallback: synthesise a Blob download. Works in any browser-
  // shaped environment including the Vite dev server.
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
  return {
    destination: 'Your download should appear shortly.',
    data: json,
  };
}
