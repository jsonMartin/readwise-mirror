import slugify from '@sindresorhus/slugify';
import { READWISE_REVIEW_URL_BASE } from 'constants/index';
import filenamify from 'filenamify';
import { normalizePath, type TFile, type TFolder } from 'obsidian';
import type { PluginContext } from 'types/plugin-context';
import type { PluginSettings } from 'types/settings';

/**
 *  Normalizes the filename by replacing critical characters
 *  and ensuring it is a valid filename
 * @param filename - The filename to normalize
 * @returns The normalized filename
 */
export function normalizeFilename(filename: string, settings: PluginSettings) {
  const { useSlugify, colonSubstitute, slugifySeparator, slugifyLowercase } = settings;
  const normalizedFilename = useSlugify
    ? slugify(filename.replace(/:/g, colonSubstitute ?? '-'), {
        separator: slugifySeparator,
        lowercase: slugifyLowercase,
      })
    : // ... else filenamify the title and limit to 252 characters (to account for the `.md` which will be added)
      filenamify(filename.replace(/:/g, colonSubstitute ?? '-'), {
        replacement: ' ',
        maxLength: 252,
      })
        // Ensure we remove additional critical characters, replace multiple spaces with one, and trim
        // Replace # as this inrerferes with WikiLinks (other characters are taken care of in "filenamify")
        .replace(/[#]+/g, ' ')
        .replace(/ +/g, ' ')
        .trim();

  return normalizePath(normalizedFilename);
}

/**
 * Check if a file is within a folder (including subfolders)
 */
export function isFileInFolder(file: TFile, folder: TFolder): boolean {
  return file.path.startsWith(`${folder.path}/`);
}

/**
 * Check if a folder is in the Readwise library hierarchy
 */
export function isFolderInReadwiseLibrary(folder: TFolder, ctx: PluginContext): boolean {
  const baseFolderName = normalizePath(ctx.settings.baseFolderName?.trim() ?? '');
  if (!baseFolderName) return false;

  // Check if folder is the base folder or anywhere within its hierarchy
  return folder.path === baseFolderName || folder.path.startsWith(`${baseFolderName}/`);
}
/**
 * Get tracking URL from a file's frontmatter
 */
export function getTrackingUrl(file: TFile, ctx: PluginContext): string | undefined {
  const fileCache = ctx.app.metadataCache.getFileCache(file);
  const trackingProperty = ctx.settings.trackingProperty;
  const trackingUrl = fileCache?.frontmatter?.[trackingProperty];
  return typeof trackingUrl === 'string' && trackingUrl.startsWith(READWISE_REVIEW_URL_BASE) ? trackingUrl : undefined;
}
