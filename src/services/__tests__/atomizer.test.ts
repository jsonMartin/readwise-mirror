/**
 * Unit tests for atomizer.ts
 * Tests the Atomizer class and AtomizeExtension
 */

import { Atomizer, AtomizeExtension } from '../atomizer';
import type { Atom, AtomizeOptions } from 'types';

describe('Atomizer', () => {
  let atomizer: Atomizer;

  beforeEach(() => {
    atomizer = new Atomizer();
  });

  describe('initialization', () => {
    it('should initialize with empty atoms array', () => {
      expect(atomizer.atoms).toEqual([]);
    });

    it('should create environment with custom tags', () => {
      expect(atomizer).toBeDefined();
    });
  });

  describe('atomize method', () => {
    it('should process atomize blocks', () => {
      const template = `
%%! atomize id=123, basename="test-note", embed=true !%%
Content here
%%! endatomize !%%
      `.trim();

      const result = atomizer.atomize(template, {});
      
      expect(result.contents).toBeDefined();
      expect(result.atoms).toBeDefined();
    });

    it('should handle context variables', () => {
      const template = `
%%! atomize id=%%$ id $%%, basename="%%$ basename $%%", embed=true !%%
Content: %%$ content $%%
%%! endatomize !%%
      `.trim();

      const context = {
        id: 789,
        basename: 'dynamic-note',
        content: 'Dynamic content',
      };

      const result = atomizer.atomize(template, context);
      expect(result.contents).toBeDefined();
    });
  });

  describe('composite mode', () => {
    it('should switch to COMPOSITE mode', () => {
      atomizer.setCompositeEnvironment();
      
      const template = `
%%! atomize id=123, basename="test", embed=true !%%
Content
%%! endatomize !%%
      `.trim();

      const result = atomizer.atomize(template, {});
      expect(result.contents).toContain('Content');
    });
  });
});

describe('AtomizeExtension', () => {
  let atoms: Atom[];
  let extension: AtomizeExtension;

  beforeEach(() => {
    atoms = [];
    extension = new AtomizeExtension(atoms, 'SECOND');
  });

  describe('tag handling', () => {
    it('should have correct tags', () => {
      expect(extension.tags).toContain('atomize');
      expect(extension.tags).toContain('frontmatter');
    });
  });

  describe('parameter validation', () => {
    it('should validate id parameter', () => {
      const mockContext = {} as any;
      const invalidOptions: AtomizeOptions = {
        id: -1,
        basename: 'test',
        parent: 1,
        embed: false,
      };
      
      const mockBody = () => 'content';
      
      expect(() => {
        extension.runAtomize(mockContext, invalidOptions, mockBody);
      }).toThrow('Invalid parameter');
    });

    it('should create atom with valid parameters', () => {
      const mockContext = {} as any;
      const options: AtomizeOptions = {
        id: 123,
        basename: 'test-note',
        parent: 1,
        embed: true,
      };
      
      const mockBody = () => 'Test content';
      
      extension.runAtomize(mockContext, options, mockBody);
      
      expect(atoms.length).toBe(1);
      expect(atoms[0].id).toBe(123);
      expect(atoms[0].content).toBe('Test content');
    });
  });

  describe('basename sanitization', () => {
    it('should sanitize basename with hashes', () => {
      const mockContext = {} as any;
      const options: AtomizeOptions = {
        id: 123,
        basename: 'test#note###hashes',
        parent: 1,
        embed: false,
      };
      
      const mockBody = () => 'content';
      
      extension.runAtomize(mockContext, options, mockBody);
      
      expect(atoms[0].basename).not.toContain('###');
    });

    it('should handle very long basenames', () => {
      const mockContext = {} as any;
      const longBasename = 'a'.repeat(300);
      const options: AtomizeOptions = {
        id: 123,
        basename: longBasename,
        parent: 1,
        embed: false,
      };
      
      const mockBody = () => 'content';
      
      extension.runAtomize(mockContext, options, mockBody);
      
      expect(atoms[0].basename.length).toBeLessThanOrEqual(252);
    });
  });

  describe('frontmatter handling', () => {
    it('should wrap frontmatter with markers', () => {
      const mockContext = {} as any;
      const mockFrontmatter = () => 'title: Test\ntags: [a, b]';
      
      const result = extension.runFrontmatter(mockContext, mockFrontmatter);
      
      expect(result.toString()).toContain('FRONTMATTER:START');
      expect(result.toString()).toContain('FRONTMATTER:END');
      expect(result.toString()).toContain('---');
    });

    it('should extract frontmatter from body', () => {
      const mockContext = {} as any;
      const options: AtomizeOptions = {
        id: 123,
        basename: 'test',
        parent: 1,
        embed: false,
      };
      
      const mockBody = () => `
FRONTMATTER:START
---
title: Test
---
FRONTMATTER:END
Content here
      `.trim();
      
      extension.runAtomize(mockContext, options, mockBody);
      
      expect(atoms[0].frontmatter).toContain('title: Test');
      expect(atoms[0].content).not.toContain('FRONTMATTER');
    });
  });
});