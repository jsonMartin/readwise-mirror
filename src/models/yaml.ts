export interface YamlStringState {
	hasSingleQuotes: boolean;
	hasDoubleQuotes: boolean;
	isValueEscapedAlready: boolean;
}

export type FrontmatterRecord = Record<string, unknown>;

export interface TemplateValidationResult {
	isValid: boolean;
	error?: string;
	preview?: string;
}
