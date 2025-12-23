import { READWISE_REVIEW_URL_BASE } from 'constants/index';
import { TFile, TFolder } from 'obsidian';
import type { Library } from 'types/library';
import type { TTrackedFile } from 'types/readwise-note';
import { getTrackingUrl, isFileInFolder, normalizeFilename } from 'utils/file-utils';
import { humanReadableFormat } from 'utils/format-utils';
import { isInReadwiseLibrary, isTrackedReadwiseNote } from 'utils/tracking-utils';
import type ReadwiseMirror from '../main';
import type { PluginContext } from '../types/plugin-context';
import ReadwiseApi from './readwise-api';

/**
 * Controller class managing Readwise API interactions and sync operations
 * Singleton pattern to ensure only one instance exists
 */
export class Controller {
  private static instance: Controller;
  private api: ReadwiseApi | undefined;

  constructor(
    private plugin: ReadwiseMirror,
    private ctx: PluginContext
  ) {}

  public static async initialize(plugin: ReadwiseMirror, ctx: PluginContext): Promise<Controller> {
    if (!Controller.instance) {
      Controller.instance = new Controller(plugin, ctx);
    }
    // Always (re)create or refresh the API instance so methods can safely assume `this.api` exists.
    try {
      Controller.instance.api = await ReadwiseApi.create(ctx);
    } catch (err) {
      // Keep instance but log/notify — callers must still check api presence/validity.
      Controller.instance.ctx.logger.error('ReadwiseController: failed to create API instance', err);
      Controller.instance.ctx.notify.notice('Readwise: Failed to initialize API. Check settings.');
      Controller.instance.api = undefined;
    }
    return Controller.instance;
  }

  // Check if a valid API instance exists (safe)
  public static async validateAPIInstance(): Promise<boolean> {
    const instance = Controller.instance;
    if (!instance) return false;
    if (!instance.api) {
      try {
        instance.api = await ReadwiseApi.create(instance.ctx);
      } catch (err) {
        instance.ctx.logger.error('validateAPIInstance: failed to create API', err);
        return false;
      }
    }
    try {
      return !!(await instance.api.validateToken());
    } catch (err) {
      instance.ctx.logger.warn('validateAPIInstance: token validation failed', err);
      return false;
    }
  }

  public async sync() {
    // Equivalent to plugin.sync()
    if (this.ctx.syncLock?.isAcquired('library-sync')) {
      this.ctx.notify.notice('Sync already in progress');
      return;
    }
    await this.ctx.syncLock?.acquire('library-sync');
    try {
      if (!(await Controller.validateAPIInstance())) {
        this.ctx.notify.notice('Readwise: Network connection and valid API Token required');
        return;
      }
      let library: Library;
      if (!this.ctx.settings.lastUpdated) {
        if (this.ctx.settings.syncNotifications)
          this.ctx.notify.notice('Readwise: Previous sync not detected...\nDownloading full Readwise library');
        library = await this.api.downloadFullLibrary();
      } else {
        if (this.ctx.settings.syncNotifications)
          this.ctx.notify.notice(
            `Readwise: Checking for new updates since ${humanReadableFormat(this.ctx.settings.lastUpdated)}...`
          );
        library = await this.api.downloadUpdates(this.ctx.settings.lastUpdated);
      }
      // ...existing filtering and writing logic...
      await this.plugin.writeLibraryToMarkdown(library);
      if (this.ctx.settings.logFile) await this.plugin.writeLogToMarkdown(library);
      this.ctx.settings.lastUpdated = new Date().toISOString();
      await this.ctx.saveAndApplySettings();
      this.ctx.notify.setStatusBarText(`Readwise: Synced ${humanReadableFormat(this.ctx.settings.lastUpdated)}`);
    } catch (error) {
      this.ctx.logger.error('Error during sync:', error);
      this.ctx.notify.notice(`Readwise: Sync failed. ${error}`);
      this.ctx.notify.setStatusBarText(`Readwise: Sync error ${error}`);
    } finally {
      this.ctx.syncLock?.release('library-sync');
    }
  }

