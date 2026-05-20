import { Plugin } from "obsidian";
import { PipSettings, DEFAULT_SETTINGS, PipSettingTab } from "./settings";
import { syncNotes } from "./sync";

export default class PipPlugin extends Plugin {
  settings: PipSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new PipSettingTab(this.app, this));

    // Cold start
    this.app.workspace.onLayoutReady(() => this.sync());

    // Foreground resume
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    // Background interval — 60s
    this.registerInterval(window.setInterval(() => this.sync(), 60_000));
  }

  onunload() {
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  private onVisibilityChange = () => {
    if (!document.hidden) this.sync();
  };

  private sync() {
    syncNotes(this.app, this.settings.pin, this.settings.serverUrl);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
