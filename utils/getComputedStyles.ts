import React from 'react';

/**
 * Extract computed CSS styles from a DOM element
 * This reads the ACTUAL rendered styles, including those from CSS classes and stylesheets
 */
export const getComputedStyles = (element: HTMLElement): React.CSSProperties => {
    const computed = window.getComputedStyle(element);

    const styles: any = {
        // Layout
        display: computed.display,
        position: computed.position,
        width: computed.width !== 'auto' ? computed.width : undefined,
        height: computed.height !== 'auto' ? computed.height : undefined,
        margin: computed.margin,
        padding: computed.padding,

        // Flexbox
        flexDirection: computed.flexDirection,
        justifyContent: computed.justifyContent,
        alignItems: computed.alignItems,

        // Typography
        fontSize: computed.fontSize,
        fontFamily: computed.fontFamily,
        fontWeight: computed.fontWeight,
        fontStyle: computed.fontStyle,
        lineHeight: computed.lineHeight,
        letterSpacing: computed.letterSpacing !== 'normal' ? computed.letterSpacing : undefined,
        textAlign: computed.textAlign,
        textDecoration: computed.textDecoration,
        textTransform: computed.textTransform,
        color: computed.color,

        // Background
        backgroundColor: computed.backgroundColor !== 'rgba(0, 0, 0, 0)' ? computed.backgroundColor : undefined,
        backgroundImage: computed.backgroundImage !== 'none' ? computed.backgroundImage : undefined,
        backgroundSize: computed.backgroundSize,
        backgroundPosition: computed.backgroundPosition,
        backgroundRepeat: computed.backgroundRepeat,

        // Border
        border: computed.border,
        borderWidth: computed.borderWidth !== '0px' ? computed.borderWidth : undefined,
        borderStyle: computed.borderStyle !== 'none' ? computed.borderStyle : undefined,
        borderColor: computed.borderColor,
        borderRadius: computed.borderRadius !== '0px' ? computed.borderRadius : undefined,

        // Effects
        boxShadow: computed.boxShadow !== 'none' ? computed.boxShadow : undefined,
        opacity: computed.opacity !== '1' ? computed.opacity : undefined,

        // Position
        top: computed.top !== 'auto' ? computed.top : undefined,
        left: computed.left !== 'auto' ? computed.left : undefined,
        right: computed.right !== 'auto' ? computed.right : undefined,
        bottom: computed.bottom !== 'auto' ? computed.bottom : undefined,
        zIndex: computed.zIndex !== 'auto' ? computed.zIndex : undefined,
    };

    // Remove undefined keys
    Object.keys(styles).forEach(key => {
        if (styles[key] === undefined) {
            delete styles[key];
        }
    });

    return styles;
};

/**
 * Get computed styles from an iframe element by ID
 */
export const getComputedStylesFromIframe = (
    iframeRef: HTMLIFrameElement | null,
    elementId: string
): React.CSSProperties | null => {
    if (!iframeRef?.contentDocument) return null;

    // Use data-v-id which is already added by the serializer
    const element = iframeRef.contentDocument.querySelector(`[data-v-id="${elementId}"]`) as HTMLElement;
    if (!element) return null;

    return getComputedStyles(element);
};
