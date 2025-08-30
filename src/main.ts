import slugify from '@sindresorhus/slugify';
// Constants
import { AUTHOR_SEPARATORS, DEFAULT_SETTINGS, READWISE_REVIEW_URL_BASE } from 'constants/index';
import filenamify from 'filenamify';
import { Template } from 'nunjucks';
import { normalizePath, Plugin, TFile, TFolder } from 'obsidian';
import { DeduplicatingVaultWriter } from 'services/deduplicating-vault-writer';
import { FrontmatterManager } from 'services/frontmatter-manager';
// Plugin classes
import Logger from 'services/logger';
import ReadwiseApi from 'services/readwise-api';
import { ReadwiseEnvironment } from 'services/readwise-environment';
import spacetime from 'spacetime';
// Types
import type { Export, Highlight, Library, PluginSettings, ReadwiseDocument, ReadwiseFile, Tag } from 'types';
import { ConfirmDialog } from 'ui/dialog';
import Notify from 'ui/notify';
import ReadwiseMirrorSettingTab from 'ui/settings-tab';
import { createdDate, lastHighlightedDate, updatedDate } from 'utils/highlight-date-utils';
import { isInReadwiseLibrary, isTrackedReadwiseNote } from 'utils/tracking-utils';

export default class ReadwiseMirror extends Plugin {
  private _settings: PluginSettings;
  private _readwiseApi: ReadwiseApi;
  private _headerTemplate: Template;
  private _highlightTemplate: Template;
  private _logger: Logger;
  private notify: Notify;
  private isSyncing = false;
  private frontmatterManager: FrontmatterManager;
  private deduplicatingVaultWriter: DeduplicatingVaultWriter;

  // Add logger getter
  get logger() {
    return this._logger;
  }

  // Getters and setters for settings and templates
  get settings() {
    return this._settings;
  }

  set settings(settings: PluginSettings) {
    this._settings = settings;
  }

  get readwiseApi() {
    return this._readwiseApi;
  }

  set readwiseApi(api: ReadwiseApi) {
    this._readwiseApi = api;
  }

  set headerTemplate(template: string) {
    try {
      this._headerTemplate = new Template(template, new ReadwiseEnvironment(), null, true);
    } catch (error) {
      this.logger.error('Error setting header template:', error);
      this.notify.notice('Readwise: Error setting header template. Check console for details.');
    }
  }

  set highlightTemplate(template: string) {
    try {
      this._highlightTemplate = new Template(template, new ReadwiseEnvironment(), null, true);
    } catch (error) {
      this.logger.error('Error setting highlight template:', error);
      this.notify.notice('Readwise: Error setting highlight template. Check console for details.');
    }
  }

  /**
   * Formats tags for use in a template
   * @param tags - The tags to format
   * @param nohash - Whether to remove the hash from the tag name
   * @param q - The quote character to use
   * @returns The formatted tags
   */
  private formatTags(tags: Tag[], nohash = false, q = '') {
    // use unique list of tags
    const uniqueTags = [...new Set(tags.map((tag) => tag.name.replace(/\s/, '-')))];

    if (nohash === true) {
      // don't return a hash in the tag name
      return uniqueTags.map((tag) => `${q}${tag}${q}`).join(', ');
    }
    return uniqueTags.map((tag) => `${q}#${tag}${q}`).join(', ');
  }

  /**
   * Formats a highlight for use in a template
   * @param highlight - The highlight to format
   * @param book - The book the highlight belongs to
   * @returns The formatted highlight
   */
  private formatHighlight(highlight: Highlight, book: Export) {
    const { id, text, note, location, color, url, tags, highlighted_at, created_at, updated_at } = highlight;

    const locationUrl = `https://readwise.io/to_kindle?action=open&asin=${book.asin}&location=${location}`;

    const formattedTags = tags.filter((tag) => tag.name !== color);
    const formattedTagStr = this.formatTags(formattedTags);

    return this._highlightTemplate.render({
      // Highlight fields
      id,
      text,
      note,
      location,
      location_url: locationUrl,
      url, // URL is set for source of highlight (webpage, tweet, etc). null for books
      color,
      created_at: created_at ? this.formatDate(created_at) : '',
      updated_at: updated_at ? this.formatDate(updated_at) : '',
      highlighted_at: highlighted_at ? this.formatDate(highlighted_at) : '',
      tags: formattedTagStr,

      // Book fields
      category: book.category,
    });
  }

