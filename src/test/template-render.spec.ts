/**
 * Tests for template rendering
 * Uses Jest with fixture-based golden file assertions
 */

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from '@jest/globals';
import {
  getHarnessExpectedPaths,
  getTemplateSetContent,
  getTemplateSetMirrorContent,
  RENDER_HARNESS_CASES,
  renderCompleteForCase,
} from 'test/template-renderer';

describe('Template Rendering', () => {
  describe('Default template synchronization', () => {
    it('keeps mirror files in sync with DEFAULT_SETTINGS', () => {
      const expected = getTemplateSetContent('default');
      const mirror = getTemplateSetMirrorContent('default');

      expect(mirror.frontmatter).toBe(expected.frontmatter);
      expect(mirror.header).toBe(expected.header);
      expect(mirror.highlight).toBe(expected.highlight);
    });
  });

  // Test each case dynamically
  RENDER_HARNESS_CASES.forEach((testCase) => {
    describe(`Case: ${testCase.id}`, () => {
      const expected = getHarnessExpectedPaths(testCase);

      describe('complete note rendering', () => {
        it('matches expected fixture', () => {
          expect(existsSync(expected.complete)).toBe(true);

          const rendered = renderCompleteForCase(testCase);
          const expectedComplete = readFileSync(expected.complete, 'utf8');

          expect(rendered).toBe(expectedComplete);
        });
      });
    });
  });
});
