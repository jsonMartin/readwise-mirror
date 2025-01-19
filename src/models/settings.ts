export interface PluginSettings {
  baseFolderName: string;
  apiToken: string | null;
  lastUpdated: string | null;
  autoSync: boolean;
  highlightSortOldestToNewest: boolean;
  highlightSortByLocation: boolean;
  highlightDiscard: boolean;
  syncNotesOnly: boolean;
  colonSubstitute: string;
  logFile: boolean;
  logFileName: string;
  frontMatter: boolean;
  frontMatterTemplate: string;
  headerTemplate: string;
  highlightTemplate: string;
  useSlugify: boolean;
  slugifySeparator: string;
  slugifyLowercase: boolean;
  deduplicateFiles: boolean;
  deduplicateProperty: string;
  deleteDuplicates: boolean;
  protectFrontmatter: boolean;
  protectedFields: string;
  updateFrontmatter: boolean;
}