  public async deleteLibrary() {
    // Equivalent to plugin.deleteLibrary()
    this.ctx.settings.lastUpdated = null;
    await this.ctx.saveAndApplySettings();
    const vault = this.ctx.app.vault;
    const path = `${this.ctx.settings.baseFolderName}`;
    const abstractFile = vault.getAbstractFileByPath(path);
    if (abstractFile) {
      try {
        this.ctx.logger.debug('Attempting to delete entire library at:', abstractFile);
        await this.ctx.app.fileManager.trashFile(abstractFile);
        if (this.ctx.settings.syncNotifications) this.ctx.notify.notice('Readwise: library folder deleted');
      } catch (err) {
        this.ctx.logger.error(`Attempted to delete file ${path} but no file was found`, err);
        if (this.ctx.settings.syncNotifications) this.ctx.notify.notice('Readwise: Error deleting library folder');
      }
    }
    this.ctx.notify.setStatusBarText('Readwise: Click to Sync');
  }

  /**
   * Update current note with Readwise data
   */
  public async updateSingleNote(trackedFile: TTrackedFile): Promise<void> {
    if (this.ctx.syncLock.isAcquired(trackedFile.readwiseId.toString())) {
      this.ctx.notify.notice('Readwise: Update already in progress');
      return;
    }

    if (!(await Controller.validateAPIInstance())) {
      this.ctx.notify.notice('Readwise: Network connection and valid API Token required');
      return;
    }

    if (!trackedFile.isUpdatable) {
      this.ctx.notify.notice('Readwise: Current note is not a tracked Readwise note.');
      return;
    }

    // Now that we are sure we can process the file, we acquire a lock for the specific note
    this.ctx.logger.debug('Readwise: Updating single note...');

    await this.ctx.syncLock.acquire(trackedFile.readwiseId.toString());

    try {
      this.ctx.logger.debug(`Readwise: downloading current book with ID ${trackedFile.readwiseId}...`);
      const library = await this.api.downloadSingleBook(trackedFile.readwiseId);
      if (Object.keys(library.books).length > 0) {
        if (this.ctx.settings.atomicHighlights) {
          library.categories.add('Highlight');
        }
        await this.plugin.writeLibraryToMarkdown(library);

        if (this.ctx.settings.logFile) await this.plugin.writeLogToMarkdown(library);

        if (this.ctx.settings.syncNotifications) this.ctx.notify.notice('Readwise: Book update complete.');
      } else {
        this.ctx.notify.notice(`Readwise: Note with id ${trackedFile.readwiseId} not found on Readwise.`);
        this.ctx.logger.warn(`Readwise: Note with id ${trackedFile.readwiseId} not found on Readwise.`);
        return;
      }
    } catch (error) {
      this.ctx.logger.error('Error during single-book update:', error);
      this.ctx.notify.notice(`Readwise: Sync failed. ${error}`);
    } finally {
      // Make sure we release the lock even if the operation fails
      this.ctx.syncLock.release(trackedFile.readwiseId.toString());
    }
  }

  public async updateAllFrontmatter() {
    // Equivalent to plugin.updateAllFrontmatter()
    if (this.ctx.syncLock?.isAcquired('frontmatter-update')) {
      this.ctx.notify.notice('Readwise: update already in progress');
      return;
    }
    if (!(await Controller.validateAPIInstance())) {
      this.ctx.notify.notice('Readwise: Network connection and valid API Token required');
      return;
    }
    this.ctx.notify.notice('Readwise: Updating all note frontmatter...');
    await this.ctx.syncLock?.acquire('frontmatter-update');
    try {
      this.ctx.logger.debug('Readwise: downloading full library to update frontmatter...');
      const library = await this.api.downloadFullLibrary();
      // ...existing filtering logic...
      this.plugin.processFrontmatterUpdatesInLibrary(library);
      let message = `Readwise: Updated ${Object.keys(library.books).length} notes`;
      if (this.ctx.settings.filterNotesByTag && this.ctx.settings.filteredTags?.length > 0) {
        message += ` (filtered by tags: ${this.ctx.settings.filteredTags.join(', ')})`;
      }
      this.ctx.notify.notice(message);
    } catch (error) {
      this.ctx.logger.error('Error during frontmatter sync:', error);
      this.ctx.notify.notice(`Readwise: Sync failed. ${error}`);
    } finally {
      this.ctx.syncLock?.release('frontmatter-update');
    }
  }

