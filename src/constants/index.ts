import type { PluginSettings } from 'types';
import type { ToStringOptions } from 'yaml';

export const DEFAULT_SETTINGS: PluginSettings = {
  atomicHighlights: false,
  atomicParentProperty: 'parent',
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
  syncNotifications: true,
  frontMatter: false,
  frontMatterTemplate: `---
id: {{ id }}
created: {{ created }}
updated: {{ updated }}
title: {{ title }}
author: [ {{ author | join(', ') }} ]
---
`,
  headerTemplate: `
%%
ID: {{ id }}
Updated: {{ updated }}
%%

![]( {{ cover_image_url }})

# About
Title: [[{{ title }}]]
Authors: [[{{ author | join(']], [[') }}]]
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
  trackAcrossVault: false,
  deleteDuplicates: false,
  enableFileNameUpdates: false,
  protectFrontmatter: false,
  protectedFields: 'connections\nstatus\ntags',
  updateFrontmatter: true,
  syncPropertiesToReadwise: false,
  titleProperty: 'title',
  authorProperty: 'author',
  debugMode: false,
  useCustomFilename: false,
  filenameTemplate: '{{title}}',
  filterNotesByTag: false,
  filteredTags: [],
};

export const FRONTMATTER_TO_ESCAPE = ['title', 'sanitized_title', 'author', 'authorStr'];
export const EMPTY_FRONTMATTER: string = '---\n---\n';

// Core Template
export const NUNJUCKS_CORE_TEMPLATE = `
{%- block header %}
{#- Render the header using the header template #}
{%- set id = doc.id %}
{%- set highlights_url = doc.readwise_url %}
{%- set unique_url = doc.unique_url %}
{%- set source_url = doc.source_url %}
{%- set title = doc.title %}
{%- set sanitized_title = doc.sanitized_title %}
{%- set author = doc.author %}
{%- set authorStr = doc.authorStr %}
{%- set document_note = doc.document_note %}
{%- set summary = doc.summary %}
{%- set category = doc.category %}
{%- set num_highlights = doc.num_highlights %}
{%- set created = doc.created %}
{%- set updated = doc.updated %}
{%- set cover_image_url = doc.cover_image_url %}
{%- set last_highlight_at = doc.last_highlight_at %}
{%- set tags = doc.tags %}
{%- set highlight_tags = doc.highlight_tags %}
{%- set tags_nohash = doc.tags_nohash %}
{%- set hl_tags_nohash = doc.hl_tags_nohash %}
{% include headerTemplate ignore missing %}
{%- endblock header %}

{%- block highlights %}
  {%- for highlight in highlights %}
  {#- Render each highlight using the highlight template #}
  {#- The parent context (book) is available in the highlight template #}
  {#- We have to set the variables here as context for the highlight template #}
    {%- set id = highlight.id %}
    {%- set text = highlight.text %}
    {%- set note = highlight.note %}
    {%- set location = highlight.location %}
    {%- set locationUrl = highlight.location_url %}
    {%- set location_url = highlight.location_url %}
    {%- set url = highlight.url %}
    {%- set color = highlight.color %}
    {%- set created_at = highlight.created_at | date("YYYY-MM-DD") %}
    {%- set updated_at = highlight.updated_at | date("YYYY-MM-DD") %}
    {%- set highlighted_at = highlight.highlighted_at | date("YYYY-MM-DD") %}
    {%- set tags = highlight.tags %}
    {%- set category = book.category %}
  {% include highlightTemplate ignore missing %}
  {%- endfor %}
{%- endblock highlights %}`;
// YAML options
// Don't line-break (mainly for compatiblity with platers/obsidian-linter#1227)
export const YAML_TOSTRING_OPTIONS: ToStringOptions = { lineWidth: -1 };
export const YAML_INDENT: string = '  ';
export const AUTHOR_SEPARATORS = /(?:,\s*and\s*)|(?:\s+and\s+)|(?:,\s*)/;
export const READWISE_REVIEW_URL_BASE = 'https://readwise.io/bookreview/';
export const READWISE_URI_FIELD = 'readwise_url';
