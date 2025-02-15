import { MetadataKeyGenerator } from 'services/metadata-key-generator';
import { FrontmatterManager } from './frontmatter-manager';
import { type App, type Vault, TFile } from 'obsidian';
import type { Export, ReadwiseMetadata } from 'models/readwise';
import type { PluginSettings } from 'models/settings';
import type { Environment } from 'nunjucks';

export class Deduplicator {
  private vault: Vault;
  private frontmatterManager: FrontmatterManager;

  constructor(
    private app: App,
    private settings: PluginSettings,
    private env: Environment
  ) {
    this.vault = app.vault;
    this.frontmatterManager = new FrontmatterManager(app, settings, this.env);
  }

  /**
   * Finds duplicate files in the vault based on the book's readwise_url
   * 
   * @param book The book to find duplicates for
   * @returns An array of duplicate files
   */
  public async findDuplicates(book: Export): Promise<TFile[]> {
    const files = this.vault.getMarkdownFiles();

    // First try file tracking if enabled
    if (this.settings.trackFiles && this.settings.trackingProperty && book.readwise_url) {
      // Filter files with matching tracking property
      const trackedDuplicates = files.filter(file => {
        const metadata = this.app.metadataCache.getFileCache(file);
        return metadata?.frontmatter?.[this.settings.trackingProperty] === book.readwise_url;
      });

      // Return the tracked duplicates
      return trackedDuplicates;
    }

    // Fallback to content-based duplicate detection
    const generator = new MetadataKeyGenerator();
    const bookKey = generator.generateKey({
      title: book.title,
      author: book.author, 
      source_url: book.source_url,
    });

    // Filter files with matching metadata
    const contentDuplicates = files.filter(file => {
      const metadata = this.app.metadataCache.getFileCache(file);
      const frontmatter = metadata?.frontmatter;
      if (!frontmatter) return false;

      // Check category match
      const fileCategory = file.path.split(`${this.settings.baseFolderName}/`)[1]?.split('/')[0];
      if (!fileCategory) return false;

      if (fileCategory.toLowerCase() !== book.category.toLowerCase()) return false;

      // Check metadata key match
      const fileKey = generator.generateKey({
        title: frontmatter.title,
        author: frontmatter.author,
        source_url: frontmatter.source_url,
      });

      if (bookKey === fileKey) {
        console.warn(`Readwise: Found duplicate file ${file.path} with key ${fileKey} and book key ${bookKey}`);
        return true;
      }

      return false;
    });

    return contentDuplicates;
  }

  /**
   * Handles deduplication of files for a given book
   */
  public async handleDuplicates(
    duplicates: TFile[], 
    path: string, 
    contents: string,
    frontmatterYaml: Record<string, unknown>,
    metadata: ReadwiseMetadata
  ): Promise<boolean> {
    if (duplicates.length === 0) return false;

    let deduplicated = false;
    const filesToDeleteOrLabel: TFile[] = [];

    // First: Check if target file is in duplicates (i.e. has the same name)
    const targetFileIndex = duplicates.findIndex((f) => f.path === path);
    const abstractFile = this.vault.getAbstractFileByPath(path);
    
    if (targetFileIndex >= 0 && abstractFile instanceof TFile) {
      deduplicated = true;
      try {
        if (this.settings.updateFrontmatter) {
          const frontmatter = await this.frontmatterManager.updateFrontmatter(abstractFile, frontmatterYaml);
          const updatedContents = `${frontmatter}${contents}`;
          await this.vault.process(abstractFile, () => updatedContents);
        } else {
          await this.vault.process(abstractFile, () => contents);
        }
      } catch (err) {
        console.error(`Readwise: Attempt to overwrite file ${path} failed`, err);
        throw err;
      } finally {
        // Remove target file from duplicates
        duplicates.splice(targetFileIndex, 1);
      }
    }

    // Second: Handle remaining duplicates (if any)
    if (duplicates.length > 0) {
      // Keep first duplicate if we haven't updated a file yet, and write it
      if (!deduplicated && duplicates[0]) {
        try {
          // Write the new contents to the first duplicate
          if (this.settings.updateFrontmatter) {
            await this.frontmatterManager.updateFrontmatter(duplicates[0], frontmatterYaml).then(( frontmatter ) => {
              const updatedContents = `${frontmatter}${contents}`;
              return this.vault
                .process(duplicates[0], () => updatedContents)
                .then(() => {
                  deduplicated = true;
                });
            });
          } else {
            await this.vault
              .process(duplicates[0], () => contents)
              .then(() => {
                deduplicated = true;
              });
          }

          // Rename the file if we have updated it
          await this.app.fileManager.renameFile(duplicates[0], path).catch(async () => {
            // We couldn't rename – check if we happen to have a file with "identical" (case-insenstivie) names
            if (this.vault.adapter.exists(path)) {
              // Replace the sanitized title with incremented version
              const sanitizedTitle = path.split('/').pop()?.replace('.md', '') || '';
              const incrementPath = path.replace(`${sanitizedTitle}.md`, `${sanitizedTitle} ${metadata.id}.md`);
              if (incrementPath !== path) {
                await this.app.fileManager.renameFile(duplicates[0], incrementPath);
                console.warn(`Readwise: Processed remote duplicate ${incrementPath}`);
              }
            }
          });
          // Remove the file we just updated from duplicates
          duplicates.shift();
        } catch (err) {
          console.error(`Readwise: Failed to rename local duplicate ${duplicates[0].path}`, err);
          throw err;
        }
      }
      // Add remaining duplicates to deletion list
      filesToDeleteOrLabel.push(...duplicates);
    }

    // Delete extra duplicates or mark as "duplicate" in the Vault
    for (const file of filesToDeleteOrLabel) {
      try {
        if (this.settings.deleteDuplicates) {
          await this.vault.trash(file, true);
        } else {
          await this.frontmatterManager.writeUpdatedFrontmatter(file, { ...frontmatterYaml, duplicate: true });
        }
      } catch (err) {
        console.error(`Readwise: Failed to delete local duplicate ${file.path}`, err);
        throw err;
      }
    }

    return deduplicated;
  }
}