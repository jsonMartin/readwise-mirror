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
import { readFileSync, writeFileSync, copyFile } from 'fs';

// Validate environment
if (!process.env.OBSIDIAN_PLUGIN_ROOT || !process.env.PACKAGE_NAME) {
  console.error('OBSIDIAN_PLUGIN_ROOT and/or NPM_PACKAGE_NAME are not defined');
  console.log(`$OBSIDIAN_PLUGIN_ROOT: ${process.env.OBSIDIAN_PLUGIN_ROOT}`);
  console.log(`$PACKAGE_NAME: ${process.env.PACKAGE_NAME}`);
  process.exit(1);
}

// Configure deployment
const DEPLOY_PATH = `${process.env.OBSIDIAN_PLUGIN_ROOT}/${process.env.PACKAGE_NAME}`;
const DEPLOY_FILES = ['main.js', 'manifest.json', 'styles.css'];

// Copy files to plugin directory
for (const file of DEPLOY_FILES) {
  switch (file) {
    case 'manifest.json':
      json = JSON.parse(readFileSync(file));
      json.version = `${json.version}-${new Date().toISOString()}`;
      console.log(`Written ${file} to ${DEPLOY_PATH}/${file} with updated version ${json.version}`);
      writeFileSync(`${DEPLOY_PATH}/${file}`, JSON.stringify(json, null, 4) + '\n');
      break;
    default:
      copyFile(file, `${DEPLOY_PATH}/${file}`, (err) => {
        if (err) {
          console.error(`Failed to copy ${file} to ${DEPLOY_PATH}/${file}`);
        } else {
          console.log(`Copied ${file} to ${DEPLOY_PATH}/${file}`);
        }
      });
      break;
  }
}
