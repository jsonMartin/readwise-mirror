# Readwise Mirror Plugin

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

## Slugify Filenames

The plugin provides an option to "slugify" filenames. This means converting the filenames into a URL-friendly format by replacing spaces and special characters with hyphens or other safe characters. This is useful for ensuring compatibility across different filesystems and avoiding issues with special characters.

### Options

- **Default**: The default behavior does not modify filenames.
- **Slugify**: Converts filenames to a slugified format. For example, `My Book Title` becomes `my-book-title`. You can select a separator and whether the filename will be all lowercase

To enable slugifying filenames, go to the plugin settings and toggle the "Slugify Filenames" option. Please note that this is a major change. You will end up with duplicate files unless you delete and sync the entire library.

## Templates

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

If File Tracking is enabled, the plugin prevents duplicate files when articles are re-imported from Readwise, maintaining link consistency in your vault. This can be useful in a number of cases:

- if you change the character used to escape the colon `:` in your titles,
- when changing to use the "Slugify" feature, or changing its options, and  
- if the title of a Readwise item changes at the source

### How It Works

1. **File Matching**
   - Uses MetadataCache to find files with matching `readwise_url`
   - Checks all vault locations, not just the Readwise folder
   - Honors existing file structure

2. **Update Strategy**
   - If exact filename match exists: Updates content in place
   - If different filename exists: Updates first matching file, and changes this file's filename to the new filename
   - Additional matches: Either deleted or marked as duplicates (with the `duplicate` property)

3. **Link Preservation**
   - Maintains existing internal links
   - Preserves file locations in vault
   - Updates content while keeping references intact

### Duplicate Handling

If File Tracking is enabled, when duplicates are found:

1. **Exact Match**

   ```shell
   📄 "My Article.md" (existing)
   └── Updates content in place
   ```

2. **Different Filename**

   ```shell
   📄 "Article (2024).md" (existing)

   └── Updates content, changes filename to "My Article.md"
   ```

3. **Multiple Matches**

   ```shell
   📄 "My Article.md" (primary)
   └── Updated with new content
   📄 "Same Article.md" (duplicate)
   └── Deleted or marked with duplicate: true
   ```

### Deduplication limitations

Currently, the following limitations apply to deduplication:

- Readwise items with the exact same title will be detected, the first one in the export will be used to write to your vault
- To start using deduplication, you have to run a full sync to make sure all your files have the deduplication frontmatter property and can thus be deduplicated. This means any changes you made to your local files will be lost (this is not a new behaviour though, but you should be aware of it)

### Readwise (remote) duplicates

In Readwise, multiple items with the same title but different `id`'s can exist. This leads to a filename collision in `readwise-mirror`. If a such a duplicate ('remote dupliacate') is detected (because a file already exists with the "same" filename), the plugin will write a file which has the Readwise id value added to the filename of all detected duplicates.

The filename of two different Readwise items both titled `My Duplicate Book` would thus become `My Duplicate Book.md` and `My Duplicate Book <ID>.md` where `<ID>` would be the id value of the second item the plugin encounters when downloading. As this order can change between runs of the plugin (e.g. because of changes to one item which changes the order in the returned data), the filenames might change as well from run to run.
