import { READWISE_REVIEW_URL_BASE } from 'constants/index';
import type { App, TFile } from 'obsidian';
import type { PluginSettings } from 'types';

// Verify if file is tracked by checking for the tracking property in frontmatter
export function isTrackedReadwiseNote(file: TFile, app: App, settings: PluginSettings): boolean {
  const trackingProperty = settings.trackingProperty;
  const fileCache = app.metadataCache.getFileCache(file);
  return fileCache?.frontmatter?.[trackingProperty]?.startsWith(READWISE_REVIEW_URL_BASE);
}

// Verify if file is part of the readwise library folder hierarchy
export function isInReadwiseLibrary(file: TFile, settings: PluginSettings): boolean {
  const baseFolderName = settings.baseFolderName; // Replace with your actual base folder name
  let currentFolder = file.parent;

  while (currentFolder) {
    if (currentFolder.path === baseFolderName) {
      return true;
    }
    currentFolder = currentFolder.parent;
  }
  return false;
}
