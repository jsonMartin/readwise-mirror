import md5 from 'md5'; // Fix imports
import { type App, type TFile, type Vault, normalizePath } from 'obsidian';
import type { FrontmatterManager } from 'services/frontmatter-manager';
import type Logger from 'services/logger';
import type { ReadwiseFile, PluginSettings, ReadwiseDocument } from 'types';
import type Notify from 'ui/notify';

export class DeduplicatingVaultWriter {
  readonly vault: Vault;
  private totalFileCount = 0;
  private fileCount = 0;

  constructor(
    private app: App,
    private settings: PluginSettings,
    private frontmatterManager: FrontmatterManager,
    private logger: Logger,
    private notify: Notify
  ) {
    this.vault = app.vault;
  }

  private notifyFileCount() {
    this.fileCount++;
    this.notify.setStatusBarText(`Readwise: ${this.fileCount} of ${this.totalFileCount} files processed`);
  }

  /**
   * Creates a normalized path for any vault path
   * @param segments - Path segments to join
   * @returns Normalized path string
   */
  private getNormalizedPath(...segments: string[]): string {
    return normalizePath(segments.join('/'));
  }

  /**
   * Creates category folders in the vault
   *
   * @param categories - The categories to create folders for
   */
  public async createCategoryFolders(categories: Set<string>) {
    for (const category of categories) {
      const path = this.getCategoryPath(category);
      const abstractFolder = this.vault.getAbstractFileByPath(path);

      if (!abstractFolder) {
        await this.vault.createFolder(path);
        this.logger.info('Successfully created folder', path);
      }
    }
  }

  /**
   * Finds files in the vault with matching highlights_url
   *
   * @param doc The readwise document to find matches for
   * @returns An array of matching files
   */
  private async findExistingByHighlightsUrl(doc: ReadwiseDocument): Promise<TFile[]> {
    if (!this.settings.trackFiles || !this.settings.trackingProperty || !doc.highlights_url) {
      return []; // No tracking or no highlights_url
    }

    // Get all files in the vault
    const files = this.vault.getMarkdownFiles();

    // Filter files by the tracking property
    return files.filter((file) => {
      const metadata = this.app.metadataCache.getFileCache(file);
      return metadata?.frontmatter?.[this.settings.trackingProperty] === doc.highlights_url;
    });
  }

  /**
   * Generates a short hash based on the metadata ID
   *
   * @param doc - The readwise document to generate a hash for
   * @returns A short hash
   */
  private generateShortHash(doc: ReadwiseDocument): string {
    return md5('sha256').substring(0, 4); 
  }

  /**
   * Gets the category path for a given category
   *
   * @param category - The category to get the path for
   * @returns The normalized category path
   */
  public getCategoryPath(category: string): string {
    const formattedCategory = category.charAt(0).toUpperCase() + category.slice(1);
    return this.getNormalizedPath(this.settings.baseFolderName, formattedCategory);
  }

  /**
   * Updates an existing file with new contents and frontmatter
   *
   * @param file - The file to update
   * @param readwiseFile - The readwise file containing doc and contents
   */
  private async updateExistingFile(
    file: TFile,
    readwiseFile: ReadwiseFile,
  ): Promise<void> {
    
    this.notifyFileCount();

    const frontmatter = this.frontmatterManager.renderFrontmatter(readwiseFile.doc);
    try {
      if (this.settings.updateFrontmatter) {
        const updatedFrontmatter = await this.frontmatterManager.getUpdatedFrontmatter(file, frontmatter);
        this.logger.debug(`Updating file ${file.path} with new frontmatter`, updatedFrontmatter);
        await this.vault.process(file, () => `${updatedFrontmatter.toString()}${readwiseFile.contents}`);
      } else {
        this.logger.debug(`Not updating frontmatter for file ${file.path}`, frontmatter);
        await this.vault.process(file, () => `${frontmatter.toString()}${readwiseFile.contents}`);
      }

      if (readwiseFile.basename !== file.basename) {
        let newPath = this.getNormalizedPath(file.parent.path, `${readwiseFile.basename}.md`);
        const newFileExists = await this.app.vault.adapter.exists(newPath, false);
        if (newFileExists) {
          // Add hash to filename if there's a collision
          const hash = this.generateShortHash(readwiseFile.doc);
          newPath = this.getNormalizedPath(file.parent.path, `${readwiseFile.basename} ${hash}.md`);
        }

        if (newPath !== file.path) {
          this.logger.debug(`Renamed file from ${file.path} to ${newPath}`);
          await this.vault.rename(file, newPath);
        }
      }
    } catch (err) {
      this.logger.error(`Readwise: Attempt to update file ${file.path} failed`, err);
      throw err;
    }
  }

