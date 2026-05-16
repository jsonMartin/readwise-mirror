import { readFileSync } from 'node:fs';
import { generateTemplateFixtures } from 'test/generate-template-fixtures';
import { getHarnessExpectedPaths, RENDER_HARNESS_CASES, renderCompleteForCase } from 'test/template-renderer';

describe('Template fixture generation', () => {
  it('updates complete fixtures from current renderer output', () => {
    generateTemplateFixtures();

    for (const testCase of RENDER_HARNESS_CASES) {
      const expected = getHarnessExpectedPaths(testCase);
      const expectedComplete = readFileSync(expected.complete, 'utf8');

      expect(expectedComplete).toBe(renderCompleteForCase(testCase));
    }
  });
});
