/**
 * FrontmatterUtils.ts
 */

import { parseYaml } from 'obsidian';
import { Frontmatter } from 'services/frontmatter';
import type { ReadwiseEnvironment } from 'services/readwise-environment';
import { FRONTMATTER_TO_ESCAPE } from 'src/constants';
import { sampleMetadata } from 'tests/sample-data';
import { escapeMetadata } from 'utils/metadata-escape-utils';

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
  isValidTemplate: boolean;
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
  } catch (error) {
    return {
      isValidTemplate: false,
      isValidYaml: false,
      error: `Template render error: ${error instanceof Error ? error.message : String(error)}`,
      preview: renderedTemplate,
    };
  }

  try {
    parseYaml(renderedTemplate);
    return { isValidTemplate: true, isValidYaml: true, preview: renderedTemplate };
  } catch (error) {
    return {
      isValidTemplate: true,
      isValidYaml: false,
      error: `Invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
      preview: renderedTemplate,
    };
  }
}
