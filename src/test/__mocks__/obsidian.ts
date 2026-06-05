import { jest } from '@jest/globals';
import { parse } from 'yaml';

export const App = jest.fn();
export const Plugin = jest.fn();
export const TFile = jest.fn();
export const TFolder = jest.fn();
export class PluginManifest {}
export interface CachedMetadata {}

export function parseYaml(yaml: string): unknown {
  return parse(yaml);
}

// add other exports as needed
