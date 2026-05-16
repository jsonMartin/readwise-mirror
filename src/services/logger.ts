/**
 * Logger service
 * @module services/logger
 */
class Logger {
  constructor(private debugMode: boolean) {}

  group(label: string): void {
    if (this.debugMode) console.group(`Readwise Mirror: ${label}`);
  }

  groupEnd(): void {
    if (this.debugMode) console.groupEnd();
  }

  setDebugMode(debugMode: boolean): void {
    this.debugMode = debugMode;
  }

  debug(...messages: unknown[]): void {
    this.debugMode && console.debug('Readwise Mirror:', ...messages);
  }

  info(...messages: unknown[]): void {
    this.debugMode && console.info('Readwise Mirror:', ...messages);
  }

  warn(...messages: unknown[]): void {
    console.warn('Readwise Mirror:', ...messages);
  }

  error(...messages: unknown[]): void {
    console.error('Readwise Mirror:', ...messages);
  }

  time(label: string): void {
    console.time(`Readwise Mirror: ${label}`);
  }

  timeLog(label: string, ...messages: unknown[]): void {
    console.timeLog(`Readwise Mirror: ${label}`, ...messages);
  }

  timeEnd(label: string): void {
    console.timeEnd(`Readwise Mirror: ${label}`);
  }
}

export default Logger;
