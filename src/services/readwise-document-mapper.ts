import { AUTHOR_SEPARATORS } from 'src/constants';
import type { ReadwiseDocument } from 'types/document';
import type { Export, Highlight, Tag } from 'types/library';
import type { PluginSettings } from 'types/settings';
import { createdDate, lastHighlightedDate, updatedDate } from 'utils/highlight-date-utils';
import { filterHighlights, formatDate, formatTags, sortHighlights } from './template-rendering';

type MapperSettings = Pick<
  PluginSettings,
  'highlightSortByLocation' | 'highlightSortOldestToNewest' | 'highlightDiscard' | 'syncNotesOnly'
>;

export function parseAuthors(authorString?: string): string[] {
  if (!authorString?.trim()) {
    return [];
  }

  return authorString
    .split(AUTHOR_SEPARATORS)
    .map((author) => author.trim())
    .filter(Boolean);
}

export function collectHighlightTags(highlights: Highlight[], settings: MapperSettings): Tag[] {
  let tags: Tag[] = [];
  for (const highlight of sortHighlights(highlights, settings)) {
    if (highlight.tags) {
      tags = [...tags, ...highlight.tags];
    }
  }
  return tags;
}

export function buildReadwiseDocument(
  book: Export,
  options: {
    basename: string;
    settings: MapperSettings;
  }
): ReadwiseDocument {
  const {
    user_book_id,
    title,
    document_note,
    summary,
    author,
    category,
    cover_image_url,
    highlights,
    readwise_url,
    source_url,
    unique_url,
    book_tags,
  } = book;

  const filteredHighlights = filterHighlights(highlights, options.settings);
  const highlightTags = collectHighlightTags(filteredHighlights, options.settings);
  const authors = parseAuthors(author);

  const authorStr =
    authors[0] && authors.length > 1
      ? authors.map((authorName: string) => `[[${authorName.trim()}]]`).join(', ')
      : author
        ? `[[${author}]]`
        : '';

  const created = createdDate(highlights);
  const updated = updatedDate(highlights);
  const lastHighlightAt = lastHighlightedDate(filteredHighlights);

  return {
    id: user_book_id,
    readwise_url,
    unique_url,
    source_url,
    title,
    sanitized_title: options.basename,
    author: authors,
    authorStr,
    document_note,
    summary,
    category,
    num_highlights: filteredHighlights.length,
    created: created ? formatDate(created) : '',
    updated: updated ? formatDate(updated) : '',
    cover_image_url: cover_image_url.replace('SL200', 'SL500').replace('SY160', 'SY500'),
    highlights,
    last_highlight_at: lastHighlightAt ? formatDate(lastHighlightAt) : '',
    tags: formatTags(book_tags),
    highlight_tags: formatTags(highlightTags),
    tags_nohash: formatTags(book_tags, true, "'"),
    hl_tags_nohash: formatTags(highlightTags, true, "'"),
  };
}
