import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { jest } from '@jest/globals';
import { TFile } from 'obsidian';
import { DeduplicatingVaultWriter } from 'services/deduplicating-vault-writer';
import { Frontmatter } from 'services/frontmatter';
import { DEFAULT_SETTINGS } from 'src/constants';
import { sampleMetadata } from 'test/sample-data';
import type { BaseFile } from 'types/document';
import type { Export } from 'types/library';
import type { PluginContext } from 'types/plugin-context';

jest.mock('obsidian');

function createTFile(filePath: string): TFile {
  const file = new TFile();
  file.path = filePath;
  file.name = filePath.split('/').pop() ?? '';
  file.basename = file.name.replace(/\.md$/, '');
  file.extension = 'md';
  return file;
}

function loadFilenameEdgeCases(): Export[] {
  const fixturePath = path.resolve('tests/fixtures/readwise/export-filename-edge-cases.json');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as { results: Export[] };
  return fixture.results;
}

function createBaseFile(overrides: Partial<BaseFile> = {}): BaseFile {
  const doc = overrides.doc ?? sampleMetadata;
  const basename = overrides.basename ?? doc.sanitized_title;

  return {
    type: 'base',
    basename,
    doc,
    contents: overrides.contents ?? '---\nuri: test\n---\nRendered body',
    primary: overrides.primary ?? `Readwise/${doc.category}/${basename}.md`,
    duplicates: overrides.duplicates ?? [],
    atoms: overrides.atoms ?? [],
  };
}

function createContext(settingsOverrides = {}) {
  const adapter = {
    exists: jest.fn() as any,
  };

  const vault = {
    adapter,
    create: jest.fn() as any,
    process: jest.fn() as any,
    trash: jest.fn() as any,
    getFileByPath: jest.fn() as any,
    getMarkdownFiles: jest.fn(() => []) as any,
    getAbstractFileByPath: jest.fn() as any,
    createFolder: jest.fn() as any,
  };

  const fileManager = {
    processFrontMatter: jest.fn(async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
      updater({});
    }),
    trashFile: jest.fn(async () => {}),
  };

  const ctx = {
    app: {
      vault,
      fileManager,
      metadataCache: {
        getFileCache: jest.fn(() => ({ frontmatter: {} })),
      },
    },
    settings: {
      ...DEFAULT_SETTINGS,
      ...settingsOverrides,
    },
    logger: {
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    },
    syncLock: {
      isAcquired: jest.fn(() => false),
      acquire: jest.fn(async () => {}),
      release: jest.fn(),
    },
    statusBarItem: {} as HTMLElement,
    notice: jest.fn(),
    setStatusBarText: jest.fn(),
    saveAndApplySettings: jest.fn(async () => {}),
  } as unknown as PluginContext;

  return { ctx, vault, fileManager, adapter };
}

function createWriter(settingsOverrides = {}) {
  const { ctx, vault, fileManager, adapter } = createContext(settingsOverrides);
  const frontmatterManager = {
    getFrontmatter: jest.fn(() => new Frontmatter({ uri: sampleMetadata.readwise_url })),
    writeUpdatedFrontmatter: jest.fn(async () => {}),
  };

  const writer = new DeduplicatingVaultWriter(ctx, frontmatterManager as never);
  return { writer, ctx, vault, fileManager, adapter, frontmatterManager };
}

describe('DeduplicatingVaultWriter', () => {
  it('creates a hashed filename when the base path already exists', async () => {
    const exports = loadFilenameEdgeCases();
    const collisionDoc = {
      ...sampleMetadata,
      title: exports[0].title,
      sanitized_title: 'A B C',
    };

    const { writer, vault, adapter, fileManager } = createWriter({ trackFiles: false });
    const createdFile = createTFile('Readwise/Articles/A B C h123.md');
    const baseFile = createBaseFile({ doc: collisionDoc, basename: 'A B C' });

    adapter.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    vault.create = jest.fn(async () => createdFile) as any;
    jest.spyOn(writer, 'generateShortHash').mockReturnValue('h123');

    const written = await (writer as unknown as { writeFileToVault(file: BaseFile): Promise<TFile> }).writeFileToVault(
      baseFile
    );

    expect(adapter.exists).toHaveBeenNthCalledWith(1, 'Readwise/Books & articles/A B C.md', false);
    expect(adapter.exists).toHaveBeenNthCalledWith(2, 'Readwise/Books & articles/A B C h123.md', false);
    expect(vault.create).toHaveBeenCalledWith('Readwise/Books & articles/A B C h123.md', baseFile.contents, {
      ctime: new Date(baseFile.doc.created).getTime(),
      mtime: new Date(baseFile.doc.updated).getTime(),
    });
    expect(fileManager.processFrontMatter).toHaveBeenCalledWith(createdFile, expect.any(Function));
    expect(written).toBe(createdFile);
  });

  it('marks duplicates in frontmatter when deletion is disabled', async () => {
    const { writer, frontmatterManager } = createWriter({ deleteDuplicates: false });
    const duplicate = createTFile('Readwise/Articles/duplicate.md');
    const baseFile = createBaseFile();

    await (
      writer as unknown as { handleDuplicate(file: TFile, readwiseFile: BaseFile): Promise<void> }
    ).handleDuplicate(duplicate, baseFile);

    const frontmatterArg = (frontmatterManager.writeUpdatedFrontmatter as jest.Mock).mock.calls[0][1] as Frontmatter;
    expect(frontmatterManager.writeUpdatedFrontmatter).toHaveBeenCalledWith(duplicate, expect.any(Frontmatter));
    expect(frontmatterArg.get('duplicate')).toBe(true);
  });

  it('trashes duplicates when deletion is enabled', async () => {
    const { writer, fileManager, frontmatterManager } = createWriter({ deleteDuplicates: true });
    const duplicate = createTFile('Readwise/Articles/duplicate.md');
    const baseFile = createBaseFile();

    await (
      writer as unknown as { handleDuplicate(file: TFile, readwiseFile: BaseFile): Promise<void> }
    ).handleDuplicate(duplicate, baseFile);

    expect(fileManager.trashFile).toHaveBeenCalledWith(duplicate);
    expect(frontmatterManager.writeUpdatedFrontmatter).not.toHaveBeenCalled();
  });

  it('surfaces errors when content writing fails after frontmatter processing', async () => {
    const { writer, vault, fileManager } = createWriter();
    const existingFile = createTFile('Readwise/Books & articles/existing.md');
    const baseFile = createBaseFile({ primary: existingFile });

    vault.process = jest.fn(async () => {
      throw new Error('content write failed');
    }) as any;

    await expect(
      (writer as unknown as { updateExistingFile(file: BaseFile): Promise<void> }).updateExistingFile(baseFile)
    ).rejects.toThrow('content write failed');
    expect(fileManager.processFrontMatter).toHaveBeenCalledWith(existingFile, expect.any(Function));
    expect(vault.process).toHaveBeenCalledWith(existingFile, expect.any(Function), undefined);
  });

  it('groups path collisions case-insensitively before writing', async () => {
    const { writer } = createWriter({ trackFiles: false });
    const writePathGroup = jest
      .spyOn(writer as unknown as { writePathGroup(files: BaseFile[]): Promise<void> }, 'writePathGroup')
      .mockResolvedValue(undefined);

    const first = createBaseFile({ primary: 'Readwise/Articles/My File.md' });
    const second = createBaseFile({ primary: 'readwise/articles/my file.md' });

    await writer.process([first, second]);

    expect(writePathGroup).toHaveBeenCalledTimes(1);
    expect(writePathGroup).toHaveBeenCalledWith([first, second]);
  });
});
