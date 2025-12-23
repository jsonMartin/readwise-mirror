import type ReadwiseMirror from 'main';
import { type Command, type Menu, type TAbstractFile, TFile, TFolder } from 'obsidian';
import { getTrackingUrl, isFolderInReadwiseLibrary } from 'utils/file-utils';
import type { PluginContext } from '../types/plugin-context';
import { getPluginCommands } from '../utils/plugin-commands';
import type { Controller } from './controller';

/**
 * Manages command registration for the Readwise Mirror plugin
 * Singleton class to ensure only one instance exists
 */
export class CommandManager {
  private static instance: CommandManager;

  private constructor(
    private plugin: ReadwiseMirror,
    private ctx: PluginContext,
    private ctr: Controller
  ) {}

  // Create and initialize the command manager
  public static async initialize(plugin: ReadwiseMirror, ctx: PluginContext, ctr: Controller): Promise<CommandManager> {
    if (!CommandManager.instance) {
      const instance = new CommandManager(plugin, ctx, ctr);
      instance.registerCommands();
      instance.registerEvents();
      instance.runStartupCommands();
      CommandManager.instance = instance;
    }
    return CommandManager.instance;
  }

  // Reset the singleton instance (for testing purposes)
  public static reset(): void {
    CommandManager.instance = undefined;
  }

  /**
   * Register all plugin commands from the manifest
   */
  private registerCommands(): void {
    const commands = getPluginCommands(this.ctr, this.ctx);
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

    this.plugin.registerDomEvent(this.ctx.statusBarItem, 'click', async () => await this.ctr.sync());
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
                this.ctx.notice('Readwise: URL copied to clipboard');
              });
          });
        }
      }
    } else if (file instanceof TFolder) {
      // Check if this folder is in the Readwise library
      if (isFolderInReadwiseLibrary(file, this.ctx)) {
        menu.addItem((item) => {
          item
            .setIcon('refresh-cw')
            .setTitle('Update all notes in folder')
            .onClick(async () => this.ctr.syncFolder(file));
        });
      }
    }
  }
}
