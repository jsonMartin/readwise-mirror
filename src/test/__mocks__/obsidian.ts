/**
 * Jest mock of Obsidian API for testing
 * Following patterns from obsidian-tasks and obsidian-dataview plugins
 */

import { jest } from '@jest/globals';
import { parse, stringify } from 'yaml';

// Re-export yaml package functions that Obsidian uses
export const parseYaml = parse;
export const stringifyYaml = stringify;

// Mock classes that production code imports
export class FileManager {
  processFrontMatter = jest.fn();
}

export class TFile {
  basename = '';
  extension = '';
  name = '';
  path = '';
  stat = {
    ctime: 0,
    mtime: 0,
    size: 0,
  };
  vault: any = null;
}

export class TFolder {
  children: Array<TFile | TFolder> = [];
  name = '';
  parent: TFolder | null = null;
  path = '';
  vault: any = null;
}

export class Vault {
  getAbstractFileByPath = jest.fn();
  getMarkdownFiles = jest.fn((): TFile[] => []);
  read = jest.fn();
  modify = jest.fn();
  create = jest.fn();
  delete = jest.fn();
}

export class Notice {
  constructor(message: string, timeout?: number) {}
}

export class Modal {
  constructor(app: any) {}
  open() {}
  close() {}
}

// Mock moment function that Obsidian provides
export const moment = (date?: any): any => ({
  format: jest.fn((formatStr: string) => ''),
  valueOf: jest.fn(() => 0),
  unix: jest.fn(() => 0),
});
