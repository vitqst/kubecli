import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { terminal } from './terminal';

// Mock the Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

describe('terminal API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should invoke terminal_create command and return terminal ID', async () => {
      const mockTerminalId = 'term_1';
      vi.mocked(invoke).mockResolvedValue(mockTerminalId);

      const result = await terminal.create();

      expect(invoke).toHaveBeenCalledWith('terminal_create', { shell: null, initialEnv: null });
      expect(result).toBe(mockTerminalId);
    });

    it('should pass custom shell to terminal_create command', async () => {
      const mockTerminalId = 'term_2';
      vi.mocked(invoke).mockResolvedValue(mockTerminalId);

      const result = await terminal.create('/bin/zsh');

      expect(invoke).toHaveBeenCalledWith('terminal_create', { shell: '/bin/zsh', initialEnv: null });
      expect(result).toBe(mockTerminalId);
    });
  });

  describe('write', () => {
    it('should invoke terminal_write with correct parameters', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      await terminal.write('term_1', 'hello');

      expect(invoke).toHaveBeenCalledWith('terminal_write', {
        terminalId: 'term_1',
        data: 'hello',
      });
    });

    it('should handle special characters in data', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      await terminal.write('term_1', '\x1b[32mgreen\x1b[0m');

      expect(invoke).toHaveBeenCalledWith('terminal_write', {
        terminalId: 'term_1',
        data: '\x1b[32mgreen\x1b[0m',
      });
    });
  });

  describe('resize', () => {
    it('should invoke terminal_resize with dimensions', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      await terminal.resize('term_1', 80, 24);

      expect(invoke).toHaveBeenCalledWith('terminal_resize', {
        terminalId: 'term_1',
        cols: 80,
        rows: 24,
      });
    });
  });

  describe('close', () => {
    it('should invoke terminal_close command', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      await terminal.close('term_1');

      expect(invoke).toHaveBeenCalledWith('terminal_close', {
        terminalId: 'term_1',
      });
    });
  });

  describe('onData', () => {
    it('should listen for terminal:data events', async () => {
      const mockUnlisten = vi.fn();
      vi.mocked(listen).mockResolvedValue(mockUnlisten);

      const callback = vi.fn();
      const unlisten = await terminal.onData(callback);

      expect(listen).toHaveBeenCalledWith('terminal:data', expect.any(Function));
      expect(unlisten).toBe(mockUnlisten);
    });

    it('should pass payload to callback when event is received', async () => {
      const mockUnlisten = vi.fn();
      let capturedHandler: ((event: any) => void) | undefined;

      vi.mocked(listen).mockImplementation(async (eventName, handler) => {
        capturedHandler = handler as (event: any) => void;
        return mockUnlisten;
      });

      const callback = vi.fn();
      await terminal.onData(callback);

      // Simulate event being received
      const mockPayload = { terminalId: 'term_1', data: 'output data' };
      capturedHandler!({ payload: mockPayload });

      expect(callback).toHaveBeenCalledWith(mockPayload);
    });
  });

  describe('onExit', () => {
    it('should listen for terminal:exit events', async () => {
      const mockUnlisten = vi.fn();
      vi.mocked(listen).mockResolvedValue(mockUnlisten);

      const callback = vi.fn();
      const unlisten = await terminal.onExit(callback);

      expect(listen).toHaveBeenCalledWith('terminal:exit', expect.any(Function));
      expect(unlisten).toBe(mockUnlisten);
    });

    it('should pass terminal ID to callback when exit event is received', async () => {
      const mockUnlisten = vi.fn();
      let capturedHandler: ((event: any) => void) | undefined;

      vi.mocked(listen).mockImplementation(async (eventName, handler) => {
        capturedHandler = handler as (event: any) => void;
        return mockUnlisten;
      });

      const callback = vi.fn();
      await terminal.onExit(callback);

      // Simulate exit event
      capturedHandler!({ payload: 'term_1' });

      expect(callback).toHaveBeenCalledWith('term_1');
    });
  });
});
