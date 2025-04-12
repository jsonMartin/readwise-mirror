import type { Highlight } from 'types';

/**
 * Get the last highlighted date of the highlights
 * @param highlights - Array of highlights
 * @returns
 */
export function lastHighlightedDate(highlights: Highlight[]) {
  if (!highlights || highlights.length === 0) return null;
  return highlights
    .map((highlight) => highlight.highlighted_at)
    .reduce((latest, date) => {
      return !latest || new Date(date) > new Date(latest) ? date : latest;
    }, null);
}

/**
 * Get the last updated date of the highlights
 * @param highlights  - Array of highlights
 * @returns
 */
export function updatedDate(highlights: Highlight[]) {
  if (!highlights || highlights.length === 0) return null;
  return highlights
    .map((highlight) => highlight.updated_at)
    .reduce((latest, date) => {
      return !latest || new Date(date) > new Date(latest) ? date : latest;
    }, null);
}

/**
 * Get the first highlighted date of the highlights
 * @param highlights - Array of highlights
 * @returns
 */
export function createdDate(highlights: Highlight[]) {
  return highlights.map((highlight) => highlight.created_at).sort()[0];
}
