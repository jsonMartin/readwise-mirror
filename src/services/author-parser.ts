import type { AuthorParserOptions } from 'models/readwise';

export class AuthorParser {
  private readonly AUTHOR_SEPARATORS = /,\s*and\s*|\s+and\s+|,\s*/;
  private readonly TITLES = /^(dr|prof|mr|mrs|ms|miss|sir|lady)\.\s+/i;

  constructor(private options: AuthorParserOptions = {}) {
    this.options = {
      removeTitles: options.removeTitles ?? false,
      normalizeCase: options.normalizeCase ?? false
    };
  }

  /**
   * Parses a string of authors into an array of individual authors
   * @param authorString The input string containing one or more authors
   * @returns Array of individual author names
   */
  public parse(authorString?: string): string[] {
    if (!authorString?.trim()) {
      return [];
    }

    return authorString
      .split(this.AUTHOR_SEPARATORS)
      .map(author => this.processAuthor(author))
      .filter(Boolean);
  }

  /**
   * Updates parser options
   * @param newOptions New configuration options for parsing
   */
  public setOptions(newOptions: Partial<AuthorParserOptions>): void {
    this.options = {
      ...this.options,
      ...newOptions
    };
  }

  /**
   * Gets current parser options
   * @returns Current configuration options
   */
  public getOptions(): AuthorParserOptions {
    return { ...this.options };
  }

  private processAuthor(author: string): string {
    let processed = author.trim();

    if (this.options.removeTitles) {
      processed = processed.replace(this.TITLES, '');
    }

    if (this.options.normalizeCase) {
      processed = this.normalizeCase(processed);
    }

    return processed;
  }

  private normalizeCase(name: string): string {
    return name
      .split(' ')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }
}

// Usage examples:
// const parser = new AuthorParser({
//   removeTitles: true,
//   normalizeCase: true
// });
//
// const authors1 = parser.parse('Dr. John Doe, and JANE SMITH, Prof. Bob Johnson');
// // Result: ['John Doe', 'Jane Smith', 'Bob Johnson']
//
// parser.setOptions({ removeTitles: false });
// const authors2 = parser.parse('mr. john doe,and JANE SMITH');
// // Result: ['mr. john doe', 'JANE SMITH']