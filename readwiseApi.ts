import Notify from 'notify';

const API_ENDPOINT = 'https://readwise.io/api/v2';
const API_PAGE_SIZE = 1000; // number of results per page, default 100 / max 1000

export interface BooksAndHighlights {
  books: Book[];
  highlights: Highlight[];
}

export interface Highlight {
  id: number;
  text: string;
  note: string;
  location: number;
  location_type: string;
  highlighted_at: string;
  url: string | null;
  color: string;
  updated: string;
  book_id: number;
  tags: Tag[];
}

export interface Tag {
  id: number;
  name: string;
}

export interface Book {
  id: number;
  title: string;
  author: string;
  category: string;
  num_highlights: number;
  last_highlight_at: string;
  updated: string;
  cover_image_url: string;
  highlights_url: string;
  source_url: string | null;
  asin: string;
  highlights: Highlight[];
  tags: Tag[];
}

export interface Books {
  [key: string]: Book;
}

export interface Library {
  categories: Set<String>;
  books: Books;
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
  async fetchData(contentType = 'highlights', lastUpdated?: string, bookId?: Number): Promise<Highlight[] | Book[]> {
    let url = `${API_ENDPOINT}/${contentType}?page_size=${API_PAGE_SIZE}`;
    if (lastUpdated) url += `&updated__gt=${lastUpdated}`;
    if (bookId) url += `&book_id=${bookId}`;

    let data;

    const results = [];

    do {
      console.info(`Readwise: Fetching ${contentType}`);
      if (lastUpdated) console.info(`Readwise: Checking for new content since ${lastUpdated}`);
      if (bookId) console.info(`Readwise: Checking for all highlights on book ID: ${bookId}`);

      let statusBarText = `Readwise: Fetching ${contentType}`;
      if (data && data['count']) statusBarText += ` (${results.length} / ${data.count})`;
      this.notify.setStatusBarText(statusBarText);

      const response = await fetch(url, this.headers);
      data = await response.json();

      if (response.status === 429) {
        // Error handling for rate limit throttling
        // b/c of limitations with cross-origin requests, we don't have (easy) access to the header
        // We must therefore extract the seconds from the statusText:
        // "Request was throttled. Expected available in 39 seconds."

        let rateLimitedDelayTime: number = 4000; // Base throttling, 20 requests per minute are the maximum allowable

        if (data.detail) {
          console.log(`Readwise: ${data.detail}`);
          const rate = data.detail.match(/available\sin\s([0-9]+)\sseconds/);
          if (rate) {
            rateLimitedDelayTime = parseInt(rate[1]) * 1000 + 1000;
          }
        }

        console.warn(`Readwise: API Rate Limited, waiting to retry for ${rateLimitedDelayTime}`);
        this.notify.setStatusBarText(`Readwise: API Rate Limited, waiting ${rateLimitedDelayTime}`);
        await new Promise((_) => setTimeout(_, rateLimitedDelayTime));
        console.info('Readwise: Trying to fetch highlights again...');
        this.notify.setStatusBarText(`Readwise: Attempting to retry...`);
        data.next = url;
      } else {
        results.push(...data.results);

        if (data.next) {
          const remainingRecords = data.count - results.length;
          console.info(
            `Readwise: There are ${remainingRecords} more records left, proceeding to next page:` + data.next
          );
          url = `${data.next}`;
        }
      }
    } while (data.next);

    if (results.length > 0)
      console.info(`Readwise: Processed ${results.length} total ${contentType} results successfully`);
    return results;
  }

  async fetchUpdatedContent(lastUpdated: string): Promise<BooksAndHighlights> {
    if (!lastUpdated) throw new Error('Date required to fetch updates');

    const updatedHighlights = [];
    const updatedBooks = (await this.fetchData('books', lastUpdated)) as Book[];

    // Iterate through Newly Updated Books, fetching all of their highlights
    for (let bookId of updatedBooks.map((book: Book) => book.id)) {
      const highlights = (await this.fetchData('highlights', null, bookId)) as Highlight[];
      updatedHighlights.push(...highlights);
    }

    return {
      books: updatedBooks as Book[],
      highlights: updatedHighlights as Highlight[],
    };
  }

  async fetchAllHighlightsAndBooks(): Promise<BooksAndHighlights> {
    const books = (await this.fetchData('books')) as Book[];
    const highlights = (await this.fetchData('highlights')) as Highlight[];

    return {
      books,
      highlights,
    };
  }

  async mergeHighlightsWithBooks(books: Book[], highlights: Highlight[]): Promise<Library> {
    const library: Library = {
      categories: new Set(),
      books: {},
      highlightCount: highlights.length,
    };

    for (const book of books) {
      book['highlights'] = [];
      library['books'][book['id']] = book;
      library['categories'].add(book.category);
    }

    for (const highlight of highlights) {
      library['books'][highlight['book_id']]['highlights'].push(highlight);
    }

    return library;
  }

  async downloadFullLibrary(): Promise<Library> {
    const { books, highlights } = await this.fetchAllHighlightsAndBooks();
    return await this.mergeHighlightsWithBooks(books, highlights);
  }

  async downloadUpdates(lastUpdated: string): Promise<Library> {
    const { highlights, books } = await this.fetchUpdatedContent(lastUpdated);
    return await this.mergeHighlightsWithBooks(books, highlights);
  }
}
