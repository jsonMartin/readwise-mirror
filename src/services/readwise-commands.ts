import type { Command } from 'obsidian';
import spacetime from 'spacetime';
import type { PluginContext } from '../types/plugin-context';
import type { ReadwiseController } from './readwise-controller';

export function getReadwiseCommands(ctr: ReadwiseController, ctx: PluginContext): Command[] {
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
        const isTokenValid = ctx.api?.hasValidToken();
        ctx.notify.notice(`Readwise: ${isTokenValid ? 'Token is valid' : 'INVALID TOKEN'}`);
      },
    },
    {
      id: 'delete',
      name: 'Delete Readwise library',
      callback: () => ctr.deleteLibrary(),
    },
    {
      id: 'update',
      name: 'Sync new highlights',
      callback: () => {
        if (typeof ctr.sync === 'function') {
          ctr.sync();
        }
      },
    },
    {
      id: 'adjust-filenames',
      name: 'Adjust Filenames to current settings',
      checkCallback: (checking: boolean) => {
        if (ctx.settings.trackFiles && ctx.settings.enableFileNameUpdates) {
          if (!checking) ctr.handleFilenameAdjustment();
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
          if (!checking) ctr.updateAllFrontmatter();
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
        if (!checking) ctr.updateSingleNote(trackedFile);
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
            ctx.saveAndApplySettings();
          }
          return true;
        }
        return false;
      },
    },
  ];
}
