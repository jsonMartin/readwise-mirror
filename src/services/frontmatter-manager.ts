import { FRONTMATTER_TO_ESCAPE, YAML_TOSTRING_OPTIONS } from 'constants/index';
import { type Environment, Template } from 'nunjucks';
import type { App, TFile } from 'obsidian';
import { sampleMetadata } from 'test/sample-data';
import type { PluginSettings, ReadwiseDocument, YamlStringState } from 'types';
import * as YAML from 'yaml';

interface YamlEscapeOptions {
  multiline?: boolean;
}


class FrontmatterError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'FrontmatterError';
  }
}

// TODO: Make this a proper class 
export type Frontmatter = Record<string, unknown>;
export class FrontmatterManager {
  private static readonly FRONTMATTER_REGEX = /^(---\n([\s\S]*?)\n---\s*)/;
  private static readonly FRONTMATTER_DELIMITER = '---';
  private frontMatterTemplate: Template;

  constructor(
    private readonly app: App,
    private readonly settings: PluginSettings,
    private readonly env: Environment
  ) {}

  /**
   * Analyzes a string for YAML frontmatter characteristics
   * @param value - String to analyze
   * @returns Analysis of string characteristics
   */
  private analyzeString(value: string): YamlStringState {
    if (!value) {
      return {
        hasSingleQuotes: false,
        hasDoubleQuotes: false,
        isValueEscapedAlready: false,
      };
    }

    return {
      hasSingleQuotes: value.includes("'"),
      hasDoubleQuotes: value.includes('"'),
      isValueEscapedAlready: this.isStringEscaped(value),
    };
  }

