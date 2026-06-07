/**
 * Logger service
 * @module services/logger
 */
class Logger {
  private groupDepth = 0;
  private readonly timers = new Map<string, number>();

  constructor(private debugMode: boolean) {}

  setDebugMode(debugMode: boolean): void {
    this.debugMode = debugMode;
  }

  private getIndent(): string {
    return '  '.repeat(this.groupDepth);
  }

  group(label: string): void {
    if (this.debugMode) {
      console.debug(`${this.getIndent()}▼ Readwise Mirror: ${label}`);
      this.groupDepth++;
    }
  }

  groupEnd(): void {
    if (this.debugMode && this.groupDepth > 0) {
      this.groupDepth--;
      console.debug(`${this.getIndent()}▲`);
    }
  }

  debug(...messages: unknown[]): void {
    if (this.debugMode) {
      console.debug(`${this.getIndent()}Readwise Mirror:`, ...messages);
    }
  }

  warn(...messages: unknown[]): void {
    console.warn(`${this.getIndent()}Readwise Mirror:`, ...messages);
  }

  error(...messages: unknown[]): void {
    console.error(`${this.getIndent()}Readwise Mirror:`, ...messages);
  }

  time(label: string): void {
    this.timers.set(label, Date.now());
  }

  timeLog(label: string, ...messages: unknown[]): void {
    if (!this.debugMode) return;
    const startTime = this.timers.get(label);
    if (startTime === undefined) {
      console.debug(`${this.getIndent()}Readwise Mirror: ${label} (timer not started)`);
      return;
    }
    const elapsedMs = Date.now() - startTime;
    console.debug(`${this.getIndent()}Readwise Mirror: ${label} (${elapsedMs}ms)`, ...messages);
  }

  timeEnd(label: string): void {
    const startTime = this.timers.get(label);
    this.timers.delete(label);
    if (!this.debugMode || startTime === undefined) {
      return;
    }
    const elapsedMs = Date.now() - startTime;
    console.debug(`${this.getIndent()}Readwise Mirror: ${label} (${elapsedMs}ms)`);
  }
}

export default Logger;
