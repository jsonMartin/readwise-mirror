import { type ConfigureOptions, Environment, type ILoaderAny } from 'nunjucks';

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
  }
}
