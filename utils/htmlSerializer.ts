import { VirtualElement } from '../types';

const toKebabCase = (str: string) => str.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);

export const serializeVirtualDom = (element: VirtualElement, depth = 0, resolveImage?: (path: string) => string): string => {
  if (element.type === 'text') {
    return element.content || '';
  }
  const indent = '  '.repeat(depth);

  // Self-closing tags (void elements in HTML)
  const voidTags = ['img', 'br', 'hr', 'input', 'link', 'meta', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];
  const isVoid = voidTags.includes(element.type);

  let html = `${indent}<${element.type}`;
  // Always output internal ID for selection logic
  html += ` data-v-id="${element.id}"`;

  if (element.id) {
    html += ` id="${element.id}"`;
  }
  if (element.className) html += ` class="${element.className}"`;

  // Handle Source Resolution
  if (element.type === 'img' && element.src && resolveImage) {
    html += ` src="${resolveImage(element.src)}"`;
  } else if (element.src) {
    html += ` src="${element.src}"`;
  }

  if (element.href) html += ` href="${element.href}"`;

  // Serialize custom attributes (data-*, aria-*, onclick, etc.)
  if (element.attributes) {
    Object.entries(element.attributes).forEach(([attrName, attrValue]) => {
      // Escape quotes in attribute values
      const escapedValue = attrValue.replace(/"/g, '&quot;');
      html += ` ${attrName}="${escapedValue}"`;
    });
  }

  // Serialize Inline Styles
  const styleEntries = Object.entries(element.styles);
  if (styleEntries.length > 0 || element.animation) {
    let styleString = '';
    styleEntries.forEach(([key, value]) => {
      if (value) {
        let finalValue = String(value);
        if (resolveImage && finalValue.includes('url(')) {
          finalValue = finalValue.replace(/url\(['"]?([^'"()]+)['"]?\)/g, (match, url) => {
            // Only skip http/https, let data: pass through to be resolved/extracted
            if (url.startsWith('http')) return match;
            return `url('${resolveImage(url)}')`;
          });
        }
        styleString += `${toKebabCase(key)}: ${finalValue}; `;
      }
    });
    if (element.animation) {
      styleString += `animation: ${element.animation};`;
    }
    if (styleString) {
      html += ` style="${styleString.trim()}"`;
    }
  }

  if (isVoid) {
    html += ` />\n`;
    return html;
  }

  html += `>`;

  // If it has only text content and no children, keep on same line
  if (element.content && element.children.length === 0) {
    html += `${element.content}</${element.type}>\n`;
    return html;
  }

  html += `\n`;

  if (element.content) {
    html += `${indent}  ${element.content}\n`;
  }

  element.children.forEach(child => {
    html += serializeVirtualDom(child, depth + 1, resolveImage);
  });

  html += `${indent}</${element.type}>\n`;
  return html;
};

/**
 * Traverses the Virtual DOM, extracts inline styles into a CSS string,
 * and returns a new VirtualElement tree with styles removed (converted to IDs/Classes).
 */
export const extractStylesFromDom = (
  element: VirtualElement,
  resolveImage?: (path: string) => string
): { root: VirtualElement, css: string } => {
  let css = '';

  // Clone element to avoid mutating original
  const newElement: VirtualElement = { ...element, styles: {}, children: [] };

  // Process Styles
  const styleEntries = Object.entries(element.styles || {});
  if (styleEntries.length > 0) {
    if (!newElement.id) {
      // Generate ID if missing (should be rare)
      newElement.id = `gen-${Math.random().toString(36).substr(2, 9)}`;
    }

    let styleBlock = '';
    styleEntries.forEach(([key, value]) => {
      if (value) {
        let finalValue = String(value);
        if (resolveImage && finalValue.includes('url(')) {
          finalValue = finalValue.replace(/url\(['"]?([^'"()]+)['"]?\)/g, (match, url) => {
            if (url.startsWith('https://') || url.startsWith('http://')) return match;
            // resolveImage (exportResolver) returns root-relative path (media/images/...)
            // Since this CSS will live in css/extracted.css, we prepended ../
            return `url('../${resolveImage(url)}')`;
          });
        }
        styleBlock += `  ${toKebabCase(key)}: ${finalValue};\n`;
      }
    });

    if (styleBlock) {
      // Use ID selector for specificity
      css += `#${newElement.id} {\n${styleBlock}}\n`;
    }
  }

  // Process Children recursively
  newElement.children = element.children.map(child => {
    const result = extractStylesFromDom(child, resolveImage);
    css += result.css;
    return result.root;
  });

  return { root: newElement, css };
};

export const createFullHtmlDocument = (
  root: VirtualElement,
  css: string | string[] = '',
  js: string | string[] = '',
  resolveImage?: (path: string) => string
): string => {

  const bodyContent = serializeVirtualDom(root, 2, resolveImage);

  // MODE 1: External Files (Export) - When arrays are passed
  if (Array.isArray(css) && Array.isArray(js)) {

    // Base Template Head (User Requested)
    const userHead = `
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <title>Gamification</title>
    <link rel="stylesheet" href="css/index.css" />

    <!---GSKpro styles start-->
    <link rel="stylesheet" href="templateCss/grid.css" />
    <link rel="stylesheet" href="templateCss/accordion.css" />
    <link rel="stylesheet" href="templateCss/box.css" />
    <link rel="stylesheet" href="templateCss/common.css" />
    <link rel="stylesheet" href="templateCss/dropdown.css" />
    <link rel="stylesheet" href="templateCss/footer.css" />
    <link rel="stylesheet" href="templateCss/header.css" />
    <link rel="stylesheet" href="templateCss/mt-header-v2.css" />
    <link rel="stylesheet" href="templateCss/locale.css" />
    <link rel="stylesheet" href="templateCss/login.css" />
    <link rel="stylesheet" href="templateCss/main.css" />
    <link rel="stylesheet" href="templateCss/navigation.css" />
    <link rel="stylesheet" href="templateCss/searchBox.css" />
    <!---GSKpro styles end-->
    <script src="templateJs/header.js"></script>
    <script src="templateJs/combined.js"></script>
    <script src="templateJs/app_webinar.js"></script>
    <script>
      $(document).ready(function () {
        $("head").append(
          '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />'
        );
      });
    </script>`;

    // Smart Merge: Only add project files that aren't already in the User Head
    const additionalCss = css.filter(path => !userHead.includes(path))
      .map(path => `<link rel="stylesheet" href="${path}" />`)
      .join('\n    ');

    // User Body Scripts
    const userBodyScripts = `
    <script src="js/jQuery.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/1.3.4/jspdf.min.js"></script>
    <script src="js/local.js"></script>`;

    // Smart Merge: Only add project scripts that aren't already in User Head or User Body
    const additionalJs = js.filter(path => !userHead.includes(path) && !userBodyScripts.includes(path))
      .map(path => `<script src="${path}"></script>`)
      .join('\n    ');

    return `<!DOCTYPE html>
<html lang="en">
  <head>
${userHead}
${additionalCss}
  </head>
  <body>
${bodyContent}
${userBodyScripts}
${additionalJs}
  </body>
</html>`;
  }

  // MODE 2: Inline Content (Preview) - When strings are passed
  const cssContent = Array.isArray(css) ? css.join('\n') : css;
  const jsContent = Array.isArray(js) ? js.join('\n') : js;

  // Wrapper to ensure scripts execute properly in iframe srcDoc context
  // DOMContentLoaded may have already fired in srcDoc, so we check document.readyState
  const wrappedJs = `
(function() {
  function initializePreview() {
    try {
      ${jsContent}
    } catch(e) {
      console.error('[Preview] Script error:', e);
    }
  }
  
  // In srcDoc iframes, DOMContentLoaded often already fired
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePreview);
  } else {
    // DOM is already ready, execute immediately
    initializePreview();
  }
})();
`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nocode-X Project</title>
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
  <style>
    html, body { height: 100%; margin: 0; }
    * { box-sizing: border-box; }
    ${cssContent}
  </style>
</head>
<body>
${bodyContent}
<script>
${wrappedJs}
</script>
</body>
</html>`;
};