  /**
   * Marks a file as a duplicate in its frontmatter or deletes it
   *
   * @param file - The duplicate file to handle
   * @param readwiseFile - The readwise file containing doc metadata
   */
  private async handleDuplicate(file: TFile, readwiseFile: ReadwiseFile): Promise<void> {

    this.notifyFileCount();

    const frontmatter = this.frontmatterManager.renderFrontmatter(readwiseFile.doc);
    try {
      if (this.settings.deleteDuplicates) {
        this.logger.debug(`Trashing duplicate ${file.path}`);
        await this.vault.trash(file, true);
      } else {
        frontmatter.set('duplicate', true);
        this.logger.debug(`Marking file ${file.path} as duplicate`, frontmatter);
        await this.frontmatterManager.writeUpdatedFrontmatter(file, frontmatter);
      }
    } catch (err) {
      this.logger.error(`Failed to handle duplicate ${file.path}`, err);
      throw err;
    }
  }

  public async process(readwiseFiles: ReadwiseFile[]): Promise<void> {
    
    // Reset the file count
    this.totalFileCount = readwiseFiles.length;
    this.fileCount = 0;
    
    this.notify.setStatusBarText(`Readwise: ${this.totalFileCount} files to process`);

    // First, compute paths for all files
    const filesWithPaths: ReadwiseFile[] = readwiseFiles.map((file) => ({
      ...file,
      path: this.getNormalizedPath(this.getCategoryPath(file.doc.category), `${file.basename}.md`),
    }));
    // Group by path (which includes category and filename)
    const groupedByPath = new Map<string, ReadwiseFile[]>();

    for (const file of filesWithPaths) {
      // Use lowercase path for comparison as filesystems are (potentially) case-insensitive
      if (!groupedByPath.has(file.path.toLowerCase())) {
        groupedByPath.set(file.path.toLowerCase(), []);
      }
      groupedByPath.get(file.path.toLowerCase()).push(file);
    }

    // Process each path group (i.e. files with the same category and filename)
    for (const [path, groupFiles] of groupedByPath) {
      this.logger.debug('Processing path group', { path, groupFiles });

      // Process the files in the path group
      await this.writePathGroup(groupFiles);
    }
  }

  /**
   * Processes a path group of files, deduplicates and writes them to the vault
   * @param readwiseFiles - The files to process
   */
  private async writePathGroup(readwiseFiles: ReadwiseFile[]): Promise<void> {
    // First, check if files are tracked (and have highlights_url), sort by doc id
    /*
     * Process tracked files by filename
     * Files that share the same filename are duplicates,
     * those with the tracking property will be treated first
     */
    if (this.settings.trackFiles && this.settings.trackingProperty) {
      // Update or create primary file based on highlights_url
      for (const file of readwiseFiles) {
        await this.processTrackedFile(file);        
      }
    } else {
      // All files are untracked - append hash to all but the first, 
      this.logger.debug('Files are untracked - appending hash to all but the first', { files: readwiseFiles });
      const [primary, ...duplicates] = readwiseFiles;
      await this.writeFile(primary, true);

      for (const duplicate of duplicates) {
        await this.writeFile(duplicate);
      }
    }
  }

