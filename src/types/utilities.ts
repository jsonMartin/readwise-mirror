export interface YamlStringState {
  hasSingleQuotes: boolean;
  hasDoubleQuotes: boolean;
  isValueEscapedAlready: boolean;
}

export interface YamlEscapeOptions {
  multiline?: boolean;
}

export interface TemplateValidationResult {
  isValidTemplate?: boolean;
  isValidYaml?: boolean;
  error?: string;
  preview?: string;
}

export interface AtomizeOptions {
  id: number | string;
  parent: number;
  basename: string;
  embed: boolean;
}
