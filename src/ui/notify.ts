import { Notice } from 'obsidian';

export default class Notify {
  constructor(private _statusBarItem: HTMLElement) {}

  get statusBarItem(): HTMLElement {
    return this._statusBarItem;
  }

  notice(message: string, duration = 5000) {
    new Notice(message, duration);
  }

  setStatusBarText(message: string) {
    // Ensure the message is a string
    const text = typeof message === 'string' ? message : '';
    this._statusBarItem.setText(text);
  }

  getStatusBarText(): string {
    return this._statusBarItem.textContent || '';
  }
}
