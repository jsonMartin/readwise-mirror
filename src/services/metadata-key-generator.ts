import type { MetadataInput } from 'types';

export class MetadataKeyGenerator {
  /**
   * Generates a composite key from metadata using Readwise's deduplication logic
   * @see https://readwise.io/api_deets
   * @param data Object containing title, author, and source_url
   * @returns A composite key string
   */
  public generateKey(data: MetadataInput): string {
    const parts: string[] = [];

    if (data.title) {
      parts.push(data.title.toLowerCase());
    }

    if (data.author) {
      parts.push(this.normalizeAuthors(data.author));
    }

    if (data.source_url) {
      parts.push(data.source_url);
    }

    return parts.join('/');
  }

  /**
   * Normalizes author data into a sorted, lowercase string
   * @param authors Single author string or array of authors
   * @returns Normalized author string
   */
  private normalizeAuthors(authors: string | string[]): string {
    const authorArray = Array.isArray(authors) ? authors : [authors];
    return authorArray
      .map((author) => author.toLowerCase())
      .sort()
      .join(',');
  }
}

// Usage example:
// const generator = new MetadataKeyGenerator();
// const key = generator.generateKey({
//   title: 'My Book',
//   author: ['John Doe', 'Jane Smith'],
//   source_url: 'https://example.com'
// });
