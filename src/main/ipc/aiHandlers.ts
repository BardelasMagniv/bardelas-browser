import { IpcMain } from 'electron';
import { aiAgentService } from '../services/AiAgentService';
import { OllamaService } from '../services/OllamaService';
import type { AiAgentSettings } from '../../shared/types';

export function registerAiHandlers(ipcMain: IpcMain) {
  ipcMain.handle('ai:listSessions', async () => {
    return aiAgentService.listSessions();
  });

  ipcMain.handle('ai:start', async (_event, profileId: string, settings: AiAgentSettings = {}) => {
    return aiAgentService.createSession(profileId, settings);
  });

  ipcMain.handle('ai:stop', async (_event, sessionId: string) => {
    return aiAgentService.stopSession(sessionId);
  });

  ipcMain.handle('ai:sendInstruction', async (_event, sessionId: string, instruction: string) => {
    return aiAgentService.sendInstruction(sessionId, instruction);
  });

  ipcMain.handle('ai:listModels', async (_event, settings: AiAgentSettings = {}) => {
    const service = new OllamaService(settings);
    return service.listModels();
  });

  ipcMain.handle('ai:getStatus', async (_event, sessionId: string) => {
    const session = aiAgentService.getSession(sessionId);
    if (!session) {
      throw new Error('AI session not found.');
    }
    return session;
  });
}
