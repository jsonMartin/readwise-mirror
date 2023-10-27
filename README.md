# Readwise Mirror Plugin

**Readwise Mirror** is an unoffical open source plugin for the powerful note-taking and knowledge-base application [Obsidian](http://obsidian.md/). This plugin allows a user to "mirror" their entire Readwise library by automatically downloading all highlights/notes and syncing changes directly into an Obsidian vault.

![example.gif](https://raw.githubusercontent.com/jsonMartin/readwise-mirror/master/example.gif)

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
- Supports tags, both within highlights as well as sources (books, articles, etc)

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

- Browse to [releases](https://github.com/jsonMartin/readwise-mirror/releases)
- Download `main.js` and `manifest.json` of the latest release
- Create a `readwise-mirror` subdirectory in your Obsidian plug-in directory (in `.obsidian/plugins` in your vault)
- Move the two downloaded files there
- In Obsidian, go to Settings, scroll down to Community Plug-ins, and activate it.
  - If it refuses to activate with an error message, open the developer console (with Ctrl-Shift-I) and check for error messages.

## Sync highlights with notes only

A lot of the value of Readwise highlights lies in the notes associated with them. E.g. if you are building a Zettelkasten and want to work with literature notes, you typically only want highlights with notes in your Zettelkasten -- and not every highlight.

The option "Only sync highlights with notes" will do exactly that: it will only sync highlights with notes. If an item in your library has only highlights without notes, it will not be synced.

## Templating

The plugin allows for simple templating. Similarly to Readwise's templating, it allows to define

- a header template,
- a highlight template, and
- a template for frontmatter

The frontmatter template can be turned on and off. If you want to revert to the default template, you can just empty the template completely and the plugin will restore the default.

### Header and frontmatter template

The template exposes the following variables (they can be used for both the header and frontmatter):

- ```id```: Document id,
- ```title```: Sanitized title,
- ```author```: Author (raw),
- ```authorStr```: Author (formatted, as Wiki Links ```[[Author Name]]```),
- ```category```: Document category,
- ```num_highlights```: Number of highlights,
- ```updated```: Date of last update,
- ```cover_image_url```: Cover image,
- ```highlights_url```: Readwise URL,
- ```highlights```: Highlights,
- ```last_highlight_at```: Date of last highlight,
- ```source_url```: Source URL,
- ```tags```: Document tags,
- ```highlight_tags```: Rolled-up list of highlight tags,
- ```tags_nohash```: Document tags withough "#",  but with single quotes "'" to avoid issues with tags that are valid in readwise but require special care when used in Obsidian frontmatter (e.g. tags using '@'). To be used in an array in frontmatter (use `tags: [ {{ tags_nohash }}]` in your frontmatter template)
- ```hl_tags_nohash```: List of all highlight tags to be used in an array in frontmatter (withouth "#", similar to `tags_nohash`)

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
title: "{{ title }}"
author: "{{ author }}"
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

---

# Highlights

```

### Highlights

The highlight template exposes the following variables:

- ```id```: The id of the highlight
- ```text```: The highlighted text
- ```note```: Your nore
- ```location```: The location
- ```location_url```: The url of the location
- ```url```: Unique highlight link (Open in Readwise)
- ```color```: The color
- ```highlighted_at```: Date highlighted (empty if none)
- ```tags```: A formatted string of tags
- ```category```: Category of the source item (book, article, etc.)

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

### Limitations

- The templating is based on the [`nunjucks`](https://mozilla.github.io/nunjucks/templating.html) templating library and thus shares its limitations;
- Certain strings (e.g. date, tags, authors) are currently preformatted
- If you have frontmatter and items with `@` in the title or author's name (typically this happens with highlights imported from Twitter), the frontmatter will be invalid. You can add quotes in your frontmatter template to try to work around these cases: `title: "{{ title }}" but any quotes already present in the title will break your frontmatter too.
