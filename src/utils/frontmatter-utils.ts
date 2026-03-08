/**
 * FrontmatterUtils.ts
 */

import { FRONTMATTER_TO_ESCAPE, YAML_INDENT } from 'constants/index';
import { parseYaml } from 'obsidian';
import { Frontmatter } from 'services/frontmatter';
import type { ReadwiseEnvironment } from 'services/readwise-environment';
import { sampleMetadata } from 'test/sample-data';
import type { ReadwiseDocument } from 'types/document';
import type { YamlEscapeOptions, YamlStringState } from 'types/utilities';

/**
 * Sanitizes the frontmatter template by removing delimiters and trimming whitespace
 * @param template - Frontmatter template to sanitize
 * @returns Sanitized frontmatter template
 */
export function sanitizeFrontmatterTemplate(template: string): string {
  let sanitizedTemplate: string = template;

  // Ensure frontmatter delimiters are removed
  sanitizedTemplate = sanitizedTemplate.replaceAll(`${Frontmatter.DELIMITER}`, '');

  // Trim leading/trailing whitespace
  sanitizedTemplate = sanitizedTemplate.trim();

  return sanitizedTemplate;
}

/**
 * Validates the frontmatter template
 * @param template - Frontmatter template to validate
 * @returns Validation result
 */
export function validateFrontmatterTemplate(
  env: ReadwiseEnvironment,
  template: string
): {
  isValidYaml: boolean;
  error?: string;
  preview?: string;
} {
  let renderedTemplate = '';
  try {
    renderedTemplate = env.renderString(
      sanitizeFrontmatterTemplate(template),
      escapeMetadata(sampleMetadata, FRONTMATTER_TO_ESCAPE)
    );
    parseYaml(renderedTemplate);
    return { isValidYaml: true };
  } catch (error) {
    return {
      isValidYaml: false,
      error: `Invalid YAML or Template: ${error.message}`,
      preview: renderedTemplate,
    };
  }
}

/**
 * Analyzes a string for YAML frontmatter characteristics
 * @param value - String to analyze
 * @returns Analysis of string characteristics
 */
function analyzeString(value: string): YamlStringState {
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
    isValueEscapedAlready: isStringEscaped(value),
  };
}

/**
 * Checks if a string is already escaped
 * @param value - String to check
 */
function isStringEscaped(value: string): boolean {
  if (value.length <= 1) return false;

  // Matching edge quotes alone can misclassify raw content as pre-escaped YAML.
  if (value.startsWith('"') && value.endsWith('"')) {
    const inner = value.slice(1, -1);
    return !hasUnescapedDoubleQuote(inner);
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    const inner = value.slice(1, -1);
    return !inner.replaceAll("''", '').includes("'");
  }

  return false;
}

function hasUnescapedDoubleQuote(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== '"') continue;

    let backslashCount = 0;
    for (let j = i - 1; j >= 0 && value[j] === '\\'; j--) {
      backslashCount++;
    }

    if (backslashCount % 2 === 0) {
      return true;
    }
  }

  return false;
}

/**
 * Handles multiline string formatting
 * @param value - String to format
 * @returns Formatted multiline string
 */
function formatMultilineString(value: string): string {
  return `>-\n${YAML_INDENT}${value.replace(/\n/g, `\n${YAML_INDENT}`)}`;
}

/**
 * Escapes a value for YAML frontmatter
 * @param value - Value to escape
 * @param options - Escape options
 */
export function escapeValue(value: string, { multiline = false }: YamlEscapeOptions = {}): string {
  if (!value) return '""';
  if (analyzeString(value).isValueEscapedAlready) return value;

  if (value.includes('\n') && multiline) {
    return formatMultilineString(value);
  }

  const cleanValue = normalizeString(value);
  return quoteString(cleanValue);
}

/**
 * Normalizes a string by cleaning whitespace
 */
function normalizeString(value: string): string {
  return value.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Applies appropriate quoting to a string
 */
function quoteString(value: string): string {
  const state = analyzeString(value);

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
export function escapeMetadata(metadata: ReadwiseDocument, fieldsToProcess: Array<string>): ReadwiseDocument {
  // Copy the metadata object to avoid modifying the original
  const processedMetadata = { ...metadata } as ReadwiseDocument;
  for (const field of fieldsToProcess) {
    if (field in processedMetadata && processedMetadata[field as keyof ReadwiseDocument]) {
      const key = field as keyof ReadwiseDocument;
      const value = processedMetadata[key];

      if (Array.isArray(value)) {
        (processedMetadata[key] as unknown) = value.map((item) =>
          typeof item === 'string' ? escapeValue(item) : item
        );
      } else if (typeof value === 'string') {
        (processedMetadata[key] as unknown) = escapeValue(value);
      }
    }
  }
  return processedMetadata;
}
