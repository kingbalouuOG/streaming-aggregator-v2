export const ONBOARDING_EVENTS = {
  ONBOARDING_STARTED: 'onboarding_started',
  SERVICES_COMPLETED: 'services_completed',
  CLUSTERS_COMPLETED: 'clusters_completed',
  QUIZ_STARTED: 'quiz_started',
  QUIZ_COMPLETED: 'quiz_completed',
  QUIZ_SKIPPED: 'quiz_skipped',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  FIRST_HOME_VIEW: 'first_home_view',
} as const;

export type OnboardingEventName = typeof ONBOARDING_EVENTS[keyof typeof ONBOARDING_EVENTS];

export interface OnboardingEventMetadata {
  onboarding_started: Record<string, never>;
  // channel_count: add-on channels picked at the same step (IN-SC-004, native
  // only — the web onboarding has no channel picker, hence optional).
  services_completed: { service_count: number; services: string[]; channel_count?: number };
  clusters_completed: { cluster_count: number; clusters: string[] };
  quiz_started: Record<string, never>;
  quiz_completed: { duration_seconds: number };
  quiz_skipped: { questions_answered: number };
  onboarding_completed: { total_duration_seconds: number };
  // via / src: the install's first-touch attribution (Growth S2, native only;
  // null when nothing brought the install in, absent on web).
  first_home_view: {
    has_taste_vector: boolean;
    section_count: number;
    via?: string | null;
    src?: string | null;
  };
}
