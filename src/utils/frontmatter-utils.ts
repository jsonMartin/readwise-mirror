/**
 * FrontmatterUtils.ts
 */

import { FRONTMATTER_TO_ESCAPE } from 'constants/index';
import { Template } from 'nunjucks';
import { Frontmatter } from 'services/frontmatter';
import { ReadwiseEnvironment } from 'services/readwise-environment';
import { sampleMetadata } from 'test/sample-data';
import type { ReadwiseDocument, YamlEscapeOptions, YamlStringState } from 'types';
import * as YAML from 'yaml';

/**
 * Validates the frontmatter template
 * @param template - Frontmatter template to validate
 * @returns Validation result
 */
export function validateFrontmatterTemplate(template: string): {
  isValidYaml: boolean;
  error?: string;
  preview?: string;
} {
  const renderedTemplate = new Template(template, new ReadwiseEnvironment(), null, true).render(
    escapeMetadata(sampleMetadata, FRONTMATTER_TO_ESCAPE)
  );
  const yamlContent = renderedTemplate.replace(Frontmatter.REGEX, '$2');
  try {
    YAML.parse(yamlContent);
    return { isValidYaml: true };
  } catch (error) {
    if (error instanceof YAML.YAMLParseError) {
      return {
        isValidYaml: false,
        error: `Invalid YAML: ${error.message}`,
        preview: yamlContent,
      };
    }
    return {
      isValidYaml: false,
      error: `Template error: ${error.message}`,
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
  return (value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'));
}

/**
 * Handles multiline string formatting
 * @param value - String to format
 * @returns Formatted multiline string
 */
function formatMultilineString(value: string): string {
  const indent = '  ';
  return `>-\n${indent}${value.replace(/\n/g, `\n${indent}`)}`;
}

/**
 * Escapes a value for YAML frontmatter
 * @param value - Value to escape
 * @param options - Escape options
 */
function escapeValue(value: string, { multiline = false }: YamlEscapeOptions = {}): string {
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

      const escapeStringValue = (str: string) => escapeValue(str);

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
