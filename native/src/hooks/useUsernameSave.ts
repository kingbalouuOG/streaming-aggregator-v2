import { useEffect, useState } from 'react';

import { isValidUsername } from '@/lib/auth/username';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

// Username availability and save, shared by "Choose your name"
// (app/choose-username.tsx) and Profile → Account Details
// (components/profile/ProfileAccount.tsx) (IN-GR-045).
//
// The check: debounced username_available while the name is valid and the
// caller has enabled it. checkUsernameAvailable throws on an RPC error (code
// sweep): that leaves 'idle' and does not block, since the save's UNIQUE
// check decides.
//
// The save, in this order: profiles (username + username_chosen; its UNIQUE
// constraint is the final word on "taken", a 23505 sets 'taken'), then
// user_metadata.username, which every screen displays. If the second write
// fails, profiles already holds the name, so a retry re-saves the same row.

export type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken';

export function useUsernameSave({
  username,
  userId,
  enabled = true,
  failureMessage,
  onSaved,
}: {
  username: string;
  userId: string | undefined;
  /** Check and allow a save only while true (Profile: the name has changed). */
  enabled?: boolean;
  /** Shown when either write fails for any reason other than "taken". */
  failureMessage: string;
  /** Runs after both writes succeed, before busy clears. */
  onSaved?: () => void;
}) {
  const { checkUsernameAvailable } = useAuth();
  const [status, setStatus] = useState<UsernameStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = isValidUsername(username);
  const canSubmit = enabled && valid && status !== 'taken' && status !== 'checking' && !!userId;

  useEffect(() => {
    if (!enabled || !valid) {
      setStatus('idle');
      return;
    }
    setStatus('checking');
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const free = await checkUsernameAvailable(username);
        if (!cancelled) setStatus(free ? 'available' : 'taken');
      } catch {
        if (!cancelled) setStatus('idle');
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, enabled, valid]);

  const save = async () => {
    if (!canSubmit || busy || !userId) return;
    setBusy(true);
    setError(null);
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ username, username_chosen: true, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (profileError) {
        if (profileError.code === '23505') setStatus('taken');
        else setError(failureMessage);
        return;
      }
      const { error: metadataError } = await supabase.auth.updateUser({ data: { username } });
      if (metadataError) {
        setError(failureMessage);
        return;
      }
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };

  return { status, busy, error, valid, canSubmit, save };
}
