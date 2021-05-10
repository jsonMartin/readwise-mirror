import { Notice } from 'obsidian';

export default class Notify {
  statusBarItem: HTMLElement;

  constructor(statusBarItem: HTMLElement) {
    this.statusBarItem = statusBarItem;
  }

  notice(message: string, duration = 5000) {
    new Notice(message, duration);
  }

  // Intended to use event emitters to pass status message updates back to main module rather than write directly to statusBarItem here,
  // but encountered issues with using event the `app.on` syntax provided in Obsidian API, so writing directly to the statusBar for now to solve the problem.
  setStatusBarText(message: string) {
    this.statusBarItem.setText(message);
  }

  getStatusBarText(): string {
    return this.statusBarItem.textContent;
  }
}
