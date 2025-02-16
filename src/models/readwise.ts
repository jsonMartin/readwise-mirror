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

/**
 * ReadwiseItem is the metadata of a book from the Readwise API, 
 * formatted for use in the nunjucks templates.
 * 
 * @see https://readwise.io/api/docs/highlights
 */
export interface ReadwiseItem {
  id: number; // book id from Readwise API
  title: string;
  sanitized_title: string;
  author: string[];
  authorStr: string;
  document_note: string;
  summary: string;
  category: string;
  num_highlights: number;
  created: string;
  updated: string;
  cover_image_url: string;
  highlights_url: string; // Readwise URL for the highlights page (unique across readwise)
  highlights: Highlight[];
  last_highlight_at: string;
  source_url: string;
  unique_url: string;
  tags: string;
  highlight_tags: string;
  tags_nohash: string;
  hl_tags_nohash: string;
}

export interface MetadataInput {
  title: string;
  author: string | string[];
  source_url: string;
}

export interface AuthorParserOptions {
  removeTitles?: boolean;
  normalizeCase?: boolean;
}
