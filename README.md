# Readwise Mirror Plugin
**Readwise Mirror** is an unoffical open source plugin for the powerful note-taking and knowledge-base application [Obsidian](http://obsidian.md/). This plugin allows a user to "mirror" their entire Readwise library by automatically downloading all highlights/notes and syncing changes directly into an Obsidian vault.

![example.gif](example.gif)

The format of the output is similar to the Markdown export available directly from Readwise (which groups all highlights together in one file per book/article/etc), except that it is integrated directly into Obsidian and provides beneficial Obsidian formatting enhancements, such as automatically creating `[[Links]]` for Book Titles and Author Names *(supports multiple authors)* and block level link references *(using highlight ID)*.

The first time this plugin is ran, it will do a full sync downloading all content from Readwise. Every subsequent sync will only check for sources with new changes made after the last sync attempt; if any are found, it will automatically regenerate the note with the most current data.

## Features
- Supports custom folder for Readwise Library content (default is `Readwise`)
- Subfolders for content type (such as `Books`, `Articles`, etc)
- Full one-way sync ensuring highlights are always current
- Downloads entire Readwise library in a format similar to Readwise manual Markdown export
- Enhanced Obsidian Markdown formatting
  - Automatically creates `[[Links]]` for book titles and authors
  - Contains block level link references *(using the Highlight ID)*. Allows to automatically link/transclude any highlight without needing to modify the Readwise note.

## Usage
After installing, visit the plugin configuration page to enter the Readwise Access Token, which can be found here: [https://readwise.io/access_token](https://readwise.io/access_token)

Then run any of the below commands or click the Readwise toolbar to sync for the first time.
## Commands
- `Sync new highlights`: Download all new highlights since previous update
- `Test Readwise API key`: Ensure the Access Token works
- `Delete Readwise library`: Remove the Readwise library file folder from vault
- `Download entire Readwise library (force)`: Forces a full download of all content from Readwise

## How does this work?
### One-way mirror sync vs append-based sync
Any changes made to content in Readwise will be automatically updated during the next sync. **It's important to note that this is a *read only/one way sync*, meaning that any new highlights detected from Readwise will cause the note file to automatically regenerate with the new content**. This was a deliberate design decision to ensure that Readwise is the ultimate source of truth for data; any changes to currently existing highlights in Readwise are always reflected rather than getting out of sync. While another possible solution is to append new highlights to existing content notes instead, it is not feasible to modify existing highlights; this is how Readwise's integration with other services such as Notion & Roam work:
> If I edit or format an existing highlight in Readwise, or make a new note or tag to an existing highlight, will that change be updated in Notion? <br /><br />
> Not at the moment. Any edits, formatting, notes, or tags you had in Readwise before your first sync with Notion will appear in Notion, but new updates to existing highlights will not be reflected in already synced highlights.

### The `obsidian-readwise` plugin for append-based syncing
In addition to this plugin, there is also another Readwise community plugin for Obsidian named [obsidian-readwise](https://github.com/renehernandez/obsidian-readwise), which can be found at: [https://github.com/renehernandez/obsidian-readwise](https://github.com/renehernandez/obsidian-readwise). Both plugins exist for different use cases, so please read below to determine which best suits your needs.

**Because of the way the mirror sync works in this plugin, users lose the ability to modify their notes as the plugin is responsible for managing all note files in the Readwise library.** If a user needs full control over their library or the ability to modify notes and highlights directly in Obsidian, [obsidian-readwise](https://github.com/renehernandez/obsidian-readwise) would be the better choice.

#### **TL;DR**
- Download [obsidian-readwise](https://github.com/renehernandez/obsidian-readwise) to import new highlights to your library with full control over the ability to modify and format your notes
- Download this plugin if you want to mirror your entire Readwise Library into Obsidian and sync modifications to previous highlights

## Performance
If the update is so large that a Readwise API limit is reached, this plugin has a rate limiting throttling solution in place to continue automatically continue downloading the entire library as soon as the limit expires.

As a reference for performance, syncing my library of 5,067 Highlights across 92 books and 9 articles took approximately 20 seconds.

## Manual Installation
- Browse to [releases](https://github.com/jsonMartin/readwise-mirror/releases)
- Download `main.js` and `manifest.json` of the latest release
- Create a `readwise-mirror` subdirectory in your Obsidian plug-in directory (in `.obsidian/plugins` in your vault)
- Move the two downloaded files there
- In Obsidian, go to Settings, scroll down to Community Plug-ins, and activate it.
  - If it refuses to activate with an error message, open the developer console (with Ctrl-Shift-I) and check for error messages.

## Future possible feature ideas
- Custom Template engine support
  - Would allow for custom headers/footers