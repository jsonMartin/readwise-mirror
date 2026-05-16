import md5 from 'md5';
import { type ConfigureOptions, Environment, type ILoader, type ILoaderAny, Loader, type LoaderSource } from 'nunjucks';
import { stringifyYaml } from 'obsidian';
import { YAML_INDENT } from 'src/constants';
import type { Atom } from 'types/document';
import { AtomizeExtension } from './atomizer';
import { registerCoreTemplateFilters } from './template-rendering';

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

  public getSource(name: string): LoaderSource {
    // Custom logic to retrieve the template source by name
    if (this.templates[name]) {
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
    registerCoreTemplateFilters(this, (date, format) => window.moment(date).format(format));

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
