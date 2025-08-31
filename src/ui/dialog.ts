import { type App, Modal, Setting } from 'obsidian';

export class ConfirmDialog extends Modal {
  constructor(app: App, prompt: string, onSubmit: (confirm: boolean) => void) {
    super(app);
    this.titleEl.setText('Are you sure?');

    this.contentEl.createEl('p', {
      text: prompt,
    });

    new Setting(this.contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('OK')
          .setCta()
          .onClick(() => {
            this.close();
            onSubmit(true);
          })
      )
      .addButton((btn) =>
        btn.setButtonText('Cancel').onClick(() => {
          this.close();
          onSubmit(false);
        })
      );
  }
}

export class WarningDialog extends Modal {
  constructor(app: App, prompt: string, onSubmit: (confirm: boolean) => void) {
    super(app);
    this.titleEl.setText('Warning');

    this.contentEl.createEl('p', {
      text: prompt,
    });

    new Setting(this.contentEl)
      .addButton((btn) => {
        btn
          .setButtonText('Confirm')
          .setCta()
          .onClick(() => {
            this.close();
            onSubmit(true);
          }).buttonEl.style.backgroundColor = 'var(--background-modifier-error)';
      })
      .addButton((btn) =>
        btn.setButtonText('Cancel').onClick(() => {
          this.close();
          onSubmit(false);
        })
      );
  }
}
