/**
 * Checks whether a highlight template contains atomize blocks.
 * Detects both syntaxes:
 * - Standard Nunjucks: {% atomize or {%- atomize (FIRST pass in ReadwiseEnvironment)
 * - Custom atomizer: %%! atomize (SECOND pass delimiters)
 */
export function hasAtomizeBlocks(template: string): boolean {
  return /{%-?\s*atomize/.test(template) || /%%!\s*atomize/.test(template);
}
