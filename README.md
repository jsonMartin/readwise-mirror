# Readwise Sync Plugin
Readwise Sync Plugin is an unoffical open source plugin for Obsidian allowing for downloading & syncing an entire Readwise library directly to an Obsidian vault.

The format of the output is similar to the Markdown export available directly from Readwise (which groups all highlights together in one file per book/article/etc), except that it is integrated directly into Obsidian and provides beneficial Obsidian formatting enhancements, such as automatically creating `[[Links]]` for Book Titles and Author Names (supports multiple authors) and block level link references (using highlight ID).

The first time this plugin is ran, it will do a full sync downloading all content from Readwise. Every subsequent sync will only check for and download new highlights created after the last sync attempt.

![example.gif](example.gif)

## Features
- Supports custom folder for Readwise Library content (default is `Readwise`)
- Subfolders for content type (such as `Books`, `Articles`, etc)
- Full one way sync ensuring highlights are always current
- Downloads entire Readwise library in a format similar to Readwise manual Markdown export
- Enhanced Obsidian Markdown formatting
  - Automatically creates `[[Links]]` for book titles and authors
  - Contains block level link references (using the Highlight ID). Allows to automatically link/transclude any highlight without needing to modify the Readwise note.

## Usage
After installing, visit the plugin configuration page to enter the Readwise Access Token, which can be found here: [https://readwise.io/access_token](https://readwise.io/access_token)

Then run any of the below commands or click the Readwise toolbar to sync for the first time.
## Commands
- `Sync new highlights`: Download all new highlights since previous update
- `Test Readwise API key`: Ensure the Access Token works
- `Delete Readwise library`: Remove the Readwise library file folder from vault
- `Download entire Readwise library (force)`: Forces a full download of all content from Readwise

## How does this work?
Any changes made to content in Readwise will be automatically updated during the next sync. It's important to note that this currently is a **read only/one way sync**, meaning that any new highlights detected from Readwise will cause the note file to automatically regenerate with the new content. This was a deliberate design decision to ensure that Readwise is the ultimate source of truth for data; any changes to currently existing highlights in Readwise are always reflected rather than getting out of sync. While another possible solution is to append new highlights to existing content notes instead, it is not feasible to modify existing highlights; this is how Readwise's integration with other services such as Notion & Roam work:
> If I edit or format an existing highlight in Readwise, or make a new note or tag to an existing highlight, will that change be updated in Notion? <br /><br />
> Not at the moment. Any edits, formatting, notes, or tags you had in Readwise before your first sync with Notion will appear in Notion, but new updates to existing highlights will not be reflected in already synced highlights.

If the update is so large that a Readwise API limit is reached, this plugin has a rate limiting throttling solution in place to continue automatically continue downloading the entire library as soon as the limit expires.

As a reference for performance, syncing my library of 5,067 Highlights across 92 books and 9 articles took approximately 20 seconds.

**Note: This has not yet been tested on Mobile beta**

## Future possible feature ideas
- Custom Template engine support
  - Would allow for custom headers/footers

- Separate option to append new highlights to existing notes?
  - This would allow users to manually edit their Readwise notes in Obsidian, at the expense of existing highlights no longer being synced (for example, if a note is added to an existing highlight while using a Kindle). This mimics how Readwise's other integrations work.
  - New Highlights would be appended to the bottom of the existing note if it exists; if not, a new note would be created.