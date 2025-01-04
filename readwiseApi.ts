import Notify from 'notify';

const API_ENDPOINT = 'https://readwise.io/api/v2';
const API_PAGE_SIZE = 1000; // number of results per page, default 100 / max 1000

export interface Export {
  user_book_id: number;
  title: string;
  author: string;
  readable_title: string;
  source: string;
  cover_image_url: string;
  unique_url: string;
  book_tags: Tag[];
  category: string;
  document_note: string;
  summary: string;
  readwise_url: string;
  source_url: string;
  asin: string | null;
  highlights: Highlight[];
}

export interface Highlight {
  id: number;
  text: string;
  note: string;
  location: number;
  location_type: string;
  highlighted_at: string;
  created_at: string;
  updated_at: string;
  url: string | null;
  color: string;
  book_id: number;
  tags: Tag[];
}

export interface Tag {
  id: number;
  name: string;
}

export interface Exports {
  [key: string]: Export;
}

export interface Library {
  categories: Set<string>;
  books: Exports;
  highlightCount: number;
}

export class ReadwiseApi {
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

      if (response.status === 429) {
        // Error handling for rate limit throttling
        const rateLimitedDelayTime = parseInt(response.headers.get('Retry-After')) * 1000 + 1000;
        console.warn(`Readwise: API Rate Limited, waiting to retry for ${rateLimitedDelayTime}`);
        this.notify.setStatusBarText(`Readwise: API Rate Limited, waiting ${rateLimitedDelayTime}`);

        await new Promise((_) => setTimeout(_, rateLimitedDelayTime));
        console.info('Readwise: Trying to fetch highlights again...');
        this.notify.setStatusBarText(`Readwise: Attempting to retry...`);
      } else {
        results.push(...data.results);
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
