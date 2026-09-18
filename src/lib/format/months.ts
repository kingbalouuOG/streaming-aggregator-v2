/**
 * English month names, January first (IN-GR-045: one table instead of one
 * per caller). Index with Date#getUTCMonth or #getMonth.
 *
 * Pure: shared by the app, native and the Worker.
 */
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
