import type { PluginSettings } from 'types';
import type { ToStringOptions } from 'yaml';

export const DEFAULT_SETTINGS: PluginSettings = {
  baseFolderName: 'Readwise',
  apiToken: null,
  lastUpdated: null,
  autoSync: true,
  highlightSortOldestToNewest: true,
  highlightSortByLocation: true,
  highlightDiscard: false,
  syncNotesOnly: false,
  colonSubstitute: '-',
  logFile: true,
  logFileName: 'Sync.md',
  frontMatter: false,
  frontMatterTemplate: `---
id: {{ id }}
created: {{ created }}
updated: {{ updated }}
title: {{ title }}
author: {{ author }}
---
`,
  headerTemplate: `
%%
ID: {{ id }}
Updated: {{ updated }}
%%

![]( {{ cover_image_url }})

# About
Title: [[{{ sanitized_title }}]]
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
Date: [[{{ created }}]]
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

`,
  highlightTemplate: `{{ text }}{%- if category == 'books' %} ([{{ location }}]({{ location_url }})){%- endif %}{%- if color %} %% Color: {{ color }} %%{%- endif %} ^{{id}}{%- if note %}

Note: {{ note }}
{%- endif %}{%- if tags %}

Tags: {{ tags }}
{%- endif %}{%- if url %}

[View Highlight]({{ url }})
{%- endif %}

---
`,
  useSlugify: false,
  slugifySeparator: '-',
  slugifyLowercase: true,
  trackFiles: false,
  trackingProperty: 'uri',
  deleteDuplicates: false, // Avoid deleting duplicates by default (as this is destructive behavior)
  protectFrontmatter: false,
  protectedFields: 'connections\nstatus\ntags',
  updateFrontmatter: true,
  syncPropertiesToReadwise: false,
  titleProperty: 'title',
  authorProperty: 'author',
  normalizeAuthorNames: false,
  stripTitlesFromAuthors: false,
};

export const FRONTMATTER_TO_ESCAPE = ['title', 'sanitized_title', 'author', 'authorStr'];

// YAML options
// Don't line-break (mainly for compatiblity with platers/obsidian-linter#1227)
export const YAML_TOSTRING_OPTIONS : ToStringOptions = { 'lineWidth': -1 }