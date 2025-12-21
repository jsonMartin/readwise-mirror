import type ReadwiseMirror from 'main';
import type { App } from 'obsidian';
import type Logger from 'services/logger';
import type { PluginSettings } from 'types/settings';
import type Notify from 'ui/notify';

/**
 * Context object that bundles commonly-used plugin dependencies
 * to reduce parameter sprawl across service constructors
 */
export interface PluginContext {
  plugin: ReadwiseMirror;
  notify: Notify;
  logger: Logger;
  app: App;
  settings: PluginSettings;
}
