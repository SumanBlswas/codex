import React from 'react';

interface DynamicStylesProps {
    styles: React.CSSProperties;
    onChange: (key: string, value: string) => void;
    availableFonts: string[];
    excludeKeys?: string[];
    includeKeys?: string[];
}

/**
 * Helper to check if a CSS value is meaningful
 */
const hasValue = (value: any): boolean => {
    if (value === undefined || value === null || value === '') return false;
    if (value === 'none' || value === 'auto' || value === 'normal') return false;
    if (value === '0px' || value === '0') return false;
    if (value === 'rgba(0, 0, 0, 0)') return false;
    return true;
};

/**
 * Convert camelCase to Title Case with spaces
 */
const toTitleCase = (str: string): string => {
    return str
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (s) => s.toUpperCase())
        .trim();
};

/**
 * Dynamically render all CSS properties that have values
 */
export const DynamicStyles: React.FC<DynamicStylesProps> = ({
    styles,
    onChange,
    availableFonts,
    excludeKeys = [],
    includeKeys = []
}) => {
    // Filter to only properties with actual values
    let activeProperties = Object.entries(styles).filter(([_, value]) => hasValue(value));

    // Apply includeKeys filter if specified
    if (includeKeys.length > 0) {
        activeProperties = activeProperties.filter(([key]) => includeKeys.includes(key));
    }

    // Apply excludeKeys filter
    if (excludeKeys.length > 0) {
        activeProperties = activeProperties.filter(([key]) => !excludeKeys.includes(key));
    }

    if (activeProperties.length === 0) {
        return null;
    }

    return (
        <div className="grid grid-cols-2 gap-3">
            {activeProperties.map(([key, value]) => {
                const label = toTitleCase(key);
                const isColor = key.toLowerCase().includes('color') || key === 'background';
                const isFontFamily = key === 'fontFamily';

                return (
                    <div key={key}>
                        <label className="text-xs text-slate-500 font-medium block mb-1">{label}</label>

                        {isColor ? (
                            <div className="flex gap-1">
                                <input
                                    type="color"
                                    value={String(value).substring(0, 7)}
                                    onChange={(e) => onChange(key, e.target.value)}
                                    className="h-9 w-8 p-1 border border-slate-200 rounded cursor-pointer"
                                />
                                <input
                                    type="text"
                                    value={String(value)}
                                    onChange={(e) => onChange(key, e.target.value)}
                                    className="flex-1 p-2 border border-slate-200 rounded text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none min-w-0"
                                />
                            </div>
                        ) : isFontFamily ? (
                            <select
                                value={String(value)}
                                onChange={(e) => onChange(key, e.target.value)}
                                className="w-full p-2 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            >
                                {availableFonts.map(font => (
                                    <option key={font} value={font}>{font}</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type="text"
                                value={String(value)}
                                onChange={(e) => onChange(key, e.target.value)}
                                className="w-full p-2 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
};
