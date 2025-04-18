import { requestUrl, type RequestUrlResponse } from 'obsidian';
import type { Export, Library } from 'types';
import type Notify from 'ui/notify';
import type Logger from 'services/logger';

const API_ENDPOINT = 'https://readwise.io/api/v2';
const API_PAGE_SIZE = 1000; // number of results per page, default 100 / max 1000

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
  private apiToken: string;
  private validToken: boolean | undefined;
  private notify: Notify;
  private logger: Logger;

  constructor(apiToken: string, notify: Notify, logger: Logger) {
    this.apiToken = apiToken;
    this.notify = notify;
    this.logger = logger;
    this.validateToken().then((isValid) => {
      this.validToken = isValid;
    });

    if (!apiToken) {
      throw new Error('API Token Required!');
    }
  }

  /**
   * Sets the API token for the Readwise API instance
   * @param apiToken - The API token to set
   */
  setToken(apiToken: string) {
    this.apiToken = apiToken;
    this.validateToken().then((isValid) => {
      this.validToken = isValid;
    }).catch((e) => {
      this.logger.error(`Failed to set token: ${e.message}`);
      this.validToken = false;
    });
  }

  /**
   * Returns the options object for the Readwise API instance
   * @returns {Record<string, unknown>} - Returns an object containing the headers for the API request
   */
  get options() {
    return {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${this.apiToken}`,
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

      this.validToken = (response.status === 204);
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
  async fetchData(contentType = 'export', lastUpdated?: string, bookId?: number[]): Promise<Export[]> {
    const url = `${API_ENDPOINT}/${contentType}?`;
    let data: Record<string, unknown>;
    let nextPageCursor: string;

    const results = [];

    while (true) {
      const queryParams = new URLSearchParams();
      queryParams.append('page_size', API_PAGE_SIZE.toString());
      if (lastUpdated && lastUpdated !== '') {
        queryParams.append('updatedAfter', lastUpdated);
      }
      if (bookId) {
        queryParams.append('ids', bookId.toString());
      }
      if (nextPageCursor) {
        queryParams.append('pageCursor', nextPageCursor);
      }

      if (lastUpdated) this.logger.info(`Checking for new content since ${lastUpdated}`);
      if (bookId) this.logger.debug(`Checking for all highlights on book ID: ${bookId}`);
      let statusBarText = `Readwise: Fetching ${contentType}`;
      if (data?.count) statusBarText += ` (${results.length})`;
      this.notify.setStatusBarText(statusBarText);

      // FIXME: When fetching very long period of data, the request might fail due to an URL which is too long (Error 414)
      const response: RequestUrlResponse = await requestUrl({ url: url + queryParams.toString(), ...this.options });
      data = response.json;

      if (!response && response.status !== 429) {
        this.logger.error(`Failed to fetch data. Status: ${response.status}`);
        throw new Error(`Failed to fetch data. Status: ${response.status}`);
      }

      if (response.status === 429) {
        // Error handling for rate limit throttling
        let rateLimitedDelayTime = Number.parseInt(response.headers['Retry-After']) * 1000 + 1000;
        if (Number.isNaN(rateLimitedDelayTime)) {
          // Default to a 1-second delay if 'Retry-After' is missing or invalid
          this.logger.warn("'Retry-After' header is missing or invalid. Defaulting to 1 second delay.");
          rateLimitedDelayTime = 1000;
        } else {
          this.logger.warn(`API Rate Limited, waiting to retry for ${rateLimitedDelayTime}`);
        }
        this.notify.setStatusBarText(`Readwise: API Rate Limited, waiting ${rateLimitedDelayTime}`);

        await new Promise((_) => setTimeout(_, rateLimitedDelayTime));
        this.logger.info('Trying to fetch highlights again...');
        this.notify.setStatusBarText('Readwise: Attempting to retry...');
      } else {
        if (data.results && Array.isArray(data.results)) {
          results.push(...data.results);
        } else {
          this.logger.warn('No results found in the response data.');
        }
        nextPageCursor = data.nextPageCursor as string;
        if (!nextPageCursor) {
          break;
        }
        this.logger.debug(`There are more records left, proceeding to next page: ${data.nextPageCursor}`);
      }
    }

    if (results.length > 0) this.logger.info(`Processed ${results.length} total ${contentType} results successfully`);
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
    const records = (await this.fetchData('export')) as Export[];

    return this.buildLibrary(records);
  }

  /**
   * Fetches updates from Readwise API
   * @param lastUpdated - The date to fetch updates from
   * @returns {Promise<Library>} - Returns a promise that resolves to a Library object
   */
  async downloadUpdates(lastUpdated: string): Promise<Library> {
    // Fetch updated books and then fetch all their highlights
    const recordsUpdated = (await this.fetchData('export', lastUpdated)) as Export[];
    const bookIds = recordsUpdated.map((r) => r.user_book_id);

    if (bookIds.length > 0) {
      // Build a library which contains *all* highlights only for changed books
      const records = (await this.fetchData('export', '', bookIds)) as Export[];
      return this.buildLibrary(records);
    }
    // Essentially return an empty library
    return this.buildLibrary(recordsUpdated);
  }
}
