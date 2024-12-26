import { App, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import Notify from 'notify';
import spacetime from 'spacetime';
import { Environment, Template, ConfigureOptions, lib } from 'nunjucks';
import * as _ from 'lodash';

import { ReadwiseApi, Library, Highlight, Export, Exports, Tag } from 'readwiseApi';

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
Date: [[{{ updated }}]]
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
};

export default class ReadwiseMirror extends Plugin {
  settings: PluginSettings;
  readwiseApi: ReadwiseApi;
  notify: Notify;
  env: Environment;
  frontMatterTemplate: Template;
  headerTemplate: Template;
  highlightTemplate: Template;

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
    const { id, text, note, location, color, url, tags, highlighted_at } = highlight;

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
        console.log('Readwise: Found discarded highlight, removing', highlight);
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
      this.notify.setStatusBarText(`Readwise: Processing - ${Math.floor(bookCurrent/booksTotal *100)}% finished (${bookCurrent}/${booksTotal})`);
      bookCurrent += 1;
      const book = library['books'][bookId];

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
      const updated = highlights.map(function(highlight) { return highlight.updated_at; }).sort().reverse()[0]
      const last_highlight_at = highlights.map(function(highlight) { return highlight.highlighted_at; }).sort().reverse()[0]
      
      // Sanitize title, replace colon with substitute from settings
      const sanitizedTitle = `${title
        .replace(/:/g, this.settings.colonSubstitute ?? '-')
        .replace(/[<>"'\/\\|?*#]+/g, '')}`;

      // Filter highlights
      const filteredHighlights = this.filterHighlights(highlights);

      if (filteredHighlights.length === 0) {
        console.log(`Readwise: No highlights found for '${title}' (${highlights_url})`);
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
          title: sanitizedTitle,
          author: author,
          authorStr: authorStr,
          document_note: document_note,
          summary: summary,
          category: category,
          num_highlights: num_highlights,
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

        const frontMatterContents = this.settings.frontMatter ? this.frontMatterTemplate.render(metadata) : '';
        const headerContents = this.headerTemplate.render(metadata);
        const contents = `${frontMatterContents}${headerContents}${formattedHighlights}`;

        let path = `${this.settings.baseFolderName}/${category.charAt(0).toUpperCase() + category.slice(1)
          }/${sanitizedTitle}.md`;

        const abstractFile = vault.getAbstractFileByPath(path);

        // Overwrite existing file with remote changes, or
        // Create new file if not existing
        if (abstractFile && abstractFile instanceof TFile) {
          // File exists
          try {
            await vault.process(abstractFile, function(data) {
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
    console.info(`Reloading settings due to external change`)
    await this.loadSettings();
    if (this.settings.lastUpdated)
        this.notify.setStatusBarText(`Readwise: Updated ${this.lastUpdatedHumanReadableFormat()} elsewhere`);
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

    this.frontMatterTemplate = new Template(this.settings.frontMatterTemplate, this.env, null, true);
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

  display(): void {
    let { containerEl } = this;

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
      .setDesc('')
      .addTextArea((text) =>
        text.setValue(this.plugin.settings.headerTemplate).onChange(async (value) => {
          if (!value) {
            this.plugin.settings.headerTemplate = DEFAULT_SETTINGS.headerTemplate;
          } else {
            this.plugin.settings.headerTemplate = value;
          }
          this.plugin.headerTemplate = new Template(this.plugin.settings.headerTemplate, this.plugin.env, null, true);
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Frontmatter')
      .setDesc('Add frontmatter (defined with the following Template)')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.frontMatter).onChange(async (value) => {
          this.plugin.settings.frontMatter = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Frontmatter Template')
      .setDesc('')
      .addTextArea((text) =>
        text.setValue(this.plugin.settings.frontMatterTemplate).onChange(async (value) => {
          if (!value) {
            this.plugin.settings.frontMatterTemplate = DEFAULT_SETTINGS.frontMatterTemplate;
          } else {
            this.plugin.settings.frontMatterTemplate = value;
          }
          this.plugin.frontMatterTemplate = new Template(
            this.plugin.settings.frontMatterTemplate,
            this.plugin.env,
            null,
            true
          );
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Highlight Template')
      .setDesc('')
      .addTextArea((text) =>
        text.setValue(this.plugin.settings.highlightTemplate).onChange(async (value) => {
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
        })
      );
  }
}