  /**
   * Handles the adjustment of filenames in the Readwise folder.
   */
  public async handleFilenameAdjustment() {
    const vault = this.ctx.app.vault;
    const path = `${this.ctx.settings.baseFolderName}`;
    const readwiseFolder = vault.getAbstractFileByPath(path);
    if (readwiseFolder && readwiseFolder instanceof TFolder) {
      this.ctx.notify.notice('Readwise: Filename adjustment started');
      // Iterate all files in the Readwise folder and "fix" their names according to the current settings using
      const renamedFiles = await this.iterativeReadwiseRenamer(readwiseFolder);
      if (renamedFiles > 0) {
        this.ctx.notify.notice(`Readwise: Renamed ${renamedFiles} files. Check console for renaming errors.`);
      } else {
        this.ctx.notify.notice('Readwise: No files renamed. Check console for renaming errors.');
      }
    }
  }
  /**
   * Formats the filename of a Readwise note based on the settings.
   *
   * @param file The file to format.
   */
  public async renameReadwiseNote(file: TFile): Promise<boolean> {
    const newFilename = normalizeFilename(file.basename, this.ctx.settings);

    // Only rename if there's a difference
    if (newFilename !== file.basename) {
      const parentPath = file.parent?.path ?? '';
      const newPath = parentPath ? `${parentPath}/${newFilename}.md` : `${newFilename}.md`;
      try {
        await this.ctx.app.fileManager.renameFile(file, newPath);
        this.ctx.logger.debug(`Renamed file '${file.name}' to '${newFilename}.md'`);
        return true;
      } catch (error) {
        this.ctx.logger.error(`Error renaming file: '${file.name}' to '${newFilename}.md': ${error}`);
        return false;
      }
    }
    return false;
  }

  /**
   * Return a tracked file if the given file is a Readwise note that can be updated.
   */
  public getUpdatableNote(file: TFile | null): TTrackedFile | null {
    if (!file) return null;
    if (!this.ctx.settings.trackFiles) return null;

    const isReadwiseNote = isTrackedReadwiseNote(file, this.ctx.app, this.ctx.settings);
    const isInLibrary = isInReadwiseLibrary(file, this.ctx.settings);

    // If trackAcrossVault is enabled, only check if it's a Readwise note.
    // Otherwise, check if it's a Readwise note AND in the Readwise library.
    const isUpdatable = this.ctx.settings.trackAcrossVault ? isReadwiseNote : isReadwiseNote && isInLibrary;

    const trackingUrl = getTrackingUrl(file, this.ctx);
    if (typeof trackingUrl !== 'string' || !trackingUrl.startsWith(READWISE_REVIEW_URL_BASE)) {
      this.ctx.logger.warn('Tracking URL missing/invalid for current note.');
      return null;
    }

    const idStr = trackingUrl.replace(READWISE_REVIEW_URL_BASE, ''); // Extract the ID from the URL
    const readwiseId = Number.parseInt(idStr, 10);

    if (Number.isNaN(readwiseId)) {
      this.ctx.logger.warn(`Tracking URL in note is invalid (ID ${idStr} is not a valid number).`);
      return null;
    }

    // Construct tracked note
    const trackedFile: TTrackedFile = {
      ...file,
      readwiseId,
      isUpdatable,
    };
    return trackedFile;
  }

