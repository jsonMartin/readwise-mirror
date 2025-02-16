import { type App, TFile, type Vault, normalizePath } from 'obsidian';
import { type Frontmatter, FrontmatterManager } from 'services/frontmatter-manager';
import type { PluginSettings, ReadwiseDocument } from 'types';

export class DeduplicatingVaultWriter {
  readonly vault: Vault;

  constructor(
    private app: App,
    private settings: PluginSettings,
    private frontmatterManager: FrontmatterManager
  ) {
    this.vault = app.vault;
    this.settings = settings;
    this.frontmatterManager = frontmatterManager;
  }

  /**
   * Finds duplicate files in the vault based on the book's readwise_url
   *
   * @param readwiseItem The book to find duplicates for
   * @returns An array of duplicate files
   */
  private async findDuplicates(readwiseItem: ReadwiseDocument): Promise<TFile[]> {
    const files = this.vault.getMarkdownFiles();

    // Try file tracking if enabled
    if (this.settings.trackFiles && this.settings.trackingProperty && readwiseItem.highlights_url) {
      // Filter files with matching tracking property
      const trackedDuplicates = files.filter((file) => {
        const metadata = this.app.metadataCache.getFileCache(file);
        return metadata?.frontmatter?.[this.settings.trackingProperty] === readwiseItem.highlights_url;
      });

      // Return the tracked duplicates
      return trackedDuplicates;
    }

    return [];
  }

  /**
   * Writes a Readwise item to the vault
   *
   * @param filename - The filename of the file to write
   * @param contents - The contents of the file (header & highlights)
   * @param metadata - The metadata of the file
   * @returns The file that was written
   */
  public async create(filename: string, contents: string, metadata: ReadwiseDocument): Promise<TFile> {
    const path = `${this.settings.baseFolderName}/${
      metadata.category.charAt(0).toUpperCase() + metadata.category.slice(1)
    }/${filename}.md`;

    const readwiseItemFile: TFile | null = this.vault.getFileByPath(normalizePath(path));
    const frontmatter: Frontmatter = this.frontmatterManager.renderFrontmatter(metadata);

    // TODO: Improve handling of duplicates
    const duplicates: TFile[] = await this.findDuplicates(metadata);

    /**
     * TODO:
     * - We don't find a duplicate (because not enabled or none found), and
     *  - the file doesn't exist yet: write the file (and add tracking property if enabled)
     *  - the file exists: process the unknown duplicate, keep frontmatter but overwrite contents if selected to do so
     */

    // Write the file if there are no duplicates and the file doesn't exist yet
    if (duplicates.length === 0) {
      if (!readwiseItemFile) {
        try {
          return await this.vault.create(normalizePath(path), `${FrontmatterManager.toString(frontmatter)}${contents}`);
        } catch (err) {
          console.error(
            `Readwise: Attempt to create file ${path} *DE NOVO* failed (uri: ${metadata.highlights_url})`,
            err
          );
          throw err;
        }
      } else {
        if (this.settings.deleteDuplicates) {
          // Overwrite the file (but keep the original frontmatter)
          await this.vault.process(readwiseItemFile, () => {
            if (this.settings.updateFrontmatter) {
              this.frontmatterManager
                .getUpdatedFrontmatter(readwiseItemFile, frontmatter)
                .then((updatedFrontmatter) => {
                  return `${FrontmatterManager.toString(updatedFrontmatter)}${contents}`;
                });
            }
            return `${FrontmatterManager.toString(frontmatter)}${contents}`;
          });
        } else {
          // File with the same name exists, but no duplicate detected (could be from an older sync without tracking)
          const incrementPath = `${this.settings.baseFolderName}/${
            metadata.category.charAt(0).toUpperCase() + metadata.category.slice(1)
          }/${filename} ${metadata.id}.md`;
          console.warn(`Readwise: Processed unknown duplicate ${incrementPath}`);
          return await this.vault.create(normalizePath(incrementPath), `${FrontmatterManager.toString(frontmatter)}${contents}`);
        }
      }
    }

    // Handle duplicates
    let isDeduplicated = false;
    const filesToDeleteOrLabel: TFile[] = [];

    // First: Check if target file is in duplicates (i.e. has the same name)
    const targetFileIndex = duplicates.findIndex((f) => normalizePath(f.path) === normalizePath(path));

    if (targetFileIndex > 0 && readwiseItemFile instanceof TFile) {
      isDeduplicated = true;
      try {
        if (this.settings.updateFrontmatter) {
          const updatedFrontmatter = await this.frontmatterManager.getUpdatedFrontmatter(readwiseItemFile, frontmatter);
          const updatedContents = `${FrontmatterManager.toString(updatedFrontmatter)}${contents}`;
          await this.vault.process(readwiseItemFile, () => updatedContents);
        } else {
          await this.vault.process(readwiseItemFile, () => contents);
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
      if (!isDeduplicated && duplicates[0]) {
        try {
          // Write the new contents to the first duplicate
          if (this.settings.updateFrontmatter) {
            await this.frontmatterManager
              .getUpdatedFrontmatter(duplicates[0], frontmatter)
              .then((updatedFrontmatter) => {
                const updatedContents = `${FrontmatterManager.toString(updatedFrontmatter)}${contents}`;
                return this.vault
                  .process(duplicates[0], () => updatedContents)
                  .then(() => {
                    isDeduplicated = true;
                  });
              });
          } else {
            await this.vault
              .process(duplicates[0], () => contents)
              .then(() => {
                isDeduplicated = true;
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
          await this.frontmatterManager.writeUpdatedFrontmatter(file, { ...frontmatter, duplicate: true });
        }
      } catch (err) {
        console.error(`Readwise: Failed to delete local duplicate ${file.path}`, err);
        throw err;
      }
    }

    // If not deduplicated / no duplicates, handle as new/existing file
    if (!isDeduplicated) {
      if (readwiseItemFile && readwiseItemFile instanceof TFile) {
        // File exists
        try {
          if (this.settings.updateFrontmatter) {
            const updatedFrontmatter = await this.frontmatterManager.getUpdatedFrontmatter(
              readwiseItemFile,
              frontmatter
            );
            const updatedContents = `${FrontmatterManager.toString(updatedFrontmatter)}${contents}`;
            await this.vault.process(readwiseItemFile, () => updatedContents);
          } else {
            await this.vault.process(readwiseItemFile, () => contents);
          }
        } catch (err) {
          console.error(`Readwise: Attempt to overwrite file ${path} failed`, err);
          Promise.reject(`Readwise: Failed to update file '${path}'. ${err}`);
        }
      } else {
        try {
          await this.vault.create(path, contents).catch(async () => {
            if (this.vault.adapter.exists(normalizePath(path))) {
              const incrementPath = path.replace(`${filename}.md`, `${filename} ${metadata.id}.md`);
              await this.vault.create(incrementPath, contents);
              console.warn(`Readwise: Processed remote duplicate ${incrementPath}`);
              Promise.reject(`Readwise: Processed remote duplicate into ${incrementPath}`);
            }
          });
        } catch (err) {
          console.error(
            `Readwise: Attempt to create file ${path} *DE NOVO* failed (uri: ${metadata.highlights_url})`,
            err
          );
          Promise.reject(`Readwise: Failed to create file '${path}'. ${err}`);
        }
      }
    }
  }
}
