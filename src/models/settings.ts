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
}