  private filterHighlights(highlights: Highlight[]) {
    return highlights.filter((highlight: Highlight) => {
      if (this.settings.syncNotesOnly && !highlight.note) return false;

      // Check if is deleted
      if (highlight.is_deleted) {
        this.logger.debug('Found deleted highlight, removing', highlight);
        return false;
      }

      // Check if is discarded
      if (this.settings.highlightDiscard && highlight.is_discard) {
        this.logger.debug('Found discarded highlight, removing', highlight);
        return false;
      }

      return true;
    });
  }

  /**
   * Parses a string of authors into an array of individual authors
   * @param authorString The input string containing one or more authors
   * @returns Array of individual author names
   */
  private parseAuthor(authorString?: string): string[] {
    if (!authorString?.trim()) {
      return [];
    }

    return authorString
      .split(AUTHOR_SEPARATORS)
      .map((author) => author.trim())
      .filter((author) => {
        if (!author) {
          return false;
        }
        return true;
      });
  }

  private formatDate(dateStr: string) {
    return dateStr.split('T')[0];
  }

  private sortHighlights = (highlights: Highlight[]) => {
    let sortedHighlights = highlights.slice();

    if (this.settings.highlightSortByLocation) {
      sortedHighlights = sortedHighlights.sort((highlightA: Highlight, highlightB: Highlight) => {
        if (highlightA.location < highlightB.location) return -1;
        if (highlightA.location > highlightB.location) return 1;
        return 0;
      });

      if (!this.settings.highlightSortOldestToNewest) sortedHighlights = sortedHighlights.reverse();
    } else {
      sortedHighlights = this.settings.highlightSortOldestToNewest ? sortedHighlights.reverse() : sortedHighlights;
    }

    return sortedHighlights;
  };

  private getTagsFromHighlights(highlights: Highlight[]) {
    // extract all tags from all Highlights and
    // construct an array with unique values

    let tags: Tag[] = [];
    for (const highlight of this.sortHighlights(highlights)) {
      if (highlight.tags) tags = [...tags, ...highlight.tags];
    }
    return tags;
  }

  async writeLogToMarkdown(library: Library) {
    const vault = this.app.vault;

    const path = `${this.settings.baseFolderName}/${this.settings.logFileName}`;
    const abstractFile = vault.getAbstractFileByPath(path);

    const now = spacetime.now();
    let logString = `# [[${now.format('iso-short')}]] *(${now.time()})*`;

    for (const bookId in library.books) {
      const book = library.books[bookId];

      const { highlights } = book;
      const num_highlights = highlights.length;
      this.logger.warn(`Replacing colon with ${this.settings.colonSubstitute}`);
      const sanitizedTitle = this.getFileNameFromDoc(book);
      const contents = `\n- [[${sanitizedTitle}]] *(${num_highlights} highlights)*`;
      logString += contents;
    }

    try {
      if (abstractFile) {
        // If log file already exists, append to the content instead of overwriting
        const logFile = vault.getFiles().filter((file) => file.name === this.settings.logFileName)[0];
        this.logger.info('logFile:', logFile);

        await vault.process(logFile, (content) => `${content}\n\n${logString}`);
      } else {
        vault.create(path, logString);
      }
    } catch (err) {
      this.logger.error('Error writing to sync log file', err);
    }
  }

