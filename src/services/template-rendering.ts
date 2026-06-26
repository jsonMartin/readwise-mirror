import { type Environment, type ILoader, Loader, type LoaderSource, Template } from 'nunjucks';
import { FRONTMATTER_TO_ESCAPE, NUNJUCKS_CORE_TEMPLATE } from 'src/constants';
import type { ReadwiseDocument } from 'types/document';
import type { Export, Highlight, Tag } from 'types/library';
import type { PluginSettings } from 'types/settings';
import { escapeMetadata } from 'utils/metadata-escape-utils';

type RenderSettings = Pick<
  PluginSettings,
  'highlightSortByLocation' | 'highlightSortOldestToNewest' | 'highlightDiscard' | 'syncNotesOnly'
>;

export class TemplateSourceLoader extends Loader implements ILoader {
  constructor(private templates: Record<string, string> = {}) {
    super();
  }

  public setSource(name: string, src: string): void {
    this.templates[name] = src;
    this.emit('update', name);
  }

  public getSource(name: string): LoaderSource {
    if (name in this.templates) {
      return {
        src: this.templates[name],
        path: name,
        noCache: true,
      };
    }

    return {
      src: '',
      path: name,
      noCache: true,
    };
  }
}

export function registerCoreTemplateFilters(
  env: Environment,
  dateFormatter?: (date: string, format: string) => string
): void {
  env.addFilter('date', (date: string, format: string) => {
    if (dateFormatter) {
      return dateFormatter(date, format);
    }

    if (format === 'YYYY-MM-DD') {
      return formatDate(date);
    }

    return date;
  });

  env.addFilter('normalize_author', (author: string | string[]) => {
    const normalize = (a: string) =>
      a
        .replace(/\b(dr|drs|prof|professor|sir|lord|lady|dame|ms|miss|mrs|mr|mx|lt|col)\b\.?/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (typeof author === 'string') {
      return normalize(author);
    }

    if (Array.isArray(author)) {
      return author.map(normalize);
    }

    return author;
  });
}

export interface RenderHighlight {
  book_id: number;
  id: number;
  text: string;
  note: string;
  location: number;
  location_type: string;
  location_url: string | null;
  is_deleted: boolean;
  is_discard: boolean;
  is_favorite: boolean;
  url: string | null;
  readwise_url: string;
  color: string;
  created_at: string;
  updated_at: string;
  highlighted_at: string;
  tags: string;
  category: string;
}

export function formatDate(dateStr: string): string {
  return dateStr.split('T')[0];
}

export function formatTags(tags: Tag[], nohash = false, q = ''): string {
  const uniqueTags = [...new Set(tags.map((tag) => tag.name.replace(/\s/g, '-')))];

  if (nohash) {
    return uniqueTags.map((tag) => `${q}${tag}${q}`).join(', ');
  }

  return uniqueTags.map((tag) => `${q}#${tag}${q}`).join(', ');
}

export function filterHighlights(highlights: Highlight[], settings: RenderSettings): Highlight[] {
  return highlights.filter((highlight) => {
    if (settings.syncNotesOnly && !highlight.note) return false;
    if (highlight.is_deleted) return false;
    if (settings.highlightDiscard && highlight.is_discard) return false;
    return true;
  });
}

export function sortHighlights(highlights: Highlight[], settings: RenderSettings): Highlight[] {
  let sortedHighlights = highlights.slice();

  if (settings.highlightSortByLocation) {
    sortedHighlights = sortedHighlights.sort((highlightA, highlightB) => {
      if (highlightA.location < highlightB.location) return -1;
      if (highlightA.location > highlightB.location) return 1;
      return 0;
    });

    if (!settings.highlightSortOldestToNewest) {
      sortedHighlights = sortedHighlights.reverse();
    }
  } else {
    sortedHighlights = settings.highlightSortOldestToNewest ? sortedHighlights.reverse() : sortedHighlights;
  }

  return sortedHighlights;
}

export function formatHighlight(highlight: Highlight, book: Export): RenderHighlight {
  const location_url =
    book.asin && highlight.location
      ? `https://readwise.io/to_kindle?action=open&asin=${book.asin}&location=${highlight.location}`
      : null;

  const formattedTags = highlight.tags.filter((tag) => tag.name !== highlight.color);

  return {
    book_id: book.user_book_id,
    id: highlight.id,
    text: highlight.text,
    note: highlight.note,
    location: highlight.location,
    location_type: highlight.location_type,
    location_url,
    is_deleted: highlight.is_deleted,
    is_discard: highlight.is_discard,
    is_favorite: highlight.is_favorite,
    url: highlight.url,
    readwise_url: highlight.readwise_url,
    color: highlight.color,
    created_at: highlight.created_at ? formatDate(highlight.created_at) : '',
    updated_at: highlight.updated_at ? formatDate(highlight.updated_at) : '',
    highlighted_at: highlight.highlighted_at ? formatDate(highlight.highlighted_at) : '',
    tags: formatTags(formattedTags),
    category: book.category,
  };
}

export function renderFrontmatterTemplate(
  frontmatterTemplate: string,
  env: Environment,
  metadata: ReadwiseDocument
): string {
  const template = new Template(frontmatterTemplate, env, undefined, true);

  return template.render(escapeMetadata(metadata, FRONTMATTER_TO_ESCAPE)).trim();
}

export function renderMarkdownTemplate(
  env: Environment,
  loader: { setSource(name: string, src: string): void },
  params: {
    doc: ReadwiseDocument;
    book: Export;
    highlights: Highlight[];
    headerTemplate: string;
    highlightTemplate: string;
    settings: RenderSettings;
  }
): string {
  loader.setSource('file', NUNJUCKS_CORE_TEMPLATE);
  const filteredHighlights = filterHighlights(params.highlights, params.settings);

  return env.render('file', {
    doc: params.doc,
    book: params.book,
    highlights: sortHighlights(filteredHighlights, params.settings).map((hl) => formatHighlight(hl, params.book)),
    headerTemplate: params.headerTemplate,
    highlightTemplate: params.highlightTemplate,
  });
}
