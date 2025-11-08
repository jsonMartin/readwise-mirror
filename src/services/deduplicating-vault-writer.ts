import md5 from 'md5'; // Fix imports
import { type App, getFrontMatterInfo, normalizePath, TFile, type Vault } from 'obsidian';
import type { FrontmatterManager } from 'services/frontmatter-manager';
import type Logger from 'services/logger';
import type { AtomicFile, BaseFile, PluginSettings, ReadwiseDocument } from 'types';
import type Notify from 'ui/notify';
import { isInReadwiseLibrary, isTrackedReadwiseNote } from 'utils/tracking-utils';
import type { Frontmatter } from './frontmatter';

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
  public getNormalizedPath(...segments: string[]): string {
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
   * Finds files in the vault with matching readwise_url
   *
   * @param doc The readwise document to find matches for
   * @returns An array of matching files
   */
  public async findExistingByHighlightsUrl(doc: ReadwiseDocument): Promise<TFile[]> {
    if (!this.settings.trackFiles || !this.settings.trackingProperty || !doc.readwise_url) {
      return []; // No tracking or no readwise_url
    }

    // Get all files in the vault
    const files = this.vault.getMarkdownFiles();

    // Filter files by the tracking property
    return files.filter((file) => {
      const metadata = this.app.metadataCache.getFileCache(file);
      const isTracked = isTrackedReadwiseNote(file, this.app, this.settings);
      const isInLibrary = isInReadwiseLibrary(file, this.settings);

      // If trackAcrossVault is enabled, only check if it's a Readwise note.
      // Otherwise, check if it's a Readwise note AND in the Readwise library.
      const shouldKeep = this.settings.trackAcrossVault ? isTracked : isTracked && isInLibrary;

      if (!shouldKeep) {
        return false;
      }

      // Compare the tracking property value to the readwise_url
      return metadata?.frontmatter?.[this.settings.trackingProperty] === doc.readwise_url;
    });
  }

  /**
   * Generates a short hash based on the metadata ID
   *
   * @param doc - The readwise document to generate a hash for
   * @returns A short hash
   */
  public generateShortHash(doc: ReadwiseDocument): string {
    return md5(doc.id.toString()).substring(0, 4);
  }

  /**
   * Gets the category path for a given category
   *
   * @param file - The file to get the category for
   * @returns The normalized category path
   */
  public getCategoryPathFromFile(file: BaseFile | AtomicFile): string {
    const category = file.type === 'base' ? file.doc.category : 'Highlight';
    return this.getCategoryPath(category);
  }

  public getCategoryPath(category: string): string {
    const formattedCategory = category.charAt(0).toUpperCase() + category.slice(1);
    return this.getNormalizedPath(this.settings.baseFolderName, formattedCategory);
  }

  /**
   * Updates an existing file with new contents and frontmatter
   *
   * @param readwiseFile - The readwise file containing doc and contents
   */
  private async updateExistingFile(readwiseFile: BaseFile): Promise<void> {
    if (!(readwiseFile.primary instanceof TFile)) {
      this.logger.error('Primary file is not a TFile instance', { primary: readwiseFile.primary });
      throw new Error('Primary file is not a TFile instance. This should not happen');
    }

    const file: TFile = readwiseFile.primary;
    this.notifyFileCount();
    try {
      // Process frontmatter atomically
      await this.app.fileManager.processFrontMatter(file, (existingFrontmatter) => {
        // Only update frontmatter if frontmatter is enabled
        const hasFrontmatter = Object.keys(existingFrontmatter).length > 0;
        const updatedFrontmatter = this.frontmatterManager.getFrontmatter(readwiseFile, hasFrontmatter);

        // Clean up existing frontmatter if updateFrontmatter is disabled
        if (!this.settings.updateFrontmatter) {
          for (const key in existingFrontmatter) {
            delete existingFrontmatter[key];
          }
        }

        this.logger.debug(`Updating file ${file.path} with new frontmatter`, updatedFrontmatter);
        for (const [key, value] of updatedFrontmatter.entries()) {
          existingFrontmatter[key] = value;
        }
      });

      await this.fileWrite(file, readwiseFile.contents);
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
  private async handleDuplicate(file: TFile, readwiseFile: BaseFile): Promise<void> {
    this.notifyFileCount();

    const frontmatter = this.frontmatterManager.getFrontmatter(readwiseFile);
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

  /**
   * Processes an array of ReadwiseFile objects by normalizing their paths,
   * grouping them by their computed path (including category and filename),
   * and then processing each group to handle potential duplicates.
   *
   * @param readwiseFiles - An array of ReadwiseFile objects to be processed.
   * @returns A Promise that resolves when all file groups have been processed.
   */
  public async process(readwiseFiles: BaseFile[]): Promise<void> {
    // Reset the file count
    this.totalFileCount = readwiseFiles.length;
    this.fileCount = 0;

    this.notify.setStatusBarText(`Readwise: ${this.totalFileCount} files to process`);

    // Group by path (which includes category and filename)
    const groupedByPath = new Map<string, BaseFile[]>();

    for (const file of readwiseFiles) {
      let path: string;
      if (file.primary instanceof TFile) {
        // If we have a primary TFile, use its path for grouping
        path = file.primary.path;
      } else if (typeof file.primary === 'string') {
        // If we have a primary path string, use it for grouping
        path = file.primary;
      }
      // Use lowercase path for comparison as filesystems are (potentially) case-insensitive
      if (!groupedByPath.has(path.toLowerCase())) {
        groupedByPath.set(path.toLowerCase(), []);
      }
      groupedByPath.get(path.toLowerCase()).push(file);
    }

    // Process each path group (i.e. files with the same category and filename)
    for (const [path, groupFiles] of groupedByPath) {
      this.logger.debug('Processing path group', { path, groupFiles });

      // Process the files in the path group
      await this.writePathGroup(groupFiles);
    }
  }

  public async processFrontmatter(readwiseFiles: BaseFile[]): Promise<void> {
    this.logger.debug('Processing frontmatter for Readwise files', { readwiseFiles });

    // Reset the file count
    this.totalFileCount = readwiseFiles.length;
    this.fileCount = 0;

    this.notify.setStatusBarText(`Readwise: ${this.totalFileCount} files to process`);

    // Process each file
    for (const readwiseFile of readwiseFiles) {
      const files: TFile[] = await this.findExistingByHighlightsUrl(readwiseFile.doc);
      for (const file of files) {
        // Since we are only updating frontmatter, for existing files, we can use the Obsidian file manager for atomic frontmatter updates
        this.app.fileManager.processFrontMatter(file, (existingFrontmatter) => {
          const updates: Frontmatter = this.frontmatterManager.getFrontmatter(readwiseFile);
          const filteredFrontMatter = this.settings.protectFrontmatter
            ? this.frontmatterManager.filterProtectedFrontmatter(updates)
            : updates;
          Object.assign(existingFrontmatter, filteredFrontMatter.toObject());
        });
        this.notifyFileCount();
      }
    }
  }
  /**
   * Processes a path group of files, identified duplicates and writes
   * the files to the vault according to the tracking settings
   * @param readwiseFiles - The files to process
   */
  private async writePathGroup(readwiseFiles: BaseFile[]): Promise<void> {
    // First, check if files are tracked (and have readwise_url), sort by doc id
    /*
     * Process tracked files by filename
     * Files that share the same filename are duplicates,
     * those with the tracking property will be treated first
     */
    if (this.settings.trackFiles && this.settings.trackingProperty) {
      // Update or create primary file based on readwise_url
      for (const file of readwiseFiles) {
        await this.processTrackedFile(file);
      }
    } else {
      // All files are untracked - append hash to all but the first,
      this.logger.debug('Files are untracked - appending hash to all but the first', { files: readwiseFiles });
      const [primary, ...duplicates] = readwiseFiles;
      await this.writeFileToVault(primary, true);

      for (const duplicate of duplicates) {
        await this.writeFileToVault(duplicate);
      }
    }
  }

  /**
   * Processes a tracked file, updating or creating it in the vault, and handling its atomicity
   * @param baseFile - The primary base file to process
   * @returns The created or updated file
   */
  private async processTrackedFile(baseFile: BaseFile): Promise<void> {
    let processedPrimary: TFile | null = null;
    if (baseFile.primary instanceof TFile) {
      // TODO: Add an option to the plugin to link remote duplicates to the primary file
      await this.updateExistingFile(baseFile);

      for (const duplicate of baseFile.duplicates) {
        this.logger.warn('Existing duplicate file found', { duplicate });
        await this.handleDuplicate(duplicate, baseFile);
      }

      processedPrimary = baseFile.primary;
    } else {
      processedPrimary = await this.writeFileToVault(baseFile);
    }

    // If we have any atoms, process them (atoms will be empty of conditional atomizer leads to no atoms)
    if (this.settings.atomicHighlights && processedPrimary && baseFile.atoms?.length > 0) {
      await this.processAtomicHighlights(processedPrimary, baseFile);
    }
  }

  /**
   * Writes a file to the vault with frontmatter and contents
   * @param file - The readwise or atomic file to write
   * @param overwrite - Whether to overwrite an existing file or create with hash
   * @returns The created or updated file
   */
  private async writeFileToVault(file: BaseFile | AtomicFile, overwrite?: boolean): Promise<TFile> {
    /**
     * This method looks quite convoluted and complex, which is due to the fact that
     * the vault methods to get files are case-sensitive, but the filesystem is probably not.
     *
     * This means that we need to check if the file exists in the vault (case insensitive)
     * via the DataAdapter, and if it does, we need to check if it's the same file as the one
     * we're trying to write.
     */

    if (file.type === 'base') this.notifyFileCount();
    const path = this.getNormalizedPath(this.getCategoryPathFromFile(file), `${file.basename}.md`);
    try {
      const frontmatter = this.frontmatterManager.getFrontmatter(file);
      const fileOptions = {
        ctime: new Date(file.doc.created).getTime(),
        mtime: new Date(file.doc.updated).getTime(),
      };

      const fileExists = await this.app.vault.adapter.exists(path, false);
      if (fileExists) {
        if (overwrite) {
          const existingFile: TFile = await this.vault.getFileByPath(path);
          this.logger.debug('Overwriting existing file', { doc: file.doc, ...fileOptions });
          await this.frontmatterWrite(existingFile, frontmatter);
          await this.fileWrite(existingFile, file.contents, fileOptions);
          return existingFile;
        }
        // Create new path with hash
        const hash = this.generateShortHash(file.doc);
        const newPath = this.getNormalizedPath(this.getCategoryPathFromFile(file), `${file.basename} ${hash}.md`);
        const newFileExists = await this.app.vault.adapter.exists(newPath, false);
        if (newFileExists) {
          const existingNewFile: TFile = await this.vault.getFileByPath(newPath);
          this.logger.debug('Overwriting existing file (with hash)', { doc: file.doc, ...fileOptions });
          await this.frontmatterWrite(existingNewFile, frontmatter);
          await this.fileWrite(existingNewFile, file.contents, fileOptions);
          return existingNewFile;
        }
        this.logger.debug('Creating new file (with hash)', { doc: file.doc, ...fileOptions });
        const newFile: TFile = await this.vault.create(newPath, file.contents, fileOptions);
        await this.frontmatterWrite(newFile, frontmatter);
        return newFile;
      }

      // If the file doesn't exist, create it
      this.logger.debug('Creating new file', { doc: file.doc, ...fileOptions });
      const newFile: TFile = await this.vault.create(path, file.contents, fileOptions);
      await this.frontmatterWrite(newFile, frontmatter);
      return newFile;
    } catch (err) {
      this.logger.error(`Failed to create file '${path}'`, err);
      throw new Error(`Failed to create file '${path}'. ${err}`);
    }
  }

  /**
   * Processes atomic highlights for a given primary file and readwise file
   * @param primaryFile
   * @param readwiseFile
   * @returns
   */
  private async processAtomicHighlights(_primaryFile: TFile, readwiseFile: BaseFile): Promise<void> {
    if (readwiseFile.atoms.length === 0) {
      return;
    }

    // FIXME: Implement this for Backlinks
    // Make sure we keep track of the "parent" file we've written
    // through a special field based on `_primaryFile`
    for (const atom of readwiseFile.atoms) {
      const basename = atom.basename || `${readwiseFile.basename}-${atom.id}`;
      const atomicFile: AtomicFile = {
        type: 'atom',
        id: atom.id,
        basename, // Sanitize the basename
        doc: readwiseFile.doc,
        contents: atom.content,
        frontmatter: atom.frontmatter,
      };

      await this.writeFileToVault(atomicFile, true); // We overwrite
    }
  }

  /**
   *
   * @param existingFile
   * @param frontmatter
   */
  private async frontmatterWrite(existingFile: TFile, frontmatter: Frontmatter) {
    // biome-ignore lint/suspicious/noExplicitAny: Obsidian API exposes this as any
    await this.app.fileManager.processFrontMatter(existingFile, (existingFrontmatter: any) => {
      for (const [key, value] of frontmatter.entries()) {
        existingFrontmatter[key] = value;
      }
    });
  }

  /**
   * Write contents atomically
   * @param existingFile - The existing file to update
   * @param fileContents - The new contents to write
   * @param fileOptions - The file options (ctime, mtime)
   * @returns The updated file
   */
  private async fileWrite(existingFile: TFile, fileContents: string, fileOptions?: { ctime: number; mtime: number }) {
    await this.vault.process(
      existingFile,
      (data) => {
        // readwiseFile.contents
        const fmi = getFrontMatterInfo(data);
        if (fmi?.exists) {
          // Return unchanged frontmatter + new contents
          return `${data.slice(0, fmi.contentStart)}\n${fileContents}`;
        }
        return data;
      },
      fileOptions
    );
    return existingFile;
  }
}
