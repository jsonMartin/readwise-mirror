import type { Export, Library } from 'types';
import type Notify from 'ui/notify';


const API_ENDPOINT = 'https://readwise.io/api/v2';
const API_PAGE_SIZE = 1000; // number of results per page, default 100 / max 1000

export class TokenValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenValidationError';
  }
}

export default class ReadwiseApi {
  private apiToken: string;
  private notify: Notify;
  private validToken: boolean = undefined;

  constructor(apiToken: string, notify: Notify) {
    if (!apiToken) {
      throw new Error('API Token Required!');
    }

    this.setToken(apiToken);
    this.notify = notify;
    this.validateToken().then((isValid) => {
      this.validToken = isValid;
    });
  }

  setToken(apiToken: string) {
    this.apiToken = apiToken;
    this.validToken = undefined;
  }

  get options() {
    return {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${this.apiToken}`,
      },
      signal: AbortSignal.timeout(5000),
    };
  }

  async hasValidToken(): Promise<boolean> {
    if (this.validToken === undefined) {
      this.validateToken().then((value) => {
        this.validToken = value;
        return value;
      });
    }
    return this.validToken;
  }

  async validateToken(): Promise<boolean> {
    try {
      const response = await fetch(`${API_ENDPOINT}/auth`, this.options);
  
      return response.status === 204;
  
    } catch (error) {
      throw new TokenValidationError(
        `Token validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // If lastUpdated or bookID aren't provided, fetch everything.
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

      if (lastUpdated) console.info(`Readwise: Checking for new content since ${lastUpdated}`);
      if (bookId) console.debug(`Readwise: Checking for all highlights on book ID: ${bookId}`);
      let statusBarText = `Readwise: Fetching ${contentType}`;
      if (data?.count) statusBarText += ` (${results.length})`;
      this.notify.setStatusBarText(statusBarText);

      const response = await fetch(url + queryParams.toString(), this.options);
      data = await response.json();

      if (!response.ok && response.status !== 429) {
        console.error(`Readwise: Failed to fetch data. Status: ${response.status} - ${response.statusText}`);
        throw new Error(`Failed to fetch data. Status: ${response.status}`);
      }

      if (response.status === 429) {
        // Error handling for rate limit throttling
        let rateLimitedDelayTime = Number.parseInt(response.headers.get('Retry-After')) * 1000 + 1000;
        if (Number.isNaN(rateLimitedDelayTime)) {
          // Default to a 1-second delay if 'Retry-After' is missing or invalid
          console.warn("Readwise: 'Retry-After' header is missing or invalid. Defaulting to 1 second delay.");
          rateLimitedDelayTime = 1000;
        } else {
          console.warn(`Readwise: API Rate Limited, waiting to retry for ${rateLimitedDelayTime}`);
        }
        this.notify.setStatusBarText(`Readwise: API Rate Limited, waiting ${rateLimitedDelayTime}`);

        await new Promise((_) => setTimeout(_, rateLimitedDelayTime));
        console.info('Readwise: Trying to fetch highlights again...');
        this.notify.setStatusBarText("Readwise: Attempting to retry...");
      } else {
        if (data.results && Array.isArray(data.results)) {
          results.push(...data.results);
        } else {
          console.warn('Readwise: No results found in the response data.');
        }
        nextPageCursor = data.nextPageCursor as string;
        if (!nextPageCursor) {
          break;
        }
        console.debug(`Readwise: There are more records left, proceeding to next page: ${data.nextPageCursor}`);
      }
    }

    if (results.length > 0)
      console.info(`Readwise: Processed ${results.length} total ${contentType} results successfully`);
    return results;
  }

  async buildLibrary(results: Export[]): Promise<Library> {
    const library: Library = {
      categories: new Set(),
      books: {},
      highlightCount: 0,
    };

    for (const record of results) {
      library.books[record.user_book_id] = record;
      library.categories.add(record.category);
      library.highlightCount += record.highlights.length;
    }

    return library;
  }
  async downloadFullLibrary(): Promise<Library> {
    const records = (await this.fetchData('export')) as Export[];

    return this.buildLibrary(records);
  }

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
