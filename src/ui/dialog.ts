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
        btn.setButtonText('Cancel').onClick(() => {
          this.close();
          onSubmit(false);
        })
      )
      .addButton((btn) =>
        btn
          .setButtonText('OK')
          .setCta()
          .onClick(() => {
            this.close();
            onSubmit(true);
          })
      );
  }
}
