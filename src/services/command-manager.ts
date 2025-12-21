import type { Command } from 'obsidian';
import spacetime from 'spacetime';
import type { TTrackedFile } from 'types/readwise-note';
import { ConfirmDialog } from 'ui/dialog';
import type { PluginContext } from './plugin-context';

/**
 * Manages command registration for the Readwise Mirror plugin
 */
export class ReadwiseCommandManager {
  constructor(private ctx: PluginContext) {}
  private get commandManifest(): Command[] {
    return [
      {
        id: 'download',
        name: 'Download entire Readwise library (force)',
        callback: () => this.ctx.plugin.download(),
      },

      {
        id: 'test',
        name: 'Test Readwise API key',
        callback: async () => {
          const isTokenValid = this.ctx.plugin.readwiseApi?.hasValidToken();
          this.ctx.notify.notice(`Readwise: ${isTokenValid ? 'Token is valid' : 'INVALID TOKEN'}`);
        },
      },

      {
        id: 'delete',
        name: 'Delete Readwise library',
        callback: () => this.ctx.plugin.deleteLibrary(),
      },

      {
        id: 'update',
        name: 'Sync new highlights',
        callback: () => this.ctx.plugin.sync(),
      },

      {
        id: 'adjust-filenames',
        name: 'Adjust Filenames to current settings',
        checkCallback: (checking: boolean) => {
          if (this.ctx.settings.trackFiles && this.ctx.settings.enableFileNameUpdates) {
            if (!checking) this.ctx.plugin.handleFilenameAdjustment();
            return true;
          }
          return false;
        },
      },

      {
        id: 'update-all-frontmatter',
        name: 'Update all Readwise note frontmatter',
        checkCallback: (checking: boolean) => {
          if (this.ctx.settings.frontMatter && this.ctx.settings.trackFiles) {
            if (!checking) this.ctx.plugin.updateAllFrontmatter();
            return true;
          }
          return false;
        },
      },

      {
        id: 'update-current-note',
        name: 'Update current note',
        checkCallback: (checking: boolean) => {
          const file: TTrackedFile = this.ctx.plugin.getUpdatableNote(this.ctx.app.workspace.getActiveFile());
          if (!file) return false;
          if (!checking) this.ctx.plugin.updateCurrentNote(file);
          return true;
        },
      },

      {
        id: 'reset-last-updated',
        name: 'Reset lastUpdated setting to 2 months ago (debug)',
        checkCallback: (checking: boolean) => {
          if (this.ctx.settings.debugMode) {
            if (!checking) {
              const d = spacetime.now().subtract(2, 'months');
              new ConfirmDialog(
                this.ctx.app,
                'Are you sure?',
                `Do you really want to reset 'last updated' date to ${spacetime.now().since(d).rounded}?`,
                (result) => {
                  if (result) {
                    this.ctx.settings.lastUpdated = d.iso();
                    this.ctx.plugin.saveSettings();
                    this.ctx.notify.setStatusBarText(
                      `Readwise: lastUpdated reset to ${spacetime.now().since(d).rounded}`
                    );
                  }
                }
              ).open();
            }
            return true;
          }
          return false;
        },
      },
    ];
  }

  /**
   * Register all plugin commands from the manifest
   */
  public registerCommands(): void {
    for (const cmd of this.commandManifest) {
      this.ctx.plugin.addCommand(cmd as Command);
    }
  }
}
