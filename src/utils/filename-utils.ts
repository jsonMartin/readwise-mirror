import slugify from '@sindresorhus/slugify';
import filenamify from 'filenamify';
import { normalizePath } from 'obsidian';
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
