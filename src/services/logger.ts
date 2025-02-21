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
}

export default Logger;