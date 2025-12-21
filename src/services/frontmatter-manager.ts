import { EMPTY_FRONTMATTER, FRONTMATTER_TO_ESCAPE, READWISE_URI_FIELD } from 'constants/index';
import { type Environment, Template } from 'nunjucks';
import { type FileManager, parseYaml, type TFile } from 'obsidian';
import { Frontmatter, FrontmatterError } from 'services/frontmatter';
import type { PluginContext } from 'services/plugin-context';
import type { AtomicFile, BaseFile, ReadwiseDocument } from 'types/document';
import { escapeMetadata } from 'utils/frontmatter-utils';

export class FrontmatterManager {
  private readonly settings = this.context.settings;
  private readonly logger = this.context.logger;

  constructor(
    private readonly context: PluginContext,
    private readonly env: Environment,
    private readonly fm: FileManager
  ) {}

  /**
   * Get updated and merged frontmatter based on a document's existing frontmatter
   * @param file - Document to process
   * @param existingFrontmatter? - Existing frontmatter cache (optional, default is none)
   * @returns
   */
  public getFrontmatter(file: BaseFile | AtomicFile, existingFrontmatter = false): Frontmatter {
    try {
      /**
       * We treat this differently by type
       * - The BaseFile *updates* existing frontmatter from the Cache
       * - The AtomicFile *updates* the parent frontmatter with its own template
       **/

      switch (file.type) {
        case 'base': {
          const updatedFrontmatter = this.getBaseFrontmatter(file.doc);

          // Add tracking property if enabled
          if (this.settings.trackFiles)
            updatedFrontmatter.set(this.settings.trackingProperty, file.doc[READWISE_URI_FIELD]);

          // Only filter update if all conditions are fulfilled
          if (
            this.settings.frontMatter &&
            this.settings.updateFrontmatter &&
            this.settings.protectFrontmatter &&
            existingFrontmatter
          ) {
            return this.filterProtectedFrontmatter(updatedFrontmatter);
          }

          return updatedFrontmatter;
        }
        case 'atom': {
          // Only add "parent frontmatter" if enabled
          let atomicFrontmatter = this.settings.atomicInheritParentFrontmatter
            ? this.getBaseFrontmatter(file.doc)
            : new Frontmatter();
          const currentFrontmatter = Frontmatter.fromString(file.frontmatter);
          const highlight = file.doc.highlights.find((h) => h.id === file.id);

          if (currentFrontmatter.keys().length > 0) {
            const filteredUpdates = this.settings.protectFrontmatter
              ? this.filterProtectedFrontmatter(currentFrontmatter)
              : currentFrontmatter;

            atomicFrontmatter = atomicFrontmatter.merge(filteredUpdates);
          }

          // Get readwise_url by finding the highlight with the corresponding ID – throw an error if not found
          atomicFrontmatter.set(this.settings.atomicParentProperty, file.doc[READWISE_URI_FIELD]);

          if (!highlight) {
            throw new Error(`Highlight with id ${file.id} not found while building atomic frontmatter.`);
          }

          const highlightUri = highlight[READWISE_URI_FIELD];

          if (!highlightUri) {
            throw new Error(`Highlight with id ${file.id} is missing ${READWISE_URI_FIELD}.`);
          }

          atomicFrontmatter.set(this.settings.trackingProperty, highlightUri);

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
        .replaceAll(Frontmatter.DELIMITER, '')
        .trim();

      const yaml = parseYaml(renderedTemplate);
      return new Frontmatter(yaml);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.debug('Rendered frontmatter template failed:', (error as Error).stack);
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
      .map((f: string) => f.trim())
      .filter(Boolean);

    // Using static methods from Frontmatter class
    return Frontmatter.fromEntries(updates.entries().filter(([key]) => !protectedFields.includes(key)));
  }

  public async writeUpdatedFrontmatter(file: TFile, updates: Frontmatter): Promise<void> {
    // File carries a reference to the vault
    try {
      await this.fm.processFrontMatter(file, (frontmatter) => {
        // Biome doesn't like assing via { ... frontmatter, ...updates }
        // Iterate over keys in updates and set them in frontmatter
        for (const [key, value] of updates.entries()) {
          frontmatter[key] = value;
        }
      });
    } catch (error) {
      throw new FrontmatterError('Failed to write frontmatter', error);
    }
  }
}