  async writeLibraryToMarkdown(library: Library) {
    this.logger.group('Write Library to Markdown');
    try {
      await this.deduplicatingVaultWriter.createCategoryFolders(library.categories);
    } catch (err) {
      this.logger.error('Failed to create category folders', err);
      this.notify.notice('Readwise: Failed to create category folders. Sync aborted.');
      this.isSyncing = false;
      this.logger.groupEnd();
      return;
    }

    // Prepare all files first
    const readwiseFiles: ReadwiseFile[] = this.getReadwiseFilesFromLibrary(library);

    if (readwiseFiles.length === 0) {
      this.logger.info('No eligible Readwise files to process (all highlights filtered out). Skipping write.');
      return;
    }

    // Process all files in batch
    try {
      this.logger.time('process');
      await this.deduplicatingVaultWriter.process(readwiseFiles);
      this.logger.timeEnd('process');
    } catch (err) {
      this.logger.error('Failed to process files batch', err);
      this.notify.notice('Readwise: Failed to process some files during sync.');
    } finally {
      this.logger.groupEnd();
      this.isSyncing = false;
    }
  }

  /**
   * Processes a given Readwise library object and generates an array of `ReadwiseFile` objects,
   * each representing a book with its associated highlights and metadata.
   *
   * @param library - The Readwise library object containing books and their highlights.
   * @returns An array of `ReadwiseFile` objects, each containing the filename, document metadata, and file contents.
   */
  private getReadwiseFilesFromLibrary(library: Library): ReadwiseFile[] {
    const readwiseFiles: ReadwiseFile[] = [];

    // Get total number of records
    const booksTotal = Object.keys(library.books).length;
    let bookCurrent = 1;

    for (const bookId in library.books) {
      this.notify.setStatusBarText(
        `Readwise: Processing - ${Math.floor((bookCurrent / booksTotal) * 100)}% finished (${bookCurrent}/${booksTotal})`
      );
      bookCurrent += 1;
      const book: Export = library.books[bookId];

      const {
        user_book_id,
        title,
        document_note,
        summary,
        author,
        category,
        cover_image_url,
        highlights,
        readwise_url,
        source_url,
        unique_url,
        book_tags,
      } = book;

      const created = createdDate(highlights); // No reverse sort: we want the oldest entry
      const updated = updatedDate(highlights);

      const last_highlight_at = lastHighlightedDate(highlights);

      // Sanitize title, replace colon with substitute from settings
      const basename = this.getFileNameFromDoc(book);

      // Filter highlights
      const filteredHighlights = this.filterHighlights(highlights);

      // Get highlight count from filtered highlights
      const num_highlights = filteredHighlights.length;

      if (filteredHighlights.length === 0) {
        this.logger.debug(`No highlights found for '${title}' (${source_url})`);
      }

      // get an array with all tags from highlights
      const highlightTags = this.getTagsFromHighlights(filteredHighlights);

      const authors = this.parseAuthor(author);

      const authorStr =
        authors[0] && authors?.length > 1
          ? authors.map((authorName: string) => `[[${authorName.trim()}]]`).join(', ')
          : author
            ? `[[${author}]]`
            : '';

      const doc: ReadwiseDocument = {
        id: user_book_id,
        highlights_url: readwise_url,
        unique_url,
        source_url,
        title,
        sanitized_title: basename,
        author: authors,
        authorStr,
        document_note,
        summary,
        category,
        num_highlights,
        created: created ? this.formatDate(created) : '',
        updated: updated ? this.formatDate(updated) : '',
        cover_image_url: cover_image_url.replace('SL200', 'SL500').replace('SY160', 'SY500'),
        highlights,
        last_highlight_at: last_highlight_at ? this.formatDate(last_highlight_at) : '',
        tags: this.formatTags(book_tags),
        highlight_tags: this.formatTags(highlightTags),
        tags_nohash: this.formatTags(book_tags, true, "'"),
        hl_tags_nohash: this.formatTags(highlightTags, true, "'"),
      };

      // Render header, and highlights
      const headerContents = this._headerTemplate.render(doc);
      const formattedHighlights = this.sortHighlights(filteredHighlights)
        .map((highlight: Highlight) => this.formatHighlight(highlight, book))
        .join('\n');

      const contents = `${headerContents}${formattedHighlights}`;

      readwiseFiles.push({
        basename,
        doc,
        contents,
      });
    }
    return readwiseFiles;
  }

