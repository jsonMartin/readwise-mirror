import { Export, Library } from 'models/readwise';
import Notify from 'ui/notify';

const API_ENDPOINT = 'https://readwise.io/api/v2';
const API_PAGE_SIZE = 1000; // number of results per page, default 100 / max 1000

export default class ReadwiseApi {
  private apiToken: string;
  private notify: Notify;

  constructor(apiToken: string, notify: Notify) {
    if (!apiToken) {
      throw new Error('API Token Required!');
    }

    this.setToken(apiToken);
    this.notify = notify;
  }

  setToken(apiToken: string) {
    this.apiToken = apiToken;
  }

  get headers() {
    return {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${this.apiToken}`,
      },
    };
  }

  async checkToken() {
    const results = await fetch(`${API_ENDPOINT}/auth`, this.headers);

    return results.status === 204; // Returns a 204 response if token is valid
  }

  // If lastUpdated or bookID aren't provided, fetch everything.
  async fetchData(contentType = 'export', lastUpdated?: string, bookId?: number[]): Promise<Export[]> {
    let url = `${API_ENDPOINT}/${contentType}?`;
    let data;
    let nextPageCursor;

    const results = [];

    while (true) {
      const queryParams = new URLSearchParams();
      queryParams.append('page_size', API_PAGE_SIZE.toString());
      if (lastUpdated && lastUpdated != '') {
        queryParams.append('updatedAfter', lastUpdated);
      }
      if (bookId) {
        queryParams.append('ids', bookId.toString());
      }
      if (nextPageCursor) {
        queryParams.append('pageCursor', nextPageCursor);
      }

      console.info(`Readwise: Fetching ${contentType}`);
      if (lastUpdated) console.info(`Readwise: Checking for new content since ${lastUpdated}`);
      if (bookId) console.debug(`Readwise: Checking for all highlights on book ID: ${bookId}`);
      let statusBarText = `Readwise: Fetching ${contentType}`;
      if (data?.count) statusBarText += ` (${results.length})`;
      this.notify.setStatusBarText(statusBarText);

      const response = await fetch(url + queryParams.toString(), this.headers);
      data = await response.json();

      if (!response.ok && response.status !== 429) {
        console.error(`Readwise: Failed to fetch data. Status: ${response.status} - ${response.statusText}`);
        throw new Error(`Failed to fetch data. Status: ${response.status}`);
      }

      if (response.status === 429) {
        // Error handling for rate limit throttling
        let rateLimitedDelayTime = parseInt(response.headers.get('Retry-After')) * 1000 + 1000;
        if (isNaN(rateLimitedDelayTime)) {
          // Default to a 1-second delay if 'Retry-After' is missing or invalid
          console.warn("Readwise: 'Retry-After' header is missing or invalid. Defaulting to 1 second delay.");
          rateLimitedDelayTime = 1000;
        } else {
          console.warn(`Readwise: API Rate Limited, waiting to retry for ${rateLimitedDelayTime}`);
        }
        this.notify.setStatusBarText(`Readwise: API Rate Limited, waiting ${rateLimitedDelayTime}`);

        await new Promise((_) => setTimeout(_, rateLimitedDelayTime));
        console.info('Readwise: Trying to fetch highlights again...');
        this.notify.setStatusBarText(`Readwise: Attempting to retry...`);
      } else {
        if (data.results && Array.isArray(data.results)) {
          results.push(...data.results);
        } else {
          console.warn('Readwise: No results found in the response data.');
        }
        nextPageCursor = data.nextPageCursor;
        if (!nextPageCursor) {
          break;
        } else {
          console.debug(`Readwise: There are more records left, proceeding to next page: ${data.nextPageCursor}`);
        }
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
      library['books'][record['user_book_id']] = record;
      library['categories'].add(record.category);
      library['highlightCount'] += record['highlights'].length;
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
    } else {
      // Essentially return an empty library
      return this.buildLibrary(recordsUpdated);
    }
  }
}
