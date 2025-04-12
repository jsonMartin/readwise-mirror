import type { Highlight } from 'types';

/**
 * Get the last highlighted date of the highlights
 * @param highlights - Array of highlights
 * @returns
 */
export function lastHighlightedDate(highlights: Highlight[]) {
  return highlights
    .map((highlight) => highlight.highlighted_at)
    .sort()
    .reverse()[0];
}

/**
 * Get the last updated date of the highlights
 * @param highlights  - Array of highlights
 * @returns
 */
export function updatedDate(highlights: Highlight[]) {
  return highlights
    .map((highlight) => highlight.updated_at)
    .sort()
    .reverse()[0];
}

/**
 * Get the first highlighted date of the highlights
 * @param highlights - Array of highlights
 * @returns
 */
export function createdDate(highlights: Highlight[]) {
  return highlights.map((highlight) => highlight.created_at).sort()[0];
}
