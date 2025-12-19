import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  title?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Select({
  value,
  onChange,
  options,
  disabled = false,
  title,
  placeholder,
  required,
  className,
  style,
}: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      title={title}
      required={required}
      className={className}
      style={{
        ...styles.select,
        ...(disabled ? styles.disabled : {}),
        ...style,
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

const styles: Record<string, React.CSSProperties> = {
  select: {
    width: '100%',
    padding: '6px 8px',
    fontSize: '12px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    color: '#cccccc',
    cursor: 'pointer',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  disabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    backgroundColor: '#2d2d2d',
  },
};
