/**
 * Logger service
 * @module services/logger
 */
class Logger {
    private debugMode: boolean;

    constructor(debugMode: boolean) {
        this.debugMode = debugMode;
    }

    setDebugMode(debugMode: boolean): void {
        this.debugMode = debugMode;
    }

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    debug(...messages: any[]): void {
        if (this.debugMode) {
            console.debug('Readwise Mirror:', ...messages);
        }
    }

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    info(...messages: any[]): void {
        if (this.debugMode) {
            console.info('Readwise Mirror:', ...messages);
        }
    }

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    warn(...messages: any[]): void {
        console.warn('Readwise Mirror:', ...messages);
    }

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    error(...messages: any[]): void {
        console.error('Readwise Mirror:', ...messages);
    }

    // biome-ignore lint/suspicious/noExplicitAny: console.time accepts any type
    time(label: string, ...messages: any[]): void {
        console.time(`Readwise Mirror: ${label}`);
    }

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    timeLog(label: string, ...messages: any[]): void {
        console.timeLog(`Readwise Mirror: ${label}`, ...messages);
    }

    timeEnd(label: string): void {
        console.timeEnd(`Readwise Mirror: ${label}`);
    }
}

export default Logger;