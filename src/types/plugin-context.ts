import type ReadwiseMirror from 'main';
import type { App } from 'obsidian';
import type Logger from 'services/logger';
import type ReadwiseApi from 'services/readwise-api';
import type { PluginSettings } from 'types/settings';
import type Notify from 'ui/notify';

/**
 * Context object that bundles commonly-used plugin dependencies
 * to reduce parameter sprawl across service constructors
 */
export interface PluginContext {
  app: App;
  settings: PluginSettings;
  api: ReadwiseApi;
  plugin: ReadwiseMirror; //TODO: Plugin is base class – should not be needed here
  logger: Logger;
  notify: Notify;
  saveSettings: () => Promise<void>;
}
