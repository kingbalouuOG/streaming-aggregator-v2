/**
 * Is this typed text a title someone is looking for, or a description of an
 * evening? (recommendation 2026-09-08-002 §9.2, routing rule 2.)
 *
 * The question matters because the two deserve opposite treatments.
 * Retrieval — "where is the thing I heard about" — is the larger share of
 * in-app search (§8.1: friends and family are the first discovery source for
 * 56–68% of GB adults) and it must be instant: the title, where to watch it,
 * a button. Discovery deserves a grid and a way to refine. Guessing wrong in
 * the retrieval direction is the expensive mistake, because it makes a
 * lookup wait on an embedding round trip it never needed.
 *
 * So the rule is deliberately conservative: a title hit needs the query to
 * actually appear in the title AND the query not to read as a sentence.
 * Everything else routes to the described layout, which is honest about what
 * it did ("Reading that as a feeling, not a title") and offers the way back.
 *
 * Pure and dependency-free apart from a type import, so the thresholds can
 * be tuned against `scripts/test/search-semantic-fixtures.json` — whose
 * `titles` half exists to calibrate exactly this.
 */

import type { ContentItem } from '../types/content';

/**
 * Minimum confidence for the title-hit layout.
 *
 * Calibrated against the eight known-title fixtures: each is a title a user
 * would plausibly type, and each must clear this bar, while none of the
 * eight preset sentences may. Raise it and lookups start rendering as
 * grids; lower it and descriptions start rendering as wrong title cards.
 */
export const CONFIDENT_TITLE_HIT = 0.55;

/**
 * Below this the query does not appear in the title in any usable way.
 *
 * Deliberately unchanged on 2026-09-09 when partial matching was widened.
 * The floor is the conservative half of the rule and the reason a wrong
 * title card is rare; what was wrong was the measurement underneath it, not
 * where the bar sat.
 */
const MIN_TITLE_MATCH = 0.5;

/** Votes at which a title is "prominent enough to be the one meant". */
const PROMINENCE_VOTES = 500;

const WEIGHT_TITLE_MATCH = 0.7;
const WEIGHT_PROMINENCE = 0.3;

/**
 * Words that only appear when someone is describing rather than naming.
 *
 * Kept small and literal on purpose. This is a guard for the case where a
 * short description happens to be a substring of some title, not a general
 * intent classifier — that is the Worker-side query-understanding step the
 * conversational version needs (§8.2), and it is not this.
 */
const DESCRIPTION_MARKERS = [
  'something',
  'anything',
  'i want',
  'i feel',
  'i can',
  'i need',
  'to watch',
  'watch with',
  'in the mood',
  'that is not',
  "that isn't",
  "don't have to",
  'do not have to',
  'we can all',
  'tonight',
];

/**
 * Above this many words, treat the text as a description regardless of what
 * it matched. Long exact titles still route correctly: an exact match is
 * checked first and wins.
 */
const DESCRIPTION_WORD_COUNT = 5;

export function normaliseForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when the text reads as a sentence about what someone wants.
 *
 * An exact title match short-circuits this: if a user types the full name of
 * a film, it does not matter that the name is long or contains "tonight".
 */
export function looksLikeDescription(query: string, exactTitleMatch = false): boolean {
  if (exactTitleMatch) return false;
  const q = normaliseForMatch(query);
  if (!q) return false;
  if (DESCRIPTION_MARKERS.some((m) => q.includes(normaliseForMatch(m)))) return true;
  return q.split(' ').length >= DESCRIPTION_WORD_COUNT;
}

/**
 * Is the query a contiguous run of WHOLE words of the title?
 *
 * The distinction this draws is between naming part of a title and matching
 * some characters of it. "hail mary" is two complete words of "Project Hail
 * Mary"; "sever" is five characters of "Severance" and names nothing. Both
 * are substrings, and until 2026-09-09 the scorer could not tell them apart.
 *
 * Order and adjacency are both required. "mary hail" is not how anyone
 * half-remembers a title, and "project mary" skips a word, so neither counts
 * here — reordering is the weaker `base = 0.55` rung below, which is where
 * it belongs.
 */
