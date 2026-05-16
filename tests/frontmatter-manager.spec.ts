/**
 * Tests for FrontmatterManager
 * Uses Jest with mocked obsidian module
 */

import { DEFAULT_SETTINGS } from 'src/constants';
import * as nunjucks from 'nunjucks';
import { FileManager } from 'obsidian';
import { FrontmatterManager } from 'services/frontmatter-manager';
import type { ReadwiseEnvironment } from 'services/readwise-environment';
import { registerCoreTemplateFilters, TemplateSourceLoader } from 'services/template-rendering';
import { sampleMetadata } from 'test/sample-data';
import type { PluginContext } from 'types/plugin-context';
import { parse } from 'yaml';

// Mock the obsidian module
jest.mock('obsidian');

interface TestContext {
  mockLogger: { debug: jest.Mock; error: jest.Mock };
  mockSettings: typeof DEFAULT_SETTINGS;
  mockContext: PluginContext;
  mockEnv: nunjucks.Environment;
  manager: FrontmatterManager;
}

function setupTestContext(): TestContext {
  const mockLogger = {
    debug: jest.fn(),
    error: jest.fn(),
  };

  const mockSettings = {
    ...DEFAULT_SETTINGS,
    frontMatter: true,
    trackFiles: false,
  };

  const mockContext = {
    logger: mockLogger,
    settings: mockSettings,
  } as unknown as PluginContext;

  const loader = new TemplateSourceLoader();
  const mockEnv = new nunjucks.Environment(loader, { autoescape: false });
  registerCoreTemplateFilters(mockEnv);

  const manager = new FrontmatterManager(mockContext, mockEnv as unknown as ReadwiseEnvironment, new FileManager());

  return { mockLogger, mockSettings, mockContext, mockEnv, manager };
}

describe('FrontmatterManager', () => {
  describe('getBaseFrontmatter', () => {
    it('returns empty Frontmatter when frontMatter and trackFiles are both false', () => {
      const ctx = setupTestContext();
      ctx.mockSettings.frontMatter = false;
      ctx.mockSettings.trackFiles = false;

      const result = ctx.manager.getBaseFrontmatter(sampleMetadata);

      expect(result.keys().length).toBe(0);
    });

    it('renders template with default settings', () => {
      const ctx = setupTestContext();

      const result = ctx.manager.getBaseFrontmatter(sampleMetadata);

      // Should have rendered frontmatter fields
      expect(result.keys().length).toBeGreaterThan(0);
      expect(result.get('id')).toBe(sampleMetadata.id);
      expect(result.get('created')).toBe(sampleMetadata.created);
    });

    it('handles metadata with special characters', () => {
      const ctx = setupTestContext();

      const result = ctx.manager.getBaseFrontmatter(sampleMetadata);

      // Title should be properly escaped
      const title = result.get('title');
      expect(typeof title).toBe('string');
      expect(title).toContain("'My Book'");
    });

    it('throws when EMPTY_FRONTMATTER renders as multiple YAML documents', () => {
      const ctx = setupTestContext();
      ctx.mockSettings.frontMatter = false;
      ctx.mockSettings.trackFiles = true;

      expect(() => ctx.manager.getBaseFrontmatter(sampleMetadata)).toThrow(/Failed to process frontmatter/);
    });

    it('throws FrontmatterError on invalid template', () => {
      const ctx = setupTestContext();
      ctx.mockSettings.frontMatterTemplate = '{{ invalid | unknown_filter }}';

      expect(() => ctx.manager.getBaseFrontmatter(sampleMetadata)).toThrow(/Failed to process frontmatter/);
    });

    it('returns valid YAML structure', () => {
      const ctx = setupTestContext();

      const result = ctx.manager.getBaseFrontmatter(sampleMetadata);

      // Should be able to convert to string and parse back
      const yamlString = result.toString();
      expect(yamlString.length).toBeGreaterThan(0);

      // Remove delimiters and parse
      const yamlContent = yamlString.replace(/^---\n/, '').replace(/\n---$/, '');
      const parsed = parse(yamlContent);

      expect(parsed).toBeTruthy();
      expect(parsed.id).toBe(sampleMetadata.id);
    });
  });
});
