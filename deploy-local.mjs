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

import dotenv from 'dotenv';
dotenv.config();
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

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

try {
  // Create deploy directory if it doesn't exist
  if (!existsSync(DEPLOY_PATH)) {
    throw new Error(`Deploy directory not found: ${DEPLOY_PATH}`);
  }

  // Copy files to plugin directory: use filename if array element is string, otherwise use src/dest object
  for (const file of DEPLOY_FILES) {
    const src = typeof file === 'string' ? file : file.src;
    const dest = typeof file === 'string' ? file : file.dest;
    const destPath = join(DEPLOY_PATH, dest);

    // Check if source file exists
    if (!existsSync(src)) {
      throw new Error(`Source file not found: ${src}`);
    }

    switch (dest) {
      case 'manifest.json':
        try {
          const manifestContent = readFileSync(src, 'utf8');
          const json = JSON.parse(manifestContent);
          json.version = `${json.version}-${new Date().toISOString().replace(/[-:.TZ]/g, '')}`;
          writeFileSync(destPath, `${JSON.stringify(json, null, 4)}\n`);
          console.log(`Written ${src} to ${destPath} with updated version ${json.version}`);
        } catch (err) {
          throw new Error(`Failed to process manifest.json: ${err.message}`);
        }
        break;
      default:
        try {
          copyFileSync(src, destPath);
          console.log(`Copied ${src} to ${destPath}`);
        } catch (err) {
          throw new Error(`Failed to copy ${src} to ${destPath}: ${err.message}`);
        }
        break;
    }
  }
} catch (error) {
  console.error(`Deployment failed: ${error.message}`);
  process.exit(1);
}

console.log('Deployment completed successfully');