  /**
   * Update all Readwise notes in a folder
   */
  public async syncFolder(folder: TFolder) {
    if (this.ctx.syncLock.isAcquired('folder-sync')) {
      this.ctx.notify.notice('Readwise: sync already in progress');
      return;
    }

    if (!(await Controller.validateAPIInstance())) {
      this.ctx.notify.notice('Readwise: Network connection and valid API Token required');
      return;
    }

    await this.ctx.syncLock.acquire('folder-sync');

    try {
      // Get all markdown files in the folder (recursively)
      // Get all markdown files in the folder and their tracked metadata
      const trackedNotes = this.ctx.app.vault
        .getFiles()
        .filter((f) => f.extension === 'md' && f.parent && isFileInFolder(f, folder))
        .map((f) => this.getUpdatableNote(f))
        .filter((tracked): tracked is TTrackedFile => tracked?.isUpdatable);

      const bookIds = trackedNotes.map((tracked) => tracked.readwiseId);

      try {
        this.ctx.notify.notice(
          `Readwise: Updating ${bookIds.length} note${bookIds.length !== 1 ? 's' : ''} in "${folder.name}"...`
        );

        await this.updateMultipleNotes(bookIds);
      } catch (error) {
        this.ctx.logger.warn('Failed to update multiple files', error);
      }

      this.ctx.notify.notice(
        `Readwise: Updated ${bookIds.length} note${bookIds.length !== 1 ? 's' : ''} in "${folder.name}"`
      );
    } catch (error) {
      this.ctx.logger.error('Error syncing folder:', error);
      this.ctx.notify.notice(`Readwise: Sync failed. ${error}`);
    } finally {
      this.ctx.syncLock.release('folder-sync');
    }
  }
  /**
   * Iteratively renames files in the Readwise folder.
   * @param folder - The folder to iterate through
   * @returns
   */
  private async iterativeReadwiseRenamer(folder: TFolder): Promise<number> {
    const files = folder.children;
    let countRenamed = 0;
    for (const file of files) {
      if (file instanceof TFolder) {
        // Skip folders
        countRenamed += await this.iterativeReadwiseRenamer(file);
      }

      if (file instanceof TFile && file.extension === 'md') {
        const result = await this.renameReadwiseNote(file);
        if (result) {
          countRenamed++;
        }
      }
    }
    return countRenamed;
  }
  /**
   * Update current note with Readwise data
   */
  private async updateMultipleNotes(bookIds: number[]): Promise<void> {
    if (this.ctx.syncLock.isAcquired('multiple-note-update')) {
      this.ctx.notify.notice('Readwise: Update for this note already in progress');
      return;
    }

    if (!(await Controller.validateAPIInstance())) {
      this.ctx.notify.notice('Readwise: Network connection and valid API Token required');
      return;
    }

    // Now that we are sure we can process the file, we acquire a lock for the specific note
    this.ctx.logger.debug('Readwise: Updating multiple notes...');

    await this.ctx.syncLock.acquire('multiple-note-update');

    try {
      const library = await this.api.downloadMultipleBooks(bookIds);
      if (Object.keys(library.books).length > 0) {
        if (this.ctx.settings.atomicHighlights) {
          library.categories.add('Highlight');
        }

        if (this.ctx.settings.syncNotifications)
          this.ctx.notify.notice(`Readwise: writing ${Object.keys(library.books).length} updated books to markdown...`);
        this.ctx.logger.debug(`Readwise: writing ${Object.keys(library.books).length} updated books to markdown...`);
        await this.plugin.writeLibraryToMarkdown(library);
        if (this.ctx.settings.logFile) await this.plugin.writeLogToMarkdown(library);
        if (this.ctx.settings.syncNotifications) this.ctx.notify.notice('Readwise: Book update complete.');
      } else {
        this.ctx.notify.notice('Readwise: No notes from folder found on Readwise.');
        this.ctx.logger.warn('Readwise: No notes from folder found on Readwise.');
        return;
      }
    } catch (error) {
      this.ctx.logger.error('Error during multiple-book update:', error);
      this.ctx.notify.notice(`Readwise: Sync failed. ${error}`);
    } finally {
      // Make sure we release the lock even if the operation fails
      this.ctx.syncLock.release('multiple-note-update');
    }
  }
}
