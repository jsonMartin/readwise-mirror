import { DEFAULT_SETTINGS } from 'constants/index';
import {
  type App,
  type ButtonComponent,
  Modal,
  PluginSettingTab,
  requestUrl,
  type RequestUrlResponse,
  Setting,
} from 'obsidian';
import type ReadwiseMirror from 'main';
import type { FrontmatterManager } from 'services/frontmatter-manager';
import type { TemplateValidationResult } from 'types';
import type Notify from 'ui/notify';
import ReadwiseApi, { TokenValidationError } from 'services/readwise-api';

export default class ReadwiseMirrorSettingTab extends PluginSettingTab {
  private plugin: ReadwiseMirror;
  private notify: Notify;
  private frontmatterManager: FrontmatterManager;

  // Add logger reference
  private get logger() {
    return this.plugin.logger;
  }

  constructor(app: App, plugin: ReadwiseMirror, notify: Notify, manager: FrontmatterManager) {
    super(app, plugin);
    this.plugin = plugin;
    this.notify = notify;
    this.frontmatterManager = manager;
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
  private async getUserAuthToken(button: HTMLElement, attempt = 0): Promise<boolean> {
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
    return this.getUserAuthToken(button, attempt + 1);
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

      container.createDiv({
        cls: 'template-syntax-note',
        text: 'Supports Nunjucks templating syntax',
      });
    });
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();

    this.renderDebugMode(containerEl);
    this.renderAuthentication(containerEl);
    this.renderLibrarySettings(containerEl);
    this.renderSyncSettings(containerEl);
    this.renderAuthorSettings(containerEl);
    this.renderHighlightSettings(containerEl);
    this.renderFilenameSettings(containerEl);
    this.renderSyncLogging(containerEl);
    this.renderTemplates(containerEl);
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
    let validationButton: ButtonComponent;

    const tokenValidationInvalid = containerEl.createDiv({
      cls: 'setting-item-description validation-error',
      text: 'Invalid token',
      attr: {
        style: 'color: var(--text-error); margin-top: 0.5em; display: none;',
      },
    });
    const tokenValidationSuccess = containerEl.createDiv({
      cls: 'setting-item-description validation-success',
      text: 'Token validated successfully',
      attr: {
        style: 'color: var(--text-success); margin-top: 0.5em; display: none;',
      },
    });
    const tokenValidationRunning = containerEl.createDiv({
      cls: 'setting-item-description validation-running',
      text: 'Validating token...',
      attr: {
        style: 'color: var(--text-accent); margin-top: 0.5em; display: none;',
      },
    });
    const tokenValidationError = containerEl.createDiv({
      cls: 'setting-item-description validation-error',
      text: 'Token validation error',
      attr: {
        style: 'color: var(--text-error); margin-top: 0.5em; display: none;',
      },
    });

