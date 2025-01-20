#!/usr/bin/env node

/**
 * Local deployment script for Obsidian plugin
 *
 * Environment variables:
 * @requires OBSIDIAN_PLUGIN_ROOT - Path to Obsidian plugins directory
 * @requires PACKAGE_NAME - Name of the plugin package
 *
 * Files deployed:
 * - main.js: Plugin core functionality
 * - manifest.json: Plugin metadata with development version
 *   Version format: x.y.z-YYYY-MM-DDTHH:mm:ss.sssZ
 *   Example: 1.0.0-2024-03-15T10:30:45.123Z
 * - styles.css: Plugin styles
 *
 * Version handling:
 * - Production releases use semantic versioning (x.y.z)
 * - Development builds append ISO timestamp for uniqueness
 * - Hot reload triggered after deployment
 *
 * Usage:
 * 1. Set OBSIDIAN_PLUGIN_ROOT in .env
 * 2. Set PACKAGE_NAME to match manifest.json id
 * 3. Run `node deploy-local.js`
 */

require('dotenv').config();
const fs = require('fs');
// Validate environment
if (!process.env.OBSIDIAN_PLUGIN_ROOT || !process.env.PACKAGE_NAME) {
  console.error('OBSIDIAN_PLUGIN_ROOT and/or PACKAGE_NAME are not defined');
  console.log(`$OBSIDIAN_PLUGIN_ROOT: ${process.env.OBSIDIAN_PLUGIN_ROOT}`);
  console.log(`$PACKAGE_NAME: ${process.env.PACKAGE_NAME}`);
  process.exit(1);
}

// Configure deployment
const DEPLOY_PATH = `${process.env.OBSIDIAN_PLUGIN_ROOT}/${process.env.PACKAGE_NAME}`;
const DEPLOY_FILES = ['main.js', 'manifest.json', { src: 'src/ui/styles/styles.css', dest: 'styles.css' }];

// Copy files to plugin directory: use filename if array element is string, otherwise use src/dest object
for (const file of DEPLOY_FILES) {
  const src = typeof file === 'string' ? file : file.src;
  const dest = typeof file === 'string' ? file : file.dest;

  switch (dest) {
    case 'manifest.json':
      json = JSON.parse(fs.readFileSync(src));
      json.version = `${json.version}-${new Date().toISOString().replace(/[-:\.TZ]/g, '')}`;
      console.log(`Written ${file} to ${DEPLOY_PATH}/${file} with updated version ${json.version}`);
      fs.writeFileSync(`${DEPLOY_PATH}/${dest}`, JSON.stringify(json, null, 4) + '\n');
      break;
    default:
      fs.copyFile(src, `${DEPLOY_PATH}/${dest}`, (err) => {
        if (err) {
          console.error(`Failed to copy ${src} to ${DEPLOY_PATH}/${dest}`);
        } else {
          console.log(`Copied ${src} to ${DEPLOY_PATH}/${dest}`);
        }
      });
      break;
  }
}
