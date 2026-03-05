
export const CSS_PROPERTY_VALUES: Record<string, string[]> = {
    // Layout
    display: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'none', 'contents', 'table', 'table-row', 'table-cell'],
    position: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
    float: ['none', 'left', 'right', 'inline-start', 'inline-end'],
    clear: ['none', 'left', 'right', 'both', 'inline-start', 'inline-end'],
    visibility: ['visible', 'hidden', 'collapse'],
    overflow: ['visible', 'hidden', 'scroll', 'auto', 'clip'],
    overflowX: ['visible', 'hidden', 'scroll', 'auto', 'clip'],
    overflowY: ['visible', 'hidden', 'scroll', 'auto', 'clip'],
    boxSizing: ['content-box', 'border-box'],
    zIndex: ['auto', '0', '1', '10', '100', '999', '9999'],

    // Flexbox
    flexDirection: ['row', 'row-reverse', 'column', 'column-reverse'],
    flexWrap: ['nowrap', 'wrap', 'wrap-reverse'],
    justifyContent: ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly', 'start', 'end'],
    alignItems: ['stretch', 'flex-start', 'flex-end', 'center', 'baseline', 'start', 'end'],
    alignContent: ['stretch', 'flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'],
    alignSelf: ['auto', 'stretch', 'flex-start', 'flex-end', 'center', 'baseline'],
    flexGrow: ['0', '1', '2', '3'],
    flexShrink: ['0', '1', '2', '3'],
    flexBasis: ['auto', '0', '100%', '50%', '25%'],
    order: ['0', '1', '2', '3', '-1'],
    gap: ['0', '4px', '8px', '12px', '16px', '20px', '24px', '32px'],

    // Grid
    gridTemplateColumns: ['none', 'repeat(2, 1fr)', 'repeat(3, 1fr)', 'repeat(4, 1fr)', '1fr 1fr', '1fr 2fr'],
    gridTemplateRows: ['none', 'auto', 'min-content', 'max-content', '1fr', 'repeat(2, 1fr)'],
    gridColumn: ['auto', 'span 1', 'span 2', 'span 3', '1 / -1'],
    gridRow: ['auto', 'span 1', 'span 2', 'span 3', '1 / -1'],
    placeItems: ['start', 'end', 'center', 'stretch'],
    placeContent: ['start', 'end', 'center', 'stretch', 'space-between', 'space-around'],

    // Sizing
    width: ['auto', '100%', '50%', 'fit-content', 'min-content', 'max-content'],
    height: ['auto', '100%', '50%', 'fit-content', 'min-content', 'max-content'],
    minWidth: ['0', 'auto', '100%', 'min-content', 'max-content'],
    maxWidth: ['none', '100%', 'fit-content', 'min-content', 'max-content'],
    minHeight: ['0', 'auto', '100%', 'min-content', 'max-content'],
    maxHeight: ['none', '100%', 'fit-content', 'min-content', 'max-content'],
    aspectRatio: ['auto', '1', '16/9', '4/3', '1/1', '21/9'],

    // Typography
    fontFamily: ['inherit', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui'],
    fontSize: ['inherit', '12px', '14px', '16px', '18px', '20px', '24px', '32px', '48px', '64px', '1rem', '1.5rem', '2rem'],
    fontWeight: ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
    fontStyle: ['normal', 'italic', 'oblique'],
    fontVariant: ['normal', 'small-caps'],
    lineHeight: ['normal', '1', '1.25', '1.5', '1.75', '2'],
    letterSpacing: ['normal', '-0.05em', '-0.025em', '0', '0.025em', '0.05em', '0.1em'],
    textAlign: ['left', 'right', 'center', 'justify', 'start', 'end'],
    textDecoration: ['none', 'underline', 'overline', 'line-through'],
    textTransform: ['none', 'capitalize', 'uppercase', 'lowercase'],
    textOverflow: ['clip', 'ellipsis'],
    textIndent: ['0', '1em', '2em'],
    textShadow: ['none', '1px 1px 2px rgba(0,0,0,0.5)', '2px 2px 4px rgba(0,0,0,0.3)'],
    wordBreak: ['normal', 'break-all', 'keep-all', 'break-word'],
    wordWrap: ['normal', 'break-word'],
    whiteSpace: ['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'],
    verticalAlign: ['baseline', 'top', 'middle', 'bottom', 'text-top', 'text-bottom', 'sub', 'super'],

    // Colors
    color: ['inherit', 'currentColor', 'transparent', 'black', 'white', 'red', 'blue', 'green', 'gray'],
    backgroundColor: ['transparent', 'inherit', 'currentColor', 'white', 'black', 'gray', 'red', 'blue', 'green'],
    opacity: ['0', '0.1', '0.25', '0.5', '0.75', '0.9', '1'],

    // Background
    backgroundImage: ['none', 'linear-gradient()', 'radial-gradient()', 'url()'],
    backgroundSize: ['auto', 'cover', 'contain', '100%', '50%'],
    backgroundPosition: ['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right'],
    backgroundRepeat: ['repeat', 'repeat-x', 'repeat-y', 'no-repeat', 'space', 'round'],
    backgroundAttachment: ['scroll', 'fixed', 'local'],
    backgroundClip: ['border-box', 'padding-box', 'content-box', 'text'],
    backgroundOrigin: ['border-box', 'padding-box', 'content-box'],
    backgroundBlendMode: ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'],

    // Borders
    borderStyle: ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'],
    borderWidth: ['0', '1px', '2px', '3px', '4px', 'thin', 'medium', 'thick'],
    borderColor: ['currentColor', 'transparent', 'inherit', 'black', 'white', 'gray'],
    borderRadius: ['0', '2px', '4px', '6px', '8px', '12px', '16px', '24px', '50%', '9999px'],
    borderCollapse: ['collapse', 'separate'],

    // Box Shadow
    boxShadow: ['none', '0 1px 2px rgba(0,0,0,0.1)', '0 4px 6px rgba(0,0,0,0.1)', '0 10px 15px rgba(0,0,0,0.1)', '0 25px 50px rgba(0,0,0,0.25)', 'inset 0 2px 4px rgba(0,0,0,0.1)'],

    // Outline
    outlineStyle: ['none', 'solid', 'dashed', 'dotted', 'double'],
    outlineWidth: ['0', '1px', '2px', '3px'],
    outlineOffset: ['0', '1px', '2px', '4px'],

    // Cursor & Pointer
    cursor: ['auto', 'default', 'pointer', 'text', 'move', 'wait', 'progress', 'not-allowed', 'help', 'crosshair', 'grab', 'grabbing', 'zoom-in', 'zoom-out', 'col-resize', 'row-resize', 'n-resize', 's-resize', 'e-resize', 'w-resize'],
    pointerEvents: ['auto', 'none'],
    userSelect: ['auto', 'none', 'text', 'all'],
    touchAction: ['auto', 'none', 'pan-x', 'pan-y', 'manipulation'],

    // Transform
    transform: ['none', 'rotate()', 'scale()', 'translateX()', 'translateY()', 'translate()', 'skew()', 'matrix()'],
    transformOrigin: ['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right'],

    // Transitions & Animations
    transition: ['none', 'all 0.2s', 'all 0.3s ease', 'all 0.5s ease-in-out', 'opacity 0.3s', 'transform 0.3s'],
    transitionDuration: ['0s', '0.1s', '0.2s', '0.3s', '0.5s', '1s'],
    transitionTimingFunction: ['ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out', 'cubic-bezier()'],
    transitionDelay: ['0s', '0.1s', '0.2s', '0.5s', '1s'],
    animation: ['none'],
    animationDuration: ['0s', '0.5s', '1s', '2s', '3s'],
    animationTimingFunction: ['ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out'],
    animationIterationCount: ['1', '2', '3', 'infinite'],
    animationDirection: ['normal', 'reverse', 'alternate', 'alternate-reverse'],
    animationFillMode: ['none', 'forwards', 'backwards', 'both'],
    animationPlayState: ['running', 'paused'],

    // Filters
    filter: ['none', 'blur()', 'brightness()', 'contrast()', 'grayscale()', 'saturate()', 'sepia()', 'drop-shadow()'],
    backdropFilter: ['none', 'blur(10px)', 'blur(20px)', 'brightness()', 'contrast()'],
    mixBlendMode: ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'difference'],

    // Object
    objectFit: ['fill', 'contain', 'cover', 'none', 'scale-down'],
    objectPosition: ['center', 'top', 'bottom', 'left', 'right', '50% 50%'],

    // List
    listStyle: ['none', 'disc', 'circle', 'square', 'decimal', 'lower-alpha', 'upper-alpha'],
    listStyleType: ['none', 'disc', 'circle', 'square', 'decimal', 'lower-roman', 'upper-roman'],
    listStylePosition: ['inside', 'outside'],

    // Table
    tableLayout: ['auto', 'fixed'],
    captionSide: ['top', 'bottom'],
    emptyCells: ['show', 'hide'],

    // Scroll
    scrollBehavior: ['auto', 'smooth'],
    scrollSnapType: ['none', 'x mandatory', 'y mandatory', 'x proximity', 'y proximity'],
    overscrollBehavior: ['auto', 'contain', 'none'],

    // Resize
    resize: ['none', 'both', 'horizontal', 'vertical'],

    // Columns
    columns: ['auto', '2', '3', '4'],
    columnGap: ['normal', '0', '8px', '16px', '24px', '32px'],
    columnRule: ['none', '1px solid gray'],

    // Isolation & Containment
    isolation: ['auto', 'isolate'],
    contain: ['none', 'strict', 'content', 'size', 'layout', 'paint'],

    // Will Change
    willChange: ['auto', 'scroll-position', 'contents', 'transform', 'opacity'],

    // Content
    content: ['""', 'none', 'normal', 'open-quote', 'close-quote', 'attr()'],
};

