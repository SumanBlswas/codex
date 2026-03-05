import { FileMap } from '../types';

/**
 * Extract font family names from @font-face declarations in CSS files
 */
export const parseFontFamilies = (files: FileMap): string[] => {
    const fonts = new Set<string>();

    // Iterate through all CSS files
    Object.values(files).forEach((file: any) => {
        if (file.type === 'css' && file.content) {
            // Match @font-face blocks and extract font-family names
            const fontFaceRegex = /@font-face\s*\{[^}]*font-family:\s*["']?([^"';]+)["']?[^}]*\}/gi;
            let match;

            while ((match = fontFaceRegex.exec(file.content)) !== null) {
                const fontName = match[1].trim();
                fonts.add(fontName);
            }
        }
    });

    // Add common web-safe fonts
    const webSafeFonts = [
        'Arial',
        'Helvetica',
        'Times New Roman',
        'Georgia',
        'Courier New',
        'Verdana',
        'Trebuchet MS',
        'Comic Sans MS',
        'Impact',
        'sans-serif',
        'serif',
        'monospace'
    ];

    webSafeFonts.forEach(font => fonts.add(font));

    return Array.from(fonts).sort();
};
