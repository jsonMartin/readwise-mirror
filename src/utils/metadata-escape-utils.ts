import { YAML_INDENT } from 'src/constants';
import type { ReadwiseDocument } from 'types/document';
import type { YamlEscapeOptions, YamlStringState } from 'types/utilities';

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

function isStringEscaped(value: string): boolean {
  if (value.length <= 1) return false;

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

function formatMultilineString(value: string): string {
  return `>-\n${YAML_INDENT}${value.replace(/\n/g, `\n${YAML_INDENT}`)}`;
}

function normalizeString(value: string): string {
  return value.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

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

export function escapeValue(value: string, { multiline = false }: YamlEscapeOptions = {}): string {
  if (!value) return '""';
  if (analyzeString(value).isValueEscapedAlready) return value;

  if (value.includes('\n') && multiline) {
    return formatMultilineString(value);
  }

  return quoteString(normalizeString(value));
}

export function escapeMetadata(metadata: ReadwiseDocument, fieldsToProcess: Array<string>): ReadwiseDocument {
  const processedMetadata = { ...metadata };
  const setFieldValue = <K extends keyof ReadwiseDocument>(key: K, value: ReadwiseDocument[K]): void => {
    processedMetadata[key] = value;
  };

  for (const field of fieldsToProcess) {
    if (field in processedMetadata) {
      const key = field as keyof ReadwiseDocument;
      const value = processedMetadata[key];

      if (Array.isArray(value)) {
        const escapedArray = value.map((item) => (typeof item === 'string' ? escapeValue(item) : item));
        setFieldValue(key, escapedArray as ReadwiseDocument[typeof key]);
      } else if (typeof value === 'string') {
        setFieldValue(key, escapeValue(value) as ReadwiseDocument[typeof key]);
      }
    }
  }

  return processedMetadata;
}
