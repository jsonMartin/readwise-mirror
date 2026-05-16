import { jest } from '@jest/globals';
import { TFile, TFolder } from 'obsidian';
import { Controller } from 'services/controller';
import type { PluginContext } from 'types/plugin-context';
import { DEFAULT_SETTINGS } from '../src/constants';

jest.mock('utils/file-utils', () => ({
  normalizeFilename: jest.fn((value: string) => value),
  isFileInFolder: jest.fn(() => true),
  getTrackingUrl: jest.fn(() => undefined),
}));

jest.mock('utils/tracking-utils', () => ({
  isInReadwiseLibrary: jest.fn(() => true),
  isTrackedReadwiseNote: jest.fn(() => true),
}));

const { normalizeFilename } = jest.requireMock('utils/file-utils') as {
  normalizeFilename: jest.Mock;
};

function createFile(filePath: string): TFile {
  const file = new TFile();
  file.path = filePath;
  file.name = filePath.split('/').pop() ?? '';
  file.basename = file.name.replace(/\.md$/, '');
  file.extension = 'md';

  const parentPath = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
  if (parentPath) {
    const parent = new TFolder();
    parent.path = parentPath;
    parent.name = parentPath.split('/').pop() ?? '';
    file.parent = parent;
  }

  return file;
}

function createFolder(folderPath: string, children: Array<TFile | TFolder> = []): TFolder {
  const folder = new TFolder();
  folder.path = folderPath;
  folder.name = folderPath.split('/').pop() ?? folderPath;
  folder.children = children;
  return folder;
}

function createController() {
  const vault = {
    getAbstractFileByPath: jest.fn(),
    getFiles: jest.fn(() => []),
  };

  const fileManager = {
    renameFile: jest.fn(async () => {}),
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
      baseFolderName: 'Readwise',
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

  const plugin = {
    writeLibraryToMarkdown: jest.fn(async () => {}),
    writeLogToMarkdown: jest.fn(async () => {}),
    processFrontmatterUpdatesInLibrary: jest.fn(async () => {}),
  };

  const controller = new Controller(plugin as never, ctx);
  return { controller, ctx, vault, fileManager };
}

describe('Controller rename flows', () => {
  beforeEach(() => {
    normalizeFilename.mockReset();
    normalizeFilename.mockImplementation((value: string) => value);
  });

  it('renames a note when normalization changes the basename', async () => {
    const { controller, fileManager, ctx } = createController();
    const file = createFile('Readwise/Articles/Book: Study.md');

    normalizeFilename.mockReturnValue('Book - Study');

    await expect(controller.renameReadwiseNote(file)).resolves.toBe(true);
    expect(fileManager.renameFile).toHaveBeenCalledWith(file, 'Readwise/Articles/Book - Study.md');
    expect(ctx.logger.debug).toHaveBeenCalledWith("Renamed file 'Book: Study.md' to 'Book - Study.md'");
  });

  it('does not rename when normalization leaves the basename unchanged', async () => {
    const { controller, fileManager } = createController();
    const file = createFile('Readwise/Articles/Stable.md');

    normalizeFilename.mockReturnValue('Stable');

    await expect(controller.renameReadwiseNote(file)).resolves.toBe(false);
    expect(fileManager.renameFile).not.toHaveBeenCalled();
  });

  it('returns false and logs when renameFile throws', async () => {
    const { controller, fileManager, ctx } = createController();
    const file = createFile('Readwise/Articles/Book: Study.md');

    normalizeFilename.mockReturnValue('Book - Study');
    fileManager.renameFile.mockRejectedValue(new Error('collision'));

    await expect(controller.renameReadwiseNote(file)).resolves.toBe(false);
    expect(ctx.logger.error).toHaveBeenCalledWith(
      "Error renaming file: 'Book: Study.md' to 'Book - Study.md': Error: collision"
    );
  });

  it('renames root-level files without a parent path', async () => {
    const { controller, fileManager } = createController();
    const file = createFile('Book: Study.md');
    file.parent = null;

    normalizeFilename.mockReturnValue('Book - Study');

    await expect(controller.renameReadwiseNote(file)).resolves.toBe(true);
    expect(fileManager.renameFile).toHaveBeenCalledWith(file, 'Book - Study.md');
  });

  it('iterates recursively and counts only successful markdown renames', async () => {
    const { controller } = createController();
    const topFile = createFile('Readwise/top.md');
    const skippedFile = createFile('Readwise/image.png');
    skippedFile.extension = 'png';
    const nestedFile = createFile('Readwise/Nested/nested.md');
    const nestedFolder = createFolder('Readwise/Nested', [nestedFile]);
    const root = createFolder('Readwise', [topFile, skippedFile, nestedFolder]);

    const renameSpy = jest
      .spyOn(controller, 'renameReadwiseNote')
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const renamedCount = await (controller as unknown as { iterativeReadwiseRenamer(folder: TFolder): Promise<number> }).iterativeReadwiseRenamer(root);

    expect(renameSpy).toHaveBeenCalledTimes(2);
    expect(renameSpy).toHaveBeenNthCalledWith(1, topFile);
    expect(renameSpy).toHaveBeenNthCalledWith(2, nestedFile);
    expect(renamedCount).toBe(1);
  });

  it('starts filename adjustment and reports renamed count for a Readwise folder', async () => {
    const { controller, vault, ctx } = createController();
    const readwiseFolder = createFolder('Readwise');

    vault.getAbstractFileByPath.mockReturnValue(readwiseFolder);
    jest
      .spyOn(controller as unknown as { iterativeReadwiseRenamer(folder: TFolder): Promise<number> }, 'iterativeReadwiseRenamer')
      .mockResolvedValue(2);

    await controller.handleFilenameAdjustment();

    expect(vault.getAbstractFileByPath).toHaveBeenCalledWith('Readwise');
    expect(ctx.notice).toHaveBeenNthCalledWith(1, 'Readwise: Filename adjustment started');
    expect(ctx.notice).toHaveBeenNthCalledWith(2, 'Readwise: Renamed 2 files. Check console for renaming errors.');
  });

  it('reports no renamed files when filename adjustment finds nothing to rename', async () => {
    const { controller, vault, ctx } = createController();
    const readwiseFolder = createFolder('Readwise');

    vault.getAbstractFileByPath.mockReturnValue(readwiseFolder);
    jest
      .spyOn(controller as unknown as { iterativeReadwiseRenamer(folder: TFolder): Promise<number> }, 'iterativeReadwiseRenamer')
      .mockResolvedValue(0);

    await controller.handleFilenameAdjustment();

    expect(ctx.notice).toHaveBeenNthCalledWith(2, 'Readwise: No files renamed. Check console for renaming errors.');
  });
});