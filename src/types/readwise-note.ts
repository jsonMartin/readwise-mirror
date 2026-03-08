import type { TFile } from 'obsidian';

/**
 * Extension of TFile to include Readwise tracking metadata
 */
export interface TTrackedFile extends TFile {
  readwiseId: number;
  isUpdatable: boolean;
}
