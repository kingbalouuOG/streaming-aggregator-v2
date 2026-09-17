/**
 * Username rules (Growth S3). Shared by onboarding Step 1 and the
 * "Choose your name" prompt so both accept exactly the same names.
 *
 * Format: 3–20 chars, lowercase a–z, 0–9, `_` and `.`; starts and ends
 * with a letter or digit; no `__`, `..`, `_.` or `._`.
 *
 * The trigger placeholder (migration 089: `user_` + 8 or 32 hex digits)
 * is reserved — nobody may pick one, so a placeholder in profiles always
 * means "not chosen yet", and an email user cannot squat the 8-digit form
 * a later provider sign-up would receive.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

const FORMAT = /^[a-z0-9]([a-z0-9_.]*[a-z0-9])?$/;
const DOUBLE_SEPARATOR = /[_.]{2}/;
const PLACEHOLDER = /^user_[0-9a-f]{8}(?:[0-9a-f]{24})?$/;

/** What the input field keeps as the user types: lowercase, no spaces, capped. */
export function normaliseUsernameInput(raw: string): string {
  return raw.toLowerCase().replace(/\s/g, '').slice(0, USERNAME_MAX_LENGTH);
}

export function isPlaceholderUsername(username: string): boolean {
  return PLACEHOLDER.test(username);
}

export function isValidUsername(username: string): boolean {
  return (
    username.length >= USERNAME_MIN_LENGTH &&
    username.length <= USERNAME_MAX_LENGTH &&
    FORMAT.test(username) &&
    !DOUBLE_SEPARATOR.test(username) &&
    !isPlaceholderUsername(username)
  );
}

/**
 * A starting suggestion from a provider's given name ("Zoë" → "zoe",
 * "Mary-Jane" → "maryjane"). Returns '' when nothing usable is left. The
 * result may still be too short or taken; the prompt validates it like
 * any typed name.
 */
export function suggestUsername(givenName: string | null | undefined): string {
  if (!givenName) return '';
  return givenName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .replace(/[_.]{2,}/g, '_')
    .slice(0, USERNAME_MAX_LENGTH)
    .replace(/^[_.]+|[_.]+$/g, '');
}
