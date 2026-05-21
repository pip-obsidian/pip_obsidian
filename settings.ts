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

    // Onboarding instructions
    const info = containerEl.createDiv();
    info.style.cssText =
      "background:var(--background-secondary);border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:0.9em;line-height:1.6;color:var(--text-muted);";
    info.innerHTML = `
      <strong style="color:var(--text-normal);display:block;margin-bottom:6px;">Getting started</strong>
      1. Open <a href="https://t.me/pipforobsidian_bot">@pipforobsidian_bot</a> on Telegram and send <code>/start</code><br>
      2. Copy your activation PIN and paste it below<br>
      3. Send any note on Telegram — it'll appear in <code>_pipinbox.md</code>
    `;

    // PIN entry
    const pinSetting = new Setting(containerEl)
      .setName("Activation PIN")
      .setDesc("Enter the PIN from your Telegram chat with Pip.");

    const pinWrapper = pinSetting.controlEl.createDiv({ cls: "pip-pin-wrapper" });
    pinWrapper.style.cssText = "display:flex;align-items:center;gap:8px;";

    const pinInput = pinWrapper.createEl("input", { type: "text" });
    pinInput.placeholder = "832-194";
    pinInput.maxLength = 7;
    pinInput.style.cssText =
      "font-size:1.4em;letter-spacing:0.1em;font-weight:600;width:140px;" +
      "font-family:monospace;padding:4px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);box-sizing:border-box;";

    const savedBadge = pinWrapper.createSpan({ text: "Saved ✓" });
    savedBadge.style.cssText =
      "color:var(--color-green);font-size:0.85em;font-weight:500;opacity:0;transition:opacity 0.3s;";

    // Format stored PIN as XXX-XXX for display
    const raw = this.plugin.settings.pin;
    if (raw.length === 6) pinInput.value = `${raw.slice(0, 3)}-${raw.slice(3)}`;

    pinInput.addEventListener("input", async () => {
      const digits = pinInput.value.replace(/\D/g, "").slice(0, 6);
      // Reformat display with dash after 3 digits
      if (digits.length > 3) {
        pinInput.value = `${digits.slice(0, 3)}-${digits.slice(3)}`;
      } else {
        pinInput.value = digits;
      }
      this.plugin.settings.pin = digits;
      await this.plugin.saveSettings();
      if (digits.length === 6) {
        savedBadge.style.opacity = "1";
        setTimeout(() => { savedBadge.style.opacity = "0"; }, 2500);
      }
    });

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
