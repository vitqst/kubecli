import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface AppError {
  id: string;
  message: string;
  details?: string;
  severity: ErrorSeverity;
  timestamp: Date;
  dismissible: boolean;
  action?: {
    label: string;
    callback: () => void;
  };
}

interface ErrorContextType {
  errors: AppError[];
  addError: (error: Omit<AppError, 'id' | 'timestamp'>) => void;
  dismissError: (id: string) => void;
  clearErrors: () => void;
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

interface ErrorProviderProps {
  children: ReactNode;
}

export function ErrorProvider({ children }: ErrorProviderProps) {
  const [errors, setErrors] = useState<AppError[]>([]);

  const addError = useCallback((error: Omit<AppError, 'id' | 'timestamp'>) => {
    const newError: AppError = {
      ...error,
      id: `error-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
    };

    setErrors(prev => [...prev, newError]);

    // Auto-dismiss info messages after 5 seconds
    if (error.severity === 'info' && error.dismissible) {
      setTimeout(() => {
        setErrors(prev => prev.filter(e => e.id !== newError.id));
      }, 5000);
    }

    console.error(`[AppError] ${error.severity.toUpperCase()}: ${error.message}`, error.details);
  }, []);

  const dismissError = useCallback((id: string) => {
    setErrors(prev => prev.filter(e => e.id !== id));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return (
    <ErrorContext.Provider value={{ errors, addError, dismissError, clearErrors }}>
      {children}
    </ErrorContext.Provider>
  );
}

export function useError(): ErrorContextType {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useError must be used within ErrorProvider');
  }
  return context;
}
