/**
 * Action Prompt Dialog Component
 * 
 * Shows a modal dialog for actions that require user input or confirmation
 */

import React, { useState, useEffect } from 'react';
import { PromptField, ResourceActionContext } from '../resources/types';

interface ActionPromptDialogProps {
  title: string;
  prompts?: PromptField[];
  confirmMessage?: string;
  context: ResourceActionContext;
  onConfirm: (values: Record<string, any>) => void;
  onCancel: () => void;
}

export function ActionPromptDialog({
  title,
  prompts,
  confirmMessage,
  context,
  onConfirm,
  onCancel,
}: ActionPromptDialogProps) {
  const [values, setValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);

  // Initialize default values and fetch current values
  useEffect(() => {
    const initializeValues = async () => {
      if (!prompts) return;

      setLoading(true);
      const initialValues: Record<string, any> = {};

      for (const prompt of prompts) {
        // Try to get current value
        if (prompt.getCurrentValue) {
          try {
            const currentValue = await prompt.getCurrentValue(context);
            if (currentValue !== undefined) {
              initialValues[prompt.name] = currentValue;
              continue;
            }
          } catch (error) {
            console.error(`Failed to get current value for ${prompt.name}:`, error);
          }
        }

        // Fall back to default value
        if (prompt.defaultValue !== undefined) {
          initialValues[prompt.name] = prompt.defaultValue;
        }
      }

      setValues(initialValues);
      setLoading(false);
    };

    void initializeValues();
  }, [prompts, context]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(values);
  };

  const handleChange = (name: string, value: any) => {
    setValues(prev => ({ ...prev, [name]: value }));
  };

  // Simple confirmation dialog
  if (confirmMessage && !prompts) {
    return (
      <div style={styles.overlay} onClick={onCancel}>
        <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
          <div style={styles.header}>
            <h3 style={styles.title}>{title}</h3>
          </div>
          <div style={styles.content}>
            <p style={styles.confirmMessage}>{confirmMessage}</p>
          </div>
          <div style={styles.footer}>
            <button onClick={onCancel} style={styles.cancelButton}>
              Cancel
            </button>
            <button onClick={() => onConfirm({})} style={styles.confirmButton}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Prompt dialog with fields
  if (prompts) {
    return (
      <div style={styles.overlay} onClick={onCancel}>
        <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
          <div style={styles.header}>
            <h3 style={styles.title}>{title}</h3>
          </div>
          <form onSubmit={handleSubmit}>
            <div style={styles.content}>
              {confirmMessage && (
                <p style={styles.confirmMessage}>{confirmMessage}</p>
              )}
              {loading ? (
                <div style={styles.loading}>Loading current values...</div>
              ) : (
                prompts.map((prompt) => (
                  <div key={prompt.name} style={styles.field}>
                    <label htmlFor={prompt.name} style={styles.label}>
                      {prompt.label}
                      {prompt.required && <span style={styles.required}> *</span>}
                    </label>
                    {prompt.type === 'text' && (
                      <input
                        type="text"
                        id={prompt.name}
                        value={values[prompt.name] || ''}
                        onChange={(e) => handleChange(prompt.name, e.target.value)}
                        placeholder={prompt.placeholder}
                        required={prompt.required}
                        style={styles.input}
                      />
                    )}
                    {prompt.type === 'number' && (
                      <input
                        type="number"
                        id={prompt.name}
                        value={values[prompt.name] || ''}
                        onChange={(e) => handleChange(prompt.name, parseInt(e.target.value, 10))}
                        placeholder={prompt.placeholder}
                        required={prompt.required}
                        min={prompt.min}
                        max={prompt.max}
                        style={styles.input}
                      />
                    )}
                    {prompt.type === 'select' && prompt.options && (
                      <select
                        id={prompt.name}
                        value={values[prompt.name] || ''}
                        onChange={(e) => handleChange(prompt.name, e.target.value)}
                        required={prompt.required}
                        style={styles.select}
                      >
                        <option value="">Select...</option>
                        {prompt.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))
              )}
            </div>
            <div style={styles.footer}>
              <button type="button" onClick={onCancel} style={styles.cancelButton}>
                Cancel
              </button>
              <button type="submit" style={styles.confirmButton} disabled={loading}>
                Execute
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return null;
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10001,
  },
  dialog: {
    backgroundColor: '#252526',
    border: '1px solid #454545',
    borderRadius: '6px',
    minWidth: '400px',
    maxWidth: '600px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid #3e3e42',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: '#cccccc',
  },
  content: {
    padding: '20px',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  confirmMessage: {
    margin: '0 0 16px 0',
    color: '#cccccc',
    fontSize: '14px',
    lineHeight: '1.5',
  },
  field: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#cccccc',
  },
  required: {
    color: '#f48771',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    color: '#cccccc',
    outline: 'none',
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    color: '#cccccc',
    outline: 'none',
    cursor: 'pointer',
  },
  loading: {
    padding: '20px',
    textAlign: 'center',
    color: '#858585',
    fontSize: '14px',
  },
  footer: {
    padding: '12px 20px',
    borderTop: '1px solid #3e3e42',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  cancelButton: {
    padding: '8px 16px',
    fontSize: '14px',
    backgroundColor: '#3c3c3c',
    color: '#cccccc',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  confirmButton: {
    padding: '8px 16px',
    fontSize: '14px',
    backgroundColor: '#0e639c',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};
