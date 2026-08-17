import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SplitHandle } from './SplitHandle';

describe('SplitHandle', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
  });

  function renderHandle(
    direction: 'row' | 'column',
    onPreviewRatio = vi.fn(),
    onResize = vi.fn(),
  ) {
    const view = render(
      <div data-testid="split">
        <SplitHandle
          direction={direction}
          ratio={0.5}
          onPreviewRatio={onPreviewRatio}
          onResize={onResize}
        />
      </div>,
    );
    const container = screen.getByTestId('split');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 600,
      width: 1000,
      height: 600,
      toJSON: () => ({}),
    });
    return { ...view, handle: screen.getByRole('separator'), onPreviewRatio, onResize };
  }

  it('previews a horizontal ratio while dragging and commits once on release', () => {
    const { handle, onPreviewRatio, onResize } = renderHandle('row');

    fireEvent.pointerDown(handle, { pointerId: 7, clientX: 500, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 700, clientY: 100 });

    expect(handle.setPointerCapture).toHaveBeenCalledWith(7);
    expect(onPreviewRatio).toHaveBeenLastCalledWith(0.7);
    expect(onResize).not.toHaveBeenCalled();

    fireEvent.pointerUp(handle, { pointerId: 7, clientX: 700, clientY: 100 });
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(0.7);
  });

  it('clamps row resizing to a 240px minimum for both children', () => {
    const { handle, onPreviewRatio, onResize } = renderHandle('row');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 10 });
    expect(onPreviewRatio).toHaveBeenLastCalledWith(0.24);

    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 999 });
    expect(onResize).toHaveBeenLastCalledWith(0.76);
  });

  it('clamps column resizing to a 120px minimum for both children', () => {
    const { handle, onPreviewRatio, onResize } = renderHandle('column');

    fireEvent.pointerDown(handle, { pointerId: 2, clientY: 300 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientY: 10 });
    expect(onPreviewRatio).toHaveBeenLastCalledWith(0.2);

    fireEvent.pointerUp(handle, { pointerId: 2, clientY: 599 });
    expect(onResize).toHaveBeenLastCalledWith(0.8);
  });

  it('restores the committed ratio when a drag is cancelled', () => {
    const { handle, onPreviewRatio, onResize } = renderHandle('row');

    fireEvent.pointerDown(handle, { pointerId: 3, clientX: 500 });
    fireEvent.pointerMove(handle, { pointerId: 3, clientX: 650 });
    fireEvent.pointerCancel(handle, { pointerId: 3 });

    expect(onPreviewRatio).toHaveBeenLastCalledWith(0.5);
    expect(onResize).not.toHaveBeenCalled();
  });
});
