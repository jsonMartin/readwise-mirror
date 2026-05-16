import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_SETTINGS } from 'constants/index';
import * as nunjucks from 'nunjucks';
import { FileManager } from 'obsidian';
import { FrontmatterManager } from 'services/frontmatter-manager';
import type { ReadwiseEnvironment } from 'services/readwise-environment';
import { registerCoreTemplateFilters, renderMarkdownTemplate, TemplateSourceLoader } from 'services/template-rendering';
import { sampleMetadata } from 'test/sample-data';
import type { Export } from 'types/library';
import type { PluginContext } from 'types/plugin-context';
import type { PluginSettings } from 'types/settings';

const sampleBook: Export = {
  user_book_id: sampleMetadata.id,
  is_deleted: false,
  title: sampleMetadata.title,
  author: sampleMetadata.author.join(', '),
  readable_title: sampleMetadata.title,
  source: 'test',
  cover_image_url: sampleMetadata.cover_image_url,
  unique_url: sampleMetadata.unique_url,
  book_tags: [],
  category: sampleMetadata.category,
  document_note: sampleMetadata.document_note,
  summary: sampleMetadata.summary,
  readwise_url: sampleMetadata.readwise_url,
  source_url: sampleMetadata.source_url,
  asin: null,
  highlights: sampleMetadata.highlights,
};

function createEnvironment(loader: TemplateSourceLoader): nunjucks.Environment {
  const env = new nunjucks.Environment(loader, { autoescape: false });
  registerCoreTemplateFilters(env);
  return env;
}

function createTestContext(settings: PluginSettings): { manager: FrontmatterManager; env: nunjucks.Environment } {
  const mockLogger = {
    debug: jest.fn(),
    error: jest.fn(),
  };

  const mockContext = {
    logger: mockLogger,
    settings,
  } as unknown as PluginContext;

  const loader = new TemplateSourceLoader();
  const env = new nunjucks.Environment(loader, { autoescape: false });
  registerCoreTemplateFilters(env);

  const readwiseEnv = env as unknown as ReadwiseEnvironment;
  const mockFileManager = new FileManager();

  const manager = new FrontmatterManager(mockContext, readwiseEnv, mockFileManager);

  return { manager, env };
}

function normalizeOutput(value: string): string {
  return `${value.replace(/\r\n/g, '\n').trimEnd()}\n`;
}

interface RenderedCaseArtifacts {
  frontmatter: string;
  markdown: string;
  complete: string;
}

interface TemplateSetContent {
  frontmatter: string;
  header: string;
  highlight: string;
}

export interface RenderHarnessCase {
  id: string;
  templateSet: string;
  settingsOverrides?: Partial<PluginSettings>;
}

export const RENDER_HARNESS_CASES: RenderHarnessCase[] = [
  {
    id: 'default',
    templateSet: 'default',
  },
  {
    id: 'default-highlight-discard',
    templateSet: 'default',
    settingsOverrides: {
      highlightDiscard: true,
    },
  },
];

export function getTemplateSetContent(templateSet: string): TemplateSetContent {
  if (templateSet === 'default') {
    return {
      frontmatter: DEFAULT_SETTINGS.frontMatterTemplate,
      header: DEFAULT_SETTINGS.headerTemplate,
      highlight: DEFAULT_SETTINGS.highlightTemplate,
    };
  }

  const templatesDir = path.resolve(`src/test/fixtures/template-sets/${templateSet}`);

  return {
    frontmatter: readFileSync(path.join(templatesDir, 'frontmatter.njk'), 'utf8'),
    header: readFileSync(path.join(templatesDir, 'header.njk'), 'utf8'),
    highlight: readFileSync(path.join(templatesDir, 'highlight.njk'), 'utf8'),
  };
}

export function getTemplateSetMirrorContent(templateSet: string): TemplateSetContent {
  const templatesDir = path.resolve(`src/test/fixtures/template-sets/${templateSet}`);

  return {
    frontmatter: readFileSync(path.join(templatesDir, 'frontmatter.njk'), 'utf8'),
    header: readFileSync(path.join(templatesDir, 'header.njk'), 'utf8'),
    highlight: readFileSync(path.join(templatesDir, 'highlight.njk'), 'utf8'),
  };
}

function getSettings(overrides?: Partial<PluginSettings>): PluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(overrides ?? {}),
  };
}

export function getHarnessExpectedPaths(testCase: RenderHarnessCase): {
  complete: string;
} {
  const expectedDir = path.resolve(`src/test/fixtures/cases/${testCase.id}/expected`);

  return {
    complete: path.join(expectedDir, 'complete.md'),
  };
}

export function renderFrontmatterForCase(testCase: RenderHarnessCase): string {
  return renderCaseArtifacts(testCase).frontmatter;
}

export function renderMarkdownForCase(testCase: RenderHarnessCase): string {
  return renderCaseArtifacts(testCase).markdown;
}

function renderCaseArtifacts(testCase: RenderHarnessCase): RenderedCaseArtifacts {
  const templates = getTemplateSetContent(testCase.templateSet);
  const settings = getSettings(testCase.settingsOverrides);

  // Override the settings with the template set's templates
  settings.frontMatterTemplate = templates.frontmatter;
  settings.headerTemplate = templates.header;
  settings.highlightTemplate = templates.highlight;

  // Create test context with FrontmatterManager
  const ctx = createTestContext(settings);

  // Use manager to get the frontmatter
  const frontmatter = ctx.manager.getBaseFrontmatter(sampleMetadata);
  const frontmatterString = normalizeOutput(frontmatter.toString());

  const loader = new TemplateSourceLoader();
  loader.setSource('header', templates.header);
  loader.setSource('highlight', templates.highlight);

  const markdownEnv = createEnvironment(loader);
  const markdownString = normalizeOutput(
    renderMarkdownTemplate(markdownEnv, loader, {
      doc: sampleMetadata,
      book: sampleBook,
      highlights: sampleMetadata.highlights,
      headerTemplate: 'header',
      highlightTemplate: 'highlight',
      settings,
    })
  );

  // Mirror plugin output shape: readwiseFile.frontmatter + readwiseFile.contents.
  const completeString = normalizeOutput(`${frontmatterString.trimEnd()}\n${markdownString}`);

  return {
    frontmatter: frontmatterString,
    markdown: markdownString,
    complete: completeString,
  };
}

export function renderCompleteForCase(testCase: RenderHarnessCase): string {
  return renderCaseArtifacts(testCase).complete;
}
