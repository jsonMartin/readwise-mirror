/**
 * Unit tests for frontmatter-utils.ts
 * Tests escaping, validation, and template handling
 */

import {
  sanitizeFrontmatterTemplate,
  validateFrontmatterTemplate,
  escapeValue,
  escapeMetadata,
} from '../frontmatter-utils';
import { ReadwiseEnvironment, ReadwiseLoader } from 'services/readwise-environment';
import { sampleMetadata } from 'test/sample-data';
import type { ReadwiseDocument } from 'types';
import { Frontmatter } from 'services/frontmatter';

describe('frontmatter-utils', () => {
  let env: ReadwiseEnvironment;

  beforeEach(() => {
    const loader = new ReadwiseLoader();
    env = new ReadwiseEnvironment(loader, { autoescape: false });
  });

  describe('sanitizeFrontmatterTemplate', () => {
    it('should remove frontmatter delimiters', () => {
      const template = '---\ntitle: Test\n---';
      const result = sanitizeFrontmatterTemplate(template);
      expect(result).toBe('title: Test');
    });

    it('should remove multiple delimiters', () => {
      const template = '---\n---\ntitle: Test\n---\n---';
      const result = sanitizeFrontmatterTemplate(template);
      expect(result).toBe('title: Test');
    });

    it('should trim whitespace', () => {
      const template = '  \n  title: Test  \n  ';
      const result = sanitizeFrontmatterTemplate(template);
      expect(result).toBe('title: Test');
    });

    it('should handle empty template', () => {
      const result = sanitizeFrontmatterTemplate('');
      expect(result).toBe('');
    });

    it('should handle template with only delimiters', () => {
      const result = sanitizeFrontmatterTemplate('---\n---');
      expect(result).toBe('');
    });

    it('should preserve template content', () => {
      const template = 'title: {{ title }}\nauthor: {{ author }}';
      const result = sanitizeFrontmatterTemplate(template);
      expect(result).toBe('title: {{ title }}\nauthor: {{ author }}');
    });
  });

  describe('validateFrontmatterTemplate', () => {
    it('should validate a correct template', () => {
      const template = 'title: {{ title }}\nauthor: {{ author | join(", ") }}';
      const result = validateFrontmatterTemplate(env, template);
      expect(result.isValidYaml).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should invalidate incorrect YAML syntax', () => {
      const template = 'title: {{ title }\nauthor: broken';
      const result = validateFrontmatterTemplate(env, template);
      expect(result.isValidYaml).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle empty template', () => {
      const result = validateFrontmatterTemplate(env, '');
      expect(result.isValidYaml).toBe(true);
    });

    it('should validate template with filters', () => {
      const template = 'date: {{ created | date("YYYY-MM-DD") }}';
      const result = validateFrontmatterTemplate(env, template);
      expect(result.isValidYaml).toBe(true);
    });

    it('should validate template with arrays', () => {
      const template = 'tags: [{{ tags }}]';
      const result = validateFrontmatterTemplate(env, template);
      expect(result.isValidYaml).toBe(true);
    });

    it('should provide preview on error', () => {
      const template = 'title: {{ undefined_var }}\n  broken: [[[';
      const result = validateFrontmatterTemplate(env, template);
      expect(result.isValidYaml).toBe(false);
      expect(result.preview).toBeDefined();
    });

    it('should handle multiline templates', () => {
      const template = `
        title: {{ title }}
        author: {{ author | join(", ") }}
        tags: {{ tags }}
      `;
      const result = validateFrontmatterTemplate(env, template);
      expect(result.isValidYaml).toBe(true);
    });
  });

  describe('escapeValue', () => {
    it('should escape simple strings with special characters', () => {
      const result = escapeValue('test: value');
      expect(result).toBe('"test: value"');
    });

    it('should handle strings with single quotes', () => {
      const result = escapeValue("it's a test");
      expect(result).toBe('"it\'s a test"');
    });

    it('should handle strings with double quotes', () => {
      const result = escapeValue('he said "hello"');
      expect(result).toBe("'he said \"hello\"'");
    });

    it('should handle strings with both quote types', () => {
      const result = escapeValue('it\'s "complicated"');
      expect(result).toContain('it');
      expect(result).toContain('complicated');
    });

    it('should handle empty strings', () => {
      const result = escapeValue('');
      expect(result).toBe('""');
    });

    it('should not double-escape already escaped values', () => {
      const alreadyEscaped = '"test"';
      const result = escapeValue(alreadyEscaped);
      expect(result).toBe('"test"');
    });

    it('should handle multiline strings', () => {
      const multiline = 'line1\nline2\nline3';
      const result = escapeValue(multiline, { multiline: true });
      expect(result).toContain('>-');
      expect(result).toContain('line1');
      expect(result).toContain('line2');
    });

    it('should handle strings with colons', () => {
      const result = escapeValue('key: value');
      expect(result).toBe('"key: value"');
    });

    it('should handle strings with special YAML characters', () => {
      const result = escapeValue('test & more');
      expect(result).toBe('"test & more"');
    });

    it('should handle strings with hashes', () => {
      const result = escapeValue('#tag');
      expect(result).toBe('"#tag"');
    });
  });

  describe('escapeMetadata', () => {
    const fieldsToEscape = ['title', 'author', 'sanitized_title'];

    it('should escape specified string fields', () => {
      const metadata: ReadwiseDocument = {
        ...sampleMetadata,
        title: 'Test: A Book',
      };
      const result = escapeMetadata(metadata, fieldsToEscape);
      expect(result.title).toContain('"');
    });

    it('should escape array fields', () => {
      const metadata: ReadwiseDocument = {
        ...sampleMetadata,
        author: ["O'Reilly", 'Test: Author'],
      };
      const result = escapeMetadata(metadata, fieldsToEscape);
      expect(Array.isArray(result.author)).toBe(true);
      expect((result.author as string[]).some(a => a.includes('"'))).toBe(true);
    });

    it('should not modify unspecified fields', () => {
      const metadata: ReadwiseDocument = {
        ...sampleMetadata,
        category: 'test: category',
      };
      const result = escapeMetadata(metadata, fieldsToEscape);
      expect(result.category).toBe('test: category');
    });

    it('should handle empty fields array', () => {
      const result = escapeMetadata(sampleMetadata, []);
      expect(result).toEqual(sampleMetadata);
    });

    it('should handle nested special characters', () => {
      const metadata: ReadwiseDocument = {
        ...sampleMetadata,
        title: 'Book: "The Test" & More',
      };
      const result = escapeMetadata(metadata, fieldsToEscape);
      expect(typeof result.title).toBe('string');
    });

    it('should preserve metadata structure', () => {
      const result = escapeMetadata(sampleMetadata, fieldsToEscape);
      expect(result.id).toBe(sampleMetadata.id);
      expect(result.category).toBe(sampleMetadata.category);
      expect(result.num_highlights).toBe(sampleMetadata.num_highlights);
    });
  });

  describe('integration tests', () => {
    it('should create valid frontmatter from template', () => {
      const template = sanitizeFrontmatterTemplate(`
        title: {{ title }}
        author: {{ author | join(", ") }}
        id: {{ id }}
      `);
      
      const validation = validateFrontmatterTemplate(env, template);
      expect(validation.isValidYaml).toBe(true);
    });

    it('should handle complex sample metadata', () => {
      const template = `
        id: {{ id }}
        title: {{ title }}
        author: [{{ author | join(", ") }}]
        category: {{ category }}
        tags: {{ tags }}
      `;
      
      const validation = validateFrontmatterTemplate(env, template);
      expect(validation.isValidYaml).toBe(true);
    });
  });
});