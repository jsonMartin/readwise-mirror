import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_SETTINGS } from 'src/constants';
import * as nunjucks from 'nunjucks';
import { FileManager } from 'obsidian';
import { FrontmatterManager } from 'services/frontmatter-manager';
import { buildReadwiseDocument } from 'services/readwise-document-mapper';
import type { ReadwiseEnvironment } from 'services/readwise-environment';
import { registerCoreTemplateFilters, renderMarkdownTemplate, TemplateSourceLoader } from 'services/template-rendering';
import { sampleMetadata } from 'test/sample-data';
import type { ReadwiseDocument } from 'types/document';
import type { Export } from 'types/library';
import type { PluginContext } from 'types/plugin-context';
import type { PluginSettings } from 'types/settings';

function createBookFromDoc(doc: ReadwiseDocument): Export {
  return {
    user_book_id: doc.id,
    is_deleted: false,
    title: doc.title,
    author: doc.author.join(', '),
    readable_title: doc.title,
    source: 'test',
    cover_image_url: doc.cover_image_url,
    unique_url: doc.unique_url,
    book_tags: [],
    category: doc.category,
    document_note: doc.document_note,
    summary: doc.summary,
    readwise_url: doc.readwise_url,
    source_url: doc.source_url,
    asin: null,
    highlights: doc.highlights,
  };
}

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

  const templatesDir = path.resolve(`tests/fixtures/template-sets/${templateSet}`);

  return {
    frontmatter: readFileSync(path.join(templatesDir, 'frontmatter.njk'), 'utf8'),
    header: readFileSync(path.join(templatesDir, 'header.njk'), 'utf8'),
    highlight: readFileSync(path.join(templatesDir, 'highlight.njk'), 'utf8'),
  };
}

export function getTemplateSetMirrorContent(templateSet: string): TemplateSetContent {
  const templatesDir = path.resolve(`tests/fixtures/template-sets/${templateSet}`);

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
  const expectedDir = path.resolve(`tests/fixtures/cases/${testCase.id}/expected`);

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

function renderCaseArtifacts(
  testCase: RenderHarnessCase,
  metadata: ReadwiseDocument = sampleMetadata,
  sourceBook?: Export
): RenderedCaseArtifacts {
  const templates = getTemplateSetContent(testCase.templateSet);
  const settings = getSettings(testCase.settingsOverrides);
  const sampleBook = sourceBook ?? createBookFromDoc(metadata);

  // Override the settings with the template set's templates
  settings.frontMatterTemplate = templates.frontmatter;
  settings.headerTemplate = templates.header;
  settings.highlightTemplate = templates.highlight;

  // Create test context with FrontmatterManager
  const ctx = createTestContext(settings);

  // Use manager to get the frontmatter
  const frontmatter = ctx.manager.getBaseFrontmatter(metadata);
  const frontmatterString = frontmatter.toString();

  const loader = new TemplateSourceLoader();
  loader.setSource('header', templates.header);
  loader.setSource('highlight', templates.highlight);

  const markdownEnv = createEnvironment(loader);
  const markdownString = renderMarkdownTemplate(markdownEnv, loader, {
    doc: metadata,
    book: sampleBook,
    highlights: metadata.highlights,
    headerTemplate: 'header',
    highlightTemplate: 'highlight',
    settings,
  });

  // Mirror plugin output shape: readwiseFile.frontmatter + readwiseFile.contents.
  const completeString = `${frontmatterString.trimEnd()}${markdownString}`;

  return {
    frontmatter: frontmatterString,
    markdown: markdownString,
    complete: completeString,
  };
}

export function renderCompleteForCase(testCase: RenderHarnessCase): string {
  return renderCaseArtifacts(testCase).complete;
}

export function renderCompleteForCaseWithDoc(testCase: RenderHarnessCase, metadata: ReadwiseDocument): string {
  return renderCaseArtifacts(testCase, metadata).complete;
}

export function renderCompleteForCaseWithExport(testCase: RenderHarnessCase, book: Export): string {
  const settings = getSettings(testCase.settingsOverrides);
  const basename = book.title;
  const metadata = buildReadwiseDocument(book, {
    basename,
    settings,
  });
  return renderCaseArtifacts(testCase, metadata, book).complete;
}