    new Setting(containerEl)
      .setName('Readwise authentication')
      .setDesc(
        createFragment(async (fragment) => {
          fragment.createEl('br');
          fragment.createEl('br');
          fragment.createEl('strong', { text: 'Important: ' });
          fragment.appendText('After successful authentication, a window with an error message will appear.');
          fragment.createEl('br');
          fragment.appendText('This is expected and can be safely closed.');
          fragment.createEl('br');
          fragment.createEl('br');
          fragment.append(tokenValidationRunning);
          fragment.append(tokenValidationInvalid);
          fragment.append(tokenValidationSuccess);
          fragment.append(tokenValidationError);

          // Show success or error message based on token validity
          if (this.plugin.readwiseApi) {
            tokenValidationRunning.show();
          } else {
            tokenValidationError.show();
          }
          validationButton?.setDisabled(true);

          // Validate the token on load
          if (this.plugin.readwiseApi) {
            try {
              const isValid = await this.plugin.readwiseApi.validateToken();
              hasValidToken = isValid;
              
              if (isValid) this.notify.setStatusBarText('Readwise: Click to Sync');
              validationButton?.setDisabled(isValid);
              validationButton?.setButtonText(isValid ? 'Re-authenticate with Readwise' : 'Authenticate with Readwise');
              tokenValidationSuccess.toggle(isValid);
              tokenValidationInvalid.toggle(!isValid);
            } catch (error) {
              validationButton?.setDisabled(true);
              if (error instanceof TokenValidationError) {
                tokenValidationError.setText(error.message);
              } else {
                tokenValidationError.setText('Token validation error');
              }
              tokenValidationError.show();
            } finally {
              tokenValidationRunning.hide();
            }
          }
        })
      )
      .addButton((button) => {
        validationButton = button;
        validationButton
          .setButtonText(!hasValidToken === false ? 'Re-authenticate with Readwise' : 'Authenticate with Readwise')
          .setCta()
          .onClick(async (evt) => {
            const buttonEl = evt.target as HTMLElement;

            // Reset validation messages
            tokenValidationSuccess.hide();
            tokenValidationInvalid.hide();
            tokenValidationError.hide();

            this.getUserAuthToken(buttonEl)
              .then((isValid) => {
                validationButton?.setDisabled(isValid);
                validationButton?.setButtonText(
                  isValid ? 'Re-authenticate with Readwise' : 'Authenticate with Readwise'
                );
                tokenValidationSuccess.toggle(isValid);
                tokenValidationInvalid.toggle(!isValid);
                tokenValidationRunning.hide();
              })
              .catch(() => {
                tokenValidationRunning.hide();
                tokenValidationInvalid.hide();
                tokenValidationSuccess.hide();
                tokenValidationError.show();
              });
          })
          .setDisabled(hasValidToken);
        return validationButton;
      })
      .addText((text) => {
        const token = this.plugin.settings.apiToken;
        const maskedToken = token ? token.slice(0, 6) + '*'.repeat(token.length - 6) : '';

        text
          .setPlaceholder('Token will be filled automatically after authentication')
          .setValue(maskedToken)
          .setDisabled(true);
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

  private renderAuthorSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Author names')
      .setHeading()
      .setDesc(
        createFragment((fragment) => {
          fragment.appendText(
            'These settings control how author names are processed. If enabled, titles (Dr., Prof., Mr., Mrs., Ms., Miss, Sir, Lady) will be stripped from author names.'
          );
          fragment.createEl('br');
          fragment.createEl('br');
          fragment.appendText('Example author string: "Dr. John Doe, and JANE SMITH, Prof. Bob Johnson"');
          fragment.createEl('br');
          fragment.createEl('blockquote', {
            text: 'Default: "Dr. John Doe, JANE SMITH, Prof. Bob Johnson"',
          });
          fragment.createEl('blockquote', {
            text: 'Normalize case: "Dr. John Doe, Jane Smith, Prof. Bob Johnson"',
          });
          fragment.createEl('blockquote', {
            text: 'Strip titles: "John Doe, JANE SMITH, Bob Johnson"',
          });
          fragment.createEl('blockquote', {
            text: 'Both enabled: "John Doe, Jane Smith, Bob Johnson"',
          });
        })
      );

    new Setting(containerEl)
      .setName('Normalize author names')
      .setClass('indent')
      .setDesc('If enabled, author names will be normalized to a consistent case.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.normalizeAuthorNames).onChange(async (value) => {
          this.plugin.settings.normalizeAuthorNames = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Strip titles from author names')
      .setClass('indent')
      .setDesc('If enabled, titles (e.g., Dr., Mr., Prof., etc.) will be stripped from author names.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.stripTitlesFromAuthors).onChange(async (value) => {
          this.plugin.settings.stripTitlesFromAuthors = value;
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
      .setDesc('If enabled, do not display discarded highlights in the Readwise library.')
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

  private renderFilenameSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Filenames').setHeading();

    new Setting(containerEl)
      .setName('Use custom filename template')
      .setDesc(
        createFragment((fragment) => {
          fragment.appendText(
            'Use a custom template to generate filenames. Slugify and colon replacement will be applied after the filename has been generated.'
          );
          fragment.createEl('br');
          fragment.createEl('br');
          fragment.appendText('Available variables:');
          fragment.createEl('ul', undefined, (ul) => {
            ul.createEl('li', { text: '{{title}} - Document title' });
            ul.createEl('li', { text: '{{author}} - Author name(s)' });
            ul.createEl('li', {
              text: '{{category}} - Content type (books, articles, etc)',
            });
            ul.createEl('li', { text: '{{source}} - Original content URL' });
            ul.createEl('li', { text: '{{book_id}} - Unique document ID' });
          });
          fragment.createEl('br');
          fragment.appendText('Example: {{title}} - {{author|trim}}');
          fragment.createEl('br');
          fragment.createEl('br');
          fragment.appendText('Built-in filters:');
          fragment.createEl('br');
          fragment.appendText('You can use Nunjucks built-in filters like ');
          fragment.createEl('code', { text: 'trim' });
          fragment.appendText(', ');
          fragment.createEl('code', { text: 'upper' });
          fragment.appendText(', ');
          fragment.createEl('code', { text: 'lower' });
          fragment.appendText(', etc. See the ');
          const link = fragment.createEl('a', {
            text: 'Nunjucks documentation',
            href: 'https://mozilla.github.io/nunjucks/templating.html#builtin-filters',
          });
          link.setAttr('target', '_blank');
          fragment.appendText(' for all available filters.');
        })
      )
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
        .setDesc('Template used to generate filenames. All special characters will be sanitized.')
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
      .setDesc(
        "Set the string to be used for replacement of colon (:) in filenames derived from the title. The default value for this setting is '-'."
      )
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
          // Trigger re-render to show/hide property selector
          this.display();
        })
      );

    if (this.plugin.settings.useSlugify) {
      new Setting(containerEl)
        .setClass('indent')
        .setName('Slugify separator')
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
        .setClass('indent')
        .setName('Slugify lowercase')
        .setDesc('Convert slugified filenames to lowercase')
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.slugifyLowercase).onChange(async (value) => {
            this.plugin.settings.slugifyLowercase = value;
            await this.plugin.saveSettings();
          })
        );
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

