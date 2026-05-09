import { IpcMain } from 'electron';
import { browserLauncher } from '../services/BrowserLauncher';

export function registerBrowserHandlers(ipcMain: IpcMain) {
  ipcMain.handle('browser:isRunning', async (_event, profileId: string) => {
    return browserLauncher.isRunning(profileId);
  });
}
