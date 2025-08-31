import { DEFAULT_SETTINGS } from 'constants/index';
import type ReadwiseMirror from 'main';
import {
  type App,
  type ButtonComponent,
  Modal,
  PluginSettingTab,
  type RequestUrlResponse,
  requestUrl,
  Setting,
  type TextComponent,
} from 'obsidian';
import ReadwiseApi, { TokenValidationError } from 'services/readwise-api';
import type { TemplateValidationResult } from 'types';
import { WarningDialog } from 'ui/dialog';
import type Notify from 'ui/notify';
import { validateFrontmatterTemplate } from 'utils/frontmatter-utils';

interface SettingsTab {
  id: string;
  name: string;
  icon?: string; // Optional icon for visual distinction
  render: (containerEl: HTMLElement) => void;
}

class TabView {
  private static lastActiveTab: string;
  private activeTab: string;
  private tabs: SettingsTab[];
  private containerEl: HTMLElement;
  private tabContent: HTMLElement;

  constructor(containerEl: HTMLElement, tabs: SettingsTab[]) {
    this.containerEl = containerEl;
    this.tabs = tabs;
    // Use the last active tab if it exists and is valid, otherwise use first tab
    this.activeTab =
      TabView.lastActiveTab && tabs.some((t) => t.id === TabView.lastActiveTab) ? TabView.lastActiveTab : tabs[0].id;
  }

  render() {
    // Create tab container
    const tabContainer = this.containerEl.createDiv({
      cls: 'settings-tab-container',
    });

    // Create tab buttons
    const tabButtons = tabContainer.createDiv({
      cls: 'settings-tab-buttons',
    });

    for (const tab of this.tabs) {
      const btn = tabButtons.createEl('button', {
        cls: ['settings-tab-button', this.activeTab === tab.id ? 'active' : ''],
        text: tab.name,
      });
      btn.addEventListener('click', () => this.switchTab(tab.id));
    }

    // Create tab content area
    this.tabContent = tabContainer.createDiv({
      cls: 'settings-tab-content',
    });

    this.renderActiveTab();
  }

  private renderActiveTab() {
    // Clear existing content
    this.tabContent.empty();

    // Render active tab
    const activeTab = this.tabs.find((t) => t.id === this.activeTab);
    if (activeTab) {
      activeTab.render(this.tabContent);
    }
  }

  private switchTab(tabId: string) {
    this.activeTab = tabId;
    TabView.lastActiveTab = tabId; // Store the last active tab

    // Update button states
    const buttons = this.containerEl.querySelectorAll('.settings-tab-button');
    for (const btn of Array.from(buttons)) {
      btn.classList.toggle('active', btn.textContent === this.tabs.find((t) => t.id === tabId)?.name);
    }

    this.renderActiveTab();
  }
}

export default class ReadwiseMirrorSettingTab extends PluginSettingTab {
  private plugin: ReadwiseMirror;
  private notify: Notify;

  private tokenValidationMessage: HTMLElement;
  private retrievalButton: ButtonComponent;
  private tokenValue: TextComponent;
  private validationButton: ButtonComponent;

  // Add logger reference
  private get logger() {
    return this.plugin.logger;
  }

  constructor(app: App, plugin: ReadwiseMirror, notify: Notify) {
    super(app, plugin);
    this.plugin = plugin;
    this.notify = notify;
  }

  /**
   * Adjusts the number of rows in a textarea based on content and wrapping
   *
   * @param textEl - The textarea element to adjust
   * @param minRows - Minimum number of rows to show (default: 3)
   *
   * Behavior:
   * - Calculates total lines needed based on content
   * - Accounts for line wrapping based on textarea width
   * - Maintains minimum row count
   * - Adds one extra row for editing
   *
   * Example:
   * For a textarea with cols=50:
   * - "Short line" -> 1 line
   * - "Very long line..." (>50 chars) -> 2 lines
   * - "Line 1\nLine 2" -> 2 lines
   * - "" (empty) -> minRows
   */
  private adjustTextareaRows = (textEl: HTMLTextAreaElement, minRows = 3) => {
    const content = textEl.value;
    const width = textEl.cols;

    // Calculate wrapped lines
    let totalLines = 0;
    for (const line of content.split('\n')) {
      // Calculate how many times the line wraps
      const wrappedLines = Math.ceil(line.length / width);
      totalLines += Math.max(1, wrappedLines);
    }

    // Add 1 to account for the last line and set minimum
    textEl.rows = Math.max(minRows, totalLines + 1);
  };

