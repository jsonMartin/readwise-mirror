import type { TFile } from 'obsidian';
import type { Highlight } from './library';

/**
 * Represents a base file that is pending to be written to the vault.
 *
 * @property basename - The basename of the file to write (consistent with TFile class)
 * @property doc - The Readwise document metadata
 * @property contents - The contents of the file to write
 * @property path - The full path including category
 */
interface ReadwiseNote {
  type: 'base' | 'atom';
  basename: string;
  doc: ReadwiseDocument;
  frontmatter?: string;
  contents?: string;
}

export interface BaseFile extends ReadwiseNote {
  type: 'base';
  contents: string; // Required: always set before writing
  primary: TFile | string; // The primary file (TFile object or file path string) in case of duplicates
  duplicates: TFile[]; // Duplicate TFiles; empty array when none
  atoms: Atom[]; // Atomized highlights; empty array when not atomized
}

export interface AtomicFile extends ReadwiseNote {
  type: 'atom';
  id: number; // ID of the atom (the highlight ID)
  contents: string; // Required: always set when constructing an AtomicFile
}

/**
 * Readwise document metadata formatted for use in nunjucks templates.
 *
 * @see https://readwise.io/api/docs/highlights
 */
export interface ReadwiseDocument {
  id: number; // book id from Readwise API
  readwise_url: string; // Readwise URL for the highlights page (unique across readwise)
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
  linktext?: string; // Link to the note in obsidian, if tracked
}

export interface MetadataInput {
  title: string;
  author: string | string[];
  source_url: string;
}

export interface Atom {
  id: number; // ID (of the highlight, if applicable, or whatever you want to use as ID)
  content: string;
  basename?: string;
  frontmatter?: string;
  isEmbedded?: boolean;
}
