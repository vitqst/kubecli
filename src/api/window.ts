import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Opens a new isolated KubeCLI window.
 * Each window has independent state, terminals, and kubeconfig.
 */
export async function openNewWindow(): Promise<void> {
  try {
    await invoke('open_new_window');
  } catch (error) {
    console.error('Failed to open new window:', error);
  }
}

/**
 * Updates the current window title to reflect active context and config.
 * Format: "KubeCLI - {context} ({configPath})" or "KubeCLI" if no config
 */
export async function updateWindowTitle(
  context: string | null,
  configPath: string | null
): Promise<void> {
  try {
    const win = getCurrentWindow();
    if (context && configPath) {
      await win.setTitle(`KubeCLI - ${context} (${configPath})`);
    } else {
      await win.setTitle('KubeCLI');
    }
  } catch (error) {
    console.error('Failed to update window title:', error);
  }
}

export const window = {
  openNewWindow,
  updateWindowTitle,
};
