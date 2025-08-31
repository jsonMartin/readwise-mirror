import { type App, Modal, Setting } from 'obsidian';

export class ConfirmDialog extends Modal {
  constructor(app: App, title: string, prompt: string | DocumentFragment, onSubmit: (confirm: boolean) => void) {
    super(app);
    this.titleEl.setText(title);

    if (typeof prompt === 'string') {
      this.contentEl.createEl('p', {
        text: prompt,
      });
    } else {
      this.contentEl.appendChild(prompt);
    }

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
  constructor(app: App, title: string, prompt: string | DocumentFragment, onSubmit: (confirm: boolean) => void) {
    super(app);
    this.titleEl.setText(`Warning: ${title}`);

    if (typeof prompt === 'string') {
      this.contentEl.createEl('p', {
        text: prompt,
      });
    } else {
      this.contentEl.appendChild(prompt);
    }

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