  // Button-based authentication inspired by the official Readwise plugin
  private async getUserAuthToken(attempt = 0): Promise<boolean> {
    const MAX_ATTEMPTS = 20;
    const BASE_TIMEOUT = 1000;
    const MAX_TIMEOUT = 10000;

    const baseURL = 'https://readwise.io';
    const uuid = this.getReadwiseMirrorClientId();

    if (attempt === 0) {
      window.open(`${baseURL}/api_auth?token=${uuid}&service=readwise-mirror`);
    }

    let response: RequestUrlResponse;
    let data: Record<string, unknown>;
    try {
      response = await requestUrl({ url: `${baseURL}/api/auth?token=${uuid}` });
      if (response.status === 200) {
        data = await response.json;
        if (data.userAccessToken) {
          this.logger.info('Token successfully retrieved');
          this.plugin.settings.apiToken = data.userAccessToken as string;
          if (this.plugin.readwiseApi) this.plugin.readwiseApi.setToken(data?.userAccessToken as string);
          else this.plugin.readwiseApi = new ReadwiseApi(data?.userAccessToken as string, this.notify, this.logger);
          await this.plugin.saveSettings();
          this.display(); // Refresh the settings page
          return true;
        }
      }
    } catch (e) {
      this.logger.error('Failed to authenticate with Readwise:', e);
    }

    if (attempt >= MAX_ATTEMPTS) {
      this.notify.notice('Authentication timeout. Please try again.');
      return false;
    }

    const timeout = Math.min(BASE_TIMEOUT * 2 ** attempt, MAX_TIMEOUT);
    await new Promise((resolve) => setTimeout(resolve, timeout));
    return this.getUserAuthToken(attempt + 1);
  }

  // Button-based authentication inspired by the official Readwise plugin
  private getReadwiseMirrorClientId() {
    let readwiseMirrorClientId = window.localStorage.getItem('readwise-mirror-obsidian-client-id');
    if (readwiseMirrorClientId) {
      return readwiseMirrorClientId;
    }

    readwiseMirrorClientId = Math.random().toString(36).substring(2, 15);
    window.localStorage.setItem('readwise-mirror-obsidian-client-id', readwiseMirrorClientId);
    return readwiseMirrorClientId;
  }

  private createTemplateDocumentation(variables: [string, string][], title?: string) {
    return createFragment((fragment) => {
      const documentationContainer = fragment.createDiv({
        cls: 'setting-documentation-container',
      });

      if (title) {
        documentationContainer.createDiv({
          text: title,
          cls: 'setting-item-description',
        });
      }

      const container = documentationContainer.createDiv({
        cls: 'setting-item-description',
        attr: { style: 'margin-top: 10px' },
      });

      container.createSpan({ text: 'Available variables:' });
      container.createEl('br');

      const list = container.createEl('ul', { cls: 'template-vars-list' });

      for (const [key, desc] of variables) {
        const item = list.createEl('li');
        item.createEl('code', { text: `{{ ${key} }}` });
        item.appendText(`: ${desc}`);
      }

      const syntaxNote = container.createDiv({ cls: 'template-syntax-note' });
      syntaxNote.appendText('Supports Nunjucks templating syntax. See ');
      const link = syntaxNote.createEl('a', {
        text: 'built-in filters documentation',
        href: 'https://mozilla.github.io/nunjucks/templating.html#builtin-filters',
      });
      link.setAttr('target', '_blank');
      syntaxNote.appendText('.');
    });
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();

    const tabs: SettingsTab[] = [
      {
        id: 'general',
        name: 'General',
        render: (container) => {
          this.renderDebugMode(container);
          this.renderAuthentication(container);
          this.renderLibrarySettings(container);
          this.renderSyncSettings(container);
          this.renderSyncLogging(container);
        },
      },
      {
        id: 'files',
        name: 'File tracking and naming',
        render: (container) => {
          this.renderFileTracking(container);
          this.renderFilenameSettings(container);
        },
      },
      {
        id: 'frontmatter-template',
        name: 'Frontmatter',
        render: (container) => {
          this.renderFrontmatterTemplateSettings(container);
        },
      },
      {
        id: 'header-template',
        name: 'Header',
        render: (container) => {
          this.renderHeaderTemplateSettings(container);
        },
      },
      {
        id: 'highlight-template',
        name: 'Highlights',
        render: (container) => {
          this.renderHighlightSettings(container);
          this.renderHighlightTemplateSettings(container);
        },
      },
    ];

    new TabView(containerEl, tabs).render();
  }

  /**
   * Updates the authentication buttons based on the current state.
   * @param state The current authentication state
   */
  private updateAuthButtons(state: 'empty' | 'valid' | 'invalid' | 'verifying'): void {
    switch (state) {
      case 'valid':
        this.validationButton?.setDisabled(true).removeCta().setButtonText('Verified');
        this.retrievalButton?.setDisabled(true).setButtonText('Re-authenticate with Readwise');
        if (this.tokenValue) {
          this.tokenValue.inputEl.type = 'password';
        }
        break;
      case 'invalid':
        this.validationButton?.setDisabled(false).setCta().setButtonText('Apply');
        this.retrievalButton?.setDisabled(false).setButtonText('Authenticate with Readwise');
        if (this.tokenValue) this.tokenValue.inputEl.type = 'text';
        break;
      case 'verifying':
        this.validationButton?.setDisabled(true).setCta();
        this.retrievalButton?.setDisabled(true);
        break;
      default:
        this.validationButton?.setDisabled(false).setCta().setButtonText('Apply');
        this.retrievalButton?.setDisabled(false).setButtonText('Authenticate with Readwise');
        break;
    }
  }