  /**
   * Get the filename from the Readwise document
   * @param book
   * @returns filename
   */
  private getFileNameFromDoc(book: Export) {
    let filename: string;
    if (this.settings.useCustomFilename) {
      const template = this.settings.filenameTemplate;
      const context = {
        title: book.title,
        author: this.parseAuthor(book.author).join(', '),
        category: book.category,
        source: book.source_url,
        book_id: book.user_book_id,
        created: createdDate(book.highlights),
        updated: updatedDate(book.highlights),
      };
      filename = new Template(template, new ReadwiseEnvironment(), null, true).render(context);
    } else {
      filename = book.title;
    }

    return this.normalizeFilename(filename);
  }

  /**
   *  Normalizes the filename by replacing critical characters
   *  and ensuring it is a valid filename
   * @param filename - The filename to normalize
   * @returns The normalized filename
   */
  private normalizeFilename(filename: string) {
    const normalizedFilename = this.settings.useSlugify
      ? slugify(filename.replace(/:/g, this.settings.colonSubstitute ?? '-'), {
          separator: this.settings.slugifySeparator,
          lowercase: this.settings.slugifyLowercase,
        })
      : // ... else filenamify the title and limit to 252 characters (to account for the `.md` which will be added)
        filenamify(filename.replace(/:/g, this.settings.colonSubstitute ?? '-'), {
          replacement: ' ',
          maxLength: 252,
        })
          // Ensure we remove additional critical characters, replace multiple spaces with one, and trim
          // Replace # as this inrerferes with WikiLinks (other characters are taken care of in "filenamify")
          .replace(/[#]+/g, ' ')
          .replace(/ +/g, ' ')
          .trim();

    return normalizePath(normalizedFilename);
  }

  async deleteLibraryFolder() {
    const vault = this.app.vault;
    const path = `${this.settings.baseFolderName}`;

    const abstractFile = vault.getAbstractFileByPath(path);

    // Delete old instance of file
    if (abstractFile) {
      try {
        this.logger.info('Attempting to delete entire library at:', abstractFile);
        await this.app.fileManager.trashFile(abstractFile);
        return true;
      } catch (err) {
        this.logger.error(`Attempted to delete file ${path} but no file was found`, err);
        return false;
      }
    }
  }

  async sync() {
    if (this.isSyncing) {
      this.notify.notice('Sync already in progress');
      return;
    }

    this.isSyncing = true;
    try {
      if (!this._readwiseApi?.hasValidToken()) {
        this.notify.notice('Readwise: Valid API Token Required');

        return;
      }

      let library: Library;
      const lastUpdated = this.settings.lastUpdated;
      const filterTags: string[] =
        this.settings.filterTags
          .split(/[,;\n]/) // Split on comma, semicolon, or newline
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0) || [];

      if (!lastUpdated) {
        this.notify.notice('Readwise: Previous sync not detected...\nDownloading full Readwise library');
        library = await this._readwiseApi.downloadFullLibrary();
      } else {
        // Load Upadtes and cache
        this.notify.notice(`Readwise: Checking for new updates since ${this.lastUpdatedHumanReadableFormat()}`);
        library = await this._readwiseApi.downloadUpdates(lastUpdated);
      }

      this.logger.group('Filter Library: Deleted and by Tag');
      this.logger.debug(`Filtering books: deleted ${this.settings.filterTags ? 'or by tag ' : ''}(${filterTags})`);
      // Remove deleted books
      for (const bookId in library.books) {
        const book = library.books[bookId];
        if (book.is_deleted) {
          this.logger.warn(`Removing deleted book: ${book.title} (${book.user_book_id})`);
          delete library.books[bookId];
        }
        if (this.settings.filterByTag && filterTags.length > 0) {
          if (book.book_tags.every((tag) => !filterTags.includes(tag.name))) {
            this.logger.debug(`Removing book not matching filter tags: ${book.title} (${book.user_book_id})`);
            delete library.books[bookId];
          }
        }
      }

      this.logger.groupEnd();

      if (Object.keys(library.books).length > 0) {
        this.writeLibraryToMarkdown(library);

        if (this.settings.logFile) this.writeLogToMarkdown(library);

        let message = `Readwise: Downloaded ${library.highlightCount} Highlights from ${Object.keys(library.books).length} Sources`;
        if (this.settings.filterByTag && this.settings.filterTags) {
          message += ` (filtered by tags: ${this.settings.filterTags})`;
        }
        this.notify.notice(message);
      } else {
        this.notify.notice('Readwise: No new content available');
      }

      this.settings.lastUpdated = new Date().toISOString();
      await this.saveSettings();
      this.notify.setStatusBarText(`Readwise: Synced ${this.lastUpdatedHumanReadableFormat()}`);
    } catch (error) {
      this.logger.error('Error during sync:', error);
      this.notify.notice(`Readwise: Sync failed. ${error}`);
    } finally {
      // Make sure we reset the sync status in case of error
      this.isSyncing = false;
    }
  }

  async download() {
    // Reset lastUpdate setting to force full download
    this.settings.lastUpdated = null;
    await this.saveSettings();
    await this.sync();
  }

  async deleteLibrary() {
    this.settings.lastUpdated = null;
    await this.saveSettings();

    if (await this.deleteLibraryFolder()) {
      this.notify.notice('Readwise: library folder deleted');
    } else {
      this.notify.notice('Readwise: Error deleting library folder');
    }

    this.notify.setStatusBarText('Readwise: Click to Sync');
  }

  lastUpdatedHumanReadableFormat() {
    return spacetime.now().since(spacetime(this.settings.lastUpdated)).rounded;
  }

  /**
   * Handles the adjustment of filenames in the Readwise folder.
   */
  async handleFilenameAdjustment() {
    const vault = this.app.vault;
    const path = `${this.settings.baseFolderName}`;
    const readwiseFolder = vault.getAbstractFileByPath(path);
    if (readwiseFolder && readwiseFolder instanceof TFolder) {
      this.notify.notice('Readwise: Filename adjustment started');
      // Iterate all files in the Readwise folder and "fix" their names according to the current settings using
      // this.normalizeFilename()
      const renamedFiles = await this.iterativeReadwiseRenamer(readwiseFolder);
      if (renamedFiles > 0) {
        this.notify.notice(`Readwise: Renamed ${renamedFiles} files. Check console for renaming errors.`);
      } else {
        this.notify.notice('Readwise: No files renamed. Check console for renaming errors.');
      }
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
   * Formats the filename of a Readwise note based on the settings.
   *
   * @param file The file to format.
   */
  private async renameReadwiseNote(file: TFile): Promise<boolean> {
    const newFilename = this.normalizeFilename(file.basename);

    // Only rename if there's a difference
    if (newFilename !== file.basename) {
      const newPath = `${file.parent.path}/${newFilename}.md`;
      try {
        await this.app.fileManager.renameFile(file, newPath);
        this.logger.info(`Renamed file '${file.name}' to '${newFilename}.md'`);
        return true;
      } catch (error) {
        this.logger.error(`Error renaming file: '${file.name}' to '${newFilename}.md': ${error}`);
        return false;
      }
    }
    return false;
  }

  // Reload settings after external change (e.g. after sync)
  async onExternalSettingsChange() {
    this.logger.info('Reloading settings due to external change');
    await this.loadSettings();
    if (this.settings.lastUpdated)
      this.notify.setStatusBarText(`Readwise: Updated ${this.lastUpdatedHumanReadableFormat()} elsewhere`);
    if (!this.settings.apiToken) {
      this.notify.notice('Readwise: API Token not detected\nPlease enter in configuration page');
      this.notify.setStatusBarText('Readwise: API Token Required');
      this._readwiseApi = null; // Invalidate the API instance
    } else {
      this._readwiseApi = new ReadwiseApi(this.settings.apiToken, this.notify, this._logger);
    }
  }

  async onload() {
    await this.loadSettings();

    // Initialize logger with debug mode from settings
    this._logger = new Logger(this.settings.debugMode || false);

    // Move UI setup to onLayoutReady
    this.app.workspace.onLayoutReady(() => {
      this.initializeUI();
    });
  }

  private initializeUI() {
    const statusBarItem = this.addStatusBarItem();

    this.notify = new Notify(statusBarItem);

    this.frontmatterManager = new FrontmatterManager(this.settings, this.logger);

    this.headerTemplate = this.settings.headerTemplate;
    this.highlightTemplate = this.settings.highlightTemplate;

    this.deduplicatingVaultWriter = new DeduplicatingVaultWriter(
      this.app,
      this.settings,
      this.frontmatterManager,
      this.logger,
      this.notify
    );

    if (!this.settings.apiToken) {
      this.notify.notice('Readwise: API Token not detected\nPlease enter in configuration page');
      this.notify.setStatusBarText('Readwise: API Token Required');
    } else {
      this._readwiseApi = new ReadwiseApi(this.settings.apiToken, this.notify, this._logger);

      this.logger.info('Validating Readwise token ...');
      // Run sync if we have a valid token and auto sync is enabled
      this._readwiseApi
        .validateToken()
        .then((isValid) => {
          if (isValid && this.settings.autoSync) {
            this.notify.notice('Readwise: Run auto sync on startup');
            this.sync();
          }
        })
        .catch((error) => {
          this.notify.notice(`Readwise: Error validating token, please check your API token: ${error}`);
        });

      if (this.settings.lastUpdated)
        this.notify.setStatusBarText(`Readwise: Updated ${this.lastUpdatedHumanReadableFormat()}`);
      else this.notify.setStatusBarText('Readwise: Click to Sync');
    }

    this.registerDomEvent(statusBarItem, 'click', this.sync.bind(this));

    this.addCommand({
      id: 'download',
      name: 'Download entire Readwise library (force)',
      callback: this.download.bind(this),
    });

    this.addCommand({
      id: 'test',
      name: 'Test Readwise API key',
      callback: async () => {
        const isTokenValid = this._readwiseApi.hasValidToken();
        this.notify.notice(`Readwise: ${isTokenValid ? 'Token is valid' : 'INVALID TOKEN'}`);
      },
    });

    this.addCommand({
      id: 'delete',
      name: 'Delete Readwise library',
      callback: this.deleteLibrary.bind(this),
    });

    this.addCommand({
      id: 'update',
      name: 'Sync new highlights',
      callback: this.sync.bind(this),
    });

    this.addCommand({
      id: 'adjust-filenames',
      name: 'Adjust Filenames to current settings',
      checkCallback: (checking: boolean) => {
        // Only enable if tracking files and filename updates are enabled
        if (this.settings.trackFiles && this.settings.enableFileNameUpdates) {
          if (!checking) {
            this.handleFilenameAdjustment();
          }
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: 'update-all-frontmatter',
      name: 'Update all Readwise note frontmatter',
      checkCallback: (checking: boolean) => {
        if (this.settings.frontMatter && this.settings.trackFiles) {
          if (!checking) {
            this.updateAllFrontmatter();
          }
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: 'update-current-note',
      name: 'Update current note',
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        const isReadwiseNote = isTrackedReadwiseNote(file, this.app, this.settings);
        const isInLibrary = isInReadwiseLibrary(file, this.settings);

        // If trackAcrossVault is enabled, only check if it's a Readwise note.
        // Otherwise, check if it's a Readwise note AND in the Readwise library.
        const shouldEnable = this.settings.trackAcrossVault ? isReadwiseNote : isReadwiseNote && isInLibrary;

        if (shouldEnable && this.settings.trackFiles) {
          if (!checking) {
            this.updateCurrentNote(file);
          }
          return true;
        }
        return false;
      },
    });

    // Special debug command, only enabled if debug mode is active
    this.addCommand({
      id: 'reset-last-updated',
      name: 'Reset lastUpdated setting to 2 months ago (debug)',
      checkCallback: (checking: boolean) => {
        if (this.settings.debugMode) {
          if (!checking) {
            const d = spacetime.now().subtract(2, 'months');
            new ConfirmDialog(
              this.app,
              `Do you really want to reset 'last updated' date to ${spacetime.now().since(d).rounded}?`,
              (result) => {
                if (result) {
                  this.settings.lastUpdated = d.iso();
                  this.saveSettings();
                  this.notify.setStatusBarText(`Readwise: lastUpdated reset to ${spacetime.now().since(d).rounded}`);
                }
              }
            ).open();
          }
          return true;
        }
        return false;
      },
    });

    // Update status bar every second if synced
    this.registerInterval(
      window.setInterval(() => {
        if (/Synced/.test(this.notify.getStatusBarText())) {
          this.notify.setStatusBarText(`Readwise: Synced ${this.lastUpdatedHumanReadableFormat()}`);
        }
      }, 1000)
    );

    this.addSettingTab(new ReadwiseMirrorSettingTab(this.app, this, this.notify));
  }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Updates the frontmatter for all markdown files within the configured base folder.
   *
   * @async
   * @returns {Promise<void>} Resolves when all eligible files have been processed.
   */
  async updateAllFrontmatter() {
    if (this.isSyncing) {
      this.notify.notice('Readwise: update already in progress');
      return;
    }

    if (!this._readwiseApi?.hasValidToken()) {
      this.notify.notice('Readwise: Valid API Token Required');
      return;
    }

    this.notify.notice('Readwise: Updating all note frontmatter...');
    try {
      this.isSyncing = true;

      this.logger.info('Readwise: downloading full library to update frontmatter...');
      const library = await this._readwiseApi.downloadFullLibrary();

      const readwiseFiles: ReadwiseFile[] = this.getReadwiseFilesFromLibrary(library);
      this.logger.time('frontmatter.process');
      await this.deduplicatingVaultWriter.processFrontmatter(readwiseFiles);
      this.logger.timeEnd('frontmatter.process');
      this.notify.notice('Readwise: Frontmatter update complete.');
    } catch (error) {
      this.logger.error('Error during frontmatter sync:', error);
      this.notify.notice(`Readwise: Sync failed. ${error}`);
    } finally {
      // Make sure we reset the sync status in case of error
      this.isSyncing = false;
    }
  }

  /**
   * Fetch single book by bookId via downloadSingleBook
   */
  async updateCurrentNote(file: TFile = this.app.workspace.getActiveFile()) {
    if (this.isSyncing) {
      this.notify.notice('Readwise: update already in progress');
      return;
    }

    if (!this.settings.trackFiles) {
      this.notify.notice('Current note can only be updated when tracking files');
      return;
    }

    if (!this._readwiseApi?.hasValidToken()) {
      this.notify.notice('Readwise: Valid API Token Required');
      return;
    }

    try {
      this.isSyncing = true;

      // Assuming 'this' is your plugin instance and you want to get metadata for the active file in the editor
      if (!file) {
        this.logger.warn('No active file selected in the editor.');
        return;
      }

      const isReadwiseNote = isTrackedReadwiseNote(file, this.app, this.settings);
      const isInLibrary = isInReadwiseLibrary(file, this.settings);

      // If trackAcrossVault is enabled, only check if it's a Readwise note.
      // Otherwise, check if it's a Readwise note AND in the Readwise library.
      const allowUpdate = this.settings.trackAcrossVault ? isReadwiseNote : isReadwiseNote && isInLibrary;

      if (allowUpdate) {
        this.logger.debug('Readwise: Updating current note...');

        const fileCache = this.app.metadataCache.getFileCache(file);
        const trackingUrl = fileCache.frontmatter[this._settings.trackingProperty];
        const id = trackingUrl.replace(READWISE_REVIEW_URL_BASE, ''); // Extract the ID from the URL

        this.logger.debug(`Readwise: downloading current book with ID ${id}...`);
        const library = await this._readwiseApi.downloadSingleBook(id);

        if (Object.keys(library.books).length > 0) {
          await this.writeLibraryToMarkdown(library);

          if (this.settings.logFile) await this.writeLogToMarkdown(library);

          this.notify.notice('Readwise: Book update complete.');
        } else {
          this.notify.notice(`Readwise: Note with id ${id} not found on Readwise.`);
          this.logger.warn(`Readwise: Note with id ${id} not found on Readwise.`);
          return;
        }
      } else {
        this.notify.notice('Readwise: Current note is not in Readwise library.');
        return;
      }
    } catch (error) {
      this.logger.error('Error during frontmatter sync:', error);
      this.notify.notice(`Readwise: Sync failed. ${error}`);
    } finally {
      // Make sure we reset the sync status in case of error
      this.isSyncing = false;
    }
  }
}
