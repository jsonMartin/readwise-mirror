import { App, PluginSettingTab, Setting } from 'obsidian';
import { Template } from 'nunjucks';
import * as YAML from 'yaml';
import { getAPI as getDVAPI } from 'obsidian-dataview';
import { sampleMetadata } from '../test-data/sampleData';
import Notify from '../notify';
import ReadwiseMirror from '../main';
import { FRONTMATTER_TO_ESCAPE, DEFAULT_SETTINGS } from './lib';
import { ReadwiseApi } from 'readwiseApi';

export class ReadwiseMirrorSettingTab extends PluginSettingTab {
  plugin: ReadwiseMirror;
  notify: Notify;

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
  private adjustTextareaRows = (textEl: HTMLTextAreaElement, minRows: number = 3) => {
    const content = textEl.value;
    const width = textEl.cols;

    // Calculate wrapped lines
    let totalLines = 0;
    content.split('\n').forEach((line) => {
      // Calculate how many times the line wraps
      const wrappedLines = Math.ceil(line.length / width);
      totalLines += Math.max(1, wrappedLines);
    });

    // Add 1 to account for the last line and set minimum
    textEl.rows = Math.max(minRows, totalLines + 1);
  };

  private validateFrontmatterTemplate(template: string): { isValid: boolean; error?: string; preview?: string } {
    const renderedTemplate = new Template(template, this.plugin.env, null, true).render(
      this.plugin.escapeFrontmatter(sampleMetadata, FRONTMATTER_TO_ESCAPE)
    );
    const yamlContent = renderedTemplate
      .replace(/^---\n/, '') // Remove opening ---
      .replace(/\n---\n*$/, ''); // Remove closing --- and any trailing newlines
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
      const documentationContainer = fragment.createDiv({
        cls: 'setting-documentation-container',
      });

      documentationContainer.createDiv({
        text: title,
        cls: 'setting-item-description',
      });

      const container = documentationContainer.createDiv({
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
          this.plugin.headerTemplate = new Template(this.plugin.settings.headerTemplate, this.plugin.env, null, true);
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
      .setName('Frontmatter')
      .setDesc('Add frontmatter (defined with the following Template)')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.frontMatter).onChange(async (value) => {
          // Test template with sample data
          const { isValid, error } = this.validateFrontmatterTemplate(this.plugin.settings.frontMatterTemplate);
          if ((value && isValid) || !value) {
            this.plugin.settings.frontMatter = value;
            await this.plugin.saveSettings();
            // Trigger re-render to show/hide frontmatter settings
            this.display();
          } else if (value && !isValid) {
            this.plugin.notify.notice(`Invalid frontmatter template: ${error}`);
            toggle.setValue(false);
            // Trigger re-render to show/hide property selector
            this.display();
          }
        })
      );

    if (this.plugin.settings.frontMatter) {
      new Setting(containerEl)
        .setName('Update Frontmatter')
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
          .setName('Protect Frontmatter Fields')
          .setDesc(
            createFragment((fragment) => {
              fragment.appendText('Prevent existing frontmatter fields from being overwritten during sync');
              fragment.createEl('br');
              fragment.createEl('br');
              fragment.appendText(
                'Note: Only fields that already exist in the file will be protected. A field marked for protection which is not present yet in the original field will be written normally at the first write/update, and will be protected henceforth.'
              );
              if (this.plugin.settings.deduplicateFiles) {
                fragment.createEl('br');
                fragment.appendText('The deduplication field ');
                fragment.createEl('strong', { text: this.plugin.settings.deduplicateProperty });
                fragment.appendText(' cannot be protected');
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
            if (!this.plugin.settings.deduplicateFiles) return { isValid: true };

            const fields = value
              .split('\n')
              .map((f) => f.trim())
              .filter((f) => f.length > 0);
            const dedupField = this.plugin.settings.deduplicateProperty;

            if (fields.includes(dedupField)) {
              return {
                isValid: false,
                error: `Cannot protect deduplication field '${dedupField}'`,
              };
            }
            return { isValid: true };
          };

          const container = containerEl.createDiv();
          new Setting(container)
            .setName('Protected Fields')
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
        const updatePreview = (template: string) => {
          const rendered = new Template(template, this.plugin.env, null, true).render(
            this.plugin.escapeFrontmatter(sampleMetadata, FRONTMATTER_TO_ESCAPE)
          );
          const yamlContent = rendered
            .replace(/^---\n/, '') // Remove opening ---
            .replace(/\n---\n*$/, ''); // Remove closing --- and any trailing newlines

          try {
            YAML.parse(yamlContent);
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
        text.setValue(this.plugin.settings.frontMatterTemplate).onChange(async (value) => {
          const validation = this.validateFrontmatterTemplate(value);

          // Update validation notice
          const noticeEl = containerEl.querySelector('.validation-notice');
          if (noticeEl) {
            noticeEl.setText(validation.isValid ? '' : validation.error);
          }

          if (!value) {
            this.plugin.settings.frontMatterTemplate = DEFAULT_SETTINGS.frontMatterTemplate;
          } else {
            this.plugin.settings.frontMatterTemplate = value.replace(/\n*$/, '\n');
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

        // Initial row adjustment
        this.adjustTextareaRows(text.inputEl, initialRows);

        // Adjust on content change
        text.inputEl.addEventListener('input', () => {
          this.adjustTextareaRows(text.inputEl, initialRows);
        });

        return text;
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
          this.plugin.highlightTemplate = new Template(
            this.plugin.settings.highlightTemplate,
            this.plugin.env,
            null,
            true
          );
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
          // Trigger re-render to show/hide property selector
          this.display();
        })
      );

    if (this.plugin.settings.useSlugify) {
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
    }

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
