import { App, TFile } from "obsidian";
import { getDeviceId } from "./settings";

interface Note {
  id: string;
  target_file: string;
  content: string;
}

interface PullResponse {
  notes: Note[];
}

const SEEN_NOTES_KEY = "pip-seen-notes";
const MAX_SEEN = 500;

function getSeenNotes(): Set<string> {
  const raw = localStorage.getItem(SEEN_NOTES_KEY);
  return new Set(raw ? JSON.parse(raw) : []);
}

function addSeenNotes(ids: string[]): void {
  const seen = getSeenNotes();
  ids.forEach((id) => seen.add(id));
  const trimmed = Array.from(seen).slice(-MAX_SEEN);
  localStorage.setItem(SEEN_NOTES_KEY, JSON.stringify(trimmed));
}

export async function syncNotes(
  app: App,
  pin: string,
  serverUrl: string
): Promise<void> {
  if (!pin) return;

  const deviceId = getDeviceId();
  const vault = app.vault;

  // Build vault index: 500 most recently modified files
  const files = vault.getMarkdownFiles()
    .sort((a, b) => b.stat.mtime - a.stat.mtime)
    .slice(0, 500)
    .map((f: TFile) => f.path);

  // Build user tags: top 50 by frequency
  const tagCounts: Record<string, number> = {};
  for (const file of vault.getMarkdownFiles().slice(0, 200)) {
    const content = await vault.cachedRead(file);
    const matches = content.match(/#([\w-]+)/g) || [];
    for (const tag of matches) {
      const t = tag.slice(1);
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }
  const userTags = Object.entries(tagCounts)
    .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
    .slice(0, 50)
    .map(([tag]: [string, number]) => tag);

  // Pull from server
  let data: PullResponse;
  try {
    const resp = await fetch(
      `${serverUrl}/pull?token=${encodeURIComponent(pin)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vault_index: files, user_tags: userTags, device_id: deviceId }),
      }
    );
    if (!resp.ok) return;
    data = await resp.json();
  } catch {
    return;
  }

  if (!data.notes?.length) return;

  const seen = getSeenNotes();
  const newIds: string[] = [];

  for (const note of data.notes) {
    if (seen.has(note.id)) continue;

    await writeNote(app, note.target_file, note.content);
    newIds.push(note.id);
  }

  if (newIds.length > 0) {
    addSeenNotes(newIds);
    // Confirm delivery
    fetch(`${serverUrl}/confirm?token=${encodeURIComponent(pin)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note_ids: newIds }),
    }).catch(() => {});
  }
}

async function writeNote(app: App, targetFile: string, content: string): Promise<void> {
  const vault = app.vault;
  const isInbox = targetFile.startsWith("_pipinbox/");

  if (!isInbox) {
    // Routed note — append to existing project file with separator
    const existing = vault.getAbstractFileByPath(targetFile);
    if (existing instanceof TFile) {
      await vault.append(existing, "\n\n---\n\n" + content);
      return;
    }
  }

  // Inbox note (or routed file doesn't exist yet) — create individual file
  try {
    const parts = targetFile.split("/");
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join("/");
      if (!vault.getAbstractFileByPath(dir)) {
        await vault.createFolder(dir);
      }
    }
    await vault.create(targetFile, content);
  } catch {
    // Fallback
    const fallback = vault.getAbstractFileByPath("_pipinbox/fallback.md");
    if (fallback instanceof TFile) {
      await vault.append(fallback, "\n\n---\n\n" + content);
    } else {
      try {
        if (!vault.getAbstractFileByPath("_pipinbox")) {
          await vault.createFolder("_pipinbox");
        }
        await vault.create("_pipinbox/fallback.md", content);
      } catch {
        // silent — best effort
      }
    }
  }
}
