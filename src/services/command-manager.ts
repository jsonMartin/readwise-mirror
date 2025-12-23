import type ReadwiseMirror from 'main';
import { type Command, type Menu, type TAbstractFile, TFile, TFolder } from 'obsidian';
import { getTrackingUrl } from 'utils/file-utils';
import type { PluginContext } from '../types/plugin-context';
import { getReadwiseCommands } from './readwise-commands';
import { ReadwiseController } from './readwise-controller';

/**
 * Manages command registration for the Readwise Mirror plugin
 * Singleton class to ensure only one instance exists
 */
export class ReadwiseCommandManager {
  private readonly ctr: ReadwiseController;
  private static instance: ReadwiseCommandManager;

  private constructor(
    private plugin: ReadwiseMirror,
    private ctx: PluginContext
  ) {
    this.ctr = new ReadwiseController(this.plugin, this.ctx);
  }

  // Create and initialize the command manager
  public static initialize(plugin: ReadwiseMirror, ctx: PluginContext): ReadwiseCommandManager {
    if (!ReadwiseCommandManager.instance) {
      ReadwiseCommandManager.instance = new ReadwiseCommandManager(plugin, ctx);
      ReadwiseCommandManager.instance.registerCommands();
      ReadwiseCommandManager.instance.registerEvents();
      ReadwiseCommandManager.instance.runStartupCommands();
    }
    return ReadwiseCommandManager.instance;
  }

  // Reset the singleton instance (for testing purposes)
  public static reset(): void {
    ReadwiseCommandManager.instance = undefined;
  }

  /**
   * Register all plugin commands from the manifest
   */
  public registerCommands(): void {
    const commands = getReadwiseCommands(this.ctr, this.ctx);
    for (const cmd of commands) {
      this.plugin.addCommand(cmd as Command);
    }
  }

  /**
   * Register context menu events for Readwise notes and folders
   */
  public registerEvents(): void {
    // Register context menu for files and folders
    this.plugin.registerEvent(
      this.ctx.app.workspace.on('file-menu', (menu, file) => this.onMenuOpenCallback(menu, file))
    );

    this.plugin.registerDomEvent(this.ctx.notify.statusBarItem, 'click', this.ctr.sync.bind(this));
  }

  public runStartupCommands(): void {
    // Run sync on startup if enabled
    if (this.ctx.settings.autoSync) {
      this.ctr.sync();
    }
  }
  /**
   * Handle context menu for files and folders
   */
  private onMenuOpenCallback(menu: Menu, file: TAbstractFile) {
    if (file instanceof TFile && file.extension === 'md') {
      const tracked = this.ctr.getUpdatableNote(file);
      if (tracked) {
        // Update this note
        menu.addItem((item) => {
          item
            .setIcon('refresh-cw')
            .setTitle('Update this note')
            .onClick(() => this.ctr.updateSingleNote(tracked));
        });

        // View in Readwise
        const trackingUrl = getTrackingUrl(file, this.ctx);
        if (trackingUrl) {
          menu.addItem((item) => {
            item
              .setIcon('external-link')
              .setTitle('View in Readwise')
              .onClick(() => window.open(trackingUrl));
          });

          // Copy Readwise URL
          menu.addItem((item) => {
            item
              .setIcon('copy')
              .setTitle('Copy Readwise URL')
              .onClick(async () => {
                await navigator.clipboard.writeText(trackingUrl);
                this.ctx.notify.notice('Readwise: URL copied to clipboard');
              });
          });
        }
      }
    } else if (file instanceof TFolder) {
      // Check if this folder is in the Readwise library
      if (this.isFolderInReadwiseLibrary(file)) {
        menu.addItem((item) => {
          item
            .setIcon('refresh-cw')
            .setTitle('Update all notes in folder')
            .onClick(async () => this.ctr.syncFolder(file));
        });
      }
    }
  }

  /**
   * Check if a folder is in the Readwise library hierarchy
   */
  private isFolderInReadwiseLibrary(folder: TFolder): boolean {
    const baseFolderName = this.ctx.settings.baseFolderName?.trim();
    if (!baseFolderName) return false;

    // Check if folder is the base folder or a direct child of it
    return folder.path === baseFolderName || folder.parent?.path === baseFolderName;
  }
}
