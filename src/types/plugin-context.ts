import type { App } from 'obsidian';
import type Logger from 'services/logger';
import type { PluginSettings } from 'types/settings';
import type { Controller } from '../services/controller';

/**
 * Context object that bundles commonly-used plugin dependencies
 * to reduce parameter sprawl across service constructors
 */
export interface PluginContext {
  app: App;
  settings: PluginSettings;
  logger: Logger;
  controller?: Controller;
  syncLock: {
    isAcquired(key: string): boolean;
    acquire(key: string): Promise<void>;
    release(key: string): void;
  };
  statusBarItem: HTMLElement;
  notice: (message: string, duration?: number) => void;
  setStatusBarText: (message: string) => void;
  saveAndApplySettings: () => Promise<void>;
}