  private renderTemplates(containerEl: HTMLElement): void {
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
          fragment.appendText('Controls the YAML metadata at the top of each note.');
        })
      )
      .setHeading();

    new Setting(containerEl)
      .setName('Add frontmatter')
      .setDesc('Add frontmatter (defined with the Frontmatter Template below)')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.frontMatter).onChange(async (value) => {
          // Test template with sample data
          const { isValid, error } = this.frontmatterManager.validateFrontmatterTemplate(
            this.plugin.settings.frontMatterTemplate
          );
          if ((value && isValid) || !value) {
            this.plugin.settings.frontMatter = value;
            await this.plugin.saveSettings();
            // Trigger re-render to show/hide frontmatter settings
            this.display();
          } else if (value && !isValid) {
            this.notify.notice(`Invalid frontmatter template: ${error}`);
            toggle.setValue(false);
            // Trigger re-render to show/hide property selector
            this.display();
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
            fragment.appendText(
              'When enabled, frontmatter of existing files will be updated, keeping additional fields that are not present in the template. Works best with Deduplication enabled.'
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
                fragment.createEl('strong', { text: this.plugin.settings.trackingProperty });
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

      new Setting(containerEl).setName('File tracking').setHeading();

      new Setting(containerEl)
        .setName('Enable file tracking')
        .setDesc(
          createFragment((fragment) => {
            fragment.appendText(
              'Track files using their unique Readwise URL to maintain consistency when titles or properties change.'
            );
            fragment.createEl('br');
            fragment.appendText(
              'This prevents duplicate files and maintains links when articles are updated in Readwise.'
            );
            fragment.createEl('br');
            fragment.createEl('br');
            fragment.appendText('Note: Requires frontmatter to be enabled');
          })
        )
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.trackFiles && this.plugin.settings.frontMatter)
            .setDisabled(!this.plugin.settings.frontMatter)
            .onChange(async (value) => {
              this.plugin.settings.trackFiles = value;
              await this.plugin.saveSettings();
              this.frontmatterManager.updateFrontmatterTemplate(this.plugin.settings.frontMatterTemplate);
              this.display();
            })
        );

      if (this.plugin.settings.trackFiles && this.plugin.settings.frontMatter) {
        new Setting(containerEl)
          .setClass('indent')
          .setName('Tracking property')
          .setDesc(
            'Frontmatter property to store the unique Readwise URL (default: uri). This field will be automatically managed in the frontmatter.'
          )
          .addText((text) =>
            text
              .setValue(this.plugin.settings.trackingProperty)
              .setDisabled(!this.plugin.settings.frontMatter)
              .onChange(async (value) => {
                this.plugin.settings.trackingProperty = value || 'uri';
                await this.plugin.saveSettings();
                this.frontmatterManager.updateFrontmatterTemplate(this.plugin.settings.frontMatterTemplate);
              })
          );

        new Setting(containerEl)
          .setClass('indent')
          .setName('Remove duplicate files')
          .setDesc(
            createFragment((fragment) => {
              fragment.appendText(
                'When enabled, duplicate files will be removed. Otherwise, they will be marked with duplicate: true in frontmatter.'
              );
              fragment.createEl('br');
              fragment.createEl('blockquote', { text: 'Default: Mark duplicates in frontmatter' });
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

                const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
                const confirmButton = buttonContainer.createEl('button', { text: 'Confirm' });
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

    new Setting(containerEl)
      .setName('Frontmatter template')
      .setDesc(
        createFragment((fragment) => {
          fragment.appendText(
            'Controls YAML frontmatter metadata. The same variables are available as for the Header template, with specific versions optimised for YAML frontmatter (tags), and escaped values for YAML compatibility.'
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
              ['highlights_url', 'Readwise URL (auto-injected if deduplication enabled)'],
              [
                'Note:',
                'If deduplication is enabled, the specified property will be automatically added or updated in the frontmatter template.',
              ],
            ])
          );
        })
      )
      .addTextArea((text) => {
        const initialRows = 12;
        text.inputEl.addClass('settings-template-input');
        text.inputEl.rows = initialRows;
        text.inputEl.cols = 50;

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
        const updatePreview = (result: TemplateValidationResult) => {
          if (!result.isValid) {
            errorNotice.setText('Your Frontmatter contains invalid YAML');
            errorDetails.setText(result.error);
            errorDetails.show();

            if (result.preview) {
              previewContent.setText(result.preview);
              previewContainer.show();
            }
            return;
          }

          errorNotice.setText('');
          errorDetails.setText('');
          errorDetails.hide();
          previewContainer.hide();
        };

        // Display rendered template on load
        const validationResult: TemplateValidationResult = this.frontmatterManager.validateFrontmatterTemplate(
          this.plugin.settings.frontMatterTemplate
        );
        updatePreview(validationResult);
        text.setValue(this.plugin.settings.frontMatterTemplate).onChange(async (value) => {
          const validationResult: TemplateValidationResult = this.frontmatterManager.validateFrontmatterTemplate(value);

          // Update validation notice
          const noticeEl = containerEl.querySelector('.validation-notice');
          if (noticeEl) {
            noticeEl.setText(validationResult.isValid ? '' : validationResult.error);
          }

          if (!value) {
            this.plugin.settings.frontMatterTemplate = DEFAULT_SETTINGS.frontMatterTemplate;
          } else {
            this.plugin.settings.frontMatterTemplate = value.replace(/\n*$/, '\n');
          }

          updatePreview(validationResult);

          this.frontmatterManager.updateFrontmatterTemplate(value);
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
