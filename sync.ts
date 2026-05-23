import { App, requestUrl, TFile } from "obsidian";
import { getDeviceId } from "./settings";

interface Note {
  id: string;
  type?: string;
  target_file: string;
  content?: string;
  patch_tags?: string[];
  patch_links?: string[];
  media_urls?: string[];
  media_filenames?: string[];
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

async function downloadMedia(
  mediaUrl: string,
  filename: string,
  app: App,
): Promise<void> {
  try {
    const resp = await requestUrl({ url: mediaUrl });
    const attachmentsFolder = "Attachments";
    if (!app.vault.getAbstractFileByPath(attachmentsFolder)) {
      await app.vault.createFolder(attachmentsFolder);
    }
    const destPath = `${attachmentsFolder}/${filename}`;
    if (!app.vault.getAbstractFileByPath(destPath)) {
      await app.vault.createBinary(destPath, resp.arrayBuffer);
    }
  } catch {
    // Media download failure is non-fatal — note still writes
  }
}

async function patchNote(app: App, targetFile: string, patchTags: string[], patchLinks: string[]): Promise<void> {
  const file = app.vault.getAbstractFileByPath(targetFile);
  if (!(file instanceof TFile)) {
    console.error("[Pip] patchNote: file not found in vault:", targetFile);
    return;
  }
  try {
    let content = await app.vault.read(file);

    // Replace tags line — handles both inline (tags: [a, b]) and block sequence (tags:\n  - a)
    content = content.replace(/^tags:.*$(\n[ \t]+-[^\n]*)*/m, `tags: [${patchTags.join(", ")}]`);

    // Replace or insert links line — handles both inline and block-sequence YAML
    const linksValue = patchLinks.map(l => `"${l}"`).join(", ");
    if (/^links:/m.test(content)) {
      content = patchLinks.length > 0
        ? content.replace(/^links:.*$(\n[ \t]+-[^\n]*)*/m, `links: [${linksValue}]`)
        : content.replace(/^links:.*$(\n[ \t]+-[^\n]*)*/m, "");
    } else if (patchLinks.length > 0 && content.startsWith("---\n")) {
      content = content.replace(/^(date: [^\n]+\n)/m, `$1links: [${linksValue}]\n`);
    }

    await app.vault.modify(file, content);
  } catch (err) {
    console.error("[Pip] patchNote failed:", err, { targetFile, patchTags, patchLinks });
  }
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
      `${serverUrl}/pull`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${pin}`,
        },
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

    if (note.type === "patch") {
      await patchNote(app, note.target_file, note.patch_tags ?? [], note.patch_links ?? []);
      newIds.push(note.id);
      continue;
    }

    if (note.media_urls && note.media_filenames) {
      for (let i = 0; i < note.media_urls.length; i++) {
        await downloadMedia(note.media_urls[i], note.media_filenames[i], app);
      }
    }

    await writeNote(app, note.target_file, note.content ?? "");
    newIds.push(note.id);
  }

  if (newIds.length > 0) {
    addSeenNotes(newIds);
    fetch(`${serverUrl}/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${pin}`,
      },
      body: JSON.stringify({ note_ids: newIds }),
    }).catch(() => {});
  }
}

async function writeNote(app: App, targetFile: string, content: string): Promise<void> {
  const vault = app.vault;

  if (!vault.getAbstractFileByPath("_pipinbox")) {
    await vault.createFolder("_pipinbox");
  }

  const base = targetFile.endsWith(".md") ? targetFile.slice(0, -3) : targetFile;
  for (let attempt = 1; attempt <= 10; attempt++) {
    const path = attempt === 1 ? targetFile : `${base} ${attempt}.md`;
    try {
      await vault.create(path, content);
      return;
    } catch {
      // file exists — try next suffix
    }
  }
}
