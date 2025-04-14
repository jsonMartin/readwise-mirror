# Changelog

## 2.0.0 

Version 2.x.x is a major rewrite of the plugin, with a focus on implementing a deduplication logic, more atomic upgrades (keeping existing additional or protected frontmatter intact) and handling of special characters in filenames.

> [!WARNING]  
>If you update to 2.0.0 without following these steps, you will likely end up with duplicate notes for the same Readwise item or, if you delete the whole Readwise folder in your Obsidian vault first, will likely lose any existing internal links to notes created by the plugin.
>
>If you plan to upgrade the plugin from v1.x.x to v2.0.0, and want to make sure any internal links in your Obsidian vault to notes created by the plugin remain intact, then you should ensure all your notes have the file tracking property in their frontmatter before the upgrade.

Below is a step-by-step guide how you can prepare an existing Readwise library by adding the `uri` tracking property to your items before upgrading to ensure links to items in your Readwise library will be updated after an upgrade.

1. Make sure you have a backup of your Obsidian vault (or at least your Readwise mirror folder with the notes created by this plugin).
2. In the plugin settings in v1.x.x, add the `uri` tracking property (or whatever property key you plan to use for file tracking) to the Frontmatter template. You can replace (recommended) the frontmatter template with the following, and enable Frontmatter[^1]:

   ```yaml
   ---
   uri: {{ highlights_url }}
   ---
   ```

3. Run **a full sync** to establish proper tracking properties (this will overwrite your local changes based on the current settings for the colon, but it will preserve the filenames of your existing files according to the way v1.4.11 of the plugin creates these. In consequence, all internal links will remain valid).

4. Upgrade the plugin to `2.0.0` and enable file tracking (this will ensure the tracking property will always be added to newly created or updated notes).
5. Rebuild the frontmatter templates and adjust the filename settings to your liking (you can also reset the templates to their default: simply delete the whole template value).
6. Run **a full sync** to rebuild all the notes according to the new settings and enjoy the new features of Readwise mirror 2.x.x. 

Your subsequent syncs will then use the `uri` property to track unique files and ensure links to items in your Readwise library will be updated, even if the note filenames change with the new version of the plugin.

>[!TIP]
>If you are unsure what the plugin will do to your Obsidian Obsidian vault after the upgrade, we would recommend that you create a copy of the Obsidian vault and run a test upgrade according to the steps described above.

### Major Changes

- Switched to using Readwise's "export" API, providing access to document summaries and additional metadata (implements #39)
- Completely rewrote the deduplication logic to handle edge cases like special characters and items with identical titles
- Implemented consistent use of `normalizedPath()` throughout for better filename generation and handling (BREAKING CHANGE)
- Added robust frontmatter creation, validation and preservation during note creation and updates, resulting in more reliable generation of valid frontmatter (precondition for using frontmatter as reliable basis for file tracking)
- Introduced file tracking using unique Readwise URLs for reliable deduplication and internal linking in Obsidian
- Implemented `/api_auth` endpoint for token retrieval, you can now retrieve your token from the plugin settings page
- Implemented filters for use with Readwise notes

### New Features

- Added Q&A parsing with new `is_qa` and `qa` nunjucks filters for `.qa` action tags in Readwise  
- Improved title, author, and frontmatter template handling to persistently create valid frontmatter
- Added slugify option for filenames (implements #27)
- Implemented `filenamify` for valid filenames with 255 character limit (implements #37)
- Enhanced documentation and settings UI with template explanations
- Added options to clean-up author names from Readwise
- Introduced debug option in UI to control console logging
- Added proper escaping for arrays of strings in frontmatter (authors, tags)

### Developer Updates

- Implemented semantic-release workflow using `brianrodri/semantic-release-obsidian-plugin`
- Added local deploy and release actions (`npm run deploy:local`))
- Restructured codebase 
- Added GitHub workflow for automated releases
- Separated settings from main class

BREAKING CHANGE: This is a major rewrite that changes how filenames are generated and validated. Please consult the documentation for migrating existing libraries, particularly regarding the new URL-based tracking system.

## 1.4.11 (2023-10-28)
- UI: Update "Open in Readwise" text to "View Highlight", to better align with official plugin expected behavior

## 1.4.1 (2023-10-27)
This update adds better support for Readwise article highlighting and default tag template additions. Thanks to first time contributor @tdznr for adding to this release!

- Feature: Add "Open in Readwise" link when Readwise url field is present.
  -The url field contains the link to Readwise's website showing the highlighted snippet in its source context.
  - The url field is not available for book types, but is available for other content types such as Articles.
- Feature: Show tags in default highlight template

## 1.4.0 (2023-08-18)
Thanks to @johannrichard for the following contributions:

### Features
- Feature: ✨ add frontmatter tag field
- Feature: ✨ roll-up of highlight tags into frontmatter
  - a rolled-up (deduplicated) list highlight tags can be used in frontmatter via the field `quoted_highlight_tags`
- Feature: ✨ user setting for "colon" (:) replacement
  - The colon in a title is a special character which by default is replaced witha a dash (-) in filenames. With this change, users can choose what string to use as a replacement.
- Feature: ✨ Multi-line text can be filtered with the `bq` filter
  - The filter adds the `>` character after each line-break
  - With this, you can get multi-line text blockquotes in your templates working correctly
    ### Example
    The following highlight
    ```
    Multi-line text in blockquotes

    This is an example of a multi-line highlight with line-breaks.
    ```
    ... with this template
    ```markdown+nunjucks
    > [!quote]
    > {{ text | bq }}
    ```
    will turn into
    ```markdown
    > [!quote]
    > Multi-line text in blockquotes
    >
    > This is an example of a multi-line highlight with line-breaks.
    ```
### Updates
- Change field names to reflect their use in frontmatter
- Introduce option for quotes in tag format
  - make tag formatting more flexible
  - avoid adding quotes all the time
  - differentiate nohas from quoting
- Introduce option for quotes in tag format

## 1.3.0 (2022-12-10)
### Added
- Sort Highlights by Location (instead of date highlighted).
  - This will display highlights in order of page location, from least to greatest.
  - Combine with Sort Highlights from Oldest to Newest to reverse the sort order.
- Filter Discarded Highlights.
  - With this option enabled, highlights that have been discarded in Readwise will not be displayed in the Obsidian library.

## 1.1.1 (2021-08-01)
### Added
- Added Sync Log functionality. Creates a file (configurable, with a default filename of `Sync.md`) in the Readwise library root folder, which stores a time-based log listing when Readwise sources have synced new highlights

## 1.1.0 (2021-06-24)
### Added
- Added tag support, both in highlights and sources (books, articles, etc)

## 1.0.2 (2021-05-24)
### Fixed
- Fixed linking bug when illegal characters were stripped in filename, but not in Note title (https://github.com/jsonMartin/readwise-mirror/issues/4)
### Changed
- Starting default sort order preference now sorts highlights chronologically from oldest to newest

## 1.0.1 (2021-05-24)
### Added
- Added new checkbox in settings to allow highlights to be listed in reverse chronological order

### Fixed
- Fixes plugin breaking when there is no author (thanks @shabegom!)

### Development
- Added Prettier configuration for project style consistency

[^1]: You might want to ensure that properties like `author` are omitted from the template as these have a tendency to break frontmatter. Alternatively, you can use the `authorStr` variable, or run a plugin like "Linter" to check and fix all your Readwise notes before upgrading.
