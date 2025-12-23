import type { App } from 'obsidian';
import type Logger from 'services/logger';
import type { PluginSettings } from 'types/settings';
import type Notify from 'ui/notify';
import type { Controller } from '../services/controller';

/**
 * Context object that bundles commonly-used plugin dependencies
 * to reduce parameter sprawl across service constructors
 */
export interface PluginContext {
  app: App;
  settings: PluginSettings;
  logger: Logger;
  notify?: Notify;
  controller?: Controller;
  syncLock: {
    isAcquired(key: string): boolean;
    acquire(key: string): Promise<void>;
    release(key: string): void;
  };
  saveAndApplySettings: () => Promise<void>;
}
