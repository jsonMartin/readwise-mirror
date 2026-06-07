import { type RequestUrlResponse, requestUrl } from 'obsidian';
import type { Export, Library } from 'types/library';
import type { PluginContext } from '../types/plugin-context';

const API_ENDPOINT = 'https://readwise.io/api/v2';
const API_PAGE_SIZE = 1000; // number of results per page, default 100 / max 1000
const MAX_RATE_LIMIT_RETRIES = 5;

export class TokenValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenValidationError';
  }
}

/**
 * Readwise API class
 */
export default class ReadwiseApi {
  private validToken: boolean | undefined;

  static async validateTokenValue(apiToken: string): Promise<boolean> {
    if (!apiToken) {
      return false;
    }

    try {
      const response = await requestUrl({
        url: `${API_ENDPOINT}/auth`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${apiToken}`,
        },
      });

      return response.status === 204;
    } catch (error) {
      throw new TokenValidationError(
        `Token validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private constructor(private ctx: PluginContext) {
    if (!ctx.settings.apiToken) {
      throw new Error('API Token Required!');
    }
  }

  // The only way to create an instance
  static async create(ctx: PluginContext): Promise<ReadwiseApi> {
    const api = new ReadwiseApi(ctx);
    await api.validateToken(); // Await validation before returning
    return api;
  }

  private isExportRecord(value: unknown): value is Export {
    return (
      typeof value === 'object' &&
      value !== null &&
      'user_book_id' in value &&
      'highlights' in value &&
      Array.isArray((value as { highlights?: unknown }).highlights)
    );
  }

  /**
   * Returns the options object for the Readwise API instance
   * @returns {Record<string, unknown>} - Returns an object containing the headers for the API request
   */
  get options() {
    return {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${this.ctx.settings.apiToken}`,
      },
    };
  }

  /**
   * Returns the validation status of the API token
   * @returns {boolean} - Returns a boolean indicating if the token is valid
   */
  public hasValidToken(): boolean {
    if (this.validToken === undefined) {
      return false;
    }
    return this.validToken;
  }

  /**
   * Checks if the token is valid by making a request to the Readwise API
   * @returns {Promise<boolean>} - Returns a promise that resolves to a boolean indicating if the token is valid
   */
  async validateToken(): Promise<boolean> {
    try {
      const response = await requestUrl({ url: `${API_ENDPOINT}/auth`, ...this.options });

      this.validToken = response.status === 204;
      return this.validToken;
    } catch (error) {
      throw new TokenValidationError(
        `Token validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Fetches data from the Readwise API - if lastUpdated or bookID aren't provided, fetch everything.
   * @param contentType - The type of content to fetch from the API
   * @param lastUpdated - The date to fetch updates from
   * @param bookId - The ID of the book to fetch highlights from
   * @returns {Promise<Export[]>} - Returns a promise that resolves to an array of Export objects
   * @throws {Error} - Throws an error if the request fails
   */
  async fetchData(
    contentType = 'export',
    lastUpdated?: string,
    bookId?: number[],
    includeDeleted?: boolean
  ): Promise<Export[]> {
    const url = `${API_ENDPOINT}/${contentType}?`;
    let data: Record<string, unknown> | undefined;
    let nextPageCursor: string | undefined;
    let rateLimitRetries = 0;

    const results: Export[] = [];

    this.ctx.logger.group(`Fetch Data: ${contentType}`);
    this.ctx.logger.debug('Fetch parameters:', { lastUpdated, bookId, includeDeleted });
    try {
      while (true) {
        const queryParams = new URLSearchParams();
        queryParams.append('page_size', API_PAGE_SIZE.toString());
        if (lastUpdated && lastUpdated !== '') {
          queryParams.append('updatedAfter', lastUpdated);
        }
        if (bookId && bookId.length > 0) {
          queryParams.append('ids', bookId.join(','));
        }
        if (nextPageCursor) {
          queryParams.append('pageCursor', nextPageCursor);
        }
        if (contentType === 'export' && includeDeleted) {
          queryParams.append('includeDeleted', 'true');
        }

        // Notify user of progress
        if (lastUpdated) this.ctx.logger.debug(`Checking for new content since ${lastUpdated}`);
        if (bookId && bookId.length > 0) {
          this.ctx.logger.debug(`Checking for all highlights on book IDs: ${bookId.join(',')}`);
        }
        let statusBarText = `Readwise: Fetching ${contentType}`;
        if (data?.count) statusBarText += ` (${results.length})`;
        this.ctx.setStatusBarText(statusBarText);

        // FIXME: When fetching very long period of data, the request might fail due to an URL which is too long (Error 414)
        const response: RequestUrlResponse = await requestUrl({ url: url + queryParams.toString(), ...this.options });
        const pageData = response.json as Record<string, unknown>;
        data = pageData;

        if (response.status !== 429 && (response.status < 200 || response.status >= 300)) {
          this.ctx.logger.error(`Failed to fetch data. Status: ${response.status}`);
          throw new Error(`Failed to fetch data. Status: ${response.status}`);
        }

        if (response.status === 429) {
          rateLimitRetries++;
          if (rateLimitRetries > MAX_RATE_LIMIT_RETRIES) {
            throw new Error(`Rate limit exceeded after ${MAX_RATE_LIMIT_RETRIES} retries for ${contentType}`);
          }
          // Error handling for rate limit throttling
          let rateLimitedDelayTime = Number.parseInt(response.headers['Retry-After'], 10) * 1000 + 1000;
          if (Number.isNaN(rateLimitedDelayTime)) {
            // Default to a 1-second delay if 'Retry-After' is missing or invalid
            this.ctx.logger.warn("'Retry-After' header is missing or invalid. Defaulting to 1 second delay.");
            rateLimitedDelayTime = 1000;
          } else {
            this.ctx.logger.warn(
              `API Rate Limited, waiting to retry for ${rateLimitedDelayTime} (attempt ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES})`
            );
          }
          this.ctx.setStatusBarText(`Readwise: API Rate Limited, waiting ${rateLimitedDelayTime}`);

          await new Promise((resolve) => window.setTimeout(resolve, rateLimitedDelayTime));
          this.ctx.logger.debug(
            `Trying to fetch highlights again... (attempt ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES})`
          );
          this.ctx.setStatusBarText('Readwise: Attempting to retry...');
        } else {
          const pageResults = pageData.results;
          if (Array.isArray(pageResults)) {
            const exports = pageResults.filter((item): item is Export => this.isExportRecord(item));
            results.push(...exports);
          } else {
            this.ctx.logger.warn('No results found in the response data.');
          }
          const rawNextPageCursor = pageData.nextPageCursor;
          nextPageCursor = typeof rawNextPageCursor === 'string' ? rawNextPageCursor : '';
          if (!nextPageCursor) {
            break;
          }
          this.ctx.logger.debug(`There are more records left, proceeding to next page: ${nextPageCursor}`);
        }
      }
    } finally {
      this.ctx.logger.groupEnd();
    }

    if (results.length > 0)
      this.ctx.logger.debug(`Processed ${results.length} total ${contentType} results successfully`);
    return results;
  }

  /**
   * Builds a library object from the fetched data
   * @param results - The fetched data from the Readwise API
   * @returns {Promise<Library>} - Returns a promise that resolves to a Library object
   */
  async buildLibrary(results: Export[]): Promise<Library> {
    const library: Library = {
      categories: new Set(),
      books: {},
      highlightCount: 0,
    };

    // Sort results by user_book_id ascending
    const sortedResults = [...results].sort((a, b) => a.user_book_id - b.user_book_id);

    for (const record of sortedResults) {
      library.books[record.user_book_id] = record;
      library.categories.add(record.category);
      library.highlightCount += record.highlights.length;
    }

    return library;
  }

  /**
   * Fetches all highlights from Readwise API
   * @returns {Promise<Library>} - Returns a promise that resolves to a Library object
   */
  async downloadFullLibrary(): Promise<Library> {
    const records = await this.fetchData('export', undefined, undefined, true);

    return this.buildLibrary(records);
  }

  /**
   * Fetches updates from Readwise API
   * @param lastUpdated - The date to fetch updates from
   * @returns {Promise<Library>} - Returns a promise that resolves to a Library object
   */
  async downloadUpdates(lastUpdated: string): Promise<Library> {
    // Fetch updated books and then fetch all their highlights
    const recordsUpdated = await this.fetchData('export', lastUpdated, undefined, true);
    const bookIds = recordsUpdated.map((r) => r.user_book_id);

    this.ctx.logger.debug(`Fetched ids of ${bookIds.length} updated books...`);

    if (bookIds.length > 0) {
      return await this.downloadMultipleBooks(bookIds);
    }
    // Essentially return an empty library
    return this.buildLibrary(recordsUpdated);
  }

  /**
   * Fetches multiple books from Readwise API (in chunks, sequentially)
   * @param bookIds - Array of book IDs to fetch
   * @returns {Promise<Library>} - Returns a promise that resolves to a Library object containing the fetched books
   */
  async downloadMultipleBooks(bookIds: number[]): Promise<Library> {
    // Fetch multiple books in chunks sequentially to avoid freezing
    const CHUNK = 100;
    let merged: Export[] = [];

    for (let i = 0; i < bookIds.length; i += CHUNK) {
      const chunk = bookIds.slice(i, i + CHUNK);
      const page = await this.fetchData('export', undefined, chunk, true);
      merged = merged.concat(page);
    }

    return this.buildLibrary(merged);
  }

  /**
   * Fetches single book from Readwise API
   * @param bookId - The ID of the book to fetch
   * @returns {Promise<Library>} - Returns a promise that resolves to a Library object
   */
  async downloadSingleBook(bookId: number): Promise<Library> {
    // Fetch single book and return library
    const recordsUpdated = await this.fetchData('export', undefined, [bookId], true);
    return this.buildLibrary(recordsUpdated);
  }
}
