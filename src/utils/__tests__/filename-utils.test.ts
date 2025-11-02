/**
 * Unit tests for filename-utils.ts
 * Tests the normalizeFilename function with various inputs and settings
 */

import { normalizeFilename } from '../filename-utils';
import type { PluginSettings } from 'types';
import { DEFAULT_SETTINGS } from 'constants/index';

describe('filename-utils', () => {
  describe('normalizeFilename', () => {
    let baseSettings: PluginSettings;

    beforeEach(() => {
      baseSettings = { ...DEFAULT_SETTINGS };
    });

    describe('slugify mode', () => {
      beforeEach(() => {
        baseSettings.useSlugify = true;
        baseSettings.slugifySeparator = '-';
        baseSettings.slugifyLowercase = true;
      });

      it('should slugify a simple filename', () => {
        const result = normalizeFilename('My Test File', baseSettings);
        expect(result).toBe('my-test-file');
      });

      it('should handle colons with colonSubstitute', () => {
        baseSettings.colonSubstitute = '_';
        const result = normalizeFilename('Book: A Subtitle', baseSettings);
        expect(result).toBe('book_-a-subtitle');
      });

      it('should handle special characters', () => {
        const result = normalizeFilename('File @ #123 & More!', baseSettings);
        expect(result).toBe('file-123-and-more');
      });

      it('should handle unicode characters', () => {
        const result = normalizeFilename('Café über München', baseSettings);
        expect(result).toBe('cafe-uber-munchen');
      });

      it('should respect lowercase setting when false', () => {
        baseSettings.slugifyLowercase = false;
        const result = normalizeFilename('My Test File', baseSettings);
        expect(result).toBe('My-Test-File');
      });

      it('should use custom separator', () => {
        baseSettings.slugifySeparator = '_';
        const result = normalizeFilename('My Test File', baseSettings);
        expect(result).toBe('my_test_file');
      });

      it('should handle empty string', () => {
        const result = normalizeFilename('', baseSettings);
        expect(result).toBe('');
      });

      it('should handle string with only special characters', () => {
        const result = normalizeFilename('!@#$%^&*()', baseSettings);
        expect(result).toBe('');
      });

      it('should handle very long filenames', () => {
        const longName = 'a'.repeat(300);
        const result = normalizeFilename(longName, baseSettings);
        expect(result.length).toBeLessThanOrEqual(252);
      });
    });

    describe('filenamify mode', () => {
      beforeEach(() => {
        baseSettings.useSlugify = false;
        baseSettings.colonSubstitute = '-';
      });

      it('should filenamify a simple filename', () => {
        const result = normalizeFilename('My Test File', baseSettings);
        expect(result).toBe('My Test File');
      });

      it('should replace colons with colonSubstitute', () => {
        const result = normalizeFilename('Book: A Subtitle', baseSettings);
        expect(result).toBe('Book- A Subtitle');
      });

      it('should remove hash symbols', () => {
        const result = normalizeFilename('File #123 #tag', baseSettings);
        expect(result).toBe('File 123 tag');
      });

      it('should handle multiple consecutive hashes', () => {
        const result = normalizeFilename('File ###123', baseSettings);
        expect(result).toBe('File 123');
      });

      it('should replace multiple spaces with single space', () => {
        const result = normalizeFilename('File   with    spaces', baseSettings);
        expect(result).toBe('File with spaces');
      });

      it('should trim leading and trailing spaces', () => {
        const result = normalizeFilename('  File with spaces  ', baseSettings);
        expect(result).toBe('File with spaces');
      });

      it('should handle illegal filename characters', () => {
        const result = normalizeFilename('File<>:"/\\|?*', baseSettings);
        // filenamify should replace these with spaces
        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
        expect(result).not.toContain('"');
        expect(result).not.toContain('/');
        expect(result).not.toContain('\\');
        expect(result).not.toContain('|');
        expect(result).not.toContain('?');
        expect(result).not.toContain('*');
      });

      it('should limit filename length to 252 characters', () => {
        const longName = 'a'.repeat(300);
        const result = normalizeFilename(longName, baseSettings);
        expect(result.length).toBeLessThanOrEqual(252);
      });

      it('should handle empty string', () => {
        const result = normalizeFilename('', baseSettings);
        expect(result).toBe('');
      });

      it('should handle newlines', () => {
        const result = normalizeFilename('File\nWith\nNewlines', baseSettings);
        expect(result).not.toContain('\n');
      });

      it('should handle tabs', () => {
        const result = normalizeFilename('File\tWith\tTabs', baseSettings);
        expect(result).not.toContain('\t');
      });
    });

    describe('edge cases', () => {
      it('should handle null colonSubstitute', () => {
        baseSettings.useSlugify = false;
        baseSettings.colonSubstitute = null as any;
        const result = normalizeFilename('Book: Subtitle', baseSettings);
        expect(result).toBe('Book- Subtitle');
      });

      it('should handle undefined colonSubstitute', () => {
        baseSettings.useSlugify = false;
        baseSettings.colonSubstitute = undefined as any;
        const result = normalizeFilename('Book: Subtitle', baseSettings);
        expect(result).toBe('Book- Subtitle');
      });

      it('should handle multiple colons', () => {
        baseSettings.colonSubstitute = '_';
        const result = normalizeFilename('A:B:C:D', baseSettings);
        expect(result).toContain('_');
      });

      it('should normalize path separators', () => {
        baseSettings.useSlugify = false;
        const result = normalizeFilename('folder/subfolder\\file', baseSettings);
        // normalizePath should handle this
        expect(result).not.toContain('\\');
      });
    });

    describe('real-world examples', () => {
      beforeEach(() => {
        baseSettings.useSlugify = false;
        baseSettings.colonSubstitute = '-';
      });

      it('should handle book title with subtitle', () => {
        const result = normalizeFilename('Atomic Habits: An Easy & Proven Way', baseSettings);
        expect(result).toBe('Atomic Habits- An Easy & Proven Way');
      });

      it('should handle quoted titles', () => {
        const result = normalizeFilename('"The Great Gatsby"', baseSettings);
        expect(result).toContain('The Great Gatsby');
      });

      it('should handle titles with apostrophes', () => {
        const result = normalizeFilename("O'Reilly's Book", baseSettings);
        expect(result).toBe("O'Reilly's Book");
      });

      it('should handle URL-like titles', () => {
        const result = normalizeFilename('https://example.com/article', baseSettings);
        expect(result).not.toContain('://');
      });

      it('should handle titles with brackets', () => {
        const result = normalizeFilename('Book [Special Edition]', baseSettings);
        expect(result).toBe('Book [Special Edition]');
      });
    });
  });
});