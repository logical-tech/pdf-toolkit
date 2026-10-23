import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type { Update };

export const appVersion = () => (isTauri() ? getVersion() : Promise.resolve("dev"));

// Updates come from the latest GitHub release's latest.json (see tauri.conf.json); signed, so a tampered file is refused.
export const checkForUpdate = (): Promise<Update | null> => (isTauri() ? check() : Promise.resolve(null));

export async function installUpdate(update: Update, onProgress: (fraction: number | null) => void) {
  let total = 0;
  let done = 0;
  await update.downloadAndInstall((e) => {
    if (e.event === "Started") total = e.data.contentLength ?? 0;
    else if (e.event === "Progress") {
      done += e.data.chunkLength;
      onProgress(total ? done / total : null);
    }
  });
  await relaunch();
}
