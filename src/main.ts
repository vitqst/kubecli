import { app, BrowserWindow, ipcMain } from 'electron';
import { loadKubeConfig, runKubectlCommand, useContext } from './main/kube';
import type { KubeConfigSummary, KubectlResult } from './common/kubeTypes';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

type SuccessResponse<T> = {
  success: true;
  data: T;
};

type ErrorResponse = {
  success: false;
  error: string;
};

function ok<T>(data: T): SuccessResponse<T> {
  return { success: true, data };
}

function err(message: string): ErrorResponse {
  return { success: false, error: message };
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    height: 600,
    width: 800,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  mainWindow.webContents.openDevTools();

  // Capture renderer console output and errors
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const prefix = '[Renderer Console]';
    const location = sourceId ? ` (${sourceId}:${line})` : '';
    
    switch (level) {
      case 0: // log
        console.log(`${prefix} ${message}${location}`);
        break;
      case 1: // warning
        console.warn(`${prefix} ⚠️  ${message}${location}`);
        break;
      case 2: // error
        console.error(`${prefix} ❌ ${message}${location}`);
        break;
      case 3: // debug
        console.debug(`${prefix} 🐛 ${message}${location}`);
        break;
      default:
        console.log(`${prefix} ${message}${location}`);
    }
  });

  // Capture page load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[Main Process] ❌ Page failed to load:', {
      errorCode,
      errorDescription,
      url: validatedURL,
    });
  });

  // Capture renderer crashes
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[Main Process] ❌ Renderer process crashed:', details);
  });
}

function registerIpcHandlers() {
  ipcMain.handle('kube:get-contexts', async () => {
    try {
      const summary = await loadKubeConfig();
      return ok(summary);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to read kubeconfig';
      return err(message);
    }
  });

  ipcMain.handle('kube:set-context', async (_event, contextName: string) => {
    if (!contextName) {
      return err('Context name is required');
    }

    try {
      await useContext(contextName);
      const summary = await loadKubeConfig();

      return ok(summary);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to switch context';
      return err(message);
    }
  });

  ipcMain.handle(
    'kube:run-command',
    async (
      _event,
      params: { context: string; command: string }
    ): Promise<SuccessResponse<KubectlResult> | ErrorResponse> => {
      if (!params?.context) {
        return err('Select a context first');
      }

      if (!params?.command || !params.command.trim()) {
        return err('Provide a kubectl command to run');
      }

      try {
        const result = await runKubectlCommand(params.context, params.command);
        return ok(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to run kubectl';
        return err(message);
      }
    }
  );
}

app.on('ready', createWindow);
app.whenReady().then(registerIpcHandlers);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
