import { supabase } from '../supabase';

// ── Types ────────────────────────────────────────────

export type ReportType = 'not_available' | 'wrong_service' | 'other';

export interface AvailabilityReport {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  service_id: string | null; // null when user selects "All"
  report_type: ReportType;
  notes?: string;
}

export interface ReportResult {
  success: boolean;
  error?: string;
  rateLimited?: boolean;
}

// ── Rate limit check ─────────────────────────────────

export async function hasReportedRecently(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return false;

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('availability_reports')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
    .gte('created_at', twentyFourHoursAgo)
    .limit(1);

  if (error) {
    console.error('[Reports] Rate limit check failed:', error.message);
    return false; // fail open — allow the report
  }

  return (data?.length ?? 0) > 0;
}

// ── Submit report ────────────────────────────────────

export async function submitReport(report: AvailabilityReport): Promise<ReportResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    const alreadyReported = await hasReportedRecently(report.tmdb_id, report.media_type);
    if (alreadyReported) {
      return { success: false, rateLimited: true };
    }

    const { error } = await supabase.from('availability_reports').insert({
      user_id: session.user.id,
      tmdb_id: report.tmdb_id,
      media_type: report.media_type,
      service_id: report.service_id,
      report_type: report.report_type,
      notes: report.notes?.trim() || null,
    });

    if (error) {
      console.error('[Reports] Submit failed:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('[Reports] Unexpected error:', err);
    return { success: false, error: 'Unexpected error' };
  }
}
