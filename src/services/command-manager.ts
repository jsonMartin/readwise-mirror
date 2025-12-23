import { Lock } from 'async-await-mutex-lock';
import { READWISE_REVIEW_URL_BASE } from 'constants/index';
import { type Command, type Menu, type TAbstractFile, TFile, TFolder } from 'obsidian';
import spacetime from 'spacetime';
import type { Library } from 'types/library';
import type { TTrackedFile } from 'types/readwise-note';
import { ConfirmDialog } from 'ui/dialog';
import { isInReadwiseLibrary, isTrackedReadwiseNote } from 'utils/tracking-utils';
import type { PluginContext } from '../types/plugin-context';

/**
 * Manages command registration for the Readwise Mirror plugin
 */
export class ReadwiseCommandManager {
  private syncLock = new Lock<string>();

  constructor(private ctx: PluginContext) {}
  private get commandManifest(): Command[] {
    return [
      {
        id: 'download',
        name: 'Download entire Readwise library (force)',
        callback: async () => {
          this.ctx.settings.lastUpdated = null;
          await this.ctx.saveSettings();
          await this.sync();
        },
      },

      {
        id: 'test',
        name: 'Test Readwise API key',
        callback: async () => {
          const isTokenValid = this.ctx.plugin.readwiseApi?.hasValidToken();
          this.ctx.notify.notice(`Readwise: ${isTokenValid ? 'Token is valid' : 'INVALID TOKEN'}`);
        },
      },

      {
        id: 'delete',
        name: 'Delete Readwise library',
        callback: () => this.ctx.plugin.deleteLibrary(),
      },

      {
        id: 'update',
        name: 'Sync new highlights',
        callback: () => this.sync(),
      },

      {
        id: 'adjust-filenames',
        name: 'Adjust Filenames to current settings',
        checkCallback: (checking: boolean) => {
          if (this.ctx.settings.trackFiles && this.ctx.settings.enableFileNameUpdates) {
            if (!checking) this.ctx.plugin.handleFilenameAdjustment();
            return true;
          }
          return false;
        },
      },

      {
        id: 'update-all-frontmatter',
        name: 'Update all Readwise note frontmatter',
        checkCallback: (checking: boolean) => {
          if (this.ctx.settings.frontMatter && this.ctx.settings.trackFiles) {
            if (!checking) this.updateAllFrontmatter();
            return true;
          }
          return false;
        },
      },

      {
        id: 'update-current-note',
        name: 'Update current note',
        checkCallback: (checking: boolean) => {
          const trackedFile = this.getUpdatableNote(this.ctx.app.workspace.getActiveFile());
          if (!trackedFile) return false;
          if (!checking) this.updateSingleNote(trackedFile);
          return true;
        },
      },

      {
        id: 'reset-last-updated',
        name: 'Reset lastUpdated setting to 2 months ago (debug)',
        checkCallback: (checking: boolean) => {
          if (this.ctx.settings.debugMode) {
            if (!checking) {
              const d = spacetime.now().subtract(2, 'months');
              new ConfirmDialog(
                this.ctx.app,
                'Are you sure?',
                `Do you really want to reset 'last updated' date to ${spacetime.now().since(d).rounded}?`,
                async (result) => {
                  if (result) {
                    this.ctx.settings.lastUpdated = d.iso();
                    await this.ctx.saveSettings();
                    this.ctx.notify.setStatusBarText(
                      `Readwise: lastUpdated reset to ${spacetime.now().since(d).rounded}`
                    );
                  }
                }
              ).open();
            }
            return true;
          }
          return false;
        },
      },
    ];
  }

  /**
   * Register all plugin commands from the manifest
   */
  public registerCommands(): void {
    for (const cmd of this.commandManifest) {
      this.ctx.plugin.addCommand(cmd as Command);
    }
  }

  /**
   * Register context menu events for Readwise notes and folders
   */
  public registerEvents(): void {
    // Register context menu for files and folders
    this.ctx.plugin.registerEvent(
      this.ctx.app.workspace.on('file-menu', (menu, file) => this.onMenuOpenCallback(menu, file))
    );

    this.ctx.plugin.registerDomEvent(this.ctx.notify.statusBarItem, 'click', this.sync.bind(this));
  }

