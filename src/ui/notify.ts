import { Notice } from 'obsidian';

export default class Notify {
  statusBarItem: HTMLElement;

  constructor(statusBarItem: HTMLElement) {
    this.statusBarItem = statusBarItem;
  }

  notice(message: string, duration = 5000) {
    new Notice(message, duration);
  }

  setStatusBarText(message: string) {
    // Ensure the message is a string
    const text = typeof message === 'string' ? message : '';
    this.statusBarItem.setText(text);
  }

  getStatusBarText(): string {
    return this.statusBarItem.textContent || '';
  }
}