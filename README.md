# Readwise Mirror Plugin

>[!WARNING]  
>Readwise Mirror 2.x is a major rewrite of the plugin which will break internal links if you update right away. This is due to changes how the filenames for notes created by this plugin are generated and handled.
>The documentation contains a step-by-step guide how you can prepare an existing Readwise library for an upgrade to 2.x.x by adding the `uri` tracking property to the frontmatter of your notes before upgrading. This will ensure links to notes synced from your Readwise library can be updated by Obsidian after the upgrade. You can find the guide [here](#upgrading-from-1xx-to-2xx).

**Readwise Mirror** is an unoffical open source plugin for the powerful note-taking and knowledge-base application [Obsidian](http://obsidian.md/). This plugin allows a user to "mirror" their entire Readwise library by automatically downloading all highlights/notes and syncing changes directly into an Obsidian vault.

Its advanced features allow you to keep internal links to your Readwise notes intact across syncs, protect or update frontmatter properties in your notes, and define custom filenames based on each Readwise item's properties.

![example.gif](https://raw.githubusercontent.com/jsonMartin/readwise-mirror/master/example.gif)

The format of the output is similar to the Markdown export available directly from Readwise (which groups all highlights together in one file per book/article/etc), except that it is integrated directly into Obsidian and provides beneficial Obsidian formatting enhancements, such as automatically creating `[[Links]]` for Book Titles and Author Names *(supports multiple authors)* and block level link references *(using highlight ID)*, as well as custom filenames and advanced frontmatter management.

The first time this plugin is ran, it will do a full sync, downloading all content from Readwise. Every subsequent sync will only check for sources with new changes made after the last sync attempt; if any are found, it will automatically regenerate the note with the most current data.

## Commands

- `Sync new highlights`: Download all new highlights since previous update
- `Test Readwise API key`: Ensure the Access Token works
- `Delete Readwise library`: Remove the Readwise library file folder from the Obsidian vault
- `Download entire Readwise library (force)`: Forces a full download of all content from Readwise
- `Adjust Filenames to current settings`: Clean up filenames of existing notes in your Readwise library folder based on current filename settings (whitespace removal and slugify only for the time being)

## Settings

The plugin can be configured via numerous settings and has different, advanced features that will allow for better integration of your Readwise highlights into your Obsidian vault. Please make sure you read the section on [advanced features](#advanced-features) below.

### General Settings

General settings of the plugin:

- **Debug mode**: Will generate lots of debug messages, usually not needed.
- **Authentication**: The plugin provides OAuth-based authentication with Readwise. After installing, visit the plugin settings and use the "Authenticate with Readwise" button to set up the connection.
- **Library folder name**: Specify the folder where the Readwise library will be stored (defaults to `Readwise`).
- **Auto sync on startup**: Automatically sync new highlights when Obsidian starts.
- **Sync log**: Enable writing sync results to a file.
- **Log filename**: Specify the name of the log file (defaults to `Sync.md`).

### File tracking and naming

Settings related to tracking notes across syncs, renames, and settings related to the way it generates the filenames used during sync:

- **File tracking**: Track the notes created from your readwise items using their unique readwise URL. This allows the plugin to maintain consistency across syncs, including for cases where the metadata of a Readwise item is changed in Readwise itself.[^2]
- **Filenames**: Define settings related to how the plugin generates filenames of the notes it creates.
  - **Custom filename template**: Define filenames using variables like `{{title}}`, `{{author}}`, `{{book_id}}` and others.
  - **Colon replacement**: Specify a character to replace colons in filenames.
- **Slugify filenames**: Convert filenames into a URL-friendly format by replacing spaces and special characters.

### Template Settings

The plugin supports three types of templates for formatting content which can be defined individually.

- **Frontmatter Template**: Defines the template for frontmatter (also called "properties") and how frontmatter is updated and protected across syncs.
- **Header Template**: Defines the structure and metadata display of the heade of the documents .
- **Highlight Template**: Defines the format of the individual highlights and the way highlights with and without notes are synced into your Obsidian library.

## Usage

After installing, visit the plugin configuration page (General) to authenticate with Readwise, and adjust the settings as you see fit.

Then run any of the commands or click the Readwise toolbar to sync for the first time.

>[!IMPORTANT]
>It is highly recommended that you enable at least File tracking. This will ensure future configuration changes, including to the file name template, colon replacement character, or metadata changes made on Readwise (title, author) will not create duplicates in your Obsidian library.  

## How does this work?

### **TL;DR**

- Download [obsidian-readwise](https://github.com/renehernandez/obsidian-readwise) to import new highlights to your library with full control over the ability to modify and format your notes
- Download this plugin if you want to mirror your entire Readwise Library into Obsidian and sync modifications to previous highlights

### One-way mirror sync vs append-based sync

Any changes made to content in Readwise will be automatically updated during the next sync. **It's important to note that this is a *read only/one way sync*, meaning that any new highlights detected from Readwise will cause the note file to automatically regenerate with the new content**. This was a deliberate design decision to ensure that Readwise is the ultimate source of truth for data; any changes to currently existing highlights in Readwise are always reflected rather than getting out of sync. The notable exception is frontmatter ("Properties") which can be protected if you allow the plugin to track notes with their unique Readwise URL. See below for other options. While another possible solution is to append new highlights to existing content notes instead, it is not feasible to modify existing highlights; this is how Readwise's integration with other services such as Notion & Roam work:
> If I edit or format an existing highlight in Readwise, or make a new note or tag to an existing highlight, will that change be updated in Notion?
> Not at the moment. Any edits, formatting, notes, or tags you had in Readwise before your first sync with Notion will appear in Notion, but new updates to existing highlights will not be reflected in already synced highlights.

### The `obsidian-readwise` plugin for append-based syncing

In addition to this plugin, there is also another Readwise community plugin for Obsidian named [obsidian-readwise](https://github.com/renehernandez/obsidian-readwise), which can be found at: [https://github.com/renehernandez/obsidian-readwise](https://github.com/renehernandez/obsidian-readwise). Both plugins exist for different use cases, so please read below to determine which best suits your needs.

### Which one to use?

**Because of the way the mirror sync works in this plugin, users lose the ability to modify their notes as the plugin is responsible for managing all note files in the Readwise library.** If a user needs full control over their library or the ability to modify notes and highlights directly in Obsidian, [obsidian-readwise](https://github.com/renehernandez/obsidian-readwise) would be the better choice.

## Performance

If the update is so large that a Readwise API limit is reached, this plugin has a rate limiting throttling solution in place to continue automatically continue downloading the entire library as soon as the limit expires.

As a reference for performance, syncing my library of 5,067 Highlights across 92 books and 9 articles took approximately 20 seconds.

## Manual Installation

### Using BRAT for Beta Testing

The current recommended way to test beta features is through frozen beta versions using BRAT:

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin in Obsidian
2. Open BRAT settings and add the beta repository:
   - Click "Add Beta Plugin with frozen version"
   - Enter `jsonMartin/readwise-mirror`
   - Select the preferred (pre-)release or `latest` in the version dropdown (available from BRAT `1.1.0`)
   - Click "Add Plugin"

### Manual Download

- Browse to [releases](https://github.com/jsonMartin/readwise-mirror/releases)
- Download `main.js` and `manifest.json` of the latest release
- Create a `readwise-mirror` subdirectory in your Obsidian plug-in directory (in `.obsidian/plugins` in your Obsidian vault)
- Move the two downloaded files there
- In Obsidian, go to Settings, scroll down to Community Plug-ins, and activate it.
  - If it refuses to activate with an error message, open the developer console (with Ctrl-Shift-I) and check for error messages.

## Advanced features

### File tracking

When File Tracking is enabled (via the File tracking settings on the "File tracking and naming" settings tab), the plugin uses the unique `highlights_url` field of a Readwise item to track unique documents from Readwise.[^4]

File tracking enables to key features in Readwise mirror:

- Updated internal links to your Readwise notes, and
- Robust handling of note filenames in case of duplicate filenames

#### Updated internal links

Linking between notes is an essential feature of Obsidian and file tracking enables that links to your Readwise notes are updated and working even if the filename of a note changes between sync runs.

If a user renames an Obsidian note or if a plugin programatically renames it, and if "Automatically update internal links" is enabled, Obsidian will ensure that all links to that note will be changed accordingly.

>[!IMPORTANT]
>File tracking searches existing Readwise notes with the tracking property **across your whole Obsidian vault**. If you have file tracking enabled and you move a note with the tracking property  created by the plugin to another folder outside of the Readwise library folder, it will still be found and updated (overwritten) by the plugin if the original item has changes that trigger a sync. You have to remove the tracking property (`uri` or whatever you chose) from the note to sever the tracking. Future versions might offer an option to limit tracking to the Readwise library folder.

#### Duplicate notes

If for some reason, syncing would create two note files with the same filename in your Readwise folder, the plugin will ensure these are handled based on the plugin settings. It will either:

- ensure a unique filename for the duplicate note file, or
- delete a duplicate note file

The plugin will ensure you get one note file for each Readwise item, even in cases of two or more notes created from different Readwise items (i.e. items with a different `id`) end up having the same filename (e.g. because you use the default filename template which is baed on the `title` field and you have two Readwise items with the same title in your library).[^3]

Note files are grouped by their path (category (e.g. "Article", "Book", etc.)). Handling of duplicate filenames will be done at category level. Different items with the same filename in different categories are left untouched (say if you have highlights in "De iure belli ac pacis" both in Books and Supplemental Books).

This may still lead to situations where two notes in your Obsidian vault have the same filename, but with a different path. This is standard and expected behavior in Obsidian.

### Processing logic

#### For tracked files (file tracking enabled)

1. **Existing files with matching `highlights_url`**

   ```shell
   📄 "My Article.md" (primary, matching highlights_url)
   └── Updates content and frontmatter
   📄 "Same Article.md" (duplicate, matching highlights_url)
   └── Either deleted or marked as duplicate: true
   ```

2. **Filename collision (different `highlights_url` but same filename)**

   ```shell
   📄 "My Article.md" (existing file)
   📄 "My Article <hash>.md" (new file)
   └── Creates new file with hash suffix
   ```

#### For untracked files (file tracking Disabled)

When multiple files share the same path:

```shell
📄 "My Article.md" (first file)
📄 "My Article <hash1>.md" (second file)
📄 "My Article <hash2>.md" (third file)
└── First file keeps original name, others get unique hashes added to it.
```

### Custom filenames

You can define a template for custom filenames that can include various fields (e.g. `title`, `author`) which is used by the plugin to build a custom filename. You can also use filters to format certain fields.

For example, the following template will create a filename with an "ID" based on the date and time the Readwise document was created:

```nunjucks
{{ created | date("YYYYMMDDHHMMSS") }}: {{ title }}
```

Assuming the colon (`:`) is replaced with `⁝`, this would results in a filename like:

```shell
20201001071004⁝ Outliers
```

Using custom filenames can be viable strategy to create unique filenames, e.g. by using the `created` date as a unique element in the filenames.

>[!IMPORTANT]
>We recommend you enable file tracking and run a full sync of the Readwise library if you want to use custom filenames and/or want to change the format of the filename. Without that, you will likely end up with many duplicate notes in your Obsidian library.

### Slugify Filenames

The plugin provides an option to "slugify" filenames. This means converting the filenames into a URL-friendly format by replacing spaces and special characters with hyphens or other safe characters.

If enabled, the plugin converts the filenames to a slugified format after it has applied the settings for custom filenames and the colon replacement character.

For example, `My Book Title` becomes `my-book-title`. You can select a separator and whether the filename will be all lowercase.

>[!IMPORTANT]
>We recommend you enable file tracking first and run a full sync of the REadwise library if you want to enable the "slugify" option, even if you don't want to use custom filenames. Without that, you will likely end up with many duplicate notes in your Obsidian library.

### Sync highlights with notes only

A lot of the value of Readwise highlights lies in the notes associated with them. E.g. if you are building a Zettelkasten and want to work with literature notes, you typically only want highlights with notes in your Zettelkasten -- and not every highlight.

The option "Only sync highlights with notes" will do exactly that: it will only sync highlights with notes. If an item in your library has only highlights without notes, it will not be synced.

## Templates

The plugin uses three template types to format content, all using Nunjucks templating syntax:

### Template Types

- **Frontmatter Template**: Controls note metadata (also called "properties") (optional)
- - **Header Template**: Controls document structure and metadata display
- **Highlight Template**: Controls individual highlight formatting

### Templates

#### Default frontmatter template

```markdown+nunjucks
---
id: {{ id }}
updated: {{ updated }}
title: {{ title }}
author: [{{ author | parse_authors | join(', ') }}]
---
```

#### A more complex frontmatter template

The following would print both document and all highlight tags, rolled-up:

```markdown+nunjucks
---
id: {{ id }}
updated: {{ updated }}
title: {{ title }}
alias: {{ sanitized_title }}
author: [{{ author | parse_authors | join(', ') }}]
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
Authors: [[{{ author | parse_authors | join(']], [[') }}]]
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

#### Default highlight template

```markdown+nunjucks
{{ text }}{%- if category == 'books' %} ([{{ location }}]({{ location_url }})){%- endif %}{%- if color %} %% Color: {{ color }} %%{%- endif %} ^{{id}}{%- if note %}

Note: {{ note }}
{%- endif %}{%- if tags %}

Tags: {{ tags }}
{%- endif %}

---
```

### Document variables

These variables exist at Readwise item level and can be used for the frontmatter and header template, but also for the highlights.

#### Metadata

| Variable | Description | Example |
|----------|-------------|---------|
| `id` | Document ID | `12345` |
| `title` | Original title | `"My Book"` |
| `sanitized_title` | Filesystem-safe title | `"My-Book"` |
| `author` | Author name(s) | `"John Smith"` |
| `authorStr` | Author with wiki links | `"[[John Smith]]"` |
| `category` | Content type | `"books"` |
| `document_note` | Reader document note | `"My reading notes..."` |
| `summary` | Reader summary | `"Book summary..."` |
| `num_highlights` | Number of highlights | `42` |

#### Readwise item URLs

| Variable | Description | Example |
|----------|-------------|---------|
| `highlights_url` | Readwise URL | `"https://readwise.io/..."` |
| `source_url` | Original content URL | `"https://..."` |
| `unique_url` | Reader URL (if available) | `"https://reader.readwise.io/..."` |
| `cover_image_url` | Cover image URL | `"https://..."` |

#### Tags

| Variable | Description | Example |
|----------|-------------|--------|
| `tags` | Document tags with # | `"#tag1, #tag2"` |
| `tags_nohash` | Document tags without # (e.g. to be used in the frontmatter template) | `"'tag1', 'tag2'"` |
| `highlight_tags` | Tags from all highlight, with # | `"#note, #important"` |
| `hl_tags_nohash` | Tags from all highlights, without # (e.g. to be used in the frontmatter template) | `"'note', 'important'"` |

#### Timestamps

| Variable | Description |
|----------|-------------|
| `created` | Creation date |
| `updated` | Last update |
| `last_highlight_at` | Last highlight date |

### Highlight Template Variables

These variables are different for each highlight and are only available in the highlight template.

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

### Template filters

The plugin provides filters that can be used in all templates (including in the filename template). These filters add functionality which is useful for working with Readwise highlights and notes, e.g. related to [action tags](https://docs.readwise.io/reader/docs/faqs/action-tags). They complement and are used like the existing [filters in nunjucks](https://mozilla.github.io/nunjucks/templating.html#builtin-filters).

| Filter | Description | Example |
|--------|-------------|---------|
| `bq` | Add blockquote markers | `{{ text \| bq }}` |
| `is_qa` | Check for Q&A format | `{% if note \| is_qa %}` |
| `qa` | Convert to Q&A format | `{{ note \| qa }}` |
| `date` | Format dates | `{{ created \| date("YYYMMDDHHMMSS") }}` |
| `parse_authors` | Get array of authors from an author field | `{{ author \| parse_authors }}` |  

#### Blockquote filter

If your highlight or note in Readwise spans multiple paragraphs, it can be difficult to get it as a proper blockquote in Obsidian as each paragraph, and the empty lines between, must begin with the quote character (`>`).

The blockquote filter (`bq`) can will ensure that every new line in the filtered text starts with the quote character.

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

This will result in something like the following for a highlight wit htwo lines:

>[!QUOTE]
>This is the first line of my quote.
>
>This is the second line of my quote.

#### Q & A filter

You can use the Q&A filter to render [notes with the `.qa` action tag](https://docs.readwise.io/reader/docs/faqs/action-tags#how-can-i-create-a-q-and-a-mastery-card-while-reading) properly:  

- `is_qa`: this filter returns `true` if the string it is applied to contains the `.qa` action tag
- `qa`: this filter extracts the question and answer and returns them as a string rendered as a Q&A pair.

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

#### Example Q&A Output

Input note with `.qa` tag:

> .qa What is the capital of France? Paris is the capital of France.

Rendered output:
> **Q:** What is the capital of France?
>
> **A:** Paris is the capital of France.

#### Date format

The plugin provides a `date` filter which builds on [`moment.js`](https://momentjs.com/). It  allow you to format any date with a template (e.g. `{{ created | date("YYYYMMDDD")}}` would result in `13 Apr 10125` to be formatted as `20250413`).

#### Author parser

For certain use cases, like linking to authors or putting multiple authors into frontmatter, you might want to get individual authors instead of one variable. The plugin provides a `parse_authors` filter which will separate a string into individual authors, following a simple approach, using commas or *and* as separators:

The `author` field with the following value `John Doe, Jane Smith, and Homer Simpson` woud be split into an array consiting of `[ 'John Doe', 'Jane Smith', 'Home Simpson']`. You can then use other `nunjucks` filters, including `join()`, to rebuild a string in your template.

For example the following frontmatter and heading template  

```markdown+nunjucks
---
author: [ {{ author | parse_authors | join(', ') }} ]
---

...

Author: [[{{ author | parse_authors | join(']], [[') }}]]
```

Would render as

```markdown
---
author: [ 'John Doe', 'Jane Smith', 'Homer Simpson' ]
---

...

Author: [[John Doe]], [[Jane Smith]], [[Homer Simpson]]
```

>[!NOTE]
>This will not work for authors that are stored in Readwise in the scientific notation (Last, First). If you end up having such cases stored in your Readwise library, it is best to manually correct them at the source or in Readwise and sync again to Obsidian.
>The use of a nunjucks filter instead of a hardcoded parsing or setting was a deliberate choice as this is about *content* of your Readwise library and not functionality of the synchronization.

### Limitations

The templating is based on the [`nunjucks`](https://mozilla.github.io/nunjucks/templating.html) templating library and thus shares its limitations.

## Frontmatter management

The plugin provides powerful frontmatter management, including an update mode which keeps additional frontmatter properties that are not part of the plugin's frontmatter template untouched and optionally protected from accidential overwrites.

This is particularly useful as it allows for example to protect a property field where you put links to other notes. A rerun of the sync for a specific note will always overwrite the body of the note. All links to other notes you might have added in the body manually will be lost during the next syny. But a protected frontmatter property with links to other notes will keep thes across the sync runs.

### Frontmatter template validation

Frontmatter in Obsidian is based on "YAML" syntax. This requires that property values are properly stored, for example to ensure newlines in a vlaue do not lead to invalid frontmatter. We therefore validate the frontmatter template using sample date, to ensure valid frontmatter is generated.

### Update frontmatter

The plugin provides granular control over how frontmatter is handled in existing files with the **Update frontmatter** setting:

When enabled, the plugin updates frontmatter in already existing files during sync, overwriting values defined in the frontmatter template and keeping additional fields you might have added since the last sync untouched. This means that properties added by other plugins, or by you manually will be kept in the note.

When disabled, existing frontmatter will always completely be overwritten, and any additional properties added between sync runs will be lost.
  
>[!IMPORTANT]
>Frontmatter update works best with file tracking enabled to ensure consistent file and duplicates handling, even if the filenames change between sync runs.
>
>If file tracking is disabled, the plugin will overwrite whenever a file with the same name exists already, but will update its frontmatter. In very rare circumstances, this might lead to a case where duplicates in your Readwise library will be overwritten by each other in subsequent sync runs.[^3]

### Frontmatter protection

By protecting specific frontmatter properties, you can on one hand ensure that a change to the frontmatter template will not accidentially overwrite a property that was previously added manually or by another pluging.

Protection will also allow you to write a property on the first sync run and then protect the value even if changed manually. This can especially be useful if you know that certain properties might need manual updates, e.g. for author names, or aliases, or any other field where a manual touch might be needed because of errors in the original metadata.[^5]

You can protect specific frontmatter fields from being overwritten during sync:

1. Enable "Protect frontmatter fields"
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
5. Note: If File tracking is enabled, the tracking field (e.g., `uri`) cannot be protected

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
  - Be added if not present during the first sync
  - Be protected in future syncs

## Special Considerations

### Remote Duplicates

Readwise can contain multiple items sharing the same title but with different IDs. The plugin handles these cases by:

1. Using the plain filename (e.g. `My Duplicate Book.md`) for the first encountered item
2. Adding a short hash of the Readwise ID to subsequent files (e.g. `My Duplicate Book <HASH>.md`)

## Upgrading from 1.x.x to 2.x.x

>[!WARNING]
>If you update to 2.x.x without following these steps, you will likely end up with duplicate notes for the same Readwise item or, if you delete the whole Readwise folder in your Obsidian vault first, will likely lose any existing internal links to notes created by the plugin.

If you plan to upgrade the plugin from v1.x.x to v2.x.x, and want to make sure any internal links in your Obsidian vault to notes created by the plugin remain intact, then you should ensure all your notes have the file tracking property in their frontmatter before the upgrade.

1. Make sure you have a backup of your Obsidian vault (or at least your Readwise mirror folder with the notes created by this plugin).
2. In the plugin settings in v1.x.x, add the `uri` tracking property (or whatever property key you plan to use for file tracking) to the Frontmatter template. You can replace (recommended) the frontmatter template with the following, and enable Frontmatter[^1]:

   ```yaml
   ---
   uri: {{ highlights_url }}
   ---
   ```

3. Run **a full sync** to establish proper tracking properties (this will overwrite your local changes based on the current settings for the colon, but it will preserve the filenames of your existing files according to the way v1.4.11 of the plugin creates these. In consequence, all internal links will remain valid).

4. Upgrade the plugin to `2.x.x` and enable file tracking (this will ensure the tracking property will always be added to newly created or updated notes).
5. Rebuild the frontmatter templates and adjust the filename settings to your liking (you can also reset the templates to their default: simply delete the whole template value).
6. Run **a full sync** to rebuild all the notes according to the new settings and enjoy the new features of Readwise mirror 2.x.x.

Your subsequent syncs will then use the `uri` property to track unique files and ensure links to items in your Readwise library will be updated, even if the note filenames change with the new version of the plugin.

>[!TIP]
>If you are unsure what the plugin will do to your Obsidian Obsidian vault after the upgrade, we would recommend that you create a copy of the Obsidian vault and run a test upgrade according to the steps described above.

[^1]: You might want to ensure that properties like `author` are omitted from the template as these have a tendency to break frontmatter. Alternatively, you can run a plugin like "Linter" to check and fix all your Readwise notes before upgrading, or you simply remove all properties except `uri` from your template and rebuild it after a successful upgrade.
[^2]: There are different cases where this can happen. For example, you can manually change Metadata of Reader and Readwise items. Without tracking, this would create a new file during the next sync. With tracking, we can rename the file based on the new metadata, and also based on whatever you chose as custom filename template.
[^3]: Readwise has a quite elaborate deduplication strategy itself where a number of factors outside of our control define if a new item is created for a highlight or if it ends up being appended to an existing item. It is therefore entirely possible, although usually unlikely, that a Readwise library contains different items of the same type with the same title.
[^4]: The use of `highlights_url` is a deliberate choice over the `id` value alone, both because, as an URL, it contains a namespace (allowing differention from other ID values) and because it allows the user to jump directly to the Readwise item in question.
[^5]: If at all possible, it is always better to change mistakes at the source, that is in Readwise itself. If, for example, Readwise has not correctly parsed an author's name, you might want to change this in the metadata in Readwise instead of manually updating (and protecting) the `author` property in Readwise. Nevertheless, there might be use cases where a *sync once, protect afterwards* approach might be useful.
