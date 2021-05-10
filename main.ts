import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import spacetime from 'spacetime';

import { ReadwiseApi, Library, Highlight, Book } from 'readwiseApi';

interface PluginSettings {
  baseFolderName: string;
  apiToken: string | null;
  lastUpdated: string | null;
  autoSync: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
  baseFolderName: 'Readwise',
  apiToken: null,
  lastUpdated: null,
  autoSync: true,
};

export default class ReadwiseSync extends Plugin {
  settings: PluginSettings;
  readwiseApi: ReadwiseApi;
  statusBarItem: HTMLElement;

  private formatHighlight(highlight: Highlight, book: Book) {
    const { id, text, note, location, color } = highlight;
    const locationUrl = `https://readwise.io/to_kindle?action=open&asin=${book['asin']}&location=${location}`;

    return `
${text} ${book.category === 'books' ? `([${location}](${locationUrl}))` : ''}${color ? ` %% Color: ${color} %%` : ''} ^${id}${
      note ? `\n\n**Note: ${note}**` : ``
    }

---
`;
  }

  private formatDate(dateStr: string) {
    return dateStr.split('T')[0];
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

      const { id, title, author, category, num_highlights, updated, cover_image_url, highlights_url, highlights, last_highlight_at, source_url } = book;
      const fileName = `${title.replace(/[<>:"\/\\|?*]+/g, '')}.md`;

      const formattedHighlights = highlights.map((highlight: Highlight) => this.formatHighlight(highlight, book)).join('');

      const authors = author.split(/and |,/);

      let authorStr =
        authors.length > 1
          ? authors
              .filter((authorName: string) => authorName.trim() != '')
              .map((authorName: string) => `[[${authorName.trim()}]]`)
              .join(', ')
          : `[[${author}]]`;

      const contents = `%%
ID: ${id}
Updated: ${this.formatDate(updated)}
%%
![](${cover_image_url.replace('SL200', 'SL500').replace('SY160', 'SY500')})

# About
Title: [[${title}]]
${authors.length > 1 ? 'Authors' : 'Author'}: ${authorStr}
Category: #${category}
Number of Highlights: ==${num_highlights}==
Last Highlighted: *${last_highlight_at ? this.formatDate(last_highlight_at) : 'Never'}*
Readwise URL: ${highlights_url}${category === 'articles' ? `\nSource URL: ${source_url}\n` : ''}

# Highlights ${formattedHighlights.replace(/---\n$/g, '')}`;
      let path = `${this.settings.baseFolderName}/${category.charAt(0).toUpperCase() + category.slice(1)}/${fileName}`;

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
      new Notice('Readwise: API Token Required', 5000);
      return;
    }

    let library: Library;
    const lastUpdated = this.settings.lastUpdated;

    if (!lastUpdated) {
      new Notice('Readwise: Previous sync not detected...\nDownloading full Readwise library', 5000);
      library = await this.readwiseApi.downloadFullLibrary();
    } else {
      new Notice(`Readwise: Checking for new updates since ${this.lastUpdatedHumanReadableFormat()}`, 5000);
      library = await this.readwiseApi.downloadUpdates(lastUpdated);
    }

    if (Object.keys(library.books).length > 0) {
      this.writeLibraryToMarkdown(library);
      new Notice(`Readwise: Downloaded ${library.highlightCount} Highlights from ${Object.keys(library.books).length} Sources`, 5000);
    } else {
      new Notice(`Readwise: No new content available`, 5000);
    }

    this.settings.lastUpdated = new Date().toISOString();
    await this.saveSettings();
    this.statusBarItem.setText(`Readwise: Synced ${this.lastUpdatedHumanReadableFormat()}`);
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
      new Notice('Readwise: library folder deleted', 5000);
    } else {
      new Notice('Readwise: Error deleting library folder', 5000);
    }

    this.statusBarItem.setText('Readwise: Click to Sync');
  }

  lastUpdatedHumanReadableFormat() {
    return spacetime.now().since(spacetime(this.settings.lastUpdated)).rounded;
  }

  async onload() {
    await this.loadSettings();

    this.statusBarItem = this.addStatusBarItem();

    if (!this.settings.apiToken) {
      new Notice('Readwise: API Token not detected\nPlease enter in configuration page');
      this.statusBarItem.setText('Readwise: API Token Required');
    } else {
      this.readwiseApi = new ReadwiseApi(this.settings.apiToken, this.statusBarItem);
      if (this.settings.lastUpdated) this.statusBarItem.setText(`Readwise: Updated ${this.lastUpdatedHumanReadableFormat()}`);
      else this.statusBarItem.setText(`Readwise: Click to Sync`);
    }

    this.registerDomEvent(this.statusBarItem, 'click', this.sync.bind(this));

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
        new Notice('Readwise: ' + (isTokenValid ? 'Token is valid' : 'INVALID TOKEN'), 5000);
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
        if (/Synced/.test(this.statusBarItem.textContent)) {
          this.statusBarItem.setText(`Readwise: Synced ${this.lastUpdatedHumanReadableFormat()}`);
        }
      }, 1000)
    );

    this.addSettingTab(new ReadwiseSyncSettingTab(this.app, this, this.statusBarItem));

    if (this.settings.autoSync) this.sync();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class ReadwiseSyncSettingTab extends PluginSettingTab {
  plugin: ReadwiseSync;
  statusBarItem: HTMLElement;

  constructor(app: App, plugin: ReadwiseSync, statusBarItem: HTMLElement) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h1', { text: 'Readwise Sync Configuration' });

    const apiTokenFragment = document.createDocumentFragment();
    apiTokenFragment.createEl('span', null, (spanEl) => spanEl.createEl('a', null, (aEl) => (aEl.innerText = aEl.href = 'https://readwise.io/access_token')));

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
            this.plugin.readwiseApi = new ReadwiseApi(value, this.statusBarItem);
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
  }
}
