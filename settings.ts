import { App, PluginSettingTab, Setting, requestUrl } from "obsidian";
import type PipPlugin from "./main";

export interface PipSettings {
  vaultToken: string;
  serverUrl: string;
}

export const DEFAULT_SETTINGS: PipSettings = {
  vaultToken: "",
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
  private pollTimer: number | null = null;

  constructor(app: App, plugin: PipPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  hide(): void {
    this.stopPolling();
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async onLinked(vaultToken: string): Promise<void> {
    this.stopPolling();
    this.plugin.settings.vaultToken = vaultToken;
    await this.plugin.saveSettings();
    this.display();
  }

  display(): void {
    const { containerEl } = this;
    this.stopPolling();
    containerEl.empty();

    const connected = !!this.plugin.settings.vaultToken;

    // Connection status
    const status = containerEl.createDiv();
    status.style.cssText =
      "background:var(--background-secondary);border-radius:8px;padding:12px 16px;margin-bottom:18px;font-size:0.95em;font-weight:600;";
    status.style.color = connected ? "var(--color-green)" : "var(--text-muted)";
    status.setText(connected ? "✓ Connected to Pip" : "Not connected");

    if (connected) {
      new Setting(containerEl)
        .setName("Disconnect")
        .setDesc("Stop syncing and forget this vault's connection. You can reconnect any time.")
        .addButton((btn) =>
          btn.setButtonText("Disconnect").setWarning().onClick(async () => {
            this.plugin.settings.vaultToken = "";
            await this.plugin.saveSettings();
            this.display();
          })
        );

      // BYOK section — rendered async; stays hidden unless the server reports
      // the feature enabled (GET /settings/byok → {enabled:true}).
      const byokEl = containerEl.createDiv();
      void this.renderByok(byokEl);
    } else {
      // Instructions
      const info = containerEl.createDiv();
      info.style.cssText =
        "background:var(--background-secondary);border-radius:8px;padding:14px 16px;margin-bottom:18px;font-size:0.9em;line-height:1.6;color:var(--text-muted);";
      info.innerHTML = `
        <strong style="color:var(--text-normal);display:block;margin-bottom:6px;">Connect your vault</strong>
        Tap <strong>Connect to Pip</strong> below — it opens Telegram, you tap <code>Start</code>, and you're linked. No codes to type.<br>
        Telegram didn't open? Send <code>/connect</code> to <a href="https://t.me/pipforobsidian_bot">@pipforobsidian_bot</a> and paste the code it gives you.
      `;

      // Path 1 — Connect button
      const connectSetting = new Setting(containerEl)
        .setName("Connect to Pip")
        .setDesc("Opens Telegram and links this vault automatically.");
      const statusLabel = connectSetting.descEl.createDiv();
      statusLabel.style.cssText = "margin-top:6px;font-size:0.85em;color:var(--text-muted);";
      connectSetting.addButton((btn) =>
        btn.setButtonText("Connect to Pip").setCta().onClick(async () => {
          btn.setDisabled(true);
          statusLabel.setText("Opening Telegram…");
          try {
            await this.startMagicLink(statusLabel);
          } catch {
            statusLabel.setText("Couldn't reach the Pip server. Check your connection and try again.");
            btn.setDisabled(false);
          }
        })
      );

      // Path 2 — manual paste-code fallback
      const codeSetting = new Setting(containerEl)
        .setName("Or paste a pairing code")
        .setDesc("Use the code from /connect in Telegram.");
      let codeValue = "";
      codeSetting.addText((text) =>
        text.setPlaceholder("paste code here").onChange((v) => { codeValue = v.trim(); })
      );
      const codeStatus = codeSetting.descEl.createDiv();
      codeStatus.style.cssText = "margin-top:6px;font-size:0.85em;color:var(--text-muted);";
      codeSetting.addButton((btn) =>
        btn.setButtonText("Link").onClick(async () => {
          if (!codeValue) { codeStatus.setText("Enter the code from Telegram first."); return; }
          btn.setDisabled(true);
          codeStatus.setText("Linking…");
          const ok = await this.redeemCode(codeValue);
          if (!ok) {
            codeStatus.setText("That code is invalid or expired. Send /connect again for a fresh one.");
            btn.setDisabled(false);
          }
        })
      );
    }

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

  /** Path 1: mint a pairing token, open the Telegram deep link, poll until linked. */
  private async startMagicLink(statusLabel: HTMLElement): Promise<void> {
    const base = this.plugin.settings.serverUrl;
    const resp = await requestUrl({
      url: `${base}/auth/token`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      throw: false,
    });
    if (resp.status !== 200) throw new Error(`auth/token ${resp.status}`);
    // claim_secret never goes into the deep link / URL — it gates the claim, so a
    // leaked URL token alone can't steal the vault token. Held only in this closure.
    const { token, claim_secret, deep_link } =
      resp.json as { token: string; claim_secret: string; deep_link: string };

    window.open(deep_link, "_blank");
    statusLabel.setText("Waiting for you to tap Start in Telegram…");

    // Poll /auth/status every 2s; the token expires server-side in ~10 min.
    // POST (body, not query) so neither token nor secret hits any access log.
    const deadline = Date.now() + 10 * 60 * 1000;
    this.stopPolling();
    this.pollTimer = window.setInterval(async () => {
      if (Date.now() > deadline) {
        this.stopPolling();
        statusLabel.setText("Connection link expired. Tap Connect to Pip to try again.");
        return;
      }
      try {
        const s = await requestUrl({
          url: `${base}/auth/status`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, claim_secret }),
          throw: false,
        });
        if (s.status === 200 && (s.json as { status: string }).status === "linked") {
          await this.onLinked((s.json as { vault_token: string }).vault_token);
        }
      } catch {
        // transient network error — keep polling until the deadline
      }
    }, 2000);
  }

  /**
   * BYOK section. Fetches feature status from the server; renders nothing if the
   * feature is disabled. The key is write-only — it's sent to the server and
   * never stored in plugin settings or shown again (only a masked "key set ✓").
   */
  private async renderByok(el: HTMLElement): Promise<void> {
    const base = this.plugin.settings.serverUrl;
    const token = this.plugin.settings.vaultToken;
    let status: {
      enabled: boolean;
      providers: { id: string; label: string; available: boolean }[];
      has_key: boolean;
      provider: string | null;
      last_error: string | null;
    };
    try {
      const resp = await requestUrl({
        url: `${base}/settings/byok`,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        throw: false,
      });
      if (resp.status !== 200) return;
      status = resp.json;
    } catch {
      return;
    }
    if (!status?.enabled) return; // feature off → no UI

    el.empty();
    const head = el.createEl("h3", { text: "Bring your own API key" });
    head.style.cssText = "margin-top:24px;margin-bottom:4px;";
    const desc = el.createDiv();
    desc.style.cssText =
      "background:var(--background-secondary);border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:0.88em;line-height:1.6;color:var(--text-muted);";
    desc.innerHTML =
      "Use your own AI provider key. Only you pay for AI usage, and your notes are processed through your own account. " +
      "Your key is sent securely and stored encrypted — Pip never displays it again.";

    const providers = status.providers || [];
    let selectedProvider = status.provider || "gemini";
    let keyValue = "";

    new Setting(el).setName("AI provider").addDropdown((dd) => {
      for (const p of providers) {
        dd.addOption(p.id, p.available ? p.label : `${p.label} (coming soon)`);
      }
      dd.setValue(selectedProvider);
      dd.onChange((v) => {
        selectedProvider = v;
      });
    });

    const keySetting = new Setting(el)
      .setName("API key")
      .setDesc(status.has_key ? "A key is set. Paste a new one to replace it." : "Paste your key, then Save.");
    keySetting.addText((t) => {
      t.inputEl.type = "password";
      t.setPlaceholder(status.has_key ? "•••••••• (key set)" : "paste your key");
      t.onChange((v) => {
        keyValue = v.trim();
      });
    });
    const statusLine = keySetting.descEl.createDiv();
    statusLine.style.cssText = "margin-top:6px;font-size:0.85em;";
    if (status.has_key) {
      statusLine.style.color = "var(--color-green)";
      statusLine.setText(`Key set ✓${status.provider ? ` (${status.provider})` : ""}`);
    } else if (status.last_error) {
      statusLine.style.color = "var(--text-error)";
      statusLine.setText("Last key was rejected. Paste a valid key and Save.");
    }
    keySetting.addButton((btn) =>
      btn
        .setButtonText("Save")
        .setCta()
        .onClick(async () => {
          if (!keyValue) {
            statusLine.style.color = "var(--text-error)";
            statusLine.setText("Paste a key first.");
            return;
          }
          const avail = providers.find((p) => p.id === selectedProvider)?.available;
          if (!avail) {
            statusLine.style.color = "var(--text-error)";
            statusLine.setText("That provider is coming soon.");
            return;
          }
          btn.setDisabled(true);
          statusLine.style.color = "var(--text-muted)";
          statusLine.setText("Validating…");
          const ok = await this.saveByok(selectedProvider, keyValue);
          keyValue = ""; // never retain plaintext in the plugin
          if (ok) {
            this.display();
          } else {
            statusLine.style.color = "var(--text-error)";
            statusLine.setText("Key rejected — check it and try again.");
            btn.setDisabled(false);
          }
        })
    );

    if (status.has_key) {
      new Setting(el)
        .setName("Remove key")
        .setDesc("Stop using your own key.")
        .addButton((b) =>
          b.setButtonText("Remove").setWarning().onClick(async () => {
            await this.clearByok();
            this.display();
          })
        );
    }
  }

  private async saveByok(provider: string, key: string): Promise<boolean> {
    const base = this.plugin.settings.serverUrl;
    try {
      const resp = await requestUrl({
        url: `${base}/settings/byok`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.plugin.settings.vaultToken}`,
        },
        body: JSON.stringify({ provider, key }),
        throw: false,
      });
      return resp.status === 200;
    } catch {
      return false;
    }
  }

  private async clearByok(): Promise<void> {
    const base = this.plugin.settings.serverUrl;
    try {
      await requestUrl({
        url: `${base}/settings/byok`,
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.plugin.settings.vaultToken}` },
        throw: false,
      });
    } catch {
      // best-effort; UI re-renders from server state on next display()
    }
  }

  /** Path 2: redeem a manual paste code for the vault token. */
  private async redeemCode(code: string): Promise<boolean> {
    const base = this.plugin.settings.serverUrl;
    try {
      const resp = await requestUrl({
        url: `${base}/auth/redeem`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        throw: false,
      });
      if (resp.status !== 200) return false;
      const { vault_token } = resp.json as { vault_token: string };
      if (!vault_token) return false;
      await this.onLinked(vault_token);
      return true;
    } catch {
      return false;
    }
  }
}
