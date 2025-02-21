import slugify from '@sindresorhus/slugify';
import filenamify from 'filenamify';
import { type ConfigureOptions, Environment, Template } from 'nunjucks';
import { type CachedMetadata, Plugin, type TFile } from 'obsidian';
import { AuthorParser } from 'services/author-parser';
import { DeduplicatingVaultWriter } from 'services/deduplicating-vault-writer';
import { FrontmatterManager } from 'services/frontmatter-manager';
import spacetime from 'spacetime';

// Plugin classes
import ReadwiseApi from 'services/readwise-api';
import ReadwiseMirrorSettingTab from 'ui/settings-tab';
import Notify from 'ui/notify';
import Logger from 'services/logger';

// Types
import type { Export, Highlight, Library, PluginSettings, ReadwiseDocument, Tag } from 'types';

// Constants
import { DEFAULT_SETTINGS } from 'constants/index';

export default class ReadwiseMirror extends Plugin {
  private _settings: PluginSettings;
  private _readwiseApi: ReadwiseApi;
  private _headerTemplate: Template;
  private _highlightTemplate: Template;
  private notify: Notify;
  private env: Environment;
  private isSyncing = false;
  private frontmatterManager: FrontmatterManager;
  private deduplicatingVault: DeduplicatingVaultWriter;
  private _logger: Logger;

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

  set headerTemplate(template: string) {
    this._headerTemplate = new Template(template, this.env, null, true);
  }

