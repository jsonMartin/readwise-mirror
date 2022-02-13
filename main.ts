import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import Notify from 'notify';
import spacetime from 'spacetime';
import { Environment, Template, ConfigureOptions } from 'nunjucks';

import { ReadwiseApi, Library, Highlight, Book, Tag } from 'readwiseApi';

interface PluginSettings {
  baseFolderName: string;
  apiToken: string | null;
  lastUpdated: string | null;
  autoSync: boolean;
  highlightSortOldestToNewest: boolean;
  syncNotesOnly: boolean;
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
  syncNotesOnly: false,
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
Title: [[{{ title }}]]
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

---

# Highlights

`,
  highlightTemplate: `{{ text }}{%- if category == 'books' %} ([{{ location }}]({{ location_url }})){%- endif %}{%- if color %} %% Color: {{ color }} %%{%- endif %} ^{{id}}{%- if note %}

Note: {{ note }}
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

  private formatTags(tags: Tag[]) {
    return tags.map((tag) => `#${tag.name}`).join(', ');
  }

  private formatHighlight(highlight: Highlight, book: Book) {
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
      color: color,
      highlighted_at: highlighted_at ? this.formatDate(highlighted_at) : '',
      tags: formattedTagStr,
      // Book fields
      category: book.category,
    });
  }

  private filterHighlight(highlight: Highlight) {
    if (this.settings.syncNotesOnly && !highlight.note) return false;
    else return true;
  }

  private formatDate(dateStr: string) {
    return dateStr.split('T')[0];
  }

  async writeLogToMarkdown(library: Library) {
    const vault = this.app.vault;

    let path = `${this.settings.baseFolderName}/${this.settings.logFileName}`;
    const abstractFile = vault.getAbstractFileByPath(path);

    const now = spacetime.now();
    let logString = `# [[${now.format('iso-short')}]] *(${now.time()})*`;

    for (let bookId in library['books']) {
      const book = library['books'][bookId];

      const { title, num_highlights } = book;
      const sanitizedTitle = `${title.replace(':', '-').replace(/[<>"'\/\\|?*]+/g, '')}`;
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

    for (let bookId in library['books']) {
      const book = library['books'][bookId];

      const {
        id,
        title,
        author,
        category,
        num_highlights,
        updated,
        cover_image_url,
        highlights_url,
        highlights,
        last_highlight_at,
        source_url,
        tags,
      } = book;
      const sanitizedTitle = `${title.replace(':', '-').replace(/[<>"'\/\\|?*]+/g, '')}`;

      const filteredHighlights = highlights.filter((highlight: Highlight) => this.filterHighlight(highlight));

      if (filteredHighlights.length == 0) {
        console.log(`Readwise: No highlights found for '${sanitizedTitle}'`);
      } else {
        const formattedHighlights = (
          this.settings.highlightSortOldestToNewest ? filteredHighlights.reverse() : filteredHighlights
        )
          .map((highlight: Highlight) => this.formatHighlight(highlight, book))
          .join('\n');

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
          id: id,
          title: sanitizedTitle,
          author: author,
          authorStr: authorStr,
          category: category,
          num_highlights: num_highlights,
          updated: this.formatDate(updated),
          cover_image_url: cover_image_url.replace('SL200', 'SL500').replace('SY160', 'SY500'),
          highlights_url: highlights_url,
          highlights: highlights,
          last_highlight_at: last_highlight_at ? this.formatDate(last_highlight_at) : '',
          source_url: source_url,
          tags: this.formatTags(tags),
        };

        const frontMatterContents = this.settings.frontMatter ? this.frontMatterTemplate.render(metadata) : '';
        const headerContents = this.headerTemplate.render(metadata);
        const contents = `${frontMatterContents}${headerContents}${formattedHighlights}`;

        let path = `${this.settings.baseFolderName}/${
          category.charAt(0).toUpperCase() + category.slice(1)
        }/${sanitizedTitle}.md`;

        const abstractFile = vault.getAbstractFileByPath(path);

        // Delete old instance of file
        if (abstractFile) {
          try {
            await vault.delete(abstractFile);
          } catch (err) {
            console.error(`Readwise: Attempted to delete file ${path} but no file was found`, err);
          }
        }

        vault.create(path, contents);
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

  async onload() {
    await this.loadSettings();

    const statusBarItem = this.addStatusBarItem();

    // Setup templating
    this.env = new Environment(null, { autoescape: false } as ConfigureOptions);
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
