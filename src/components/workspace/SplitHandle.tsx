import React, { useRef } from 'react';

interface SplitHandleProps {
  direction: 'row' | 'column';
  ratio: number;
  onPreviewRatio: (ratio: number) => void;
  onResize: (ratio: number) => void;
  minimumFirstPixels?: number;
  minimumSecondPixels?: number;
}

const HANDLE_SIZE_PX = 8;

export function SplitHandle({
  direction,
  ratio,
  onPreviewRatio,
  onResize,
  minimumFirstPixels,
  minimumSecondPixels,
}: SplitHandleProps) {
  const draggingRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  const ratioForPoint = (handle: HTMLElement, clientX: number, clientY: number) => {
    const container = handle.parentElement;
    if (!container) return ratio;
    const rect = container.getBoundingClientRect();
    const size = direction === 'row' ? rect.width : rect.height;
    if (size <= 0) return ratio;

    const usableSize = Math.max(1, size - HANDLE_SIZE_PX);
    const offset = (direction === 'row' ? clientX - rect.left : clientY - rect.top) - HANDLE_SIZE_PX / 2;
    const defaultMinimum = direction === 'row' ? 240 : 120;
    const firstMinimum = minimumFirstPixels ?? defaultMinimum;
    const secondMinimum = minimumSecondPixels ?? defaultMinimum;
    const fits = firstMinimum + secondMinimum <= usableSize;
    const minimumRatio = fits ? firstMinimum / usableSize : firstMinimum / (firstMinimum + secondMinimum);
    const maximumRatio = fits ? 1 - secondMinimum / usableSize : minimumRatio;
    return Math.min(maximumRatio, Math.max(minimumRatio, offset / usableSize));
  };

  const cancelFrame = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  return (
    <div
      className={`workspace-split-handle workspace-split-handle--${direction}`}
      role="separator"
      aria-label={`Resize ${direction === 'row' ? 'left and right' : 'top and bottom'} panes`}
      aria-orientation={direction === 'row' ? 'vertical' : 'horizontal'}
      aria-valuemin={5}
      aria-valuemax={95}
      aria-valuenow={Math.round(ratio * 100)}
      onPointerDown={(event) => {
        event.preventDefault();
        draggingRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.classList.add('workspace-split-handle--dragging');
      }}
      onPointerMove={(event) => {
        if (!draggingRef.current) return;
        const handle = event.currentTarget;
        const { clientX, clientY } = event;
        cancelFrame();
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          onPreviewRatio(ratioForPoint(handle, clientX, clientY));
        });
      }}
      onPointerUp={(event) => {
        if (!draggingRef.current) return;
        cancelFrame();
        draggingRef.current = false;
        const nextRatio = ratioForPoint(event.currentTarget, event.clientX, event.clientY);
        onPreviewRatio(nextRatio);
        onResize(nextRatio);
        event.currentTarget.classList.remove('workspace-split-handle--dragging');
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        if (!draggingRef.current) return;
        cancelFrame();
        draggingRef.current = false;
        onPreviewRatio(ratio);
        event.currentTarget.classList.remove('workspace-split-handle--dragging');
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    />
  );
}
