import { EMPTY_FRONTMATTER, FRONTMATTER_TO_ESCAPE, READWISE_URI_FIELD } from 'constants/index';
import { type Environment, Template } from 'nunjucks';
import type { FrontMatterCache, TFile } from 'obsidian';
import { Frontmatter, FrontmatterError } from 'services/frontmatter';
import type Logger from 'services/logger';
import type { AtomicFile, BaseFile, PluginSettings, ReadwiseDocument } from 'types';
import { escapeMetadata } from 'utils/frontmatter-utils';
import * as YAML from 'yaml';

export class FrontmatterManager {
  constructor(
    private readonly settings: PluginSettings,
    private readonly logger: Logger,
    private readonly env: Environment
  ) {}

  /**
   * Get updated and merged frontmatter based on a document's existing frontmatter
   * @param file - Document to process
   * @param frontmatterCache? - Existing frontmatter cache (optional)
   * @returns
   */
  public getFrontmatter(file: BaseFile | AtomicFile, frontmatterCache?: FrontMatterCache): Frontmatter {
    try {
      /**
       * We treat this differently by type
       * - The BaseFile *updates* existing frontmatter from the Cache
       * - The AtomicFile *updates* the parent frontmatter with its own template
       **/

      switch (file.type) {
        case 'base': {
          const currentFrontmatter = new Frontmatter(frontmatterCache);
          const updatedFrontmatter = this.getBaseFrontmatter(file.doc);

          // Add tracking property
          if (this.settings.trackFiles)
            updatedFrontmatter.set(this.settings.trackingProperty, file.doc[READWISE_URI_FIELD]);
          if (currentFrontmatter.keys().length > 0) {
            const filteredUpdates = this.settings.protectFrontmatter
              ? this.filterProtectedFrontmatter(updatedFrontmatter)
              : updatedFrontmatter;
            return currentFrontmatter.merge(filteredUpdates);
          }

          return currentFrontmatter.merge(updatedFrontmatter);
        }
        case 'atom': {
          let atomicFrontmatter = this.getBaseFrontmatter(file.doc);
          const currentFrontmatter = Frontmatter.fromString(file.frontmatter);
          const highlight = file.doc.highlights.find((h) => h.id === file.id);

          if (currentFrontmatter.keys().length > 0) {
            const filteredUpdates = this.settings.protectFrontmatter
              ? this.filterProtectedFrontmatter(currentFrontmatter)
              : currentFrontmatter;

            atomicFrontmatter = atomicFrontmatter.merge(filteredUpdates);
          }

          // Get readwise_url by finding the highlight with the corresponding ID
          atomicFrontmatter.set(this.settings.atomicParentProperty, file.doc[READWISE_URI_FIELD]);
          atomicFrontmatter.set(this.settings.trackingProperty, highlight[READWISE_URI_FIELD]);

          return atomicFrontmatter;
        }
      }
    } catch (error) {
      throw new FrontmatterError('Failed to update frontmatter', error);
    }
  }

  /**
   * Processes the frontmatter template according to the relevant settings and returns the raw frontmatter record
   * @param metadata - The metadata to process
   * @returns The frontmatter record
   */
  public getBaseFrontmatter(metadata: ReadwiseDocument): Frontmatter {
    // Render a template if frontmatter is managed or file tracking is set
    if (!this.settings.frontMatter && !this.settings.trackFiles) {
      return new Frontmatter();
    }
    try {
      // Get frontmatter template string
      // Add Sync properties
      const frontmatterTemplate = this.settings.frontMatter ? this.settings.frontMatterTemplate : EMPTY_FRONTMATTER;
      this.logger.debug(`Processing merged frontmatter template\n${frontmatterTemplate}`);

      // Render and parse the template into YAML
      const template = new Template(frontmatterTemplate, this.env, null, true);
      const renderedTemplate = template
        .render(escapeMetadata(metadata, FRONTMATTER_TO_ESCAPE))
        .replace(Frontmatter.REGEX, '$2');

      const yaml = YAML.parse(renderedTemplate);
      return new Frontmatter(yaml);
    } catch (error) {
      if (error instanceof YAML.YAMLParseError) {
        this.logger.error('Failed to parse YAML frontmatter:', error.message);
        throw new FrontmatterError(`Invalid YAML frontmatter: ${error.message}`, error);
      }
      if (error instanceof Error) {
        this.logger.error('Error processing frontmatter template:', error.message);
        throw new FrontmatterError(`Failed to process frontmatter: ${error.message}`, error);
      }
      this.logger.error('Unknown error processing frontmatter:', error);
      throw new FrontmatterError('Failed to process frontmatter due to unknown error', error);
    }
  }
  /**
   * Filters out protected fields from the frontmatter updates
   * @param updates - The frontmatter updates to filter
   * @returns Filtered frontmatter without protected fields
   */
  public filterProtectedFrontmatter(updates: Frontmatter): Frontmatter {
    const protectedFields = this.settings.protectedFields
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

    // Push the tracking property as well
    if (this.settings.trackFiles) protectedFields.push(this.settings.trackingProperty);

    // Using static methods from Frontmatter class
    return Frontmatter.fromEntries(updates.entries().filter(([key]) => !protectedFields.includes(key)));
  }

  public async writeUpdatedFrontmatter(file: TFile, updates: Frontmatter): Promise<void> {
    // File carries a reference to the vault
    const vault = file.vault;
    try {
      const content = await vault.read(file);
      const frontmatter = Frontmatter.fromString(content);
      frontmatter.merge(updates);

      const match = content.match(Frontmatter.REGEX);
      const frontmatterStr = match?.[1] || '';
      const body = content.slice(frontmatterStr.length);

      await vault.modify(file, `${frontmatter.toString()}\n${body}`);
    } catch (error) {
      throw new FrontmatterError('Failed to write frontmatter', error);
    }
  }
}
