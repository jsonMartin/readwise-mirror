/**
 * Unit tests for frontmatter.ts
 * Tests the Frontmatter class and related functionality
 */

import { Frontmatter, FrontmatterError, type FrontmatterData } from '../frontmatter';

describe('Frontmatter', () => {
  describe('constructor', () => {
    it('should create an empty Frontmatter instance', () => {
      const fm = new Frontmatter();
      expect(fm.keys()).toEqual([]);
    });

    it('should create Frontmatter with initial data', () => {
      const data: FrontmatterData = { title: 'Test', author: 'John' };
      const fm = new Frontmatter(data);
      expect(fm.get('title')).toBe('Test');
      expect(fm.get('author')).toBe('John');
    });

    it('should validate data on construction', () => {
      expect(() => new Frontmatter({ key: 'value' })).not.toThrow();
    });

    it('should throw on invalid data types', () => {
      expect(() => new Frontmatter({ key: null } as any)).toThrow(FrontmatterError);
    });
  });

  describe('get and set', () => {
    let fm: Frontmatter;

    beforeEach(() => {
      fm = new Frontmatter();
    });

    it('should set and get a value', () => {
      fm.set('title', 'Test Title');
      expect(fm.get('title')).toBe('Test Title');
    });

    it('should return undefined for non-existent keys', () => {
      expect(fm.get('nonexistent')).toBeUndefined();
    });

    it('should allow method chaining on set', () => {
      const result = fm.set('key1', 'value1').set('key2', 'value2');
      expect(result).toBe(fm);
      expect(fm.get('key1')).toBe('value1');
      expect(fm.get('key2')).toBe('value2');
    });

    it('should handle different value types', () => {
      fm.set('string', 'text');
      fm.set('number', 42);
      fm.set('boolean', true);
      fm.set('date', new Date('2024-01-01'));
      
      expect(fm.get('string')).toBe('text');
      expect(fm.get('number')).toBe(42);
      expect(fm.get('boolean')).toBe(true);
      expect(fm.get('date')).toBeInstanceOf(Date);
    });

    it('should handle array values', () => {
      fm.set('tags', ['tag1', 'tag2', 'tag3']);
      const tags = fm.get<string[]>('tags');
      expect(Array.isArray(tags)).toBe(true);
      expect(tags).toHaveLength(3);
    });

    it('should validate values on set', () => {
      expect(() => fm.set('key', null as any)).toThrow(FrontmatterError);
    });
  });

  describe('getOrThrow', () => {
    let fm: Frontmatter;

    beforeEach(() => {
      fm = new Frontmatter({ title: 'Test' });
    });

    it('should return value if it exists', () => {
      expect(fm.getOrThrow('title')).toBe('Test');
    });

    it('should throw FrontmatterError if key does not exist', () => {
      expect(() => fm.getOrThrow('nonexistent')).toThrow(FrontmatterError);
      expect(() => fm.getOrThrow('nonexistent')).toThrow('Required frontmatter key "nonexistent" not found');
    });
  });

  describe('merge', () => {
    let fm: Frontmatter;

    beforeEach(() => {
      fm = new Frontmatter({ key1: 'value1', key2: 'value2' });
    });

    it('should merge with another Frontmatter instance', () => {
      const other = new Frontmatter({ key3: 'value3', key4: 'value4' });
      fm.merge(other);
      
      expect(fm.get('key1')).toBe('value1');
      expect(fm.get('key2')).toBe('value2');
      expect(fm.get('key3')).toBe('value3');
      expect(fm.get('key4')).toBe('value4');
    });

    it('should overwrite existing keys', () => {
      const other = new Frontmatter({ key1: 'newValue1' });
      fm.merge(other);
      
      expect(fm.get('key1')).toBe('newValue1');
      expect(fm.get('key2')).toBe('value2');
    });

    it('should return the merged Frontmatter instance', () => {
      const other = new Frontmatter({ key3: 'value3' });
      const result = fm.merge(other);
      
      expect(result).toBe(fm);
    });
  });

  describe('toString and fromString', () => {
    it('should return empty string for empty frontmatter', () => {
      const fm = new Frontmatter();
      expect(fm.toString()).toBe('');
    });

    it('should format frontmatter with delimiters', () => {
      const fm = new Frontmatter({ title: 'Test' });
      const str = fm.toString();
      
      expect(str).toContain('---');
      expect(str).toContain('title');
    });

    it('should parse valid frontmatter', () => {
      const str = '---\ntitle: Test\nauthor: John\n---\nContent here';
      const fm = Frontmatter.fromString(str);
      
      expect(fm.get('title')).toBe('Test');
      expect(fm.get('author')).toBe('John');
    });

    it('should handle edge cases', () => {
      const fm = new Frontmatter({ emoji: '🎉', chinese: '你好' });
      
      expect(fm.get('emoji')).toBe('🎉');
      expect(fm.get('chinese')).toBe('你好');
    });
  });
});

describe('FrontmatterError', () => {
  it('should create error with message', () => {
    const error = new FrontmatterError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('FrontmatterError');
  });

  it('should be instanceof Error', () => {
    const error = new FrontmatterError('Test');
    expect(error instanceof Error).toBe(true);
  });
});