// All CSS property names for autocomplete
export const CSS_PROPERTY_NAMES = Object.keys(CSS_PROPERTY_VALUES).concat([
    // Additional properties without predefined values
    'top', 'left', 'right', 'bottom',
    'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
    'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
    'border', 'borderTop', 'borderBottom', 'borderLeft', 'borderRight',
    'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth',
    'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor',
    'borderTopStyle', 'borderBottomStyle', 'borderLeftStyle', 'borderRightStyle',
    'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
    'background', 'outline', 'flex', 'font', 'grid', 'gridArea', 'gridGap',
    'rowGap', 'inset', 'clip', 'clipPath', 'mask', 'perspective', 'perspectiveOrigin',
    'rotate', 'scale', 'translate', 'transformStyle', 'backfaceVisibility',
    'minInlineSize', 'maxInlineSize', 'minBlockSize', 'maxBlockSize',
    'inlineSize', 'blockSize', 'writingMode', 'direction', 'unicodeBidi',
    'counterReset', 'counterIncrement', 'quotes', 'hyphens', 'tabSize',
    'caretColor', 'accentColor', 'colorScheme', 'printColorAdjust', 'forcedColorAdjust',
    'scrollMargin', 'scrollPadding', 'scrollSnapAlign', 'scrollSnapStop',
    'shapeOutside', 'shapeMargin', 'shapeImageThreshold',
    'appearance', 'all', 'boxDecorationBreak', 'breakAfter', 'breakBefore', 'breakInside',
    'orphans', 'widows', 'pageBreakAfter', 'pageBreakBefore', 'pageBreakInside'
]).sort();

// Helper to sort properties: Exact match -> Starts with -> Contains
export const filterAndSortProperties = (query: string, limit: number = 10): string[] => {
    const q = query.toLowerCase().trim();
    if (!q) return CSS_PROPERTY_NAMES.slice(0, limit);

    const exactIdx = CSS_PROPERTY_NAMES.findIndex(p => p.toLowerCase() === q);

    // 1. Starts with
    const startsWith = CSS_PROPERTY_NAMES.filter(p => p.toLowerCase().startsWith(q) && p.toLowerCase() !== q);

    // 2. Contains (but not starts with)
    const contains = CSS_PROPERTY_NAMES.filter(p => !p.toLowerCase().startsWith(q) && p.toLowerCase().includes(q));

    let result: string[] = [];
    if (exactIdx !== -1) result.push(CSS_PROPERTY_NAMES[exactIdx]);
    result = result.concat(startsWith).concat(contains);

    return result.slice(0, limit);
};
