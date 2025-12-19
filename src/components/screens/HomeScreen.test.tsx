import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeScreen } from './HomeScreen';

const defaultProps = {
  kubeconfigPath: '/home/user/.kube/config',
  availableConfigs: [
    { path: '/home/user/.kube/config', name: 'config', isDefault: true },
    { path: '/home/user/.kube/config-dev', name: 'config-dev', isDefault: false },
  ],
  selectedContext: 'my-context',
  contexts: [
    { name: 'my-context', cluster: 'my-cluster', server: 'https://localhost:6443', user: 'admin' },
  ],
  isLoading: false,
  onConfigChange: vi.fn(),
  onContextChange: vi.fn(),
  onGetStarted: vi.fn(),
};

describe('HomeScreen Component', () => {
  describe('Loading Overlay', () => {
    it('should NOT show loading overlay when isLoading is false', () => {
      render(<HomeScreen {...defaultProps} isLoading={false} />);

      // Loading text should not be in the document
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    it('should show loading overlay when isLoading is true', () => {
      render(<HomeScreen {...defaultProps} isLoading={true} />);

      // Loading text should be visible
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should disable Get Started button when isLoading is true', () => {
      render(<HomeScreen {...defaultProps} isLoading={true} />);

      const button = screen.getByRole('button', { name: /get started/i });
      expect(button).toBeDisabled();
    });

    it('should enable Get Started button when isLoading is false', () => {
      render(<HomeScreen {...defaultProps} isLoading={false} />);

      const button = screen.getByRole('button', { name: /get started/i });
      expect(button).not.toBeDisabled();
    });

    it('should disable config select when isLoading is true', () => {
      render(<HomeScreen {...defaultProps} isLoading={true} />);

      // Find the config select (first select)
      const selects = screen.getAllByRole('combobox');
      const configSelect = selects[0];
      expect(configSelect).toBeDisabled();
    });

    it('should disable context select when isLoading is true', () => {
      render(<HomeScreen {...defaultProps} isLoading={true} />);

      // Find the context select (second select)
      const selects = screen.getAllByRole('combobox');
      const contextSelect = selects[1];
      expect(contextSelect).toBeDisabled();
    });
  });

  describe('Get Started Button', () => {
    it('should show Get Started button when context is selected', () => {
      render(<HomeScreen {...defaultProps} />);

      expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
    });

    it('should NOT show Get Started button when no contexts available', () => {
      render(<HomeScreen {...defaultProps} contexts={[]} selectedContext="" />);

      expect(screen.queryByRole('button', { name: /get started/i })).not.toBeInTheDocument();
    });

    it('should call onGetStarted when clicked', async () => {
      const onGetStarted = vi.fn();
      render(<HomeScreen {...defaultProps} onGetStarted={onGetStarted} />);

      const button = screen.getByRole('button', { name: /get started/i });
      button.click();

      expect(onGetStarted).toHaveBeenCalledTimes(1);
    });
  });
});
