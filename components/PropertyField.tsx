import React from 'react';

interface PropertyFieldProps {
    label: string;
    value: any;
    onChange: (value: string) => void;
    type?: 'text' | 'color' | 'select';
    options?: string[];
    placeholder?: string;
}

/**
 * Helper to check if a CSS value is meaningful (not empty/default)
 */
export const hasValue = (value: any): boolean => {
    if (value === undefined || value === null || value === '') return false;
    if (value === 'none' || value === 'auto' || value === 'normal') return false;
    if (value === '0px' || value === '0') return false;
    if (value === 'rgba(0, 0, 0, 0)') return false; // Transparent
    return true;
};

/**
 * Renders a property field only if it has a value
 */
export const PropertyField: React.FC<PropertyFieldProps> = ({
    label,
    value,
    onChange,
    type = 'text',
    options,
    placeholder
}) => {
    // Don't render if no value
    if (!hasValue(value)) return null;

    return (
        <div>
            <label className="text-xs text-slate-500">{label}</label>
            {type === 'color' ? (
                <div className="flex gap-1">
                    <input
                        type="color"
                        value={String(value).substring(0, 7)}
                        onChange={(e) => onChange(e.target.value)}
                        className="h-9 w-8 p-1 border border-slate-200 rounded"
                    />
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="flex-1 p-2 border border-slate-200 rounded text-sm font-mono min-w-0"
                    />
                </div>
            ) : type === 'select' && options ? (
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded text-sm"
                >
                    {options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            ) : (
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded text-sm"
                    placeholder={placeholder}
                />
            )}
        </div>
    );
};
