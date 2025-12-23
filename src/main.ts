// Plugin classes
import { Lock } from 'async-await-mutex-lock';
import { AUTHOR_SEPARATORS, DEFAULT_SETTINGS, NUNJUCKS_CORE_TEMPLATE } from 'constants/index';
import { type App, type CachedMetadata, normalizePath, Plugin, type PluginManifest, TFile } from 'obsidian';
import { Atomizer } from 'services/atomizer';
import { CommandManager } from 'services/command-manager';
import { DeduplicatingVaultWriter } from 'services/deduplicating-vault-writer';
import { Frontmatter } from 'services/frontmatter';
import { FrontmatterManager } from 'services/frontmatter-manager';
import Logger from 'services/logger';
import type ReadwiseApi from 'services/readwise-api';
import { Controller } from 'services/readwise-controller';
import { ReadwiseEnvironment, ReadwiseLoader } from 'services/readwise-environment';
import spacetime from 'spacetime';
import type { BaseFile, ReadwiseDocument } from 'types/document';
import type { Export, Highlight, Library, Tag } from 'types/library';
import type { PluginContext } from 'types/plugin-context';
import Notify from 'ui/notify';
import ReadwiseMirrorSettingTab from 'ui/settings-tab';
import { normalizeFilename } from 'utils/file-utils';
import { humanReadableFormat } from 'utils/format-utils';
import { createdDate, lastHighlightedDate, updatedDate } from 'utils/highlight-date-utils';
import type { PluginSettings } from './types/settings';

