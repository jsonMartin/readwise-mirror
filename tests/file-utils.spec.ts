import { jest } from '@jest/globals';
import { DEFAULT_SETTINGS } from 'src/constants';
import { normalizeFilename } from 'utils/file-utils';

jest.mock('@sindresorhus/slugify', () => ({
  __esModule: true,
  default: jest.fn((value: string, options: { separator?: string; lowercase?: boolean } = {}) => {
    const separator = options.separator ?? '-';
    const collapsed = value
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/ +/g, separator);

    return options.lowercase === false ? collapsed : collapsed.toLowerCase();
  }),
}));

jest.mock('filenamify', () => ({
  __esModule: true,
  default: jest.fn((value: string, options: { replacement?: string; maxLength?: number } = {}) => {
    const replacement = options.replacement ?? ' ';
    const sanitized = value
      .replace(/[<>:"/\\|?*]+/g, replacement)
      .replace(/\s+/g, ' ')
      .trim();

    return typeof options.maxLength === 'number' ? sanitized.slice(0, options.maxLength) : sanitized;
  }),
}));

describe('normalizeFilename', () => {
  it('can collapse distinct raw titles into the same normalized basename', () => {
    const settings = { ...DEFAULT_SETTINGS, useSlugify: false };

    expect(normalizeFilename('A#B###C', settings)).toBe('A B C');
    expect(normalizeFilename('A B C', settings)).toBe('A B C');
  });

  it('removes hash runs and collapses repeated spaces in filenamify mode', () => {
    const settings = { ...DEFAULT_SETTINGS, useSlugify: false };

    expect(normalizeFilename('A#B###C', settings)).toBe('A B C');
    expect(normalizeFilename('  A   spaced   title  ', settings)).toBe('A spaced title');
  });

  it('creates deterministic bounded filenames for very long titles', () => {
    const settings = { ...DEFAULT_SETTINGS, useSlugify: false };
    const longTitle = 'Long title '.repeat(40);

    const normalized = normalizeFilename(longTitle, settings);

    expect(normalized).toHaveLength(252);
    expect(normalized).toBe(normalizeFilename(longTitle, settings));
  });

  it('uses slugify settings when enabled', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      useSlugify: true,
      slugifySeparator: '_',
      slugifyLowercase: false,
    };

    expect(normalizeFilename('A Tale: Of Two Cities', settings)).toBe('A_Tale_Of_Two_Cities');
  });

  it('strips path separators and other filesystem-hostile characters', () => {
    const settings = { ...DEFAULT_SETTINGS, useSlugify: false };

    const normalized = normalizeFilename('Folder/Like\\Path ? * Name', settings);

    expect(normalized).toBe('Folder Like Path Name');
    expect(normalized).not.toContain('/');
    expect(normalized).not.toContain('\\');
  });
});
