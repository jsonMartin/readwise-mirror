import { YAML_INDENT } from 'constants/index';
import { type ConfigureOptions, Environment, type ILoader, type ILoaderAny, Loader, type LoaderSource } from 'nunjucks';
import { moment } from 'obsidian';
import { escapeValue } from 'utils/frontmatter-utils';

/**
 * Template name to source mapping for ReadwiseLoader
 */
interface ReadwiseTemplates {
  [key: string]: string;
}
/**
 * Custom Nunjucks Loader for Readwise templates
 * Extends the base Loader to load templates from a provided mapping "in memory"
 */
export class ReadwiseLoader extends Loader implements ILoader {
  constructor(private templates: ReadwiseTemplates = {}) {
    super();
  }

  public setSource(name: string, src: string): void {
    this.templates[name] = src;
    this.emit('update', name);
  }

  public getSource(name: string): LoaderSource | null {
    // Custom logic to retrieve the template source by name
    if (this.templates[name]) {
      return {
        src: this.templates[name],
        path: name,
        noCache: true,
      };
    }
    return null;
  }
}

/**
 * Custom Nunjucks environment with Readwise-specific filters
 * Extends the base Environment to add custom filters for formatting content
 */
export class ReadwiseEnvironment extends Environment {
  constructor(loader?: ILoaderAny | ILoaderAny[] | null, opts?: ConfigureOptions) {
    super(loader, { ...opts, autoescape: false });
    this.setupFilters();
  }

  /**
   * Initialize custom filters for the Readwise environment
   */
  private setupFilters(): void {
    // Convert newlines to blockquotes
    this.addFilter('bq', (str: string) => {
      if (typeof str !== 'string') return str;
      return str.replace(/\r|\n|\r\n/g, '\r\n> ');
    });

    // Test if string contains .qa
    this.addFilter('is_qa', (str: string) => {
      if (typeof str !== 'string') return false;
      return str.includes('.qa');
    });

    // Convert .qa format to Q&A format
    this.addFilter('qa', (str: string) => {
      if (typeof str !== 'string') return str;
      return str.replace(/\.qa(.*)\?(.*)/g, '**Q:**$1?\r\n\r\n**A:**$2');
    });

    // Add a date filter
    this.addFilter('date', (date: moment.MomentInput, format: string) => {
      return moment(date).format(format);
    });

    // Add a filter to normalize author names by removing titles like dr. prof. etc.
    this.addFilter('normalize_author', (author: string | string[]) => {
      const authorArray = [];
      if (typeof author === 'string') {
        // create an array with the single string element
        authorArray.push(author);
      } else if (Array.isArray(author)) {
        // use the array as is
        authorArray.push(...author);
      } else {
        // if it's neither a string nor an array, return as is
        return author;
      }
      return authorArray.map((a) =>
        a
          .replace(/\b(dr|drs|prof|professor|sir|lord|lady|dame|ms|miss|mrs|mr|mx)\b\.?/gi, '')
          .replace(/\s+/g, ' ')
          .trim()
      );
    });

    this.addFilter('fme', (value: string | string[], multiline?: boolean) => {
      // Escape frontmatter values
      if (multiline) {
        if (typeof value !== 'string') {
          const ret: string[] = [];
          value.forEach((v, index, ret) => {
            // DSS
            if (index === 0) {
              // Add multiline indicator to YAML
              ret.push(' |-\n');
            }
            ret.push(`${YAML_INDENT}${v}`);
          });

          return ret;
        }

        // Create multi-line YAML
        return ` ${escapeValue(value, { multiline: true })}`;
      }

      if (Array.isArray(value)) {
        return value.map((item) => (typeof item === 'string' ? ` ${escapeValue(item)}` : item));
      }

      if (typeof value === 'string') {
        return ` ${escapeValue(value)}`;
      }
      return value;
    });
  }
}