export default class ReadwiseMirror extends Plugin {
  private settings: PluginSettings;
  private readwiseApi: ReadwiseApi;
  private loader: ReadwiseLoader;
  private env: ReadwiseEnvironment;
  private logger: Logger;
  private notify: Notify;
  private lock: Lock<string>;
  private frontmatterManager: FrontmatterManager;
  private deduplicatingVaultWriter: DeduplicatingVaultWriter;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);

    // Set new custom Environment using our custom loader
    this.loader = new ReadwiseLoader();
    this.env = new ReadwiseEnvironment(this.loader, { autoescape: false });
    this.logger = new Logger(false);
    this.lock = new Lock<string>();
  }

  private get ctx() {
    // Create plugin context for dependency injection
    const ctx: PluginContext = {
      settings: this.settings,
      app: this.app,
      logger: this.logger,
      notify: this.notify,
      saveAndApplySettings: this.saveAndApplySettings.bind(this),
      syncLock: this.lock,
    };
    return ctx;
  }

  async onload() {
    // Move UI setup to onLayoutReady
    this.app.workspace.onLayoutReady(async () => {
      const statusBarItem = this.addStatusBarItem();
      this.notify = new Notify(statusBarItem);
      await this.initializeUI();
    });
  }

  private async initializeUI() {
    await this.loadAndApplySettings();
    this.logger.info('Readwise Mirror plugin loaded.');

    // Instantiate controller and attach to context
    this.frontmatterManager = new FrontmatterManager(this.ctx, this.env, this.app.fileManager);
    this.deduplicatingVaultWriter = new DeduplicatingVaultWriter(this.ctx, this.frontmatterManager);

    if (!this.settings.apiToken) {
      this.notify.notice('Readwise: API Token not detected\nPlease enter in configuration page');
      this.notify.setStatusBarText('Readwise: API Token Required');
    } else {
      //Update status bar with last sync time
      if (this.settings.lastUpdated)
        this.notify.setStatusBarText(`Readwise: Updated ${humanReadableFormat(this.settings.lastUpdated)}`);
      else this.notify.setStatusBarText('Readwise: Click to Sync');
    }

    // Register all commands and run startup commands
    let controllerInstance: Controller;
    try {
      controllerInstance = await Controller.initialize(this, this.ctx);
    } catch (error) {
      this.logger.error('Error initializing Readwise controller:', error);
      // Show concise user-facing notice but do not rethrow — allow plugin to continue
      // eslint-disable-next-line no-new
      this.notify.notice('Readwise: Controller initialization failed. Check console for details.');
    }
    CommandManager.initialize(this, this.ctx, controllerInstance);

    // Update status bar every second if synced
    this.registerInterval(
      window.setInterval(() => {
        if (/Synced/.test(this.notify.getStatusBarText())) {
          this.notify.setStatusBarText(`Readwise: Synced ${humanReadableFormat(this.settings.lastUpdated)}`);
        }
      }, 1000)
    );

    this.addSettingTab(new ReadwiseMirrorSettingTab(this, this.ctx, this.env));
  }

  // Reload settings after external change (e.g. after sync)
  async onExternalSettingsChange() {
    await this.loadAndApplySettings();
  }

  /**
   * Loads settings from disk and applies them to the plugin instance.
   * In particular, this updates the header and highlight templates.
   */
  async loadAndApplySettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
    await this.applySettings();
  }

  /**
   * Saves the current settings to disk and applies them to the plugin instance.
   * In particular, this updates the header and highlight templates.
   */
  private async saveAndApplySettings() {
    await this.saveData(this.settings);
    await this.applySettings();
  }

  /**
   * Applies the logger mode, and header and highlight templates from the current settings to the plugin instance.
   */
  private async applySettings() {
    // Set logger debug mode
    this.logger.setDebugMode(this.settings.debugMode);
    try {
      // Update and try to compile
      this.loader.setSource('header', this.settings.headerTemplate);
      this.env.getTemplate('header', true);
    } catch (error) {
      this.logger.error('Error setting header template:', error);
      this.notify.notice('Readwise: Error setting header template. Check console for details.');
    }
    try {
      // Update and try to compile
      this.loader.setSource('highlight', this.settings.highlightTemplate);
      this.env.getTemplate('highlight', true);
    } catch (error) {
      this.logger.error('Error setting highlight template:', error);
      this.notify.notice('Readwise: Error setting highlight template. Check console for details.');
    }

    // Re-initialize the ReadwiseController instance
    try {
      await Controller.initialize(this, this.ctx);
    } catch (error) {
      this.logger.error('Error initializing Readwise controller during settings apply:', error);
      this.notify.notice('Readwise: Controller initialization failed. Check console for details.');
    }
  }

  /**
   * Checks whether a specific file should be atomized,
   * based on the various settings that govern this step
   *
   * @param contents
   * @returns boolean
   */
  private shouldAtomize(frontmatter: Frontmatter): boolean {
    // Early return if atomic highlights or tracking is disabled
    if (!this.settings.atomicHighlights || !this.settings.trackFiles) {
      return false;
    }

    // If conditional atomization is disabled, always atomize
    if (!this.settings.atomicConditionalAtomize) {
      return true;
    }

    try {
      return Boolean(frontmatter?.get('rw-atomize'));
    } catch (error) {
      this.logger.warn('Error parsing frontmatter for atomization check:', error);
      return false;
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
   * @returns The highlight object for the template
   */
  private formatHighlight(highlight: Highlight, book: Export) {
    const {
      id,
      text,
      note,
      location,
      color,
      url,
      readwise_url,
      tags,
      highlighted_at,
      created_at,
      updated_at,
      is_deleted,
      is_discard,
      is_favorite,
      location_type,
    } = highlight;

    const location_url =
      book.asin && location ? `https://readwise.io/to_kindle?action=open&asin=${book.asin}&location=${location}` : null;

    const formattedTags = tags.filter((tag: Tag) => tag.name !== color);
    const formattedTagStr = this.formatTags(formattedTags);

    return {
      // Highlight fields
      book_id: book.user_book_id,
      id,
      text,
      note,
      location,
      location_type,
      location_url,
      is_deleted,
      is_discard,
      is_favorite,
      url, // URL is set for source of highlight (webpage, tweet, etc). null for books
      readwise_url,
      color,
      created_at: created_at ? this.formatDate(created_at) : '',
      updated_at: updated_at ? this.formatDate(updated_at) : '',
      highlighted_at: highlighted_at ? this.formatDate(highlighted_at) : '',
      tags: formattedTagStr,

      // Book fields
      category: book.category,
    };
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

  public async writeLogToMarkdown(library: Library) {
    const vault = this.app.vault;

    const path = `${this.settings.baseFolderName}/${this.settings.logFileName}`;
    const abstractFile = vault.getAbstractFileByPath(path);

    const now = spacetime.now();
    let logString = `# [[${now.format('iso-short')}]] *(${now.time()})*`;

    for (const bookId in library.books) {
      const book = library.books[bookId];

      const { highlights } = book;
      const num_highlights = highlights.length;
      this.logger.debug(`Replacing colon with ${this.settings.colonSubstitute}`);
      const sanitizedTitle = this.getFileNameFromDoc(book);
      const contents = `\n- [[${sanitizedTitle}]] *(${num_highlights} highlights)*`;
      logString += contents;
    }

    try {
      if (abstractFile) {
        // If log file already exists, append to the content instead of overwriting
        const logFile = vault.getFiles().filter((file) => file.name === this.settings.logFileName)[0];
        this.logger.debug('logFile:', logFile);

        await vault.process(logFile, (content) => `${content}\n\n${logString}`);
      } else {
        vault.create(path, logString);
      }
    } catch (err) {
      this.logger.error('Error writing to sync log file', err);
    }
  }

  // Write a library of Readwise books to markdown files
  public async writeLibraryToMarkdown(library: Library) {
    this.logger.group('Write Library to Markdown');
    try {
      await this.deduplicatingVaultWriter.createCategoryFolders(library.categories);
    } catch (err) {
      this.logger.error('Failed to create category folders', err);
      this.notify.notice('Readwise: Failed to create category folders. Sync aborted.');
      this.logger.groupEnd();
      return;
    }

    // Prepare all files first
    const readwiseFiles: BaseFile[] = await this.processReadwiseLibrary(library);

    if (readwiseFiles.length === 0) {
      this.logger.debug('No eligible Readwise files to process (all highlights filtered out). Skipping write.');
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
    }
  }

  public async processFrontmatterUpdatesInLibrary(library: Library): Promise<void> {
    const readwiseFiles: BaseFile[] = await this.processReadwiseLibrary(library);
    await this.deduplicatingVaultWriter.processFrontmatter(readwiseFiles);
  }

  /**
   * Processes a given Readwise library object and generates an array of `ReadwiseFile` objects,
   * each representing a book with its associated highlights and metadata.
   *
   * @param library - The Readwise library object containing books and their highlights.
   * @returns An array of `ReadwiseFile` objects, each containing the filename, document metadata, and file contents.
   */
  private async processReadwiseLibrary(library: Library): Promise<BaseFile[]> {
    const readwiseFiles: BaseFile[] = [];

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
        readwise_url,
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

      // Get the primary path for new file before checking for duplicates
      const readwisePrimary = normalizePath(
        `${this.deduplicatingVaultWriter.getCategoryPath(category)}/${basename}.md`
      );

      // Prepare the readwise file object
      const readwiseFile: BaseFile = {
        type: 'base',
        primary: readwisePrimary,
        basename,
        doc,
        contents: undefined,
      };
      // note_link is just the basename in this case
      doc.linktext = basename;

      // Early deduplication check to find primary and duplicate files
      if (this.settings.trackFiles && this.settings.trackingProperty) {
        const existingFiles = await this.deduplicatingVaultWriter.findExistingByHighlightsUrl(doc);
        if (existingFiles.length > 0) {
          const [primary, ...duplicates] = existingFiles;
          this.logger.debug(
            `Found ${existingFiles.length} existing file(s) for '${title}' (${source_url}), using primary: ${primary.path}`
          );

          if (this.settings.enableFileNameUpdates) {
            const hash = this.deduplicatingVaultWriter.generateShortHash(basename);

            try {
              for (let i = 0; i < duplicates.length; i++) {
                let newPath = normalizePath(`${duplicates[i].parent.path}/${basename} ${i + 1}.md`);
                // Avoid overwriting existing files
                let suffix = i + 1;
                while ((await this.app.vault.adapter.exists(newPath, false)) && newPath !== duplicates[i].path) {
                  suffix++;
                  newPath = normalizePath(`${duplicates[i].parent.path}/${basename} ${suffix}.md`);
                }
                if (newPath !== duplicates[i].path) {
                  await this.app.fileManager.renameFile(duplicates[i], newPath);
                }
              }

              const newFileExists = await this.app.vault.adapter.exists(readwisePrimary, false);
              // Add hash to filename if there's a collision (and the primary is not in the duplicates)
              const newPath =
                newFileExists && readwisePrimary !== primary.path
                  ? normalizePath(`${primary.parent.path}/${basename} ${hash}.md`)
                  : normalizePath(`${primary.parent.path}/${basename}.md`);
              this.logger.debug(`Rename file from ${primary.path} to ${newPath}`);
              await this.app.fileManager.renameFile(primary, newPath);
            } catch (error) {
              this.logger.error(`Error renaming file ${primary.path}`, error);
            }
          }

          readwiseFile.primary = primary;
          readwiseFile.duplicates = duplicates;
          doc.linktext = this.app.metadataCache.fileToLinktext(readwiseFile.primary, readwiseFile.primary.path, true);
        }
      }
      // Assign frontmatter

      const hasExistingFrontmatter = readwiseFile.primary instanceof TFile;
      let frontmatter = this.frontmatterManager.getFrontmatter(readwiseFile, hasExistingFrontmatter);
      if (hasExistingFrontmatter) {
        const primaryFile: TFile = readwiseFile.primary as TFile;
        const fileMetadata: CachedMetadata = this.app.metadataCache.getFileCache(primaryFile);
        if (fileMetadata?.frontmatter) {
          const existingFrontmatter = new Frontmatter(fileMetadata.frontmatter);
          frontmatter = existingFrontmatter.merge(frontmatter);
        }
      }

      // Determine if we should atomize this file
      const shouldAtomize = this.shouldAtomize(frontmatter);
      // Render header, and highlights by rendering the core template
      this.loader.setSource('file', NUNJUCKS_CORE_TEMPLATE);
      const _contents = this.env.render('file', {
        // We pass the doc (current Readwise document) and book (Export) for access to all fields
        doc,
        book,
        highlights: this.sortHighlights(filteredHighlights).map((hl) => this.formatHighlight(hl, book)),
        headerTemplate: 'header',
        highlightTemplate: 'highlight',
      });

      _contents;

      // Assign frontmatter to readwiseFile
      readwiseFile.frontmatter = frontmatter?.toString();

      // Atomize only when enabled and when trackFiles is enabled as well
      const atomizer = new Atomizer();
      if (shouldAtomize) {
        // FIXME: Handle basename changes of the parent file: we need to update all atomized files as well, or ensure we catch a differing basename vs. primary file
        const { contents, atoms } = atomizer.atomize(_contents, { basename, doc, book });
        this.logger.debug(`Atomized ${atoms?.length} highlights for '${title}' (${source_url})`);
        readwiseFile.contents = contents;
        readwiseFile.atoms = atoms;
      } else {
        // Set atomizer to composite mode and remove frontmatter blocks
        atomizer.setCompositeEnvironment();
        const { contents } = atomizer.atomize(_contents, { basename, doc, book });
        readwiseFile.contents = contents;
      }
      readwiseFiles.push(readwiseFile);
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
      this.loader.setSource('filename', template);
      filename = this.env.render('filename', context);
    } else {
      filename = book.title;
    }

    return normalizeFilename(filename, this.settings);
  }

  private async deleteLibraryFolder() {
    const vault = this.app.vault;
    const path = `${this.settings.baseFolderName}`;

    const abstractFile = vault.getAbstractFileByPath(path);

    // Delete old instance of file
    if (abstractFile) {
      try {
        this.logger.debug('Attempting to delete entire library at:', abstractFile);
        await this.app.fileManager.trashFile(abstractFile);
        return true;
      } catch (err) {
        this.logger.error(`Attempted to delete file ${path} but no file was found`, err);
        return false;
      }
    }
  }

  async deleteLibrary() {
    this.settings.lastUpdated = null;
    await this.saveAndApplySettings();

    if (await this.deleteLibraryFolder()) {
      if (this.settings.syncNotifications) this.notify.notice('Readwise: library folder deleted');
    } else {
      if (this.settings.syncNotifications) this.notify.notice('Readwise: Error deleting library folder');
    }

    this.notify.setStatusBarText('Readwise: Click to Sync');
  }
}
