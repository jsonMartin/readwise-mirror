import type { Moment } from 'moment';
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

    // Add a date filter
    this.addFilter('date', (date: Moment, format: string) => {
      const moment = window.moment;
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
  }
}
