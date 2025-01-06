import Notify from 'notify';
import { ConfigureOptions, Environment, Template } from 'nunjucks';
import { App, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import spacetime from 'spacetime';
import slugify from '@sindresorhus/slugify';
import filenamify from 'filenamify';

import { DataviewApi, getAPI as getDVAPI, Literal } from 'obsidian-dataview';
import { Export, Highlight, Library, ReadwiseApi, Tag } from 'readwiseApi';
import { sampleMetadata } from 'test-data/sampleData';
import * as YAML from 'yaml';
interface PluginSettings {
  baseFolderName: string;
  apiToken: string | null;
  lastUpdated: string | null;
  autoSync: boolean;
  highlightSortOldestToNewest: boolean;
  highlightSortByLocation: boolean;
  highlightDiscard: boolean;
  syncNotesOnly: boolean;
  colonSubstitute: string;
  logFile: boolean;
  logFileName: string;
  frontMatter: boolean;
  frontMatterTemplate: string;
  headerTemplate: string;
  highlightTemplate: string;
  useSlugify: boolean;
  slugifySeparator: string;
  slugifyLowercase: boolean;
  deduplicateFiles: boolean;
  deduplicateProperty: string;
  deleteDuplicates: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
  baseFolderName: 'Readwise',
  apiToken: null,
  lastUpdated: null,
  autoSync: true,
  highlightSortOldestToNewest: true,
  highlightSortByLocation: true,
  highlightDiscard: false,
  syncNotesOnly: false,
  colonSubstitute: '-',
  logFile: true,
  logFileName: 'Sync.md',
  frontMatter: false,
  frontMatterTemplate: `---
id: {{ id }}
created: {{ created }}
updated: {{ updated }}
title: {{ title }}
author: {{ author }}
---
`,
  headerTemplate: `
%%
ID: {{ id }}
Updated: {{ updated }}
%%

![]( {{ cover_image_url }})

# About
Title: [[{{ sanitized_title }}]]
Authors: {{ authorStr }}
Category: #{{ category }}
{%- if tags %}
Tags: {{ tags }}
{%- endif %}
Number of Highlights: =={{ num_highlights }}==
Readwise URL: {{ highlights_url }}
{%- if source_url %}
Source URL: {{ source_url }}
{%- endif %}
Date: [[{{ created }}]]
Last Highlighted: *{{ last_highlight_at }}*
{%- if summary %}
Summary: {{ summary }}
{%- endif %}

---

{%- if document_note %}
# Document Note

{{ document_note }}
{%- endif %}

# Highlights

`,
  highlightTemplate: `{{ text }}{%- if category == 'books' %} ([{{ location }}]({{ location_url }})){%- endif %}{%- if color %} %% Color: {{ color }} %%{%- endif %} ^{{id}}{%- if note %}

Note: {{ note }}
{%- endif %}{%- if tags %}

Tags: {{ tags }}
{%- endif %}{%- if url %}

[View Highlight]({{ url }})
{%- endif %}

---
`,
  useSlugify: false,
  slugifySeparator: '-',
  slugifyLowercase: true,
  deduplicateFiles: false,
  deduplicateProperty: 'uri',
  deleteDuplicates: true,
};

interface YamlStringState {
  hasSingleQuotes: boolean;
  hasDoubleQuotes: boolean;
  isValueEscapedAlready: boolean;
}

const FRONTMATTER_TO_ESCAPE = ['title', 'sanitized_title', 'author', 'authorStr'];
export default class ReadwiseMirror extends Plugin {
  settings: PluginSettings;
  readwiseApi: ReadwiseApi;
  notify: Notify;
  env: Environment;
  frontMatterTemplate: Template;
  headerTemplate: Template;
  highlightTemplate: Template;

  private analyzeStringForFrontmatter(value: string): YamlStringState {
    return {
      hasSingleQuotes: value.includes("'"),
      hasDoubleQuotes: value.includes('"'),
      isValueEscapedAlready:
        value.length > 1 &&
        ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))), // Basic YAML escape validation
    };
  }

  // Before metadata is used
  public escapeFrontmatter(metadata: any, fieldsToProcess: Array<string>): any {
    // Copy the metadata object to avoid modifying the original
    const processedMetadata = { ...metadata };
    fieldsToProcess.forEach((field) => {
      if (field in processedMetadata && processedMetadata[field] && typeof processedMetadata[field] === 'string') {
        processedMetadata[field] = this.escapeYamlValue(processedMetadata[field]);
      }
    });

    return processedMetadata;
  }

  private escapeYamlValue(value: string, multiline: boolean = false ): string {
    if (!value) return '""';

    const state = this.analyzeStringForFrontmatter(value);

    // Already properly quoted and valid YAML
    if (state.isValueEscapedAlready) return value;

    // Handle multi-line strings
    if (value.includes('\n') && multiline) {
      // Use folded block style (>) for titles, preserve single line ending
      const indent = '  ';
      return `>-\n${indent}${value.replace(/\n/g, `\n${indent}`)}`;
    }

    value = value.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

    // No quotes in string - use simple double quotes to catch other special characters
    if (!state.hasSingleQuotes && !state.hasDoubleQuotes) {
      return `"${value}"`;
    }

    // Has double quotes but no single quotes - use single quotes
    if (state.hasDoubleQuotes && !state.hasSingleQuotes) {
      return `'${value}'`;
    }

    // Has single quotes but no double quotes - use double quotes
    if (state.hasSingleQuotes && !state.hasDoubleQuotes) {
      return `"${value}"`;
    }

    // Has both types of quotes - escape double quotes and use double quotes
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  private formatTags(tags: Tag[], nohash: boolean = false, q: string = '') {
    // use unique list of tags
    const uniqueTags = [...new Set(tags.map((tag) => tag.name.replace(/\s/, '-')))];

    if (nohash) {
      // don't return a hash in the tag name
      return uniqueTags.map((tag) => `${q}${tag}${q}`).join(', ');
    } else {
      return uniqueTags.map((tag) => `${q}#${tag}${q}`).join(', ');
    }
  }

  private formatHighlight(highlight: Highlight, book: Export) {
    const { id, text, note, location, color, url, tags, highlighted_at, created_at, updated_at } = highlight;

    const locationUrl = `https://readwise.io/to_kindle?action=open&asin=${book['asin']}&location=${location}`;

    const formattedTags = tags.filter((tag) => tag.name !== color);
    const formattedTagStr = this.formatTags(formattedTags);

    return this.highlightTemplate.render({
      // Highlight fields
      id: id,
      text: text,
      note: note,
      location: location,
      location_url: locationUrl,
      url, // URL is set for source of highlight (webpage, tweet, etc). null for books
      color: color,
      created_at: highlighted_at ? this.formatDate(created_at) : '',
      updated_at: highlighted_at ? this.formatDate(updated_at) : '',
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
        console.debug('Readwise: Found discarded highlight, removing', highlight);
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
        else if (highlightA.location > highlightB.location) return 1;
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

    var tags: Tag[] = [];
    this.sortHighlights(highlights).forEach((highlight: Highlight) =>
      highlight.tags ? (tags = [...tags, ...highlight.tags]) : tags
    );
    return tags;
  }

  async writeLogToMarkdown(library: Library) {
    const vault = this.app.vault;

    let path = `${this.settings.baseFolderName}/${this.settings.logFileName}`;
    const abstractFile = vault.getAbstractFileByPath(path);

    const now = spacetime.now();
    let logString = `# [[${now.format('iso-short')}]] *(${now.time()})*`;

    for (let bookId in library['books']) {
      const book = library['books'][bookId];

      const { title, highlights } = book;
      const num_highlights = highlights.length;
      console.warn(`Readwise: Replacing colon with ${this.settings.colonSubstitute}`);
      const sanitizedTitle = `${title.replace(/:/g, this.settings.colonSubstitute).replace(/[<>"'\/\\|?*]+/g, '')}`;
      const contents = `\n- [[${sanitizedTitle}]] *(${num_highlights} highlights)*`;
      logString += contents;
    }

    try {
      if (abstractFile) {
        // If log file already exists, append to the content instead of overwriting
        const logFile = vault.getFiles().filter((file) => file.name === this.settings.logFileName)[0];
        console.log('logFile:', logFile);

        const logFileContents = await vault.read(logFile);
        vault.modify(logFile, logFileContents + '\n\n' + logString);
      } else {
        vault.create(path, logString);
      }
    } catch (err) {
      console.error(`Readwise: Error writing to sync log file`, err);
    }
  }

  /**
   * Update frontmatter of a file with new values
   * @param file TFile to update
   * @param updates Record of key-value pairs to update/add in frontmatter
   * @returns Promise<void>
   *
   * Example:
   * ```typescript
   * await updateFrontmatter(file, {
   *   duplicate: true,
   *   lastUpdated: '2024-03-15'
   * });
   * ```
   *
   * - If file has no frontmatter, creates new frontmatter section
   * - If key exists, updates value
   * - If key doesn't exist, adds new key-value pair
   * - Preserves existing frontmatter formatting and other values
   * - Maintains file content after frontmatter unchanged
   */
  private async updateFrontmatter(file: TFile, updates: Record<string, any>): Promise<void> {
    const content = await this.app.vault.read(file);

    // Split content into frontmatter and body
    const frontmatterRegex = /^(---\n[\s\S]*?\n---)/;
    const match = content.match(frontmatterRegex);

    let frontmatter = '';
    let body = content;

    if (match) {
      frontmatter = match[1];
      body = content.slice(match[0].length);

      // Parse existing frontmatter
      const currentFrontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter || {};

      // Create new frontmatter
      const newFrontmatter = {
        ...currentFrontmatter,
        ...updates,
      };

      frontmatter = ['---', YAML.stringify(newFrontmatter), '---'].join('\n');
    } else {
      frontmatter = ['---', YAML.stringify(updates), '---'].join('\n');
    }

    // Combine and write back
    await this.app.vault.modify(file, `${frontmatter}\n${body}`);
  }

  private async findDuplicates(book: Export): Promise<TFile[]> {
    const dataviewApi: DataviewApi | undefined = getDVAPI(this.app);
    const canDeduplicate = this.settings.deduplicateFiles && dataviewApi;

    // TODO: If Dataview is not available, we should attempt to deduplicate with MetadataCache (which is presumably slower)
    if (canDeduplicate) {
      const existingPages = dataviewApi
        .pages('')
        .where((p: Record<string, Literal>) => p[this.settings.deduplicateProperty] === book.readwise_url);

      const duplicateFiles: TFile[] = [];
      existingPages.forEach((duplicate: { file: { path: string } }) => {
        const existingFile = this.app.vault.getAbstractFileByPath(duplicate.file.path) as TFile;
        duplicateFiles.push(existingFile);
      });
      return duplicateFiles;
    }
    return Promise.reject('Deduplication not enabled or Dataview API not available');
  }

  async writeLibraryToMarkdown(library: Library) {
    const vault = this.app.vault;

    // Create parent directories for all categories, if they do not exist
    library['categories'].forEach(async (category: string) => {
      category = category.charAt(0).toUpperCase() + category.slice(1); // Title Case the directory name

      const path = `${this.settings.baseFolderName}/${category}`;
      const abstractFolder = vault.getAbstractFileByPath(path);

      if (!abstractFolder) {
        vault.createFolder(path);
        console.info('Readwise: Successfully created folder', path);
      }
    });

    // Get total number of records
    const booksTotal = Object.keys(library.books).length;
    let bookCurrent = 1;
    for (let bookId in library['books']) {
      this.notify.setStatusBarText(
        `Readwise: Processing - ${Math.floor(
          (bookCurrent / booksTotal) * 100
        )}% finished (${bookCurrent}/${booksTotal})`
      );
      bookCurrent += 1;
      const book: Export = library['books'][bookId];

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
      const created = highlights
        .map(function (highlight) {
          return highlight.created_at;
        })
        .sort()[0]; // No reverse sort: we want the oldest entry
      const updated = highlights
        .map(function (highlight) {
          return highlight.updated_at;
        })
        .sort()
        .reverse()[0];
      const last_highlight_at = highlights
        .map(function (highlight) {
          return highlight.highlighted_at;
        })
        .sort()
        .reverse()[0];

      // Sanitize title, replace colon with substitute from settings
      const sanitizedTitle = this.settings.useSlugify
        ? slugify(title.replace(/:/g, this.settings.colonSubstitute ?? '-'), {
            separator: this.settings.slugifySeparator,
            lowercase: this.settings.slugifyLowercase,
          })
        : `${filenamify(title.replace(/:/g, this.settings.colonSubstitute ?? '-'), { replacement: ' ' })}`;

      // Filter highlights
      const filteredHighlights = this.filterHighlights(highlights);

      if (filteredHighlights.length === 0) {
        console.debug(`Readwise: No highlights found for '${title}' (${source_url})`);
      } else {
        const formattedHighlights = this.sortHighlights(filteredHighlights)
          .map((highlight: Highlight) => this.formatHighlight(highlight, book))
          .join('\n');

        // get an array with all tags from highlights
        const highlightTags = this.getTagsFromHighlights(filteredHighlights);
        const authors = author ? author.split(/and |,/) : [];

        let authorStr =
          authors[0] && authors?.length > 1
            ? authors
                .filter((authorName: string) => authorName.trim() != '')
                .map((authorName: string) => `[[${authorName.trim()}]]`)
                .join(', ')
            : author
            ? `[[${author}]]`
            : ``;

        const metadata = {
          id: user_book_id,
          title: title,
          sanitized_title: sanitizedTitle,
          author: author,
          authorStr: authorStr,
          document_note: document_note,
          summary: summary,
          category: category,
          num_highlights: num_highlights,
          created: created ? this.formatDate(created) : '',
          updated: updated ? this.formatDate(updated) : '',
          cover_image_url: cover_image_url.replace('SL200', 'SL500').replace('SY160', 'SY500'),
          highlights_url: readwise_url,
          highlights: highlights,
          last_highlight_at: last_highlight_at ? this.formatDate(last_highlight_at) : '',
          source_url: source_url,
          unique_url: unique_url,
          tags: this.formatTags(book_tags),
          highlight_tags: this.formatTags(highlightTags),
          tags_nohash: this.formatTags(book_tags, true, "'"),
          hl_tags_nohash: this.formatTags(highlightTags, true, "'"),
        };

        // Escape specific fields used in frontmatter
        // TODO: Tidy up code. It doesn't make sense to remove the frontmatter markers and then add them back
        const frontmatterYaml = YAML.parse(
          this.frontMatterTemplate
            .render(this.escapeFrontmatter(metadata, FRONTMATTER_TO_ESCAPE))
            .replace(/^---\n/, '')
            .replace(/\n---$/, '')
        );
        const frontMatterContents = this.settings.frontMatter
          ? ['---', YAML.stringify(frontmatterYaml), '---'].join('\n')
          : '';
        const headerContents = this.headerTemplate.render(metadata);
        const contents = `${frontMatterContents}${headerContents}${formattedHighlights}`;

        let path = `${this.settings.baseFolderName}/${
          category.charAt(0).toUpperCase() + category.slice(1)
        }/${sanitizedTitle}.md`;

        const duplicates = await this.findDuplicates(book);
        const abstractFile = vault.getAbstractFileByPath(path);

        // Deduplicate files
        if (duplicates.length > 0) {
          let deduplicated = false;
          let filesToDeleteOrLabel: TFile[] = [];

          // First: Check if target file is in duplicates
          const targetFileIndex = duplicates.findIndex((f) => f.path === path);
          if (targetFileIndex >= 0 && abstractFile instanceof TFile) {
            deduplicated = true;
            // Remove target file from duplicates
            duplicates.splice(targetFileIndex, 1);
            // Update target file
            try {
              await vault.process(abstractFile, () => contents);
            } catch (err) {
              console.error(`Readwise: Attempt to overwrite file ${path} failed`, err);
            }
          }

          // Second: Handle remaining duplicates (if any)
          if (duplicates.length > 0) {
            // Keep first duplicate if we haven't updated a file yet, and write it
            if (!deduplicated && duplicates[0]) {
              try {
                // Rename the duplicate first and then write the new contents
                await this.app.fileManager.renameFile(duplicates[0], path).then(() => {
                  vault
                    .process(duplicates[0], () => contents)
                    .then(() => {
                      deduplicated = true;
                    });
                });
                // Remove the file we just updated from duplicates
                duplicates.shift();
              } catch (err) {
                console.error(`Readwise: Failed to update duplicate ${duplicates[0].path}`, err);
              }
            }
            // Add remaining duplicates to deletion list
            filesToDeleteOrLabel.push(...duplicates);
          }

          // Delete extra duplicates or mark as "duplicate" in the Vault
          for (const file of filesToDeleteOrLabel) {
            try {
              if (this.settings.deleteDuplicates) {
                await vault.trash(file, true);
              } else {
                await this.updateFrontmatter(file, { duplicate: true });
              }
            } catch (err) {
              console.error(`Readwise: Failed to delete duplicate ${file.path}`, err);
            }
          }
        }
        // Overwrite existing file with remote changes, or
        // Create new file if not existing
        else if (abstractFile && abstractFile instanceof TFile) {
          // File exists
          try {
            await vault.process(abstractFile, function () {
              // Simply return new contents to overwrite file
              return contents;
            });
          } catch (err) {
            console.error(`Readwise: Attempt to overwrite file ${path} failed`, err);
          }
        } else {
          // File does not exist
          vault.create(path, contents);
        }
      }
    }
  }

  async deleteLibraryFolder() {
    const vault = this.app.vault;
    let path = `${this.settings.baseFolderName}`;

    const abstractFile = vault.getAbstractFileByPath(path);

    // Delete old instance of file
    if (abstractFile) {
      try {
        console.info('Readwise: Attempting to delete entire library at:', abstractFile);
        await vault.delete(abstractFile, true);
        return true;
      } catch (err) {
        console.error(`Readwise: Attempted to delete file ${path} but no file was found`, err);
        return false;
      }
    }
  }

  async sync() {
    if (!this.settings.apiToken) {
      this.notify.notice('Readwise: API Token Required');
      return;
    }

    let library: Library;
    const lastUpdated = this.settings.lastUpdated;

    if (!lastUpdated) {
      this.notify.notice('Readwise: Previous sync not detected...\nDownloading full Readwise library');
      library = await this.readwiseApi.downloadFullLibrary();
    } else {
      // Load Upadtes and cache
      this.notify.notice(`Readwise: Checking for new updates since ${this.lastUpdatedHumanReadableFormat()}`);
      library = await this.readwiseApi.downloadUpdates(lastUpdated);
    }

    if (Object.keys(library.books).length > 0) {
      this.writeLibraryToMarkdown(library);

      if (this.settings.logFile) this.writeLogToMarkdown(library);

      this.notify.notice(
        `Readwise: Downloaded ${library.highlightCount} Highlights from ${Object.keys(library.books).length} Sources`
      );
    } else {
      this.notify.notice(`Readwise: No new content available`);
    }

    this.settings.lastUpdated = new Date().toISOString();
    await this.saveSettings();
    this.notify.setStatusBarText(`Readwise: Synced ${this.lastUpdatedHumanReadableFormat()}`);
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
    console.info(`Reloading settings due to external change`);
    await this.loadSettings();
    if (this.settings.lastUpdated)
      this.notify.setStatusBarText(`Readwise: Updated ${this.lastUpdatedHumanReadableFormat()} elsewhere`);
  }

  public ensureDedupPropertyInTemplate(template: string): string {
    if (!this.settings.deduplicateFiles) return template;

    const propertyName = this.settings.deduplicateProperty;
    const propertyValue = `${propertyName}: {{ highlights_url }}`;

    const lines = template.split('\n');
    const frontmatterStart = lines.findIndex((line) => line.trim() === '---');
    const frontmatterEnd =
      lines.slice(frontmatterStart + 1).findIndex((line) => line.trim() === '---') + frontmatterStart + 1;

    if (frontmatterStart === -1 || frontmatterEnd <= frontmatterStart) return template;

    // Check for existing property
    const propertyIndex = lines.findIndex((line) => line.trim().startsWith(`${propertyName}:`));

    if (propertyIndex > -1 && propertyIndex < frontmatterEnd) {
      // Replace existing property
      console.warn(`Readwise: Replacing existing property '${propertyName}' in frontmatter template for deduplication`);
      lines[propertyIndex] = propertyValue;
    } else {
      // Add new property before closing ---
      lines.splice(frontmatterEnd, 0, propertyValue);
    }

    return lines.join('\n');
  }

  async onload() {
    await this.loadSettings();

    const statusBarItem = this.addStatusBarItem();

    // Setup templating
    this.env = new Environment(null, { autoescape: false } as ConfigureOptions);

    // Add a nunjucks filter to convert newlines to "newlines + >" for quotes
    this.env.addFilter('bq', function (str) {
      return str.replace(/\r|\n|\r\n/g, '\r\n> ');
    });

    // Add a nunjukcs filter to test whether we are a ".qa" note
    this.env.addFilter('is_qa', function (str) {
      return str.includes('.qa');
    });

    // Add a nunjucks filter to convert ".qa" notes to Q& A
    this.env.addFilter('qa', function (str) {
      return str.replace(/\.qa(.*)\?(.*)/g, '**Q:**$1?\r\n\r\n**A:**$2');
    });

    // Add filter to nunjucks environment
    this.env.addFilter('yaml', function (str) {
      return this.escapeForYaml(str);
    });

    this.frontMatterTemplate = new Template(
      this.ensureDedupPropertyInTemplate(this.settings.frontMatterTemplate),
      this.env,
      null,
      true
    );
    this.headerTemplate = new Template(this.settings.headerTemplate, this.env, null, true);
    this.highlightTemplate = new Template(this.settings.highlightTemplate, this.env, null, true);

    this.notify = new Notify(statusBarItem);

    if (!this.settings.apiToken) {
      this.notify.notice('Readwise: API Token not detected\nPlease enter in configuration page');
      this.notify.setStatusBarText('Readwise: API Token Required');
    } else {
      this.readwiseApi = new ReadwiseApi(this.settings.apiToken, this.notify);
      if (this.settings.lastUpdated)
        this.notify.setStatusBarText(`Readwise: Updated ${this.lastUpdatedHumanReadableFormat()}`);
      else this.notify.setStatusBarText(`Readwise: Click to Sync`);
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
        const isTokenValid = await this.readwiseApi.checkToken();
        this.notify.notice('Readwise: ' + (isTokenValid ? 'Token is valid' : 'INVALID TOKEN'));
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

    this.addSettingTab(new ReadwiseMirrorSettingTab(this.app, this, this.notify));

    if (this.settings.autoSync) this.sync();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class ReadwiseMirrorSettingTab extends PluginSettingTab {
  plugin: ReadwiseMirror;
  notify: Notify;

  constructor(app: App, plugin: ReadwiseMirror, notify: Notify) {
    super(app, plugin);
    this.plugin = plugin;
    this.notify = notify;
  }

  private validateFrontmatterTemplate(template: string): { isValid: boolean; error?: string; preview?: string } {
    const renderedTemplate = new Template(template, this.plugin.env, null, true).render(
      this.plugin.escapeFrontmatter(sampleMetadata, FRONTMATTER_TO_ESCAPE)
    );
    const yamlContent = renderedTemplate.replace(/^---\n/, '').replace(/\n---$/, '');
    try {
      YAML.parse(yamlContent);
      return { isValid: true };
    } catch (error) {
      if (error instanceof YAML.YAMLParseError) {
        return {
          isValid: false,
          error: `Invalid YAML: ${error.message}`,
          preview: yamlContent,
        };
      }
      return {
        isValid: false,
        error: `Template error: ${error.message}`,
      };
    }
  }

  private createTemplateDocumentation(title: string, variables: [string, string][]) {
    return createFragment((fragment) => {
      fragment.createEl('div', {
        text: title,
        cls: 'setting-item-description',
      });

      const container = fragment.createDiv({
        cls: 'setting-item-description',
        attr: { style: 'margin-top: 10px' },
      });

      container.createSpan({ text: 'Available variables:' });
      container.createEl('br');

      const list = container.createEl('ul', { cls: 'template-vars-list' });

      variables.forEach(([key, desc]) => {
        const item = list.createEl('li');
        item.createEl('code', { text: `{{ ${key} }}` });
        item.appendText(`: ${desc}`);
      });

      container.createDiv({
        cls: 'template-syntax-note',
        text: 'Supports Nunjucks templating syntax',
      });
    });
  }

  async display(): Promise<void> {
    let { containerEl } = this;
    const dataviewApi = getDVAPI(this.app);

    containerEl.empty();

    containerEl.createEl('h1', { text: 'Readwise Sync Configuration' });

    const apiTokenFragment = document.createDocumentFragment();
    apiTokenFragment.createEl('span', null, (spanEl) =>
      spanEl.createEl('a', null, (aEl) => (aEl.innerText = aEl.href = 'https://readwise.io/access_token'))
    );

    new Setting(containerEl)
      .setName('Enter your Readwise Access Token')
      .setDesc(apiTokenFragment)
      .addText((text) =>
        text
          .setPlaceholder('Readwise Access Token')
          .setValue(this.plugin.settings.apiToken)
          .onChange(async (value) => {
            if (!value) return;
            this.plugin.settings.apiToken = value;
            await this.plugin.saveSettings();
            this.plugin.readwiseApi = new ReadwiseApi(value, this.notify);
          })
      );

    new Setting(containerEl)
      .setName('Readwise library folder name')
      .setDesc('Default: Readwise')
      .addText((text) =>
        text
          .setPlaceholder('Readwise')
          .setValue(this.plugin.settings.baseFolderName)
          .onChange(async (value) => {
            if (!value) return;
            this.plugin.settings.baseFolderName = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Auto Sync when starting')
      .setDesc('Automatically syncs new highlights after opening Obsidian')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoSync).onChange(async (value) => {
          this.plugin.settings.autoSync = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Sort Highlights in notes from Oldest to Newest')
      .setDesc(
        'If checked, highlights will be listed from oldest to newest. Unchecked, newest highlights will appear first.'
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.highlightSortOldestToNewest).onChange(async (value) => {
          this.plugin.settings.highlightSortOldestToNewest = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Sort Highlights by Location')
      .setDesc(
        'If checked, highlights will be listed in order of Location. Combine with above Sort Highlights from Oldest to Newest option to reverse order.'
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.highlightSortByLocation).onChange(async (value) => {
          this.plugin.settings.highlightSortByLocation = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Filter Discarded Highlights')
      .setDesc('If enabled, do not display discarded highlights in the Readwise library.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.highlightDiscard).onChange(async (value) => {
          this.plugin.settings.highlightDiscard = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Only sync highlights with notes')
      .setDesc(
        'If checked, highlights will only be synced if they have a note. This makes it easier to use these notes for Zettelkasten.'
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.syncNotesOnly).onChange(async (value) => {
          this.plugin.settings.syncNotesOnly = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Replacement string for colons in filenames')
      .setDesc(
        "Set the string to be used for replacement of colon (:) in filenames derived from the title. The default value for this setting is '-'."
      )
      .addText((text) =>
        text
          .setPlaceholder('Colon replacement in title')
          .setValue(this.plugin.settings.colonSubstitute)
          .onChange(async (value) => {
            if (!value || value.match(':')) {
              console.warn(`Readwise: colon replacement: empty or invalid value: ${value}`);
              this.plugin.settings.colonSubstitute = DEFAULT_SETTINGS.colonSubstitute;
            } else {
              console.info(`Readwise: colon replacement: setting value: ${value}`);
              this.plugin.settings.colonSubstitute = value;
            }
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Sync Log')
      .setDesc('Save sync log to file in Library')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.logFile).onChange(async (value) => {
          this.plugin.settings.logFile = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Sync Log File Name')
      .setDesc('Default: Sync.md')
      .addText((text) =>
        text
          .setPlaceholder('Sync.md')
          .setValue(this.plugin.settings.logFileName)
          .onChange(async (value) => {
            if (!value) return;
            this.plugin.settings.logFileName = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Header Template')
      .setDesc(
        this.createTemplateDocumentation('Controls document metadata and structure.', [
          ['id', 'Document ID'],
          ['title', 'Document title'],
          ['sanitized_title', 'Title safe for file system'],
          ['author/authorStr', 'Author name(s), authorStr includes wiki links'],
          ['category', 'Content type (books, articles, etc)'],
          ['cover_image_url', 'Book/article cover'],
          ['summary', 'Document summary'],
          ['document_note', 'Additional notes'],
          ['num_highlights', 'Number of highlights'],
          ['highlights_url', 'Readwise URL'],
          ['source_url', 'Original content URL'],
          ['unique_url', 'Unique identifier URL'],
          ['created/updated/last_highlight_at', 'Timestamps'],
          ['tags/tags_nohash', 'Tags (with/without # prefix)'],
          ['highlight_tags/hl_tags_nohash', 'Tags from highlights (with/without # prefix)'],
        ])
      )
      .addTextArea((text) => {
        text.inputEl.addClass('settings-template-input');
        text.inputEl.rows = 15;
        text.inputEl.cols = 50;
        text.setValue(this.plugin.settings.headerTemplate).onChange(async (value) => {
          if (!value) {
            this.plugin.settings.headerTemplate = DEFAULT_SETTINGS.headerTemplate;
          } else {
            this.plugin.settings.headerTemplate = value;
          }
          this.plugin.headerTemplate = new Template(this.plugin.settings.headerTemplate, this.plugin.env, null, true);
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Frontmatter')
      .setDesc('Add frontmatter (defined with the following Template)')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.frontMatter).onChange(async (value) => {
          // Test template with sample data
          const { isValid, error } = this.validateFrontmatterTemplate(this.plugin.settings.frontMatterTemplate);
          if ((value && isValid) || !value) {
            this.plugin.settings.frontMatter = value;
            await this.plugin.saveSettings();
          } else if (value && !isValid) {
            this.plugin.notify.notice(`Invalid frontmatter template: ${error}`);
            toggle.setValue(false);
            // Trigger re-render to show/hide property selector
            this.display();
          }
        })
      );

    new Setting(containerEl)
      .setName('Frontmatter Template')
      .setDesc(
        createFragment((fragment) => {
          fragment.append(
            this.createTemplateDocumentation(
              'Controls YAML frontmatter metadata. The same variables are available as for the Header template, with specific versions optimised for YAML frontmatter (tags), and escaped values for YAML compatibility.',
              [
                ['id', 'Document ID'],
                ['created', 'Creation timestamp'],
                ['updated', 'Last update timestamp'],
                ['last_highlight_at', 'Last highlight timestamp'],
                ['title', 'Document title (escaped for YAML)'],
                ['sanitized_title', 'Title safe for file system (escaped for YAML)'],
                ['author', 'Author name(s) (escaped for YAML)'],
                ['authorStr', 'Author names with wiki links (escaped for YAML)'],
                ['category', 'Content type'],
                ['num_highlights', 'Number of highlights'],
                ['source_url', 'Original content URL'],
                ['unique_url', 'Unique identifier URL'],
                ['tags', 'Tags with # prefix'],
                ['tags_nohash', 'Tags without # prefix (compatible with frontmatter)'],
                ['highlight_tags', 'Tags from highlights with # prefix'],
                ['hl_tags_nohash', 'Tags from highlights without # prefix (compatible with frontmatter)'],
                ['highlights_url', 'Readwise URL (auto-injected if deduplication enabled)'],
                [
                  'Note:',
                  'If deduplication is enabled, the specified property will be automatically added or updated in the frontmatter template.',
                ],
              ]
            )
          );
        })
      )
      .addTextArea((text) => {
        const container = containerEl.createDiv();

        text.inputEl.addClass('settings-template-input');
        text.inputEl.rows = 12;
        text.inputEl.cols = 50;

        // Create preview elements below textarea
        const previewContainer = container.createDiv('template-preview');
        const previewTitle = previewContainer.createDiv({
          text: 'Template Preview (Error):',
          cls: 'template-preview-title',
          attr: {
            style: 'color: var(--text-error);',
          },
        });
        previewTitle.style.fontWeight = 'bold';
        previewTitle.style.marginTop = '1em';

        const errorNotice = previewContainer.createDiv({
          cls: 'validation-notice',
          attr: {
            style: 'color: var(--text-error); margin-top: 1em;',
          },
        });

        const previewContent = previewContainer.createEl('pre', {
          cls: ['template-preview-content', 'settings-template-input'],
          attr: {
            style: 'background-color: var(--background-secondary); padding: 1em; border-radius: 4px; overflow-x: auto;',
          },
        });
        
        const errorDetails = previewContainer.createEl('pre', {
          cls: ['error-details'],
          attr: {
            style:
              'color: var(--text-error); background-color: var(--background-primary-alt); padding: 0.5em; border-radius: 4px; margin-top: 0.5em; font-family: monospace; white-space: pre-wrap;',
          },
        });
        
        errorDetails.hide();

        // Update preview on template changes
        const updatePreview = (template: string) => {
          const rendered = new Template(template, this.plugin.env, null, true).render(
            this.plugin.escapeFrontmatter(sampleMetadata, FRONTMATTER_TO_ESCAPE)
          );
          const yamlContent = rendered.replace(/^---\n/, '').replace(/\n---$/, '');

          try {
            errorNotice.setText('');
            previewContainer.hide();
          } catch (error) {
            // Turn Frontmatter toggle off
            if (error instanceof YAML.YAMLParseError) {
              errorNotice.setText(`Invalid YAML:`);
              errorDetails.setText(error.message);
              errorDetails.show();
            } else {
              errorNotice.setText(`Template error: ${error.message}`);
              errorDetails.hide();
            }
            previewContent.setText(yamlContent);
            previewContainer.show();
          }
        };

        // Display rendered template on load
        updatePreview(this.plugin.settings.frontMatterTemplate);
        return text.setValue(this.plugin.settings.frontMatterTemplate).onChange(async (value) => {
          const validation = this.validateFrontmatterTemplate(value);

          // Update validation notice
          const noticeEl = containerEl.querySelector('.validation-notice');
          if (noticeEl) {
            noticeEl.setText(validation.isValid ? '' : validation.error);
          }

          if (!value) {
            this.plugin.settings.frontMatterTemplate = DEFAULT_SETTINGS.frontMatterTemplate;
          } else {
            this.plugin.settings.frontMatterTemplate = value;
          }

          updatePreview(value);

          this.plugin.frontMatterTemplate = new Template(
            this.plugin.ensureDedupPropertyInTemplate(this.plugin.settings.frontMatterTemplate),
            this.plugin.env,
            null,
            true
          );
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Highlight Template')
      .setDesc(
        this.createTemplateDocumentation('Controls individual highlight formatting.', [
          ['text', 'Highlight content (supports bq filter for blockquotes)'],
          ['note', 'Associated notes (supports qa filter for Q&A format)'],
          ['color', 'Highlight color'],
          ['location', 'Book location'],
          ['locationUrl', 'Direct link to highlight location'],
          ['url', 'Source URL'],
          ['id', 'Highlight ID'],
          ['category', 'Content type (e.g., books)'],
          ['tags', 'Tags with # prefix'],
          ['created_at', 'Creation timestamp'],
          ['updated_at', 'Last update timestamp'],
          ['highlighted_at', 'Highlight timestamp'],
        ])
      )
      .addTextArea((text) => {
        text.inputEl.addClass('settings-template-input');
        text.inputEl.rows = 12;
        text.inputEl.cols = 50;
        return text.setValue(this.plugin.settings.highlightTemplate).onChange(async (value) => {
          if (!value) {
            this.plugin.settings.highlightTemplate = DEFAULT_SETTINGS.highlightTemplate;
          } else {
            this.plugin.settings.highlightTemplate = value;
          }
          this.plugin.highlightTemplate = new Template(
            this.plugin.settings.highlightTemplate,
            this.plugin.env,
            null,
            true
          );
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Use Slugify for filenames')
      .setDesc(
        createFragment((fragment) => {
          fragment.appendText(
            'Use slugify to create clean filenames. This removes diacritics and other special characters, including emojis.'
          );
          fragment.createEl('br');
          fragment.createEl('br');
          fragment.appendText('Example filename: "Déjà Vu with a 🦄"');
          fragment.createEl('br');
          fragment.createEl('blockquote', {
            text: 'Slugify disabled: "Deja Vu with a "',
          });
          fragment.createEl('blockquote', {
            text: 'Slugify enabled (default settings): "deja-vu-with-a"',
          });
          fragment.createEl('blockquote', {
            text: 'Slugify + custom separator "_": "deja_vu_with_a"',
          });
          fragment.createEl('blockquote', {
            text: 'Slugify + lowercase disabled: "Deja-Vu-With-A"',
          });
        })
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.useSlugify).onChange(async (value) => {
          this.plugin.settings.useSlugify = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Slugify Separator')
      .setDesc('Character to use as separator in slugified filenames (default: -)')
      .addText((text) =>
        text
          .setPlaceholder('-')
          .setValue(this.plugin.settings.slugifySeparator)
          .onChange(async (value) => {
            this.plugin.settings.slugifySeparator = value || '-';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Slugify Lowercase')
      .setDesc('Convert slugified filenames to lowercase')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.slugifyLowercase).onChange(async (value) => {
          this.plugin.settings.slugifyLowercase = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Deduplicate Files')
      .setDesc(
        createFragment((fragment) => {
          fragment.appendText('Use Dataview to check for duplicate files based on Readwise URL.');
          fragment.createEl('br');
          fragment.appendText(
            'This prevents creating duplicate files when articles are updated, even if the file name separator or the title in Readwise change. The Dataview plugin must be installed and enabled.'
          );
        })
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.deduplicateFiles && dataviewApi !== undefined)
          .setDisabled(!dataviewApi)
          .onChange(async (value) => {
            this.plugin.settings.deduplicateFiles = value;
            await this.plugin.saveSettings();
            // Trigger re-render to show/hide property selector
            this.display();
          })
      );

    if (this.plugin.settings.deduplicateFiles) {
      new Setting(containerEl)
        .setName('Deduplication Property')
        .setDesc(
          'Frontmatter property to use for deduplication (default: uri). This field will be set in the frontmatter template. If it exists in your frontmatter template, its value will be updated automatically when processing highlights.'
        )
        .addText((text) =>
          text.setValue(this.plugin.settings.deduplicateProperty).onChange(async (value) => {
            this.plugin.settings.deduplicateProperty = value || 'uri';
            await this.plugin.saveSettings();
          })
        );
    }

    if (this.plugin.settings.deduplicateFiles) {
      new Setting(containerEl)
        .setName('Delete Duplicates')
        .setDesc(
          createFragment((fragment) => {
            fragment.appendText(
              'When enabled, duplicate files will be deleted. Otherwise, they will be marked with duplicate: true in frontmatter.'
            );
            fragment.createEl('br');
            fragment.createEl('blockquote', { text: 'Default: Delete duplicates' });
          })
        )
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.deleteDuplicates).onChange(async (value) => {
            this.plugin.settings.deleteDuplicates = value;
            await this.plugin.saveSettings();
          })
        );
    }
  }
}
