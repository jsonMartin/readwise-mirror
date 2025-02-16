export interface YamlStringState {
	hasSingleQuotes: boolean;
	hasDoubleQuotes: boolean;
	isValueEscapedAlready: boolean;
}

export interface TemplateValidationResult {
	isValid: boolean;
	error?: string;
	preview?: string;
}
