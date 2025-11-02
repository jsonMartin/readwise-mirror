/**
 * Unit tests for readwise-environment.ts
 * Tests ReadwiseLoader and ReadwiseEnvironment classes
 */

import { ReadwiseLoader, ReadwiseEnvironment } from '../readwise-environment';

describe('ReadwiseLoader', () => {
  let loader: ReadwiseLoader;

  beforeEach(() => {
    loader = new ReadwiseLoader();
  });

  describe('constructor and basic operations', () => {
    it('should create loader with empty templates', () => {
      expect(loader).toBeDefined();
      expect(loader.getSource('nonexistent')).toBeNull();
    });

    it('should set and retrieve template sources', () => {
      loader.setSource('greeting', 'Hello {{ name }}');
      
      const source = loader.getSource('greeting');
      expect(source).not.toBeNull();
      expect(source?.src).toBe('Hello {{ name }}');
      expect(source?.path).toBe('greeting');
    });

    it('should overwrite existing templates', () => {
      loader.setSource('test', 'First version');
      loader.setSource('test', 'Second version');
      
      const source = loader.getSource('test');
      expect(source?.src).toBe('Second version');
    });
  });
});

describe('ReadwiseEnvironment', () => {
  let env: ReadwiseEnvironment;
  let loader: ReadwiseLoader;

  beforeEach(() => {
    loader = new ReadwiseLoader();
    env = new ReadwiseEnvironment(loader, { autoescape: false });
  });

  describe('filters', () => {
    it('should have bq filter for blockquotes', () => {
      const result = env.renderString('{{ text | bq }}', { 
        text: 'Line 1\nLine 2' 
      });
      expect(result).toContain('> ');
    });

    it('should have normalize_author filter', () => {
      const result = env.renderString('{{ author | normalize_author }}', { 
        author: 'Dr. John Smith' 
      });
      expect(result).not.toContain('Dr.');
      expect(result).toContain('John Smith');
    });

    it('should handle date formatting', () => {
      const result = env.renderString('{{ date | date("YYYY") }}', { 
        date: '2024-03-15T10:30:00Z' 
      });
      expect(result).toBe('2024');
    });

    it('should have qa filter for Q&A format', () => {
      const result = env.renderString('{{ text | qa }}', { 
        text: '.qaWhat is this?Answer here' 
      });
      expect(result).toContain('**Q:**');
      expect(result).toContain('**A:**');
    });
  });

  describe('template rendering', () => {
    it('should render templates with variables', () => {
      const result = env.renderString('Hello {{ name }}!', { name: 'World' });
      expect(result).toBe('Hello World!');
    });

    it('should chain multiple filters', () => {
      const result = env.renderString('{{ text | bq | upper }}', { text: 'test' });
      expect(result).toContain('> ');
    });
  });
});