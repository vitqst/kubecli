import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { Terminal } from '../components/Terminal';

// Mock ResizeObserver which is not available in jsdom
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as any;

// Mock xterm and fit addon - factory must be self-contained (hoisted)
vi.mock('xterm', () => {
  const MockTerminal = class {
    open = vi.fn();
    write = vi.fn();
    writeln = vi.fn();
    clear = vi.fn();
    dispose = vi.fn();
    onData = vi.fn().mockReturnValue({ dispose: vi.fn() });
    attachCustomKeyEventHandler = vi.fn();
    loadAddon = vi.fn();
    getSelection = vi.fn().mockReturnValue('');
    clearSelection = vi.fn();
    focus = vi.fn();
    buffer = { active: {} };
    element = { clientWidth: 800, clientHeight: 600 };
    cols = 80;
    rows = 24;
    unicode = { activeVersion: '' };
  };
  return {
    Terminal: MockTerminal,
  };
});

vi.mock('xterm-addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn();
    dispose = vi.fn();
  },
}));

vi.mock('@xterm/addon-unicode11', () => ({
  Unicode11Addon: class {
    dispose = vi.fn();
  },
}));

// Create mock functions
const mockInvoke = vi.fn();
const mockListen = vi.fn();
const mockUnlisten = vi.fn();

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: any[]) => mockListen(...args),
}));

describe('Terminal Component', () => {
  let dataListener: ((payload: any) => void) | null = null;
  let exitListener: ((payload: any) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    dataListener = null;
    exitListener = null;

    // Setup listen mock to capture the callbacks
    mockListen.mockImplementation(async (eventName: string, callback: (event: any) => void) => {
      if (eventName === 'terminal:data') {
        dataListener = (payload) => callback({ payload });
      } else if (eventName === 'terminal:exit') {
        exitListener = (payload) => callback({ payload });
      }
      return mockUnlisten;
    });

    // Default invoke behavior
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'terminal_create') {
        return Promise.resolve('term_test_1');
      }
      return Promise.resolve();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Event Listener Registration', () => {
    it('should register data listener BEFORE creating terminal', async () => {
      const callOrder: string[] = [];

      mockListen.mockImplementation(async (eventName: string, callback: any) => {
        callOrder.push(`listen:${eventName}`);
        if (eventName === 'terminal:data') {
          dataListener = (payload) => callback({ payload });
        }
        return mockUnlisten;
      });

      mockInvoke.mockImplementation((cmd: string) => {
        callOrder.push(`invoke:${cmd}`);
        if (cmd === 'terminal_create') {
          return Promise.resolve('term_1');
        }
        return Promise.resolve();
      });

      render(<Terminal id="test" />);

      // Wait for async operations
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('terminal_create', expect.anything());
      });

      // Verify order: listen should come before create
      const dataListenIndex = callOrder.indexOf('listen:terminal:data');
      const createIndex = callOrder.indexOf('invoke:terminal_create');

      expect(dataListenIndex).toBeLessThan(createIndex);
    });

    it('should register exit listener BEFORE creating terminal', async () => {
      const callOrder: string[] = [];

      mockListen.mockImplementation(async (eventName: string, callback: any) => {
        callOrder.push(`listen:${eventName}`);
        if (eventName === 'terminal:exit') {
          exitListener = (payload) => callback({ payload });
        }
        return mockUnlisten;
      });

      mockInvoke.mockImplementation((cmd: string) => {
        callOrder.push(`invoke:${cmd}`);
        if (cmd === 'terminal_create') {
          return Promise.resolve('term_1');
        }
        return Promise.resolve();
      });

      render(<Terminal id="test" />);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('terminal_create', expect.anything());
      });

      const exitListenIndex = callOrder.indexOf('listen:terminal:exit');
      const createIndex = callOrder.indexOf('invoke:terminal_create');

      expect(exitListenIndex).toBeLessThan(createIndex);
    });
  });

  describe('Pending Command Execution', () => {
    it('should execute pending command when terminal is ready', async () => {
      render(<Terminal id="test" pendingCommand="kubectl get pods" />);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('terminal_create', expect.anything());
      });

      // Wait for command to be written (includes Ctrl+C to interrupt, Ctrl+U to clear line)
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('terminal_write', {
          terminalId: 'term_test_1',
          data: '\x03\x15kubectl get pods\n',
        });
      });
    });

    it('should call onCommandExecuted callback after command is sent', async () => {
      const onCommandExecuted = vi.fn();

      render(
        <Terminal
          id="test"
          pendingCommand="kubectl get pods"
          onCommandExecuted={onCommandExecuted}
        />
      );

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('terminal_create', expect.anything());
      });

      await waitFor(() => {
        expect(onCommandExecuted).toHaveBeenCalled();
      });
    });

    it('should not execute command if terminal is not ready', async () => {
      // Make terminal creation hang
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'terminal_create') {
          return new Promise(() => {}); // Never resolves
        }
        return Promise.resolve();
      });

      render(<Terminal id="test" pendingCommand="kubectl get pods" />);

      // Wait a bit
      await new Promise((r) => setTimeout(r, 100));

      // terminal_write should not be called because terminal isn't ready
      expect(mockInvoke).not.toHaveBeenCalledWith('terminal_write', expect.anything());
    });

    it('should not execute null pending command', async () => {
      render(<Terminal id="test" pendingCommand={null} />);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('terminal_create', expect.anything());
      });

      // Wait a bit more for any async effects
      await new Promise((r) => setTimeout(r, 100));

      // terminal_write should not be called with null command
      expect(mockInvoke).not.toHaveBeenCalledWith('terminal_write', expect.anything());
    });
  });

  describe('Cleanup', () => {
    it('should unregister listeners on unmount', async () => {
      const { unmount } = render(<Terminal id="test" />);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('terminal_create', expect.anything());
      });

      unmount();

      // Verify unlisten was called
      expect(mockUnlisten).toHaveBeenCalled();
    });

    it('should close terminal on unmount', async () => {
      const { unmount } = render(<Terminal id="test" />);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('terminal_create', expect.anything());
      });

      unmount();

      expect(mockInvoke).toHaveBeenCalledWith('terminal_close', {
        terminalId: 'term_test_1',
      });
    });
  });
});