  /**
   * Updates the validation message div based on status.
   * @param status 'invalid' | 'success' | 'running' | 'error'
   * @param errorMsg Optional error message for 'error' status
   */
  private setTokenValidationStatus(status: 'invalid' | 'success' | 'running' | 'error' | 'empty', errorMsg?: string) {
    const el = this.tokenValidationMessage;
    el.show();
    switch (status) {
      case 'invalid':
        el.setText('Invalid token');
        el.setAttr('style', 'color: var(--text-error); margin-top: 0.5em;');
        break;
      case 'success':
        el.setText('Token validated successfully');
        el.setAttr('style', 'color: var(--text-success); margin-top: 0.5em;');
        break;
      case 'running':
        el.setText('Validating token...');
        el.setAttr('style', 'color: var(--text-accent); margin-top: 0.5em;');
        break;
      case 'error':
        el.setText(errorMsg || 'Token validation error');
        el.setAttr('style', 'color: var(--text-error); margin-top: 0.5em;');
        break;
      default:
        el.setText('');
        el.hide();
    }
  }

  private renderDebugMode(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Debug mode')
      .setDesc('Enable debug logging')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.debugMode).onChange(async (value) => {
          this.plugin.settings.debugMode = value;
          this.plugin.logger.setDebugMode(value);
          this.plugin.logger.warn('Debug mode:', value ? 'enabled' : 'disabled');
          await this.plugin.saveSettings();
        })
      );
  }

  private renderAuthentication(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Authentication').setHeading();

    let hasValidToken: boolean | null = null;

    // Create a single validation message div and a function to update its status
    this.tokenValidationMessage = containerEl.createDiv({
      cls: 'setting-item-description validation-message',
      attr: {
        style: 'margin-top: 0.5em; display: none;',
      },
    });

    new Setting(containerEl)
      .setName('Readwise authentication')
      .setDesc(
        createFragment(async (fragment) => {
          fragment.createEl('strong', { text: 'How to authenticate: ' });
          fragment.appendText('Paste your API key from ');
          fragment.createEl('a', { text: 'readwise.io/access_token', href: 'readwise.io/access_token' });
          fragment.appendText(', or use the "Authenticate with Readwise" button for automatic retrieval of the token.');
          fragment.createEl('br');
          fragment.append(this.tokenValidationMessage);
          // Show success or error message based on token validity
          if (this.plugin.readwiseApi) {
            this.setTokenValidationStatus('running');
          } else {
            this.setTokenValidationStatus('error');
          }
          this.updateAuthButtons('verifying');

          // Validate the token on load
          if (this.plugin.readwiseApi) {
            try {
              hasValidToken =
                this.plugin.readwiseApi.hasValidToken() || (await this.plugin.readwiseApi.validateToken());

              if (hasValidToken) this.notify.setStatusBarText('Readwise: Click to Sync');
              this.updateAuthButtons(hasValidToken ? 'valid' : 'invalid');
              this.setTokenValidationStatus(hasValidToken ? 'success' : 'invalid');
            } catch (error) {
              this.updateAuthButtons('invalid');
              if (error instanceof TokenValidationError) {
                this.setTokenValidationStatus('error', error.message);
              } else {
                this.setTokenValidationStatus('error', 'Token validation error');
              }
            } finally {
              this.setTokenValidationStatus('empty');
            }
          }
        })
      )
      .addButton((button) => {
        this.retrievalButton = button;
        this.retrievalButton
          .setButtonText(!hasValidToken === false ? 'Re-authenticate with Readwise' : 'Authenticate with Readwise')
          .onClick(async () => {
            const authModal = new Modal(this.app);
            authModal.titleEl.setText('Authenticate with Readwise');
            authModal.contentEl.createEl('p', {
              text: 'A new window will open for Readwise authentication. After logging in, an error page may appear—this is normal and can be closed.',
            });
            authModal.contentEl.createEl('p', {
              text: 'Check your authentication status here in Obsidian settings after completing the process.',
            });
            authModal.contentEl.createEl('br');
            const buttonContainer = authModal.contentEl.createDiv();
            buttonContainer.style.display = 'flex';
            buttonContainer.style.justifyContent = 'flex-end';
            buttonContainer.style.gap = '10px';

            const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
            const continueButton = buttonContainer.createEl('button', { text: 'Understood' });
            continueButton.addClass('mod-cta');

            cancelButton.onclick = () => authModal.close();
            continueButton.onclick = async () => {
              authModal.close();
              this.getUserAuthToken().then((isAuthenticated) => {
                this.updateAuthButtons(isAuthenticated ? 'valid' : 'invalid');
                this.setTokenValidationStatus(isAuthenticated ? 'success' : 'invalid');
              });
            };
            authModal.open();
          })
          .setDisabled(hasValidToken);
        return this.retrievalButton;
      })
      .addText((text) => {
        this.tokenValue = text;
        const token = this.plugin.settings.apiToken;

        this.tokenValue.inputEl.type = 'password';

        this.tokenValue.setPlaceholder('API Token').setValue(token);
        this.tokenValue.onChange(() => {
          const value = this.tokenValue.inputEl.value;
          if (value !== this.plugin.settings.apiToken) {
            this.setTokenValidationStatus('empty');
            this.updateAuthButtons('invalid');
          }
        });
      })
      .addButton((button) => {
        this.validationButton = button;
        this.validationButton
          .setDisabled(hasValidToken)
          .setCta()
          .setIcon('check')
          .setButtonText(hasValidToken ? 'Verified' : 'Apply')
          .onClick(async () => {
            const value = this.tokenValue.inputEl.value;
            if (value === '') {
              // Invalidate API and cached auth state when token is cleared
              this.plugin.readwiseApi = null;
              this.plugin.settings.apiToken = value;
              // If you have a cached "hasValidToken" flag, set it to false here
              this.updateAuthButtons('empty');
              this.setTokenValidationStatus('empty');
              await this.plugin.saveSettings();
              this.notify.notice('Cleared token. Add or retrieve token to sync.');
            } else if (value !== this.plugin.settings.apiToken) {
              this.updateAuthButtons('verifying');
              this.plugin.settings.apiToken = value;
              await this.plugin.saveSettings();
              this.notify.notice('New token set.');

              if (this.plugin.readwiseApi) {
                this.plugin.readwiseApi.setToken(value);
              } else {
                this.plugin.readwiseApi = new ReadwiseApi(value, this.notify, this.logger);
              }
              await this.plugin.readwiseApi
                .validateToken()
                .then((isValid) => {
                  this.updateAuthButtons(isValid ? 'valid' : 'invalid');
                })
                .catch(() => {
                  this.notify.notice('Failed to verify token.');
                  this.setTokenValidationStatus('invalid');
                  this.updateAuthButtons('invalid');
                });
            }
          });
        // Add fixed width class
        this.validationButton.buttonEl.addClass('readwise-auth-validate-btn');
        return this.validationButton;
      });
  }

  private renderLibrarySettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Library').setHeading();

    new Setting(containerEl)
      .setName('Library folder name')
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

    // Add new Filter by tag setting
    new Setting(containerEl)
      .setName('Filter by tag')
      .setDesc('Only sync readwise items with specific document tags')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.filterNotesByTag).onChange(async (value) => {
          this.plugin.settings.filterNotesByTag = value;
          // Trigger a refresh of the settings display to show/hide the tags input
          await this.plugin.saveSettings();
          this.display();
        })
      );

    // Add tags input field (only visible when filterByTag is enabled)
    if (this.plugin.settings.filterNotesByTag) {
      new Setting(containerEl)
        .setName('Tags to include')
        .setDesc(
          'Enter tags separated by commas (e.g., important, todo, review). Only readwise items matching ANY of these tags (document level) will be synced.'
        )
        .addTextArea((text) => {
          text
            .setPlaceholder('tag1, tag2, tag3')
            .setValue(this.plugin.settings.filteredTags.join(', '))
            .onChange(async (value) => {
              this.plugin.settings.filteredTags = value
                .split(/[,;\n]/) // We are bit more generous with separation characters
                .map((tag) => tag.trim())
                .filter((tag) => tag !== '');
              await this.plugin.saveSettings();
            });

          // Adjust the height of the text area
          text.inputEl.rows = 2;

          return text;
        });
    }
  }

  private renderSyncSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Sync').setHeading();

    new Setting(containerEl)
      .setName('Auto sync when starting')
      .setDesc('Automatically syncs new highlights after opening Obsidian')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoSync).onChange(async (value) => {
          this.plugin.settings.autoSync = value;
          await this.plugin.saveSettings();
        })
      );
  }

  private renderHighlightSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Highlight organization').setHeading();

    new Setting(containerEl)
      .setName('Sort highlights from oldest to newest')
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
      .setName('Sort highlights by location')
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
      .setName('Filter discarded highlights')
      .setDesc(
        'If enabled, do not display discarded highlights in the Readwise library. (Deleted highlights will still be removed on sync)'
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.highlightDiscard).onChange(async (value) => {
          this.plugin.settings.highlightDiscard = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Sync highlights with notes only')
      .setDesc(
        'If checked, highlights will only be synced if they have a note. This makes it easier to use these notes for Zettelkasten.'
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.syncNotesOnly).onChange(async (value) => {
          this.plugin.settings.syncNotesOnly = value;
          await this.plugin.saveSettings();
        })
      );
  }

  private renderFileTracking(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('File tracking').setHeading();

    new Setting(containerEl)
      .setName('Enable file tracking')
      .setDesc(
        createFragment((fragment) => {
          fragment.appendText(
            'Track your Readwise notes using their unique Readwise URL to enable reliable updates and deduplication. See the Wiki: '
          );
          fragment
            .createEl('a', {
              text: 'File tracking and naming',
              href: 'https://github.com/jsonMartin/readwise-mirror/wiki/Guide:-File-tracking-and-naming',
            })
            .setAttr('target', '_blank');
        })
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.trackFiles).onChange(async (value) => {
          if (!value) {
            new WarningDialog(
              this.app,
              'Risk of inconsistency',
              createFragment((fragment) => {
                fragment.createDiv({
                  text: 'Disabling file tracking may lead to loss of consistency in your Obsidian vault if you sync Readwise notes without tracking properties and then re-enable file tracking again.',
                });
                fragment.createEl('br');
                fragment.createDiv({ text: 'Are you sure you want to continue?' });
              }),

              async (confirmed: boolean) => {
                if (confirmed) {
                  this.plugin.settings.trackFiles = false;
                  await this.plugin.saveSettings();
                  this.display();
                } else {
                  toggle.setValue(true);
                }
              }
            ).open();
          } else {
            this.plugin.settings.trackFiles = value;
            await this.plugin.saveSettings();
            this.display();
          }
        })
      );

    if (this.plugin.settings.trackFiles) {
      new Setting(containerEl)
        .setClass('indent')
        .setName('Tracking property')
        .setDesc('Protected frontmatter property used to track the unique Readwise URL across syncs (default: uri).')
        .addText((text) =>
          text.setValue(this.plugin.settings.trackingProperty).onChange(async (value) => {
            this.plugin.settings.trackingProperty = value || 'uri';
            await this.plugin.saveSettings();
          })
        );

      new Setting(containerEl)
        .setClass('indent')
        .setName('Track across vault')
        .setDesc('Track, and update files across your entire vault, and not just inside the Readwise library folder.')
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.trackAcrossVault).onChange(async (value) => {
            if (!value) {
              new WarningDialog(
                this.app,
                'Risk of inconsistency',
                createFragment((fragment) => {
                  fragment.createDiv({
                    text: 'Once enabled, disabling file tracking across the vault may lead to loss of consistency in your Obsidian vault and duplicate notes. Tracked Readwise notes that you previously moved outside the Readwise library folder might be re-created inside the Readwise library. ',
                  });
                  fragment.createEl('br');
                  fragment.createDiv({ text: 'Are you sure you want to continue?' });
                }),
                async (confirmed: boolean) => {
                  if (confirmed) {
                    this.plugin.settings.trackAcrossVault = false;
                    await this.plugin.saveSettings();
                    this.display();
                  } else {
                    toggle.setValue(true);
                  }
                }
              ).open();
            } else {
              this.plugin.settings.trackAcrossVault = value;
              await this.plugin.saveSettings();
              this.display();
            }
          })
        );

      new Setting(containerEl)
        .setClass('indent')
        .setName('Remove duplicate files')
        .setDesc(
          createFragment((fragment) => {
            fragment.appendText(
              'Duplicate notes with the same Readwise URL will be removed when enabled. Otherwise, they will be marked with duplicate: true in frontmatter.'
            );
          })
        )
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.deleteDuplicates).onChange(async (value) => {
            if (value) {
              const modal = new Modal(this.app);
              modal.titleEl.setText('Warning');
              modal.contentEl.createEl('p', {
                text: 'This will permanently delete duplicate files instead of marking them. If enabled, files in your Vault will be deleted when duplicates are found. Are you sure you want to continue?',
              });

              const buttonContainer = modal.contentEl.createDiv();
              buttonContainer.style.display = 'flex';
              buttonContainer.style.justifyContent = 'flex-end';
              buttonContainer.style.gap = '10px';
              buttonContainer.style.marginTop = '20px';

              const cancelButton = buttonContainer.createEl('button', {
                text: 'Cancel',
              });
              const confirmButton = buttonContainer.createEl('button', {
                text: 'Confirm',
              });
              confirmButton.style.backgroundColor = 'var(--background-modifier-error)';

              cancelButton.onclick = () => {
                toggle.setValue(false);
                modal.close();
              };

              confirmButton.onclick = async () => {
                this.plugin.settings.deleteDuplicates = true;
                await this.plugin.saveSettings();
                modal.close();
              };

              modal.open();
            } else {
              this.plugin.settings.deleteDuplicates = false;
              await this.plugin.saveSettings();
            }
          })
        );
    }
  }

  private renderFilenameSettings(containerEl: HTMLElement): void {
    if (this.plugin.settings.trackFiles) {
      new Setting(containerEl).setName('Filename updates and filename templates').setHeading();

      new Setting(containerEl)
        .setName('File name updates')
        .setDesc(
          createFragment((fragment) => {
            fragment.appendText('Enable file name updates on sync and customize how filenames are generated.');
            fragment.createEl('br');
            fragment.appendText('See the ');
            fragment
              .createEl('a', {
                text: 'File tracking and naming',
                href: 'https://github.com/jsonMartin/readwise-mirror/wiki/Guide:-File-tracking-and-naming',
              })
              .setAttr('target', '_blank');
            fragment.appendText(' wiki for details.');
          })
        )
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.enableFileNameUpdates).onChange(async (value) => {
            this.plugin.settings.enableFileNameUpdates = value;
            await this.plugin.saveSettings();
            this.display();
          })
        );
    }

    if (this.plugin.settings.trackFiles && this.plugin.settings.enableFileNameUpdates) {
      new Setting(containerEl)
        .setName('Use custom filename template')
        .setDesc('Enable custom filename templates using Nunjucks variables.')
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.useCustomFilename).onChange(async (value) => {
            this.plugin.settings.useCustomFilename = value;
            await this.plugin.saveSettings();
            this.display();
          })
        );

      if (this.plugin.settings.useCustomFilename) {
        new Setting(containerEl)
          .setClass('indent')
          .setName('Filename template')
          .setDesc('Nunjucks template used to generate filenames.')
          .addText((text) =>
            text
              .setPlaceholder('{{title}}')
              .setValue(this.plugin.settings.filenameTemplate)
              .onChange(async (value) => {
                this.plugin.settings.filenameTemplate = value || '{{title}}';
                await this.plugin.saveSettings();
              })
          );
      }

      new Setting(containerEl)
        .setName('Colon replacement in filenames')
        .setDesc('String used to replace colons (:) in filenames.')
        .addText((text) =>
          text
            .setPlaceholder('Colon replacement in title')
            .setValue(this.plugin.settings.colonSubstitute)
            .onChange(async (value) => {
              if (!value || /[:<>"/\\|?*]/.test(value)) {
                this.logger.warn(`Colon replacement: empty or invalid value: ${value}`);
                this.plugin.settings.colonSubstitute = DEFAULT_SETTINGS.colonSubstitute;
              } else {
                this.logger.info(`Colon replacement: setting value: ${value}`);
                this.plugin.settings.colonSubstitute = value;
              }
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName('Use slugify for filenames')
        .setDesc('Enable slugification to create clean filenames.')
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.useSlugify).onChange(async (value) => {
            this.plugin.settings.useSlugify = value;
            await this.plugin.saveSettings();
            // Trigger re-render to show/hide property selector
            this.display();
          })
        );

      if (this.plugin.settings.useSlugify) {
        new Setting(containerEl)
          .setClass('indent')
          .setName('Slugify separator')
          .setDesc('Character used as separator in slugified filenames.')
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
          .setClass('indent')
          .setName('Slugify lowercase')
          .setDesc('Convert slugified filenames to lowercase.')
          .addToggle((toggle) =>
            toggle.setValue(this.plugin.settings.slugifyLowercase).onChange(async (value) => {
              this.plugin.settings.slugifyLowercase = value;
              await this.plugin.saveSettings();
            })
          );
      }
    }
  }

  private renderSyncLogging(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Sync logging').setHeading();

    new Setting(containerEl)
      .setName('Sync log')
      .setDesc('Save sync log to file in Library')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.logFile).onChange(async (value) => {
          this.plugin.settings.logFile = value;
          await this.plugin.saveSettings();
          // Trigger re-render to show/hide log filename setting
          this.display();
        })
      );

    if (this.plugin.settings.logFile) {
      new Setting(containerEl)
        .setClass('indent')
        .setName('Log filename')
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
    }
  }

  private renderFrontmatterTemplateSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Templates')
      .setHeading()
      .setDesc(
        createFragment((fragment) => {
          fragment.createEl('p', {
            text: 'The plugin uses three templates to control how your Readwise content is formatted:',
          });

          fragment.createEl('p', {
            text: '1. Frontmatter Template: Controls the YAML metadata at the top of each note',
          });
          fragment.createEl('p', {
            text: '2. Header Template: Controls the main document structure and metadata below the frontmatter',
          });
          fragment.createEl('p', {
            text: '3. Highlight Template: Controls how individual highlights are formatted within the note',
          });

          fragment.createEl('p', {
            text: 'Each template supports Nunjucks templating syntax and provides access to specific variables relevant to that section.',
          });
        })
      );

    // Documentation block for templates

    new Setting(containerEl)
      .setName('Frontmatter settings')
      .setDesc(
        createFragment((fragment) => {
          fragment.appendText('Controls the YAML metadata at the top of each note');
        })
      )
      .setHeading();

    new Setting(containerEl)
      .setName('Add frontmatter')
      .setDesc('Add frontmatter (defined with the Frontmatter Template below)')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.frontMatter).onChange(async (value) => {
          // Test template with sample data
          try {
            const { isValidYaml, error } = validateFrontmatterTemplate(this.plugin.settings.frontMatterTemplate);
            if ((value && isValidYaml) || !value) {
              // Save settings and update the template
              this.plugin.settings.frontMatter = value;
              await this.plugin.saveSettings();
              // Trigger re-render to show/hide frontmatter settings
              this.display();
            } else if (value && !isValidYaml) {
              this.notify.notice(`Invalid frontmatter template: ${error}`);
              toggle.setValue(false);
              // Trigger re-render to show/hide property selector
              this.display();
            }
          } catch (error) {
            this.logger.error('Error validating frontmatter template:', error);
            return;
          }
        })
      );

    if (this.plugin.settings.frontMatter) {
      new Setting(containerEl)
        .setClass('indent')
        .setName('Update frontmatter')
        .setDesc(
          createFragment((fragment) => {
            fragment.appendText('Update frontmatter when syncing existing files');
            fragment.createEl('br');
            fragment.createEl('br');
            fragment.appendText(
              'When enabled, frontmatter of existing files will be updated, keeping additional fields that are not present in the template. Works best with file tracking enabled.'
            );
          })
        )
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.updateFrontmatter).onChange(async (value) => {
            this.plugin.settings.updateFrontmatter = value;
            await this.plugin.saveSettings();
            // Trigger re-render to show/hide protection settings
            this.display();
          })
        );

      if (this.plugin.settings.updateFrontmatter) {
        new Setting(containerEl)
          .setClass('indent')
          .setName('Protect frontmatter fields')
          .setDesc(
            createFragment((fragment) => {
              fragment.appendText('Prevent existing frontmatter fields from being overwritten during sync');
              fragment.createEl('br');
              fragment.createEl('br');
              fragment.appendText(
                'Note: Only fields that already exist in the file will be protected. A field marked for protection which is not present yet in the original field will be written normally at the first write/update, and will be protected henceforth.'
              );
              fragment.createEl('br');
              if (this.plugin.settings.trackFiles) {
                fragment.appendText('The tracking field ');
                fragment.createEl('strong', {
                  text: this.plugin.settings.trackingProperty,
                });
                fragment.appendText(' cannot be protected.');
              }
            })
          )
          .addToggle((toggle) =>
            toggle.setValue(this.plugin.settings.protectFrontmatter).onChange(async (value) => {
              this.plugin.settings.protectFrontmatter = value;
              await this.plugin.saveSettings();
              this.display();
            })
          );

        if (this.plugin.settings.protectFrontmatter) {
          const validateProtectedFields = (value: string): { isValid: boolean; error?: string } => {
            const fields = value
              .split('\n')
              .map((f) => f.trim())
              .filter((f) => f.length > 0);
            const dedupField = this.plugin.settings.trackingProperty;

            if (this.plugin.settings.trackFiles && fields.includes(dedupField)) {
              return {
                isValid: false,
                error: `Cannot protect tracking field '${dedupField}'`,
              };
            }
            return { isValid: true };
          };

          const container = containerEl.createDiv();
          new Setting(container)
            .setClass('indent')
            .setName('Protected fields')
            .setDesc('Enter one field name per line')
            .addTextArea((text) => {
              const errorDiv = container.createDiv({
                cls: 'validation-error',
                attr: { style: 'color: var(--text-error); margin-top: 0.5em;' },
              });

              const initialRows = 3;
              text.inputEl.addClass('settings-template-input');
              text.inputEl.rows = initialRows;
              text.inputEl.cols = 25;

              text
                .setValue(this.plugin.settings.protectedFields)
                .setPlaceholder('status\ntags')
                .onChange(async (value) => {
                  const validation = validateProtectedFields(value);
                  errorDiv.setText(validation.error || '');

                  if (validation.isValid) {
                    this.plugin.settings.protectedFields = value;
                    await this.plugin.saveSettings();
                  }
                });

              const validation = validateProtectedFields(this.plugin.settings.protectedFields);
              errorDiv.setText(validation.error || '');

              // Initial row adjustment
              this.adjustTextareaRows(text.inputEl, initialRows);

              // Adjust on content change
              text.inputEl.addEventListener('input', () => {
                this.adjustTextareaRows(text.inputEl, initialRows);
              });

              return text;
            });
        }
      }
    }

    new Setting(containerEl)
      .setName('Frontmatter template')
      .setDesc(
        createFragment((fragment) => {
          fragment.appendText(
            'Controls YAML frontmatter metadata. The same variables are available as for the Header template, with specific versions optimised for YAML (tags), and escaped values for YAML compatibility.'
          );
        })
      )
      .setHeading();

    new Setting(containerEl)
      .setDesc(
        createFragment((fragment) => {
          fragment.append(
            this.createTemplateDocumentation([
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
              ['highlights_url', 'Readwise URL (auto-injected if file tracking enabled)'],
              [
                'Note:',
                'If file tracking is enabled, the specified tracking property will be automatically added or updated in the frontmatter template, independent of the frontmatter settings.',
              ],
            ])
          );
        })
      )
      .addTextArea((text) => {
        const initialRows = 12;
        text.inputEl.addClass('settings-template-input');
        text.inputEl.id = 'frontmatter-template';
        text.inputEl.rows = initialRows;
        text.inputEl.cols = 50;

        const container = containerEl.createDiv();

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
        errorNotice.id = 'validation-notice';

        const previewContent = previewContainer.createEl('pre', {
          cls: ['template-preview-content', 'settings-template-input'],
          attr: {
            style: 'background-color: var(--background-secondary); padding: 1em; border-radius: 4px; overflow-x: auto;',
          },
        });
        previewContent.id = 'template-preview-content';

        const errorDetails = previewContainer.createEl('pre', {
          cls: ['error-details'],
          attr: {
            style:
              'color: var(--text-error); background-color: var(--background-primary-alt); padding: 0.5em; border-radius: 4px; margin-top: 0.5em; font-family: monospace; white-space: pre-wrap;',
          },
        });
        errorDetails.id = 'error-details';

        errorDetails.hide();

        // Update preview on template changes
        const updatePreview = (result: TemplateValidationResult) => {
          const isInvalidTemplate = result.isValidtemplate === false;
          const isInvalidYaml = result.isValidYaml === false;
          const hasError = isInvalidTemplate || isInvalidYaml;

          if (isInvalidTemplate) {
            errorNotice.setText('Your Frontmatter template contains invalid Nunjucks syntax.');
            errorDetails.setText(result.error);
          } else if (isInvalidYaml) {
            errorNotice.setText('Your Frontmatter template creates invalid YAML.');
            errorDetails.setText(result.error);
          } else {
            errorNotice.setText('');
            errorDetails.setText('');
          }

          if (result.preview) {
            previewContent.setText(result.preview);
          }

          text.inputEl.toggleClass('invalid-template', hasError);
          errorDetails.toggle(hasError);
          previewContainer.toggle(hasError && result.preview !== '');
        };

        // Display rendered template on load
        try {
          const validationResult: TemplateValidationResult = validateFrontmatterTemplate(
            this.plugin.settings.frontMatterTemplate
          );
          updatePreview(validationResult);
        } catch (error) {
          // Catch Nunjucks template errors
          this.logger.error('Error validating frontmatter template:', error);
          updatePreview({
            isValidYaml: true,
            isValidtemplate: false,
            error: error.message,
            preview: this.plugin.settings.frontMatterTemplate,
          });
        }
        text.setValue(this.plugin.settings.frontMatterTemplate).onChange(async (value) => {
          const noticeEl = containerEl.querySelector('#validation-notice');
          try {
            const validationResult: TemplateValidationResult = validateFrontmatterTemplate(value);

            // Update validation notice
            if (noticeEl) {
              noticeEl.setText(validationResult.isValidYaml ? '' : validationResult.error);
            }

            // Set the frontmatter in settings
            if (!value) {
              this.plugin.settings.frontMatterTemplate = DEFAULT_SETTINGS.frontMatterTemplate;
            } else {
              this.plugin.settings.frontMatterTemplate = value.replace(/\n*$/, '\n');
            }

            updatePreview(validationResult);
            await this.plugin.saveSettings();
          } catch (error) {
            // Catch Nunjucks template errors
            this.logger.error('Error validating frontmatter template:', error);

            if (noticeEl) {
              noticeEl.setText(`Error validating frontmatter template: ${error.message}`);
              updatePreview({
                isValidYaml: true,
                isValidtemplate: false,
                error: error.message,
                preview: value,
              });
            }
          }
        });

        // Initial row adjustment
        this.adjustTextareaRows(text.inputEl, initialRows);

        // Adjust on content change
        text.inputEl.addEventListener('input', () => {
          this.adjustTextareaRows(text.inputEl, initialRows);
        });

        return text;
      });
  }

  private renderHeaderTemplateSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Header template')
      .setDesc(
        createFragment((fragment) => {
          fragment.appendText('Controls document metadata and structure.');
        })
      )
      .setHeading();

    new Setting(containerEl)
      .setDesc(
        this.createTemplateDocumentation([
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
        // TODO: Add header template validation resp. preview
        const initialRows = 15;
        text.inputEl.addClass('settings-template-input');
        text.inputEl.rows = initialRows;
        text.inputEl.cols = 50;
        text.setValue(this.plugin.settings.headerTemplate).onChange(async (value) => {
          if (!value) {
            this.plugin.settings.headerTemplate = DEFAULT_SETTINGS.headerTemplate;
          } else {
            this.plugin.settings.headerTemplate = value;
          }
          this.plugin.headerTemplate = this.plugin.settings.headerTemplate;
          await this.plugin.saveSettings();
        });

        // Initial row adjustment
        this.adjustTextareaRows(text.inputEl, initialRows);

        // Adjust on content change
        text.inputEl.addEventListener('input', () => {
          this.adjustTextareaRows(text.inputEl, initialRows);
        });

        return text;
      });
  }

  private renderHighlightTemplateSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Highlight template')
      .setDesc(
        createFragment((fragment) => {
          fragment.appendText('Controls individual highlight formatting.');
        })
      )
      .setHeading();

    new Setting(containerEl)
      .setDesc(
        this.createTemplateDocumentation([
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
        // TODO: Add settings template validation resp. preview
        const initialRows = 12;
        text.inputEl.addClass('settings-template-input');
        text.inputEl.rows = initialRows;
        text.inputEl.cols = 50;
        text.setValue(this.plugin.settings.highlightTemplate).onChange(async (value) => {
          if (!value) {
            this.plugin.settings.highlightTemplate = DEFAULT_SETTINGS.highlightTemplate;
          } else {
            this.plugin.settings.highlightTemplate = value;
          }

          this.plugin.highlightTemplate = this.plugin.settings.highlightTemplate;
          await this.plugin.saveSettings();
        });

        // Initial row adjustment
        this.adjustTextareaRows(text.inputEl, initialRows);

        // Adjust on content change
        text.inputEl.addEventListener('input', () => {
          this.adjustTextareaRows(text.inputEl, initialRows);
        });

        return text;
      });
  }
}
