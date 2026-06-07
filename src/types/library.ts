export interface Export {
  user_book_id: number;
  is_deleted: boolean;
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
  is_deleted: boolean;
  text: string;
  note: string;
  location: number;
  location_type: string;
  highlighted_at: string;
  created_at: string;
  updated_at: string;
  url: string | null;
  readwise_url: string;
  color: string;
  book_id: number;
  tags: Tag[];
  is_favorite: boolean;
  is_discard: boolean;
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
