import { escapeMetadata } from 'utils/frontmatter-utils';
import { EMPTY_FRONTMATTER, FRONTMATTER_TO_ESCAPE } from 'constants/index';
import { Template } from 'nunjucks';
import type { FrontMatterCache, TFile } from 'obsidian';
import { Frontmatter, FrontmatterError } from 'services/frontmatter';
import { ReadwiseEnvironment } from 'services/readwise-environment';
import type { PluginSettings, ReadwiseDocument } from 'types';
import type Logger from 'services/logger';
import * as YAML from 'yaml';

export class FrontmatterManager {
  constructor(
    private readonly settings: PluginSettings,
    private readonly logger: Logger
  ) {}

  /**
   * Get updated and merged frontmatter based on a document's existing frontmatter
   * @param doc - Document to process
   * @param frontmatterCache? - Existing frontmatter cache (optional)
   * @returns
   */
  public getFrontmatter(doc: ReadwiseDocument, frontmatterCache?: FrontMatterCache): Frontmatter {
    try {
      const currentFrontmatter = new Frontmatter(frontmatterCache);
      const updates = this.processFrontmatterTemplate(doc);

      if (currentFrontmatter.keys().length > 0) {
        const filteredUpdates = this.settings.protectFrontmatter ? this.filterProtectedFields(updates) : updates;
        currentFrontmatter.merge(filteredUpdates);
      } else {
        currentFrontmatter.merge(updates);
      }

      return currentFrontmatter;
    } catch (error) {
      throw new FrontmatterError('Failed to update frontmatter', error);
    }
  }

  private filterProtectedFields(updates: Frontmatter): Frontmatter {
    const protectedFields = this.settings.protectedFields
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

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

  /**
   * Adds sync properties to frontmatter template
   */
  private addSyncPropertiesToTemplate(template: string): string {
    try {
      if (!this.settings.trackFiles) return template;

      const lines = template.split('\n');
      const { start, end } = this.findFrontmatterBoundaries(lines);

      if (!this.isValidFrontmatter(start, end)) return template;

      const trackingProperty = `${this.settings.trackingProperty}: {{ highlights_url }}`;
      return this.insertTrackingProperty(lines, end, trackingProperty);
    } catch (error) {
      throw new FrontmatterError('Failed to add sync properties', error);
    }
  }

  /**
   * Finds frontmatter boundaries in template
   */
  private findFrontmatterBoundaries(lines: string[]): {
    start: number;
    end: number;
  } {
    const start = lines.findIndex((line) => line.trim() === Frontmatter.DELIMITER);
    const end =
      start !== -1 ? lines.slice(start + 1).findIndex((line) => line.trim() === Frontmatter.DELIMITER) + start + 1 : -1;

    return { start, end };
  }

  /**
   * Validates frontmatter boundaries
   */
  private isValidFrontmatter(start: number, end: number): boolean {
    return start !== -1 && end > start;
  }

  /**
   * Inserts tracking property into template
   * @param lines - Template lines
   * @param endIndex - End index of frontmatter
   * @param property - Property to insert
   * @returns Updated template with tracking property
   */
  private insertTrackingProperty(lines: string[], endIndex: number, property: string): string {
    const propertyName = this.settings.trackingProperty;

    const filteredLines = lines.filter((line, index) => {
      if (index < endIndex) {
        return !line.trim().startsWith(`${propertyName}:`);
      }
      return true;
    });

    const d = lines.length - filteredLines.length;
    filteredLines.splice(endIndex - d, 0, property);
    return filteredLines.join('\n');
  }

  /**
   * Processes the frontmatter template according to the relevant settings and returns the frontmatter record
   * @param metadata - The metadata to process
   * @returns The frontmatter record
   */
  private processFrontmatterTemplate(metadata: ReadwiseDocument): Frontmatter {
    // Render a template if frontmatter is managed or file tracking is set
    if (!this.settings.frontMatter && !this.settings.trackFiles) {
      return new Frontmatter();
    }
    try {
      // Get frontmatter template string
      const frontMatterTemplate = this.settings.frontMatter ? this.settings.frontMatterTemplate : EMPTY_FRONTMATTER;
      // Add Sync properties
      const mergedTemplate = this.addSyncPropertiesToTemplate(frontMatterTemplate);
      this.logger.debug(`Processing merged frontmatter template\n${mergedTemplate}`);

      // Render and parse the template into YAML
      const template = new Template(
        this.addSyncPropertiesToTemplate(mergedTemplate),
        new ReadwiseEnvironment(),
        null,
        true
      );
      const renderedTemplate = template
        .render(escapeMetadata(metadata, FRONTMATTER_TO_ESCAPE))
        .replace(Frontmatter.REGEX, '$2');

      const yaml = YAML.parse(renderedTemplate);
      return new Frontmatter(yaml);
    } catch (error) {
      if (error instanceof YAML.YAMLParseError) {
        this.logger.error('Failed to parse YAML frontmatter:', error.message);
        throw new Error(`Invalid YAML frontmatter: ${error.message}`);
      }

      if (error instanceof Error) {
        this.logger.error('Error processing frontmatter template:', error.message);
        throw new Error(`Failed to process frontmatter: ${error.message}`);
      }

      this.logger.error('Unknown error processing frontmatter:', error);
      throw new Error('Failed to process frontmatter due to unknown error');
    }
  }
}
