import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { Terminal } from '../components/Terminal';

const xtermMocks = vi.hoisted(() => ({
  getSelection: vi.fn().mockReturnValue(''),
  clearSelection: vi.fn(),
}));

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
    getSelection = xtermMocks.getSelection;
    clearSelection = xtermMocks.clearSelection;
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
    xtermMocks.getSelection.mockReturnValue('');
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

  describe('Environment Updates', () => {
    it('updates and clears kubelogin variables without recreating the terminal', async () => {
      const initialEnv = {
        KUBECONFIG: '/tmp/old-config',
        KUBECTL_NAMESPACE: 'default',
        AAD_LOGIN_METHOD: 'devicecode',
        AZURE_TENANT_ID: 'tenant-old',
        AZURE_CLIENT_ID: 'client-old',
      };
      const { rerender } = render(<Terminal id="test" env={initialEnv} />);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('terminal_create', {
          shell: null,
          initialEnv,
        });
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350));
      });

      rerender(
        <Terminal
          id="test"
          env={{
            KUBECONFIG: "/tmp/team's config",
            KUBECTL_NAMESPACE: 'default',
            AAD_LOGIN_METHOD: 'devicecode',
            AZURE_TENANT_ID: 'tenant-new',
          }}
        />,
      );

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('terminal_write_silent', {
          terminalId: 'term_test_1',
          data: "export KUBECONFIG='/tmp/team'\"'\"'s config'; export AZURE_TENANT_ID='tenant-new'; unset AZURE_CLIENT_ID",
        });
      }, { timeout: 1500 });
      expect(
        mockInvoke.mock.calls.filter(([command]) => command === 'terminal_create'),
      ).toHaveLength(1);
    });

    it('diffs rapid updates from the environment actually applied to the shell', async () => {
      const initialEnv = {
        KUBECONFIG: '/tmp/config',
        KUBECTL_NAMESPACE: 'default',
        AAD_LOGIN_METHOD: 'devicecode',
        AZURE_TENANT_ID: 'tenant-old',
        AZURE_CLIENT_ID: 'client-old',
      };
      const { rerender } = render(<Terminal id="test" env={initialEnv} />);
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('terminal_create', {
          shell: null,
          initialEnv,
        });
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350));
      });

      rerender(
        <Terminal
          id="test"
          env={{ KUBECONFIG: '/tmp/config', KUBECTL_NAMESPACE: 'default' }}
        />,
      );
      await act(async () => Promise.resolve());
      rerender(
        <Terminal
          id="test"
          env={{
            KUBECONFIG: '/tmp/config',
            KUBECTL_NAMESPACE: 'default',
            AAD_LOGIN_METHOD: 'devicecode',
            AZURE_TENANT_ID: 'tenant-new',
          }}
        />,
      );

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('terminal_write_silent', {
          terminalId: 'term_test_1',
          data: "export AZURE_TENANT_ID='tenant-new'; unset AZURE_CLIENT_ID",
        });
      }, { timeout: 1500 });
    });
  });

  describe('Context Menu', () => {
    it('delegates terminal actions to the shared pane context menu', async () => {
      const onContextMenuRequest = vi.fn();
      const clipboard = {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue('paste me'),
      };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
      xtermMocks.getSelection.mockReturnValue('selected output');
      render(<Terminal id="test" onContextMenuRequest={onContextMenuRequest} />);
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('terminal_create', expect.anything());
      });

      fireEvent.contextMenu(screen.getByTestId('terminal-surface-test'), {
        clientX: 120,
        clientY: 240,
      });

      expect(onContextMenuRequest).toHaveBeenCalledTimes(1);
      const request = onContextMenuRequest.mock.calls[0][0];
      expect(request).toMatchObject({ x: 120, y: 240, selection: 'selected output' });

      await request.copySelection();
      expect(clipboard.writeText).toHaveBeenCalledWith('selected output');
      await request.paste();
      expect(mockInvoke).toHaveBeenCalledWith('terminal_write', {
        terminalId: 'term_test_1',
        data: 'paste me',
      });
      request.clearSelection();
      expect(xtermMocks.clearSelection).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cleanup', () => {
    it('closes late-created terminals and unregisters listeners resolved after unmount', async () => {
      let resolveCreate!: (id: string) => void;
      let resolveListen!: (unlisten: () => void) => void;
      const lateUnlisten = vi.fn();
      const createPromise = new Promise<string>((resolve) => { resolveCreate = resolve; });
      const listenPromise = new Promise<() => void>((resolve) => { resolveListen = resolve; });
      mockInvoke.mockImplementation((cmd: string) => cmd === 'terminal_create'
        ? createPromise
        : Promise.resolve());
      mockListen.mockReturnValue(listenPromise);

      const { unmount } = render(<Terminal id="late" />);
      unmount();

      await act(async () => {
        resolveListen(lateUnlisten);
        resolveCreate('term_late');
        await Promise.resolve();
      });

      expect(lateUnlisten).toHaveBeenCalledTimes(2);
      expect(mockInvoke).toHaveBeenCalledWith('terminal_close', { terminalId: 'term_late' });
    });

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
