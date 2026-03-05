import React from 'react';
import { VirtualElement, ElementType } from '../types';

export const parseHtmlFile = async (file: File): Promise<VirtualElement> => {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');

  let idCounter = 0;

  const getStyles = (el: HTMLElement): React.CSSProperties => {
    const styles: React.CSSProperties = {};
    const styleDeclaration = el.style;
    for (let i = 0; i < styleDeclaration.length; i++) {
      const key = styleDeclaration[i];
      const value = styleDeclaration.getPropertyValue(key);
      const camelKey = key.replace(/-([a-z])/g, g => g[1].toUpperCase());
      (styles as any)[camelKey] = value;
    }
    return styles;
  };

  const transformNode = (node: Element): VirtualElement => {
    const rawTagName = node.tagName.toLowerCase();

    // Support ALL HTML tags - let the browser handle rendering natively
    const type: ElementType = rawTagName;

    const htmlEl = node as HTMLElement;
    const existingId = htmlEl.id;
    const className = htmlEl.className;

    // Capture ALL attributes including data-*, aria-*, onclick, etc.
    const attributes: Record<string, string> = {};
    const reservedAttrs = ['id', 'class', 'style', 'src', 'href']; // These are handled separately

    for (let i = 0; i < node.attributes.length; i++) {
      const attr = node.attributes[i];
      if (!reservedAttrs.includes(attr.name)) {
        attributes[attr.name] = attr.value;
      }
    }

    const element: VirtualElement = {
      id: existingId || `imported-${Date.now()}-${idCounter++}`,
      type,
      name: rawTagName.charAt(0).toUpperCase() + rawTagName.slice(1),
      styles: getStyles(node as HTMLElement),
      className: className || undefined,
      attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
      children: []
    };

    if (rawTagName === 'img') {
      const src = node.getAttribute('src');
      if (src) element.src = src;
      // Ensure images are visible if no size set
      if (!element.styles.width && !element.styles.height) {
        element.styles.maxWidth = '100%';
      }
    }
    if (rawTagName === 'a') {
      const href = node.getAttribute('href');
      if (href) element.href = href;
    }

    // Process children
    const childNodes = Array.from(node.childNodes);

    childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent;
        if (text && text.trim().length > 0) {
          // Use 'text' type for plain text nodes (no wrapping element)
          element.children.push({
            id: `text-${Date.now()}-${idCounter++}`,
            type: 'text',
            name: 'Text Node',
            content: text,
            styles: {},
            children: []
          });
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = transformNode(child as Element);
        element.children.push(childEl);
      }
    });

    return element;
  };

  // Start from body
  const rootChildren: VirtualElement[] = [];
  Array.from(doc.body.children).forEach(child => {
    const vNode = transformNode(child);
    rootChildren.push(vNode);
  });

  return {
    id: 'root',
    type: 'div',
    name: 'Body Container',
    styles: {
      ...getStyles(doc.body),
      minHeight: '100%',
      backgroundColor: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Inter, sans-serif'
    },
    children: rootChildren
  };
};