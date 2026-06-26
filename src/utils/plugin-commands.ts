import type { Command } from 'obsidian';
import spacetime from 'spacetime';
import { Controller } from '../services/controller';
import type { PluginContext } from '../types/plugin-context';
import { humanReadableFormat } from './format-utils';

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'number' || typeof err === 'boolean') return err.toString();
  if (err === null) return 'null';
  if (typeof err === 'undefined') return 'undefined';

  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

/**
 * Construct all plugin commands for the CommandManager
 * @param ctr ReadwiseController instance
 * @param ctx PluginContext instance
 * @returns Array of Obsidian Command objects
 */
export function getPluginCommands(ctr: Controller, ctx: PluginContext): Command[] {
  return [
    {
      id: 'download',
      name: 'Download entire Readwise library (force)',
      callback: async () => {
        ctx.settings.lastUpdated = null;
        await ctx.saveAndApplySettings();
        await ctr.sync();
      },
    },
    {
      id: 'test',
      name: 'Test Readwise API key',
      callback: async () => {
        try {
          const isTokenValid = await Controller.validateAPIInstance();
          ctx.notice(`Readwise: ${isTokenValid ? 'Token is valid' : 'INVALID TOKEN'}`);
        } catch (err: unknown) {
          ctx.notice(`Failed to validate API key: ${toErrorMessage(err)}`);
        }
      },
    },
    {
      id: 'delete',
      name: 'Delete Readwise library',
      callback: async () => await ctr.deleteLibrary(),
    },
    {
      id: 'update',
      name: 'Sync new highlights',
      callback: async () => await ctr.sync(),
    },
    {
      id: 'adjust-filenames',
      name: 'Adjust Filenames to current settings',
      checkCallback: (checking: boolean) => {
        if (ctx.settings.trackFiles && ctx.settings.enableFileNameUpdates) {
          if (!checking) {
            void ctr.handleFilenameAdjustment().catch((err: unknown) => {
              ctx.logger.error('Failed to adjust filenames', err);
              ctx.notice(`Failed to adjust filenames: ${toErrorMessage(err)}`);
            });
          }
          return true;
        }
        return false;
      },
    },
    {
      id: 'update-all-frontmatter',
      name: 'Update all Readwise note frontmatter',
      checkCallback: (checking: boolean) => {
        if (ctx.settings.frontMatter && ctx.settings.trackFiles) {
          if (!checking) {
            void ctr.updateAllFrontmatter().catch((err: unknown) => {
              ctx.logger.error('Failed to update all frontmatter', err);
              ctx.notice(`Failed to update frontmatter: ${toErrorMessage(err)}`);
            });
          }
          return true;
        }
        return false;
      },
    },
    {
      id: 'update-current-note',
      name: 'Update current note',
      checkCallback: (checking: boolean) => {
        const trackedFile = ctr.getUpdatableNote(ctx.app.workspace.getActiveFile());
        if (!trackedFile) return false;
        if (!checking) {
          void ctr.updateSingleNote(trackedFile).catch((err: unknown) => {
            ctx.logger.error('Failed to update current note', err);
            ctx.notice(`Failed to update current note: ${toErrorMessage(err)}`);
          });
        }
        return true;
      },
    },
    {
      id: 'reset-last-updated',
      name: 'Reset lastUpdated setting to 2 months ago (debug)',
      checkCallback: (checking: boolean) => {
        if (ctx.settings.debugMode) {
          if (!checking) {
            const d = spacetime.now().subtract(2, 'months');
            ctx.settings.lastUpdated = d.format('iso');
            void ctx
              .saveAndApplySettings()
              .catch((err: unknown) => ctx.notice(`Failed to save settings: ${toErrorMessage(err)}`));
            ctx.setStatusBarText(`Readwise: Synced ${humanReadableFormat(ctx.settings.lastUpdated)}`);
          }
          return true;
        }
        return false;
      },
    },
  ];
}
