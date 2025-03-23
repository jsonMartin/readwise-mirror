# Readwise Mirror Plugin

> [!WARNING]  
> Readwise Mirror 2.x is a major rewrite of the plugin which might break things due to changes how filenames are generated and validated. The documentation contains a step-by-step guide how you can prepare an existing Readwise library by adding the `uri` tracking property to your items before upgrading to ensure links to items in your Readwise library will be updated. You can find the guide [here](#upgrading-from-1xx-to-2xx).

**Readwise Mirror** is an unoffical open source plugin for the powerful note-taking and knowledge-base application [Obsidian](http://obsidian.md/). This plugin allows a user to "mirror" their entire Readwise library by automatically downloading all highlights/notes and syncing changes directly into an Obsidian vault.

![example.gif](https://raw.githubusercontent.com/jsonMartin/readwise-mirror/master/example.gif)

The format of the output is similar to the Markdown export available directly from Readwise (which groups all highlights together in one file per book/article/etc), except that it is integrated directly into Obsidian and provides beneficial Obsidian formatting enhancements, such as automatically creating `[[Links]]` for Book Titles and Author Names *(supports multiple authors)* and block level link references *(using highlight ID)*.

The first time this plugin is ran, it will do a full sync downloading all content from Readwise. Every subsequent sync will only check for sources with new changes made after the last sync attempt; if any are found, it will automatically regenerate the note with the most current data.

## Features

- **Flexible Organization**
  - Customizable library folder location (defaults to `Readwise`)
  - Automatic content categorization into subfolders (Books, Articles, etc.)

- **Seamless Syncing**
  - Complete one-way synchronization that keeps your highlights current
  - Downloads your entire Readwise library in clean Markdown format

- **Enhanced Obsidian Integration**
  - Automatic `[[Links]]` creation for book titles and authors
  - Block references using highlight IDs for easy linking and transclusion
  - Full support for tags on both highlights and sources
  - Integration with Readwise Reader features like summaries and document notes

- **Smart File Management**
  - Uses Readwise's unique URLs to track notes across title changes
  - Automatically updates filenames and content while preserving links
  - Protected frontmatter fields to maintain your custom note properties
  - URL-friendly filename conversion (slugification)

## Commands

- `Sync new highlights`: Download all new highlights since previous update
- `Test Readwise API key`: Ensure the Access Token works
- `Delete Readwise library`: Remove the Readwise library file folder from vault
- `Download entire Readwise library (force)`: Forces a full download of all content from Readwise
- `Adjust Filenames to current settings`: CLean up filenames of existing files in your Readwise library folder based on current filename settings (whitespace removal and slugify only for the time being)

## Settings

### General

#### Authentication

The plugin provides OAuth-based authentication with Readwise. After installing, visit the plugin settings and use the "Authenticate with Readwise" button to set up the connection.

#### Library Settings

- **Library folder name**: Where to store the Readwise library (defaults to `Readwise`)
- **Auto sync when starting**: Automatically sync new highlights when Obsidian opens

#### Sync Logging

- **Sync log**: Enable writing sync results to a file
- **Log filename**: Name of the log file (defaults to `Sync.md`)

### Organization

#### Author Names

These settings control how author names are processed. If enabled, titles (Dr., Prof., Mr., Mrs., Ms., Miss, Sir, Lady) will be stripped from author names. This is useful for cases where you don't want to change the author names in Readwise (e.g. to avoid duplicate highlights).

For example, given the author string: "Dr. John Doe, and JANE SMITH, Prof. Bob Johnson"

The different settings will produce:

- **Default**: "Dr. John Doe, JANE SMITH, Prof. Bob Johnson"
- **Normalize case**: "Dr. John Doe, Jane Smith, Prof. Bob Johnson"
- **Strip titles**: "John Doe, JANE SMITH, Bob Johnson"
- **Both enabled**: "John Doe, Jane Smith, Bob Johnson"

The plugin will split the authors returned by Readwise into an array which can be used in Frontmatter and other templates.

#### Highlights Organization

- **Sort highlights from oldest to newest**: Control highlight ordering
- **Sort highlights by location**: Use document location for ordering
- **Filter discarded highlights**: Hide discarded highlights
- **Sync highlights with notes only**: Only sync highlights that have notes

#### Filenames

- **Custom filename template**: Generate filenames using variables like `{{title}}`, `{{author}}`
- **Colon replacement**: Character to replace colons in filenames
- **Slugify filenames**: Create clean, URL-friendly filenames

### Templates

The plugin uses three template types to format content:

- **Frontmatter Template**: Controls YAML metadata
- **Header Template**: Controls document structure
- **Highlight Template**: Controls individual highlight formatting

## Usage

After installing, visit the plugin configuration page to enter the Readwise Access Token, which can be found here: [https://readwise.io/access_token](https://readwise.io/access_token)

Then run any of the commands or click the Readwise toolbar to sync for the first time.

## How does this work?

### One-way mirror sync vs append-based sync

Any changes made to content in Readwise will be automatically updated during the next sync. **It's important to note that this is a *read only/one way sync*, meaning that any new highlights detected from Readwise will cause the note file to automatically regenerate with the new content**. This was a deliberate design decision to ensure that Readwise is the ultimate source of truth for data; any changes to currently existing highlights in Readwise are always reflected rather than getting out of sync. The notable exception is frontmatter ("Properties") which can be protected if you allow the plugin to track notes with their unique Readwise URL. See below for other options. While another possible solution is to append new highlights to existing content notes instead, it is not feasible to modify existing highlights; this is how Readwise's integration with other services such as Notion & Roam work:
> If I edit or format an existing highlight in Readwise, or make a new note or tag to an existing highlight, will that change be updated in Notion?
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

### Using BRAT for Beta Testing

The current recommended way to test beta features is through frozen beta versions using BRAT:

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin in Obsidian
2. Go to the [releases page](https://github.com/jsonMartin/readwise-mirror/releases) and note the latest beta version number (e.g. `1.5.1-beta.1`), labeled as pre-release
3. Open BRAT settings and add the beta repository:
   - Click "Add Beta Plugin with frozen version"
   - Enter `jsonMartin/readwise-mirror`
   - Enter the version number you noted from releases (e.g. `1.5.1-beta.1`)
   - Click "Add Plugin"

Note: Beta versions are currently distributed as frozen releases that must be installed through BRAT's version selector. In the future, BRAT might support a feature that allows automatic updates to the latest pre-release version on GitHub.

### Manual Download

- Browse to [releases](https://github.com/jsonMartin/readwise-mirror/releases)
- Download `main.js` and `manifest.json` of the latest release
- Create a `readwise-mirror` subdirectory in your Obsidian plug-in directory (in `.obsidian/plugins` in your vault)
- Move the two downloaded files there
- In Obsidian, go to Settings, scroll down to Community Plug-ins, and activate it.
  - If it refuses to activate with an error message, open the developer console (with Ctrl-Shift-I) and check for error messages.

## Sync highlights with notes only

A lot of the value of Readwise highlights lies in the notes associated with them. E.g. if you are building a Zettelkasten and want to work with literature notes, you typically only want highlights with notes in your Zettelkasten -- and not every highlight.

The option "Only sync highlights with notes" will do exactly that: it will only sync highlights with notes. If an item in your library has only highlights without notes, it will not be synced.

## Author Name Settings

These settings control how author names are processed. If enabled, titles (Dr., Prof., Mr., Mrs., Ms., Miss, Sir, Lady) will be stripped from author names. This is useful for cases where you don't want to change the author names in Readwise (e.g. to avoid duplicate highlights).

For example, given the author string: "Dr. John Doe, and JANE SMITH, Prof. Bob Johnson"

The different settings will produce:

- **Default**: "Dr. John Doe, JANE SMITH, Prof. Bob Johnson"
- **Normalize case**: "Dr. John Doe, Jane Smith, Prof. Bob Johnson"
- **Strip titles**: "John Doe, JANE SMITH, Bob Johnson"
- **Both enabled**: "John Doe, Jane Smith, Bob Johnson"

The plugin will split the authors returned by Readwise into an array which can be used in Frontmatter and other templates.

## Slugify Filenames

The plugin provides an option to "slugify" filenames. This means converting the filenames into a URL-friendly format by replacing spaces and special characters with hyphens or other safe characters. This is useful for ensuring compatibility across different filesystems and avoiding issues with special characters.

### Options

- **Default**: The default behavior does not modify filenames.
- **Slugify**: Converts filenames to a slugified format. For example, `My Book Title` becomes `my-book-title`. You can select a separator and whether the filename will be all lowercase

To enable slugifying filenames, go to the plugin settings and toggle the "Slugify Filenames" option. Please note that this is a major change. You will end up with duplicate files unless you delete and sync the entire library.

## Templating

The plugin uses three template types to format content, all using Nunjucks templating syntax:

### Template Types

- **Header Template**: Controls document structure and metadata display
- **Highlight Template**: Controls individual highlight formatting
- **Frontmatter Template**: Controls YAML metadata (optional)

### Frontmatter Validation

Real-time template validation for the frontmatter ensures:

- Valid YAML syntax
- Proper field escaping
- Correct template variables
- Preview with sample data

## Frontmatter Management

### Updating Frontmatter

The plugin provides granular control over how frontmatter is handled in existing files:

- **Update Frontmatter**: When enabled, updates frontmatter in existing files during sync, overwriting values defined in the frontmatter template and keeping additional fields you might have added since the last sync.
- When disabled, existing frontmatter will always completely be overwritten
- Works best with File Tracking enabled to ensure consistent file handling

### Frontmatter Protection

Protect specific frontmatter fields from being overwritten during sync:

1. Enable "Protect Frontmatter Fields"
2. Enter field names to protect (one per line), for example:

   ```yaml
   status
   tags
   categories
   ```

3. Protected fields will retain their values during sync **only if they already exist** in the file
4. Fields listed for protection but not present in the file will be:
   - Added normally on first sync
   - Protected in subsequent updates once they exist
5. Note: If File Tracking is enabled, the tracking field (e.g., `uri`) cannot be protected

#### Example

If you have an existing note:

```yaml
---
title: My Article
status: in-progress  # Will be protected
tags: [research]     # Will be protected
uri: https://readwise.io/article/123
---
```

And protect `status`, `tags`, and `category`:

- `status` and `tags` will keep their values
- `category` would:
  - Be added if present in the first sync
  - Be protected in future syncs once it exists

>**Note**:
>
> - Frontmatter protection only works when "Update Frontmatter" is enabled.
> - Fields must exist in the file to be protected
> - Non-existent protected fields will be written once, then protected

### Available Variables

#### Document Metadata

| Variable | Description | Example |
|----------|-------------|---------|
| `id` | Document ID | `12345` |
| `title` | Original title | `"My Book"` |
| `sanitized_title` | Filesystem-safe title | `"My-Book"` |
| `author` | Author name(s) | `"John Smith"` |
| `authorStr` | Author with wiki links | `"[[John Smith]]"` |
| `category` | Content type | `"books"` |

#### Header / Frontmatter Content

| Variable | Description | Example |
|----------|-------------|---------|
| `document_note` | Reader document note | `"My reading notes..."` |
| `summary` | Reader summary | `"Book summary..."` |
| `num_highlights` | Number of highlights | `42` |
| `cover_image_url` | Cover image URL | `"https://..."` |

#### URLs

| Variable | Description | Example |
|----------|-------------|---------|
| `highlights_url` | Readwise URL | `"https://readwise.io/..."` |
| `source_url` | Original content URL | `"https://..."` |
| `unique_url` | Reader URL (if available) | `"https://reader.readwise.io/..."` |

#### Tags

| Variable | Description | Example |
|----------|-------------|--------|
| `tags` | Document tags with # | `"#tag1, #tag2"` |
| `tags_nohash` | Tags for frontmatter | `"'tag1', 'tag2'"` |
| `highlight_tags` | Highlight tags with # | `"#note, #important"` |
| `hl_tags_nohash` | Highlight tags for frontmatter | `"'note', 'important'"` |

#### Timestamps

| Variable | Description |
|----------|-------------|
| `created` | Creation date |
| `updated` | Last update |
| `last_highlight_at` | Last highlight date |

### Template Filters

- `bq`: Add blockquote markers.
- `is_qa`: Check for Q&A format.
- `qa`: Convert to Q&A format.

#### Default frontmatter template

```markdown+nunjucks
---
id: {{ id }}
updated: {{ updated }}
title: {{ title }}
author: {{ author }}
---
```

#### Example of a more complex frontmatter template

The following would print both document and all highlight tags, rolled-up:

```markdown+nunjucks
---
id: {{ id }}
updated: {{ updated }}
title: {{ title }}
alias: {{ sanitized_title }}
author: {{ author }}
highlights: {{ num_highlights }}
last_highlight_at: {{ last_highlight_at }}
source: {{ source_url }}
tags: [ {%- if tags_nohash %}{{ tags_nohash }},{%- endif %}{%- if hl_tags_nohash %} {{ hl_tags_nohash }}{%- endif %} ]
---
```

#### Default header template

```markdown+nunjucks
%%
ID: {{ id }}
Updated: {{ updated }}
%%

![]( {{ cover_image_url }})

# About
Title: [[{{ title }}]]
Authors: {{ authorStr }}
Category: #{{ category }}
{%- if tags %}
Tags: {{ tags }}
{%- endif %}
Number of Highlights: =={{ num_highlights }}==
Readwise URL: {{ highlights_url }}
{%- if source_url %}
Source URL: {{ source_url }}
{%- endif %}
Date: [[{{ updated }}]]
Last Highlighted: *{{ last_highlight_at }}*
{%- if summary %}
Summary: {{ summary }}
{%- endif %}

---

{%- if document_note %}
# Document Note

{{ document_note }}
{%- endif %}

# Highlights

```

### Highlight Template Variables

#### Highlight Content

| Variable | Description | Example |
|----------|-------------|---------|
| `text` | Highlighted text | `"This is the highlight"` |
| `note` | Your annotation | `"My thoughts on this..."` |
| `color` | Highlight color | `"yellow"` |

#### Location

| Variable | Description | Example |
|----------|-------------|---------|
| `location` | Position reference | `"Page 42"` |
| `location_url` | Direct link to location | `"https://readwise.io/to_kindle?..."` |
| `url` | Source URL | `"https://readwise.io/open/..."` |

#### Metadata

| Variable | Description | Example |
|----------|-------------|---------|
| `id` | Highlight ID | `"abc123"` |
| `category` | Content type | `"books"` |
| `tags` | Associated tags | `"#important, #todo"` |
| `highlighted_at` | Creation date | `"2024-01-20"` |
| `created_at` | Creation timestamp | `"2024-01-20T10:00:00Z"` |
| `updated_at` | Last update timestamp | `"2024-01-21T15:30:00Z"` |

#### Available Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `bq` | Add blockquote markers | `{{ text \| bq }}` |
| `is_qa` | Check for Q&A format | `{% if note \| is_qa %}` |
| `qa` | Convert to Q&A format | `{{ note \| qa }}` |

#### Default highlight template

```markdown+nunjucks
{{ text }}{%- if category == 'books' %} ([{{ location }}]({{ location_url }})){%- endif %}{%- if color %} %% Color: {{ color }} %%{%- endif %} ^{{id}}{%- if note %}

Note: {{ note }}
{%- endif %}{%- if tags %}

Tags: {{ tags }}
{%- endif %}

---
```

### Blockquote filter

If you want to use blockquotes for text fields in your template, there's a handy `bq` filter that will put the quote character (`>`) in front of every new line. This is useful for both multi-line highlights as well as multi-line notes.

With this filter, templates like the following become possible, without breaking the blockquote.

```markdown+nunjucks
> [!quote]
> {{ text | bq }}{%- if category == 'books' %} ([{{ location }}]({{ location_url }})){%- endif %}{%- if color %} %% Color: {{ color }} %%{%- endif %} ^{{id}}{%- if note %}
Note: {{ note }}
{%- endif %}{%- if tags %}
Tags: {{ tags }}
{%- endif %}
---
```

### Q & A Filter

If you want to render [notes with the `.qa` action tag](https://docs.readwise.io/reader/docs/faqs/action-tags#how-can-i-create-a-q-and-a-mastery-card-while-reading) properly, the plugin makes several nunjucks filters available for that:  

- `is_qa`: this filter returns `true` if the string it is applied to contains the `.qa` action tag
- `qa`: this filter extracts the question and answer and returns them as a rendered string

Using both filters, you could for example format Q&A notes differently from regular notes.

```nunjucks
{# Example template using both filters #}
{% if note | is_qa %}
  {{ note | qa }}
  **Original Highlight:** 
  {{ text | replace('__', '==') }}  
  ***
{% else %}
  > [!quote]
  > {{ text | bq | replace('__', '==') }}  
  {{ note }}
{% endif %}
```

### Example Q&A Output

Input note with `.qa` tag:

> .qa What is the capital of France? Paris is the capital of France.

Rendered output:
> **Q:** What is the capital of France?
>
> **A:** Paris is the capital of France.

### Limitations

- The templating is based on the [`nunjucks`](https://mozilla.github.io/nunjucks/templating.html) templating library and thus shares its limitations;
- Certain strings (e.g. date, tags, authors) are currently preformatted

## Deduplication

The plugin implements a deduplication strategy to handle both tracked and untracked files, ensuring consistency in your vault while preserving existing content and links.

### File Tracking

When File Tracking is enabled (via `trackFiles` and `trackingProperty` settings), the plugin uses the `highlights_url` property to track unique documents from Readwise.

## Deduplication Strategy

### Path-Based Grouping

Files are first grouped by their normalized path (category + filename), handling potential case-sensitivity issues across different filesystems. This ensures consistent behavior regardless of your operating system but leaves different items with the same filename in different categories untouched (e.g. Books and Supplemental Books).

### Processing Logic

#### For Tracked Files (File Tracking Enabled)

1. **Existing Files with Matching `highlights_url`**

   ```shell
   📄 "My Article.md" (primary, matching highlights_url)
   └── Updates content and frontmatter
   📄 "Same Article.md" (duplicate, matching highlights_url)
   └── Either deleted or marked as duplicate: true
   ```

2. **Path Collision (Different `highlights_url`)**

   ```shell
   📄 "My Article.md" (existing file)
   📄 "My Article <hash>.md" (new file)
   └── Creates new file with hash suffix
   ```

#### For Untracked Files (File Tracking Disabled)

When multiple files share the same path:

```shell
📄 "My Article.md" (first file)
📄 "My Article <hash1>.md" (second file)
📄 "My Article <hash2>.md" (third file)
└── First file keeps original name, others get unique hashes
```

### File Operations

The plugin carefully manages file operations to maintain vault consistency:

1. **Content Updates**
   - Preserves original file creation and modification timestamps
   - Selectively updates frontmatter based on `updateFrontmatter` setting
   - Handles filename changes while maintaining internal links and metadata

2. **Duplicate Management**
   Based on your settings, duplicates are handled in one of two ways:
   - When `deleteDuplicates: true`, duplicate files are moved to trash
   - When `deleteDuplicates: false`, duplicates are marked with `duplicate: true` in frontmatter

## Special Considerations

### Filename Changes

The plugin implements a robust strategy for handling filename changes:

1. First attempts a direct rename to the new filename
2. If a file already exists at the target path, creates a new file with a hash suffix
3. Throughout the process, preserves all metadata and internal links to Readwise items (please note that Markdown / Wikilinks in your notes can not be preserved, as the plugin can not sync changes to the original Readwise content)

### Remote Duplicates

Readwise can contain multiple items sharing the same title but with different IDs. The plugin handles these cases by:

1. Using the plain filename (e.g. `My Duplicate Book.md`) for the first encountered item
2. Adding a short hash of the Readwise ID to subsequent files (e.g. `My Duplicate Book <HASH>.md`)

## Deduplication Limitations

The current implementation has several important considerations:

- File ordering affects clean filename assignment, though we mitigate this by sorting by Readwise ID (ascending)
- Initial setup requires a full sync to establish proper tracking properties
- During the initial full sync, local modifications may be overwritten
- Platform differences in case-sensitivity are handled through normalized path comparison

## Best Practices

To get the most out of the deduplication system:

1. Enable File Tracking for the most reliable deduplication experience
2. Run a full sync when first enabling tracking
3. Consider maintaining unique titles in Readwise to minimize hash suffix usage

## Upgrading from 1.x.x to 2.x.x

If you are upgrading from 1.x.x to 2.x.x, and want to preserve your existing links to items in your Readwise library, you need to follow these steps before upgrading the plugin:

1. Make sure you have a backup of your vault (or at least your Readwise Mirror folder)
2. In the plugin settings, add the `uri` tracking property to the Frontmatter template. Just add the following at the end of the template and enable Frontmatter[^1]:

   ```yaml
   uri: {{ highlights_url }}
   ```

3. Run **a full sync** to establish proper tracking properties (this will overwrite your local changes, but will preserve the filenames of your existing files according to the way version 1.4.11 of the plugin creates them)

4. Upgrade the plugin to 2.x.x and enable File Tracking

Your subsequent syncs will then use the `uri` property to track unique files and ensure links to items in your Readwise library will be updated, even if the generated filenames change with the new version of the plugin.

As an additional measure, you can also use the `Adjust Filenames to current settings` command. This will iteratively go through all files in your Readwise library only and will rename the files according to the general settings (incl. slugify), and will also remove things like multiple or trailing spaces in filenames. Links from other Notes to renamed files will be updated.

[^1]: You might want to ensure that properties like `author` are omitted from the template as these have a tendency to break frontmatter. Alternatively, you can use the `authorStr` variable, or run a plugin like "Linter" to check and fix all your Readwise notes before upgrading.
