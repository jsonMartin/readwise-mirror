import { EMPTY_FRONTMATTER, FRONTMATTER_TO_ESCAPE } from 'constants/index';
import { Template } from 'nunjucks';
import type { FrontMatterCache, TFile } from 'obsidian';
import { Frontmatter, FrontmatterError } from 'services/frontmatter';
import { ReadwiseEnvironment } from 'services/readwise-environment';
import { sampleMetadata } from 'test/sample-data';
import type { PluginSettings, ReadwiseDocument, YamlStringState } from 'types';
import * as YAML from 'yaml';
import type Logger from 'services/logger';

interface YamlEscapeOptions {
  multiline?: boolean;
}

export class FrontmatterManager {
  constructor(
    private readonly settings: PluginSettings,
    private readonly logger: Logger
  ) {}

  /**
   * Analyzes a string for YAML frontmatter characteristics
   * @param value - String to analyze
   * @returns Analysis of string characteristics
   */
  private static analyzeString(value: string): YamlStringState {
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
      isValueEscapedAlready: FrontmatterManager.isStringEscaped(value),
    };
  }

  /**
   * Checks if a string is already escaped
   * @param value - String to check
   */
  private static isStringEscaped(value: string): boolean {
    if (value.length <= 1) return false;
    return (value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'));
  }

  /**
   * Handles multiline string formatting
   * @param value - String to format
   * @returns Formatted multiline string
   */
  private static formatMultilineString(value: string): string {
    const indent = '  ';
    return `>-\n${indent}${value.replace(/\n/g, `\n${indent}`)}`;
  }

  /**
   * Escapes a value for YAML frontmatter
   * @param value - Value to escape
   * @param options - Escape options
   */
  private static escapeValue(value: string, { multiline = false }: YamlEscapeOptions = {}): string {
    if (!value) return '""';
    if (FrontmatterManager.analyzeString(value).isValueEscapedAlready) return value;

    if (value.includes('\n') && multiline) {
      return FrontmatterManager.formatMultilineString(value);
    }

    const cleanValue = FrontmatterManager.normalizeString(value);
    return FrontmatterManager.quoteString(cleanValue);
  }

  /**
   * Normalizes a string by cleaning whitespace
   */
  private static normalizeString(value: string): string {
    return value.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Applies appropriate quoting to a string
   */
  private static quoteString(value: string): string {
    const state = FrontmatterManager.analyzeString(value);

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
  private static escapeMetadata(metadata: ReadwiseDocument, fieldsToProcess: Array<string>): ReadwiseDocument {
    // Copy the metadata object to avoid modifying the original
    const processedMetadata = { ...metadata } as ReadwiseDocument;
    for (const field of fieldsToProcess) {
      if (field in processedMetadata && processedMetadata[field as keyof ReadwiseDocument]) {
        const key = field as keyof ReadwiseDocument;
        const value = processedMetadata[key];

        const escapeStringValue = (str: string) => FrontmatterManager.escapeValue(str);

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

  /**
   * Validates the frontmatter template
   * @param template - Frontmatter template to validate
   * @returns Validation result
   */
  public static validateFrontmatterTemplate(template: string): { isValid: boolean; error?: string; preview?: string } {
    const renderedTemplate = new Template(template, new ReadwiseEnvironment(), null, true).render(
      FrontmatterManager.escapeMetadata(sampleMetadata, FRONTMATTER_TO_ESCAPE)
    );
    const yamlContent = renderedTemplate.replace(Frontmatter.REGEX, '$2');
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
        .render(FrontmatterManager.escapeMetadata(metadata, FRONTMATTER_TO_ESCAPE))
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
