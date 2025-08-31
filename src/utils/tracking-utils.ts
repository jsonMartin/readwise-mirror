import { READWISE_REVIEW_URL_BASE } from 'constants/index';
import type { App, TFile } from 'obsidian';
import type { PluginSettings } from 'types';

/**
 * Determines whether a file is a Readwise-tracked note by checking a configured frontmatter property.
 *
 * Checks the frontmatter property named by `settings.trackingProperty` and returns true if its string value starts with `READWISE_REVIEW_URL_BASE`.
 * Returns false for a falsy `file`, a missing or non-string property, or a value that does not start with the Readwise base URL.
 *
 * @param settings - Plugin settings; `settings.trackingProperty` is the frontmatter key to inspect.
 * @returns True if the file is tracked by Readwise, otherwise false.
 */
export function isTrackedReadwiseNote(file: TFile, app: App, settings: PluginSettings): boolean {
  if (!file) {
    return false;
  }
  const trackingProperty = settings.trackingProperty;
  const fileCache = app.metadataCache.getFileCache(file);
  const frontmatterValue = fileCache?.frontmatter?.[trackingProperty];

  if (typeof frontmatterValue !== 'string') {
    return false;
  }

  return frontmatterValue.startsWith(READWISE_REVIEW_URL_BASE);
}

/**
 * Returns whether a file is located inside the configured Readwise library folder.
 *
 * Traverses the file's parent folders upward and compares each folder's path to
 * `settings.baseFolderName` (trimmed). If `file` is falsy or `settings.baseFolderName`
 * is empty after trimming, the function returns false.
 *
 * @param file - The file to check (may be null/undefined).
 * @param settings - Plugin settings; `baseFolderName` is used (whitespace trimmed) as the root folder name to match.
 * @returns True if an ancestor folder's path equals the configured base folder name; otherwise false.
 */
export function isInReadwiseLibrary(file: TFile | null | undefined, settings: PluginSettings): boolean {
  if (!file) return false;
  const baseFolderName = settings.baseFolderName?.trim();
  if (!baseFolderName) return false;
  let currentFolder = file.parent;

  while (currentFolder) {
    if (currentFolder.path === baseFolderName) {
      return true;
    }
    currentFolder = currentFolder.parent;
  }
  return false;
}