  public runStartupCommands(): void {
    // Run sync on startup if enabled
    if (this.ctx.settings.autoSync) {
      this.sync();
    }
  }
  /**
   * Handle context menu for files and folders
   */
  private onMenuOpenCallback(menu: Menu, file: TAbstractFile) {
    if (file instanceof TFile && file.extension === 'md') {
      const tracked = this.getUpdatableNote(file);
      if (tracked) {
        // Update this note
        menu.addItem((item) => {
          item
            .setIcon('refresh-cw')
            .setTitle('Update this note')
            .onClick(() => this.updateSingleNote(tracked));
        });

        // View in Readwise
        const trackingUrl = this.getTrackingUrl(file);
        if (trackingUrl) {
          menu.addItem((item) => {
            item
              .setIcon('external-link')
              .setTitle('View in Readwise')
              .onClick(() => window.open(trackingUrl));
          });

          // Copy Readwise URL
          menu.addItem((item) => {
            item
              .setIcon('copy')
              .setTitle('Copy Readwise URL')
              .onClick(async () => {
                await navigator.clipboard.writeText(trackingUrl);
                this.ctx.notify.notice('Readwise: URL copied to clipboard');
              });
          });
        }
      }
    } else if (file instanceof TFolder) {
      // Check if this folder is in the Readwise library
      if (this.isFolderInReadwiseLibrary(file)) {
        menu.addItem((item) => {
          item
            .setIcon('refresh-cw')
            .setTitle('Update all notes in folder')
            .onClick(async () => this.syncFolder(file));
        });
      }
    }
  }

  /**
   * Check if a folder is in the Readwise library hierarchy
   */
  private isFolderInReadwiseLibrary(folder: TFolder): boolean {
    const baseFolderName = this.ctx.settings.baseFolderName?.trim();
    if (!baseFolderName) return false;

    // Check if folder is the base folder or a direct child of it
    return folder.path === baseFolderName || folder.parent?.path === baseFolderName;
  }

  /**
   * Get tracking URL from a file's frontmatter
   */
  private getTrackingUrl(file: TFile): string | undefined {
    const fileCache = this.ctx.app.metadataCache.getFileCache(file);
    const trackingProperty = this.ctx.settings.trackingProperty;
    const trackingUrl = fileCache?.frontmatter?.[trackingProperty];
    return typeof trackingUrl === 'string' && trackingUrl.startsWith(READWISE_REVIEW_URL_BASE)
      ? trackingUrl
      : undefined;
  }

  /**
   * Update all Readwise notes in a folder
   */
  private async syncFolder(folder: TFolder) {
    if (this.syncLock.isAcquired('folder-sync')) {
      this.ctx.notify.notice('Readwise: sync already in progress');
      return;
    }

    if (!this.ctx.plugin.readwiseApi?.hasValidToken()) {
      this.ctx.notify.notice('Readwise: Valid API Token Required');
      return;
    }

    await this.syncLock.acquire('folder-sync');

    try {
      // Get all markdown files in the folder (recursively)
      // Get all markdown files in the folder and their tracked metadata
      const trackedNotes = this.ctx.app.vault
        .getFiles()
        .filter((f) => f.extension === 'md' && f.parent && this.isFileInFolder(f, folder))
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
      this.syncLock.release('folder-sync');
    }
  }

  /**
   * Check if a file is within a folder (including subfolders)
   */
  private isFileInFolder(file: TFile, folder: TFolder): boolean {
    return file.path.startsWith(`${folder.path}/`);
  }

