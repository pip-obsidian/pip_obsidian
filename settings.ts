import { App, PluginSettingTab, Setting } from "obsidian";
import type PipPlugin from "./main";

export interface PipSettings {
  pin: string;
  serverUrl: string;
}

export const DEFAULT_SETTINGS: PipSettings = {
  pin: "",
  serverUrl: "https://api.pipforobsidian.app",
};

export function getDeviceId(): string {
  let id = localStorage.getItem("pip-device-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("pip-device-id", id);
  }
  return id;
}

export class PipSettingTab extends PluginSettingTab {
  plugin: PipPlugin;

  constructor(app: App, plugin: PipPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Activation PIN")
      .setDesc("Enter the PIN from your Telegram chat with Pip.")
      .addText((text) =>
        text
          .setPlaceholder("832194")
          .setValue(this.plugin.settings.pin)
          .onChange(async (value) => {
            this.plugin.settings.pin = value.replace(/\D/g, "");
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Server URL")
      .setDesc("Pip server address. Leave as default unless self-hosting.")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}