  /**
   * Checks if a string is already escaped
   * @param value - String to check
   */
  private isStringEscaped(value: string): boolean {
    if (value.length <= 1) return false;

    return (value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'));
  }

  /**
   * Handles multiline string formatting
   * @param value - String to format
   * @returns Formatted multiline string
   */
  private formatMultilineString(value: string): string {
    const indent = '  ';
    return `>-\n${indent}${value.replace(/\n/g, `\n${indent}`)}`;
  }

  /**
   * Escapes a value for YAML frontmatter
   * @param value - Value to escape
   * @param options - Escape options
   */
  private escapeValue(value: string, { multiline = false }: YamlEscapeOptions = {}): string {
    if (!value) return '""';
    if (this.analyzeString(value).isValueEscapedAlready) return value;

    if (value.includes('\n') && multiline) {
      return this.formatMultilineString(value);
    }

    const cleanValue = this.normalizeString(value);
    return this.quoteString(cleanValue);
  }

  /**
   * Normalizes a string by cleaning whitespace
   */
  private normalizeString(value: string): string {
    return value.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Applies appropriate quoting to a string
   */
  private quoteString(value: string): string {
    const state = this.analyzeString(value);

    if (!state.hasSingleQuotes && !state.hasDoubleQuotes) {
      return `"${value}"`;
    }

    if (state.hasDoubleQuotes && !state.hasSingleQuotes) {
      return `'${value}'`;
    }

    if (state.hasSingleQuotes && !state.hasDoubleQuotes) {
      return `"${value}"`;
    }

    return `"${value.replace(/"/g, '\\"')}"`;
  }

  // Before metadata is used
  public escapeMetadata(metadata: ReadwiseDocument, fieldsToProcess: Array<string>): ReadwiseDocument {
    // Copy the metadata object to avoid modifying the original
    const processedMetadata = { ...metadata } as ReadwiseDocument;
    for (const field of fieldsToProcess) {
      if (field in processedMetadata && processedMetadata[field as keyof ReadwiseDocument]) {
        const key = field as keyof ReadwiseDocument;
        const value = processedMetadata[key];

        const escapeStringValue = (str: string) => this.escapeValue(str);

        if (Array.isArray(value)) {
          (processedMetadata[key] as unknown) = value.map((item) =>
            typeof item === 'string' ? escapeStringValue(item) : item
          );
        } else if (typeof value === 'string') {
          (processedMetadata[key] as unknown) = escapeStringValue(value);
        }
      }
    }
    return processedMetadata;
  }

  /**
   * Updates frontmatter of a file
   */
  public async getUpdatedFrontmatter(file: TFile, updates: Frontmatter): Promise<Frontmatter> {
    try {
      const currentFrontmatter: Frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter || {};

      if (Object.keys(currentFrontmatter).length > 0) {
        const filteredUpdates = this.settings.protectFrontmatter ? this.filterProtectedFields(updates) : updates;

        const newFrontmatter = {
          ...currentFrontmatter,
          ...filteredUpdates,
        };

        return newFrontmatter;
      }

      return updates;
    } catch (error) {
      throw new FrontmatterError('Failed to update frontmatter', error);
    }
  }

  public validateFrontmatterTemplate(template: string): { isValid: boolean; error?: string; preview?: string } {
    const renderedTemplate = new Template(template, this.env, null, true).render(
      this.escapeMetadata(sampleMetadata, FRONTMATTER_TO_ESCAPE)
    );
    const yamlContent = renderedTemplate.replace(FrontmatterManager.FRONTMATTER_REGEX, '$2');
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

  /**
   * Filters out protected fields from updates
   */
  private filterProtectedFields(updates: Frontmatter): Frontmatter {
    const protectedFields = this.settings.protectedFields
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

    return Object.fromEntries(Object.entries(updates).filter(([key]) => !protectedFields.includes(key)));
  }
  /**
   * Generates frontmatter string
   */
  public static toString(data: Record<string, unknown>): string {
    return [
      FrontmatterManager.FRONTMATTER_DELIMITER,
      YAML.stringify(data, YAML_TOSTRING_OPTIONS),
      FrontmatterManager.FRONTMATTER_DELIMITER,
    ].join('\n');
  }

  /**
   * Writes updated frontmatter to a file
   * TODO: Should go into a ReadwiseMirrorWriter class
   */
  public async writeUpdatedFrontmatter(file: TFile, updates: Frontmatter): Promise<void> {
    try {
      const content = await this.app.vault.read(file);
      const match = content.match(FrontmatterManager.FRONTMATTER_REGEX);
      const frontmatterStr = match?.[1] || '';
      const body = content.slice(frontmatterStr.length);

      const frontmatter = FrontmatterManager.toString(updates);
      await this.app.vault.modify(file, `${frontmatter}\n${body}`);
    } catch (error) {
      throw new FrontmatterError('Failed to write frontmatter', error);
    }
  }

  /**
   * Adds sync properties to frontmatter template
   */
  public addSyncPropertiesToTemplate(template: string): string {
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
    const start = lines.findIndex((line) => line.trim() === FrontmatterManager.FRONTMATTER_DELIMITER);
    const end =
      start !== -1
        ? lines.slice(start + 1).findIndex((line) => line.trim() === FrontmatterManager.FRONTMATTER_DELIMITER) +
          start +
          1
        : -1;

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
   */
  private insertTrackingProperty(lines: string[], endIndex: number, property: string): string {
    const propertyName = this.settings.trackingProperty;

    const filteredLines = lines.filter((line, index) => {
      if (index < endIndex) {
        return !line.trim().startsWith(`${propertyName}:`);
      }
      return true;
    });

    filteredLines.splice(endIndex, 0, property);
    return filteredLines.join('\n');
  }

  // Update the frontmatter template with the sync properties (and remove the markers)
  public updateFrontmatteTemplate(template: string) {
    this.frontMatterTemplate = new Template(this.addSyncPropertiesToTemplate(template), this.env, null, true);
  }

  /**
   * Processes the frontmatter template and returns the frontmatter record
   * @param metadata - The metadata to process
   * @returns The frontmatter record
   */
  public renderFrontmatter(metadata: ReadwiseDocument): Frontmatter {
    return this.settings.updateFrontmatter ? this.processTemplate(metadata, this.frontMatterTemplate) : {};
  }

  /**
   * Processes a template and returns the frontmatter record
   * @param metadata - The metadata to process
   * @param template - The template to process
   * @returns The frontmatter record
   */
  private processTemplate(metadata: ReadwiseDocument, template: Template): Frontmatter {
    try {
      // Render template if provided, otherwise use the default frontmatter template
      const cleanedTemplate = template
        .render(this.escapeMetadata(metadata, FRONTMATTER_TO_ESCAPE))
        .replace(FrontmatterManager.FRONTMATTER_REGEX, '$2');
      return YAML.parse(cleanedTemplate);
    } catch (error) {
      if (error instanceof YAML.YAMLParseError) {
        console.error('Failed to parse YAML frontmatter:', error.message);
        throw new Error(`Invalid YAML frontmatter: ${error.message}`);
      }

      if (error instanceof Error) {
        console.error('Error processing frontmatter template:', error.message);
        throw new Error(`Failed to process frontmatter: ${error.message}`);
      }

      console.error('Unknown error processing frontmatter:', error);
      throw new Error('Failed to process frontmatter due to unknown error');
    }
  }
}
