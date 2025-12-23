import spacetime from 'spacetime';

/**
 * Convert lastUpdated string to human readable format
 * @param lastUpdated
 * @returns Human readable format of lastUpdated
 */
export function humanReadableFormat(lastUpdated: string): string {
  return spacetime.now().since(spacetime(lastUpdated)).rounded;
}
