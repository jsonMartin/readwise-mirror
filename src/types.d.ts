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
 * Represents a file that is pending to be written to the vault.
 * 
 * @property filename - The name of the file to write
 * @property doc - The Readwise document metadata
 * @property contents - The contents of the file to write
 * @property path - The full path including category
 */
export interface ReadwiseFile {
  filename: string;
  path?: string; // The full path including category
  doc: ReadwiseDocument;
  contents: string; // Rendered contents of the file
}
/**
 *  is the metadata of a book from the Readwise API, 
 * formatted for use in the nunjucks templates.
 * 
 * @see https://readwise.io/api/docs/highlights
 */
export interface ReadwiseDocument {
  id: number; // book id from Readwise API
  highlights_url: string; // Readwise URL for the highlights page (unique across readwise)
  unique_url: string; // Readwise URL for the book page (unique across readwise)
  source_url: string; // URL of the book on the source website
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
  highlights: Highlight[];
  last_highlight_at: string;
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

export interface PluginSettings {
  baseFolderName: string;      // Base folder where synced notes will be stored
  apiToken: string | null;     // Readwise API authentication token
  lastUpdated: string | null;  // Timestamp of last successful sync
  autoSync: boolean;           // Whether to automatically sync on startup
  highlightSortOldestToNewest: boolean;  // Sort highlights chronologically from oldest to newest
  highlightSortByLocation: boolean;       // Sort highlights by their location in the document
  highlightDiscard: boolean;              // Filter out discarded highlights
  syncNotesOnly: boolean;      // Only sync highlights that have notes attached
  colonSubstitute: string;     // String to replace colons in filenames
  logFile: boolean;            // Whether to save sync logs to a file
  logFileName: string;         // Name of the sync log file
  frontMatter: boolean;        // Whether to include YAML frontmatter in notes
  frontMatterTemplate: string; // Template for YAML frontmatter content
  headerTemplate: string;      // Template for document header content
  highlightTemplate: string;   // Template for individual highlights
  useSlugify: boolean;         // Whether to slugify filenames
  slugifySeparator: string;    // Character to use as separator in slugified names
  slugifyLowercase: boolean;   // Convert slugified names to lowercase
  trackFiles: boolean;         // Track files using unique Readwise URLs
  trackingProperty: string;    // Frontmatter property for storing tracking URL
  deleteDuplicates: boolean;   // Remove duplicate files instead of marking them
  protectFrontmatter: boolean; // Protect specified frontmatter fields from updates
  protectedFields: string;     // List of frontmatter fields to protect
  updateFrontmatter: boolean;  // Allow updating of non-protected frontmatter fields
  syncPropertiesToReadwise: boolean;  // Sync title/author changes back to Readwise
  titleProperty: string;       // Frontmatter property for syncing title
  authorProperty: string;      // Frontmatter property for syncing author
  normalizeAuthorNames: boolean; // Normalize author names
  stripTitlesFromAuthors: boolean; // Strip titles from author names
  debugMode: boolean;
}

export interface YamlStringState {
	hasSingleQuotes: boolean;
	hasDoubleQuotes: boolean;
	isValueEscapedAlready: boolean;
}

export interface TemplateValidationResult {
	isValid: boolean;
	error?: string;
	preview?: string;
}