  set highlightTemplate(template: string) {
    this._highlightTemplate = new Template(template, this.env, null, true);
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

  private highlightIsDiscarded = (highlight: Highlight) => {
    // is_discard is not a field in the API response for (https://readwise.io/api/v2/highlights/), so we need to check if the highlight has the discard tag
    // is_discard field only showing under the /export API endpoint in the API docs: https://readwise.io/api_deets

    return highlight.tags.some((tag) => tag.name === 'discard');
  };

  private filterHighlights(highlights: Highlight[]) {
    return highlights.filter((highlight: Highlight) => {
      if (this.settings.syncNotesOnly && !highlight.note) return false;

      // Check if is discarded
      if (this.settings.highlightDiscard && this.highlightIsDiscarded(highlight)) {
        this.logger.debug('Found discarded highlight, removing', highlight);
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

      const { title, highlights } = book;
      const num_highlights = highlights.length;
      this.logger.warn(`Replacing colon with ${this.settings.colonSubstitute}`);
      const sanitizedTitle = this.filenameFromTitle(book.title);
      const contents = `\n- [[${sanitizedTitle}]] *(${num_highlights} highlights)*`;
      logString += contents;
    }

    try {
      if (abstractFile) {
        // If log file already exists, append to the content instead of overwriting
        const logFile = vault.getFiles().filter((file) => file.name === this.settings.logFileName)[0];
        this.logger.info('logFile:', logFile);

        const logFileContents = await vault.read(logFile);
        await vault.process(logFile, (content) => `${content}\n\n${logString}`);
      } else {
        vault.create(path, logString);
      }
    } catch (err) {
      this.logger.error('Error writing to sync log file', err);
    }
  }

  async writeLibraryToMarkdown(library: Library) {
    const vault = this.app.vault;

    // Create parent directories for all categories synchronously
    try {
      for (const category of library.categories) {
        const titleCaseCategory = category.charAt(0).toUpperCase() + category.slice(1); // Title Case the directory name
        const path = `${this.settings.baseFolderName}/${titleCaseCategory}`;
        const abstractFolder = vault.getAbstractFileByPath(path);

        if (!abstractFolder) {
          await vault.createFolder(path);
          this.logger.info('Successfully created folder', path);
        }
      }
    } catch (err) {
      this.logger.error('Failed to create category folders', err);
      this.notify.notice('Readwise: Failed to create category folders. Sync aborted.');
      return;
    }

    // Get total number of records
    const booksTotal = Object.keys(library.books).length;
    let bookCurrent = 1;
    for (const bookId in library.books) {
      this.notify.setStatusBarText(
        `Readwise: Processing - ${Math.floor(
          (bookCurrent / booksTotal) * 100
        )}% finished (${bookCurrent}/${booksTotal})`
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

      // Get highlight count
      const num_highlights = highlights.length;
      const created = highlights.map((highlight) => highlight.created_at).sort()[0]; // No reverse sort: we want the oldest entry
      const updated = highlights
        .map((highlight) => highlight.updated_at)
        .sort()
        .reverse()[0];

      const last_highlight_at = highlights
        .map((highlight) => highlight.highlighted_at)
        .sort()
        .reverse()[0];

      // Sanitize title, replace colon with substitute from settings
      const filename = this.filenameFromTitle(title);

      // Filter highlights
      const filteredHighlights = this.filterHighlights(highlights);

      if (filteredHighlights.length === 0) {
        this.logger.debug(`No highlights found for '${title}' (${source_url})`);
      } else {
        // get an array with all tags from highlights
        const highlightTags = this.getTagsFromHighlights(filteredHighlights);

        // Parse Authors, normalize their names and remove titles (configurable in settings)
        const authorParser = new AuthorParser({
          normalizeCase: this.settings.normalizeAuthorNames,
          removeTitles: this.settings.stripTitlesFromAuthors,
        });
        const authors = authorParser.parse(author);

        const authorStr =
          authors[0] && authors?.length > 1
            ? authors.map((authorName: string) => `[[${authorName.trim()}]]`).join(', ')
            : author
              ? `[[${author}]]`
              : '';

        const metadata: ReadwiseDocument = {
          id: user_book_id,
          title,
          sanitized_title: filename,
          author: authors,
          authorStr,
          document_note,
          summary,
          category,
          num_highlights,
          created: created ? this.formatDate(created) : '',
          updated: updated ? this.formatDate(updated) : '',
          cover_image_url: cover_image_url.replace('SL200', 'SL500').replace('SY160', 'SY500'),
          highlights_url: readwise_url,
          highlights,
          last_highlight_at: last_highlight_at ? this.formatDate(last_highlight_at) : '',
          source_url,
          unique_url,
          tags: this.formatTags(book_tags),
          highlight_tags: this.formatTags(highlightTags),
          tags_nohash: this.formatTags(book_tags, true, "'"),
          hl_tags_nohash: this.formatTags(highlightTags, true, "'"),
        };

        // Render header, and highlights
        const headerContents = this._headerTemplate.render(metadata);
        const formattedHighlights = this.sortHighlights(filteredHighlights)
          .map((highlight: Highlight) => this.formatHighlight(highlight, book))
          .join('\n');

        const contents = `${headerContents}${formattedHighlights}`;

        // Try to find duplicates: local duplicates (e.g. copies of files), and remote duplicates
        try {
          this.deduplicatingVault.create(filename, contents, metadata);
        } catch (err) {
          this.logger.error(`Writing file ${book.title} (${metadata.highlights_url}) failed`, err);
          this.notify.notice(`Readwise: Writing '${book.title}' failed. ${err}`);
        }
      }
    }
  }

  // Sanitize title for use as filename
  private filenameFromTitle(title: string) {
    return this.settings.useSlugify
      ? slugify(title.replace(/:/g, this.settings.colonSubstitute ?? '-'), {
          separator: this.settings.slugifySeparator,
          lowercase: this.settings.slugifyLowercase,
        })
      : // ... else filenamify the title and limit to 255 characters
        filenamify(title.replace(/:/g, this.settings.colonSubstitute ?? '-'), {
          replacement: ' ',
          maxLength: 255,
        })
          // Ensure we remove additional critical characters, replace multiple spaces with one, and trim
          // Replace # as this inrerferes with WikiLinks (other characters are taken care of in "filenamify")
          .replace(/[#]+/g, ' ')
          .replace(/ +/g, ' ')
          .trim();
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

  async sync(full = false) {
    if (this.isSyncing) {
      this.notify.notice('Sync already in progress');
      return;
    }

    this.isSyncing = true;
    try {
      if (!this._readwiseApi.hasValidToken()) {
        this.notify.notice('Readwise: Valid API Token Required');

        return;
      }

      let library: Library;
      const lastUpdated = this.settings.lastUpdated;

      if (!lastUpdated) {
        this.notify.notice('Readwise: Previous sync not detected...\nDownloading full Readwise library');
        library = await this._readwiseApi.downloadFullLibrary();
      } else {
        // Load Upadtes and cache
        this.notify.notice(`Readwise: Checking for new updates since ${this.lastUpdatedHumanReadableFormat()}`);
        library = await this._readwiseApi.downloadUpdates(lastUpdated);
      }

      if (Object.keys(library.books).length > 0) {
        this.writeLibraryToMarkdown(library);

        if (this.settings.logFile) this.writeLogToMarkdown(library);

        this.notify.notice(
          `Readwise: Downloaded ${library.highlightCount} Highlights from ${Object.keys(library.books).length} Sources`
        );
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

  // Reload settings after external change (e.g. after sync)
  async onExternalSettingsChange() {
    this.logger.info('Reloading settings due to external change');
    await this.loadSettings();
    if (this.settings.lastUpdated)
      this.notify.setStatusBarText(`Readwise: Updated ${this.lastUpdatedHumanReadableFormat()} elsewhere`);
  }

  // Dedicated function to handle metadata change events
  private onMetadataChange(file: TFile) {
    const metadata: CachedMetadata = this.app.metadataCache.getFileCache(file);
    if (metadata && !this.isSyncing) {
      this.logger.info(`Updated metadata cache for file: ${file.path}: ${JSON.stringify(metadata?.frontmatter)}`);
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

    // Setup templating
    this.env = new Environment(null, { autoescape: false } as ConfigureOptions);

    // Add a nunjucks filter to convert newlines to "newlines + >" for quotes
    this.env.addFilter('bq', (str) => str.replace(/\r|\n|\r\n/g, '\r\n> '));

    // Add a nunjukcs filter to test whether we are a ".qa" note
    this.env.addFilter('is_qa', (str) => str.includes('.qa'));

    // Add a nunjucks filter to convert ".qa" notes to Q& A
    this.env.addFilter('qa', (str) => str.replace(/\.qa(.*)\?(.*)/g, '**Q:**$1?\r\n\r\n**A:**$2'));

    this.frontmatterManager = new FrontmatterManager(this.app, this.settings, this.env);
    this.frontmatterManager.updateFrontmatteTemplate(this.settings.frontMatterTemplate);

    this.headerTemplate = this.settings.headerTemplate;
    this.highlightTemplate = this.settings.highlightTemplate;

    if (!this.settings.apiToken) {
      this.notify.notice('Readwise: API Token not detected\nPlease enter in configuration page');
      this.notify.setStatusBarText('Readwise: API Token Required');
    } else {
      this._readwiseApi = new ReadwiseApi(this.settings.apiToken, this.notify, this._logger);

      if (this.settings.lastUpdated)
        this.notify.setStatusBarText(`Readwise: Updated ${this.lastUpdatedHumanReadableFormat()}`);
      else this.notify.setStatusBarText('Readwise: Click to Sync');
    }

    this.deduplicatingVault = new DeduplicatingVaultWriter(
      this.app,
      this.settings,
      this.frontmatterManager,
      this._logger
    );
    
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
        const isTokenValid = await this._readwiseApi.hasValidToken();
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

    this.registerInterval(
      window.setInterval(() => {
        if (/Synced/.test(this.notify.getStatusBarText())) {
          this.notify.setStatusBarText(`Readwise: Synced ${this.lastUpdatedHumanReadableFormat()}`);
        }
      }, 1000)
    );

    this.addSettingTab(new ReadwiseMirrorSettingTab(this.app, this, this.notify, this.frontmatterManager));

    if (this.settings.autoSync) this.sync();
  }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