function isWholeWordRun(titleWords: readonly string[], queryWords: readonly string[]): boolean {
  if (queryWords.length === 0 || queryWords.length > titleWords.length) return false;
  for (let i = 0; i + queryWords.length <= titleWords.length; i += 1) {
    if (queryWords.every((w, j) => titleWords[i + j] === w)) return true;
  }
  return false;
}

/**
 * How well the query names this title, 0–1.
 *
 * The ladder mirrors `reRankSearchResults` (which orders the list but throws
 * its scores away) so the card shown is the one the ranker already put
 * first, judged by the same measure.
 */
export function titleMatchScore(title: string, query: string): number {
  const t = normaliseForMatch(title);
  const q = normaliseForMatch(query);
  if (!t || !q) return 0;
  if (t === q) return 1;

  const titleWords = t.split(' ');
  const queryWords = q.split(' ');
  const namedRun = isWholeWordRun(titleWords, queryWords);

  // Partial matches are scaled by how much of the title the query accounts
  // for. Without this, "the" is a prefix of half the catalogue and would
  // score as though the user had named a film; and "sever" would open the
  // Severance card before they had finished typing it. A partial query is
  // exactly the case where the grid is the right answer.
  //
  // Measured in CHARACTERS for a partial word, and in WORDS as well once the
  // query names whole ones. Characters alone had "hail mary" account for
  // 9/17ths of "Project Hail Mary" — a smaller share than "sever" covers of
  // "Severance" — when what the user had actually done was name two of its
  // three words. The larger of the two is taken, so this can only raise a
  // score and never lower one: `max` is what keeps "project hail" (a longer
  // prefix, but a smaller share of the words) exactly where it was.
  const charCoverage = Math.min(q.length / t.length, 1);
  const wordCoverage = Math.min(queryWords.length / titleWords.length, 1);
  const coverage = namedRun ? Math.max(charCoverage, wordCoverage) : charCoverage;

  let base = 0;
  // A named run scores like a prefix, because that is what it is: a prefix is
  // simply the run that starts at word 0, and "Hail Mary" sitting at the end
  // of the title says nothing about how well the user remembered it. Coverage
  // still separates the two cases — one word of a two-word title lands at
  // 0.425 either way, under the floor, and stays a grid.
  if (namedRun || t.startsWith(q)) base = 0.85;
  else if (t.includes(q)) base = 0.6;
  else {
    // Every query word present somewhere in the title, in any order —
    // catches reordering and dropped articles.
    const present = new Set(titleWords);
    const covered = queryWords.filter((w) => present.has(w)).length;
    base = covered === queryWords.length ? 0.55 : 0;
  }
  return base * coverage;
}

export interface TitleHit {
  item: ContentItem;
  confidence: number;
}

/**
 * The confident title hit, or null when the text should be read as a
 * description.
 *
 * `items` is the Mode A result list, already re-ranked — only the head is
 * considered, because a hit that is not the top result is not a hit.
 */
export function selectTitleHit(
  items: readonly ContentItem[] | undefined,
  query: string,
  threshold: number = CONFIDENT_TITLE_HIT,
): TitleHit | null {
  const top = items?.[0];
  if (!top) return null;

  const match = titleMatchScore(top.title, query);
  if (match < MIN_TITLE_MATCH) return null;
  if (looksLikeDescription(query, match === 1)) return null;

  const prominence = Math.min((top.voteCount ?? 0) / PROMINENCE_VOTES, 1);
  const confidence = match * WEIGHT_TITLE_MATCH + prominence * WEIGHT_PROMINENCE;
  if (confidence < threshold) return null;
  return { item: top, confidence };
}