  /**
   * Processes a tracked file, updating or creating it in the vault
   * @param trackedPrimary - The primary file to process
   */
  private async processTrackedFile(trackedPrimary: ReadwiseFile) {
    const existingFiles = await this.findExistingByHighlightsUrl(trackedPrimary.doc);
    if (existingFiles.length > 0) {
      const [primary, ...duplicates] = existingFiles;

      // TODO: Add an option to the plugin to link remote duplicates to the primary file
      await this.updateExistingFile(primary, trackedPrimary);

      for (const duplicate of duplicates) {
        this.logger.warn('Existing duplicate file found', { duplicate });
        await this.handleDuplicate(duplicate, trackedPrimary);
      }

    } else {
      // If the file already exists, create a new file with a hash
      if (await this.app.vault.adapter.exists(trackedPrimary.path, false)) {
        await this.writeFile(trackedPrimary);
      } else {
        await this.writeFile(trackedPrimary, true);
      }
    }
  }

  /**
   * Writes a file to the vault with frontmatter and contents
   * @param readwiseFile - The readwise file to write
   * @param overwrite - Whether to overwrite an existing file or create with hash
   * @returns The created or updated file
   */
  private async writeFile(
    readwiseFile: ReadwiseFile,
    overwrite?: boolean
  ): Promise<TFile> {
    /**
     * This method looks quite convoluted and complex, which is due to the fact that
     * the vault methods to get files are case-sensitive, but the filesystem is probably not.
     *
     * This means that we need to check if the file exists in the vault (case insensitive)
     * via the DataAdapter, and if it does, we need to check if it's the same file as the one
     * we're trying to write.
     */
    const path = this.getNormalizedPath(this.getCategoryPath(readwiseFile.doc.category), `${readwiseFile.basename}.md`);

    this.notifyFileCount();

    try {
      const frontmatter = this.frontmatterManager.renderFrontmatter(readwiseFile.doc);
      const fileContents = `${frontmatter.toString()}${readwiseFile.contents}`;
      const fileOptions = {
        ctime: new Date(readwiseFile.doc.created).getTime(),
        mtime: new Date(readwiseFile.doc.updated).getTime(),
      };

      const fileExists = await this.app.vault.adapter.exists(path, false);
      if (fileExists) {
        if (overwrite) {
          const existingFile = await this.vault.getFileByPath(path);
          this.logger.debug('Overwriting existing file', { doc: readwiseFile.doc, ...fileOptions });
          await this.vault.process(existingFile, () => fileContents, fileOptions);
          return existingFile;
        }
        // Create new path with hash
        const hash = this.generateShortHash(readwiseFile.doc);
        const newPath = this.getNormalizedPath(this.getCategoryPath(readwiseFile.doc.category), `${readwiseFile.basename} ${hash}.md`);
        const newFileExists = await this.app.vault.adapter.exists(newPath, false);
        if (newFileExists) {
          const existingNewFile = await this.vault.getFileByPath(newPath);
          this.logger.debug('Overwriting existing file (with hash)', { doc: readwiseFile.doc, ...fileOptions });
          await this.vault.process(existingNewFile, () => fileContents, fileOptions);
          return existingNewFile;
        }
        this.logger.debug('Creating new file (with hash)', { doc: readwiseFile.doc, ...fileOptions });
        return await this.vault.create(newPath, fileContents, fileOptions);
      }

      // If the file doesn't exist, create it
      this.logger.debug('Creating new file', { doc: readwiseFile.doc, ...fileOptions });
      return await this.vault.create(path, fileContents, fileOptions);
    } catch (err) {
      this.logger.error(`Failed to create file '${path}'`, err);
      throw new Error(`Failed to create file '${path}'. ${err}`);
    }
  }
}