  /**
   * Return a tracked file if the given file is a Readwise note that can be updated.
   */
  private getUpdatableNote(file: TFile | null): TTrackedFile | null {
    if (!file) return null;
    if (!this.ctx.settings.trackFiles) return null;

    const isReadwiseNote = isTrackedReadwiseNote(file, this.ctx.app, this.ctx.settings);
    const isInLibrary = isInReadwiseLibrary(file, this.ctx.settings);

    // If trackAcrossVault is enabled, only check if it's a Readwise note.
    // Otherwise, check if it's a Readwise note AND in the Readwise library.
    const isUpdatable = this.ctx.settings.trackAcrossVault ? isReadwiseNote : isReadwiseNote && isInLibrary;

    const trackingUrl = this.getTrackingUrl(file);
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
   * Sync entire library from Readwise
   */
  public async sync(): Promise<void> {
    if (this.syncLock.isAcquired('library-sync')) {
      this.ctx.notify.notice('Sync already in progress');
      return;
    }

    await this.syncLock.acquire('library-sync');
    try {
      if (!this.ctx.plugin.readwiseApi?.hasValidToken()) {
        this.ctx.notify.notice('Readwise: Valid API Token Required');
        return;
      }

      let library: Library;
      const lastUpdated = this.ctx.settings.lastUpdated;

      if (!lastUpdated) {
        if (this.ctx.settings.syncNotifications)
          this.ctx.notify.notice('Readwise: Previous sync not detected...\nDownloading full Readwise library');
        library = await this.ctx.plugin.readwiseApi.downloadFullLibrary();
      } else {
        // Load Updates and cache
        if (this.ctx.settings.syncNotifications)
          this.ctx.notify.notice(
            `Readwise: Checking for new updates since ${this.ctx.plugin.lastUpdatedHumanReadableFormat()}`
          );
        library = await this.ctx.plugin.readwiseApi.downloadUpdates(lastUpdated);
      }

      this.ctx.logger.group('Filter Library: Deleted and by Tag');
      this.ctx.logger.debug(
        `Filtering books: deleted ${this.ctx.settings.filteredTags ? 'or by tag ' : ''}(${this.ctx.settings.filteredTags})`
      );
      // Remove deleted books
      for (const bookId in library.books) {
        const book = library.books[bookId];
        if (book.is_deleted) {
          this.ctx.logger.warn(`Removing deleted book: ${book.title} (${book.user_book_id})`);
          delete library.books[bookId];
        }
        if (
          this.ctx.settings.filterNotesByTag &&
          Array.isArray(this.ctx.settings.filteredTags) &&
          this.ctx.settings.filteredTags.length > 0
        ) {
          if (book.book_tags.every((tag) => !this.ctx.settings.filteredTags.includes(tag.name))) {
            this.ctx.logger.debug(`Removing book not matching filter tags: ${book.title} (${book.user_book_id})`);
            delete library.books[bookId];
          }
        }
      }

      this.ctx.logger.groupEnd();

      if (Object.keys(library.books).length > 0) {
        if (this.ctx.settings.atomicHighlights) {
          library.categories.add('Highlight');
        }

        await this.ctx.plugin.writeLibraryToMarkdown(library);

        if (this.ctx.settings.logFile) await this.ctx.plugin.writeLogToMarkdown(library);

        let message = `Readwise: Downloaded ${library.highlightCount} Highlights from ${Object.keys(library.books).length} Sources`;
        if (this.ctx.settings.filterNotesByTag && this.ctx.settings.filteredTags?.length > 0) {
          message += ` (filtered by tags: ${this.ctx.settings.filteredTags.join(', ')})`;
        }
        if (this.ctx.settings.syncNotifications) this.ctx.notify.notice(message);
      } else {
        if (this.ctx.settings.syncNotifications) this.ctx.notify.notice('Readwise: No new content available');
      }

      this.ctx.settings.lastUpdated = new Date().toISOString();
      await this.ctx.saveSettings();
      this.ctx.notify.setStatusBarText(`Readwise: Synced ${this.ctx.plugin.lastUpdatedHumanReadableFormat()}`);
    } catch (error) {
      this.ctx.logger.error('Error during sync:', error);
      this.ctx.notify.notice(`Readwise: Sync failed. ${error}`);
      this.ctx.notify.setStatusBarText(`Readwise: Sync error ${error}`);
    } finally {
      // Make sure we reset the sync status in case of error
      this.syncLock.release('library-sync');
    }
  }

  /**
   * Update current note with Readwise data
   */
  private async updateSingleNote(trackedFile: TTrackedFile): Promise<void> {
    if (this.syncLock.isAcquired(trackedFile.readwiseId.toString())) {
      this.ctx.notify.notice('Readwise: Update already in progress');
      return;
    }

    if (!this.ctx.plugin.readwiseApi?.hasValidToken()) {
      this.ctx.notify.notice('Readwise: Valid API Token Required');
      return;
    }

    if (!trackedFile.isUpdatable) {
      this.ctx.notify.notice('Readwise: Current note is not a tracked Readwise note.');
      return;
    }

    // Now that we are sure we can process the file, we acquire a lock for the specific note
    this.ctx.logger.debug('Readwise: Updating multiple notes...');

    await this.syncLock.acquire(trackedFile.readwiseId.toString());

    try {
      this.ctx.logger.debug(`Readwise: downloading current book with ID ${trackedFile.readwiseId}...`);
      const library = await this.ctx.plugin.readwiseApi.downloadSingleBook(trackedFile.readwiseId);
      if (Object.keys(library.books).length > 0) {
        if (this.ctx.settings.atomicHighlights) {
          library.categories.add('Highlight');
        }
        await this.ctx.plugin.writeLibraryToMarkdown(library);

        if (this.ctx.settings.logFile) await this.ctx.plugin.writeLogToMarkdown(library);

        if (this.ctx.settings.syncNotifications) this.ctx.notify.notice('Readwise: Book update complete.');
      } else {
        this.ctx.notify.notice(`Readwise: Note with id ${trackedFile.readwiseId} not found on Readwise.`);
        this.ctx.logger.warn(`Readwise: Note with id ${trackedFile.readwiseId} not found on Readwise.`);
        return;
      }
    } catch (error) {
      this.ctx.logger.error('Error during multiple-book update:', error);
      this.ctx.notify.notice(`Readwise: Sync failed. ${error}`);
    } finally {
      // Make sure we release the lock even if the operation fails
      this.syncLock.release(trackedFile.readwiseId.toString());
    }
  }

  /**
   * Update current note with Readwise data
   */
  private async updateMultipleNotes(bookIds: number[]): Promise<void> {
    if (this.syncLock.isAcquired('multiple-note-update')) {
      this.ctx.notify.notice('Readwise: Update for this note already in progress');
      return;
    }

    if (!this.ctx.plugin.readwiseApi?.hasValidToken()) {
      this.ctx.notify.notice('Readwise: Valid API Token Required');
      return;
    }

    // Now that we are sure we can process the file, we acquire a lock for the specific note
    this.ctx.logger.debug('Readwise: Updating current note...');

    await this.syncLock.acquire('multiple-note-update');

    try {
      const library = await this.ctx.plugin.readwiseApi.downloadMultipleBooks(bookIds);
      if (Object.keys(library.books).length > 0) {
        if (this.ctx.settings.atomicHighlights) {
          library.categories.add('Highlight');
        }

        if (this.ctx.settings.syncNotifications)
          this.ctx.notify.notice(`Readwise: writing ${Object.keys(library.books).length} updated books to markdown...`);
        this.ctx.logger.debug(`Readwise: writing ${Object.keys(library.books).length} updated books to markdown...`);
        await this.ctx.plugin.writeLibraryToMarkdown(library);
        if (this.ctx.settings.logFile) await this.ctx.plugin.writeLogToMarkdown(library);
        if (this.ctx.settings.syncNotifications) this.ctx.notify.notice('Readwise: Book update complete.');
      } else {
        this.ctx.notify.notice('Readwise: No notes from folder found on Readwise.');
        this.ctx.logger.warn('Readwise: No notes from folder found on Readwise.');
        return;
      }
    } catch (error) {
      this.ctx.logger.error('Error during single-book update:', error);
      this.ctx.notify.notice(`Readwise: Sync failed. ${error}`);
    } finally {
      // Make sure we release the lock even if the operation fails
      this.syncLock.release('multiple-note-update');
    }
  }
  /**
   * Updates the frontmatter for all markdown files within the configured base folder.
   */
  public async updateAllFrontmatter(): Promise<void> {
    if (this.syncLock.isAcquired('frontmatter-update')) {
      this.ctx.notify.notice('Readwise: update already in progress');
      return;
    }

    if (!this.ctx.plugin.readwiseApi?.hasValidToken()) {
      this.ctx.notify.notice('Readwise: Valid API Token Required');
      return;
    }

    this.ctx.notify.notice('Readwise: Updating all note frontmatter...');
    await this.syncLock.acquire('frontmatter-update');
    try {
      this.ctx.logger.info('Readwise: downloading full library to update frontmatter...');
      const library = await this.ctx.plugin.readwiseApi.downloadFullLibrary();

      // Remove deleted books
      for (const bookId in library.books) {
        const book = library.books[bookId];
        if (book.is_deleted) {
          this.ctx.logger.warn(`Removing deleted book: ${book.title} (${book.user_book_id})`);
          delete library.books[bookId];
        }
        if (
          this.ctx.settings.filterNotesByTag &&
          Array.isArray(this.ctx.settings.filteredTags) &&
          this.ctx.settings.filteredTags.length > 0
        ) {
          if (book.book_tags.every((tag) => !this.ctx.settings.filteredTags.includes(tag.name))) {
            this.ctx.logger.debug(`Removing book not matching filter tags: ${book.title} (${book.user_book_id})`);
            delete library.books[bookId];
          }
        }
      }

      this.ctx.logger.group('Frontmatter Update');
      this.ctx.plugin.processFrontmatterUpdatesInLibrary(library);
      this.ctx.logger.groupEnd();
      let message = `Readwise: Updated ${Object.keys(library.books).length} notes`;
      if (this.ctx.settings.filterNotesByTag && this.ctx.settings.filteredTags?.length > 0) {
        message += ` (filtered by tags: ${this.ctx.settings.filteredTags.join(', ')})`;
      }
      this.ctx.notify.notice(message);
    } catch (error) {
      this.ctx.logger.error('Error during frontmatter sync:', error);
      this.ctx.notify.notice(`Readwise: Sync failed. ${error}`);
    } finally {
      // Make sure we reset the sync status in case of error
      this.syncLock.release('frontmatter-update');
    }
  }
}
