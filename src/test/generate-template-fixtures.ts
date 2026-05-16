import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { getHarnessExpectedPaths, RENDER_HARNESS_CASES, renderCompleteForCase } from 'test/template-renderer';

function writeFixture(filePath: string, content: string): void {
  writeFileSync(filePath, content, 'utf8');
  console.log(`Updated fixture: ${filePath}`);
}

export function generateTemplateFixtures(): void {
  for (const testCase of RENDER_HARNESS_CASES) {
    const expected = getHarnessExpectedPaths(testCase);

    mkdirSync(path.dirname(expected.complete), { recursive: true });
    writeFixture(expected.complete, renderCompleteForCase(testCase));
  }
}

if (process.env.NODE_ENV !== 'test') {
  generateTemplateFixtures();
}
