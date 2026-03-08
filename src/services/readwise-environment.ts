import { YAML_INDENT } from 'constants/index';
import md5 from 'md5';
import { type ConfigureOptions, Environment, type ILoader, type ILoaderAny, Loader, type LoaderSource } from 'nunjucks';
import { moment, stringifyYaml } from 'obsidian';
import type { Atom } from 'types/document';
import { AtomizeExtension } from './atomizer';

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
  private atoms: Atom[] = [];
  constructor(loader?: ILoaderAny | ILoaderAny[] | null, opts?: ConfigureOptions) {
    super(loader, { ...opts, autoescape: false });
    this.setupFilters();
    this.addExtension('AtomizeExtension', new AtomizeExtension(this.atoms, 'FIRST'));
  }

  /**
   * Initialize custom filters for the Readwise environment
   */
  private setupFilters(): void {
    // Convert newlines to blockquotes
    this.addFilter('bq', (str: string) => {
      if (typeof str !== 'string') return str;
      return str
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join('\r\n');
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

    // biome-ignore lint/suspicious/noExplicitAny: stringifyYaml is accepting `any`
    this.addFilter('fme', (value: any) => {
      // Return if null/undefined
      if (value === null || value === undefined) {
        return null;
      }

      // This is a bit of a hack, but a realiable way to get multi-line yaml right
      const _key = md5(value);
      const _value = stringifyYaml({ [_key]: value })
        .replace(`${_key}: `, '')
        .trim();

      // If `stringifyYaml` doesn't return a multi-line YAML line, we return it as one
      if (_value.includes('\n') && _value.indexOf('|') !== 0) {
        return `|-\n${YAML_INDENT}${_value}\n`;
      }

      // Ensure we properly return the value with a leading space
      return ` ${_value}`;
    });
  }
}
