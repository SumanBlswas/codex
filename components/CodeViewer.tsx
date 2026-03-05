import React, { useMemo } from 'react';
import { VirtualElement } from '../types';
import { INJECTED_STYLES, INJECTED_SCRIPTS } from '../constants';

interface CodeViewerProps {
  root: VirtualElement;
}

const CodeViewer: React.FC<CodeViewerProps> = ({ root }) => {
  
  // Helper to convert camelCase to kebab-case
  const toKebabCase = (str: string) => str.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);

  const generateCode = (element: VirtualElement, depth = 0): { html: string; css: string } => {
    const indent = '  '.repeat(depth);
    let css = '';
    
    // Generate CSS for this element
    if (Object.keys(element.styles).length > 0 || element.animation) {
      css += `#${element.id} {\n`;
      Object.entries(element.styles).forEach(([key, value]) => {
        if (value) css += `  ${toKebabCase(key)}: ${value};\n`;
      });
      if (element.animation) {
          css += `  animation: ${element.animation};\n`;
      }
      css += `}\n\n`;
    }

    // Generate HTML
    let html = `${indent}<${element.type} id="${element.id}"`;
    if (element.className) html += ` class="${element.className}"`;
    if (element.src) html += ` src="${element.src}"`;
    if (element.href) html += ` href="${element.href}"`;
    html += `>\n`;

    if (element.content) {
      html += `${indent}  ${element.content}\n`;
    }

    element.children.forEach(child => {
      const childResult = generateCode(child, depth + 1);
      html += childResult.html;
      css += childResult.css;
    });

    html += `${indent}</${element.type}>\n`;

    return { html, css };
  };

  const { html, css } = useMemo(() => {
     const bodyContent = generateCode(root, 2);
     const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Generated Site</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
${bodyContent.html}
  <script src="script.js"></script>
</body>
</html>`;

    return { html: fullHtml, css: INJECTED_STYLES + '\n' + bodyContent.css };
  }, [root]);

  return (
    <div className="flex-1 bg-slate-900 text-slate-300 p-6 overflow-auto font-mono text-sm grid grid-cols-3 gap-4 h-full">
      <div className="flex flex-col gap-2 h-full">
        <div className="flex items-center gap-2 text-orange-400 font-bold border-b border-slate-700 pb-2">
            <span>index.html</span>
        </div>
        <textarea readOnly value={html} className="flex-1 bg-slate-950 p-4 rounded-lg resize-none focus:outline-none border border-slate-800" />
      </div>
      
      <div className="flex flex-col gap-2 h-full">
        <div className="flex items-center gap-2 text-blue-400 font-bold border-b border-slate-700 pb-2">
            <span>style.css</span>
        </div>
        <textarea readOnly value={css} className="flex-1 bg-slate-950 p-4 rounded-lg resize-none focus:outline-none border border-slate-800" />
      </div>

       <div className="flex flex-col gap-2 h-full">
        <div className="flex items-center gap-2 text-yellow-400 font-bold border-b border-slate-700 pb-2">
            <span>script.js</span>
        </div>
        <textarea readOnly value={INJECTED_SCRIPTS} className="flex-1 bg-slate-950 p-4 rounded-lg resize-none focus:outline-none border border-slate-800" />
      </div>
    </div>
  );
};

export default CodeViewer;