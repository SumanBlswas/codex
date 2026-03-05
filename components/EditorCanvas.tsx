import React, { useRef } from 'react';
import { VirtualElement } from '../types';

interface EditorCanvasProps {
  element: VirtualElement;
  selectedId: string | null;
  selectedPathIds?: Set<string> | null;
  onSelect: (id: string) => void;
  resolveImage?: (path: string) => string;
  onMoveElement: (draggedId: string, targetId: string) => void;
  onMoveByPosition: (id: string, styles: Partial<React.CSSProperties>) => void;
  onResize: (id: string, width: string, height: string) => void;
  interactionMode?: 'edit' | 'preview' | 'inspect' | 'draw' | 'move';
}

// Resize handle directions and their cursor/position styles
const RESIZE_HANDLES = [
  { dir: 'n', cursor: 'ns-resize', style: { top: -4, left: '50%', transform: 'translateX(-50%)', width: 24, height: 8 } },
  { dir: 's', cursor: 'ns-resize', style: { bottom: -4, left: '50%', transform: 'translateX(-50%)', width: 24, height: 8 } },
  { dir: 'e', cursor: 'ew-resize', style: { right: -4, top: '50%', transform: 'translateY(-50%)', width: 8, height: 24 } },
  { dir: 'w', cursor: 'ew-resize', style: { left: -4, top: '50%', transform: 'translateY(-50%)', width: 8, height: 24 } },
  { dir: 'nw', cursor: 'nwse-resize', style: { top: -5, left: -5, width: 10, height: 10 } },
  { dir: 'ne', cursor: 'nesw-resize', style: { top: -5, right: -5, width: 10, height: 10 } },
  { dir: 'sw', cursor: 'nesw-resize', style: { bottom: -5, left: -5, width: 10, height: 10 } },
  { dir: 'se', cursor: 'nwse-resize', style: { bottom: -5, right: -5, width: 10, height: 10 } },
] as const;

type ResizeDir = typeof RESIZE_HANDLES[number]['dir'];

const EditorCanvasBase: React.FC<EditorCanvasProps> = ({
  element,
  selectedId,
  selectedPathIds,
  onSelect,
  resolveImage,
  onMoveElement,
  onMoveByPosition,
  onResize,
  interactionMode = 'edit'
}) => {
  const isSelected = element.id === selectedId;
  const isPreview = interactionMode === 'preview';
  const isMoveMode = interactionMode === 'move';
  const elementRef = useRef<HTMLElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (isPreview) return;
    e.stopPropagation();
    onSelect(element.id);
  };

  // Handle Resizing via CSS resize (edit mode only)
  const handleMouseUp = (e: React.MouseEvent) => {
    if (isPreview || isMoveMode) return;
    e.stopPropagation();
    if (isSelected && elementRef.current) {
      const currentWidth = elementRef.current.style.width;
      const currentHeight = elementRef.current.style.height;
      if (currentWidth !== element.styles.width || currentHeight !== element.styles.height) {
        onResize(element.id, currentWidth, currentHeight);
      }
    }
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent) => {
    if (isPreview || isMoveMode) { e.preventDefault(); return; }
    e.stopPropagation();
    e.dataTransfer.setData('application/react-dnd-id', element.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isPreview || isMoveMode) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    if (isPreview || isMoveMode) return;
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData('application/react-dnd-id');
    if (draggedId && draggedId !== element.id) {
      onMoveElement(draggedId, element.id);
    }
  };

  // Move tool: drag element to reposition
  const handleMoveMouseDown = (e: React.MouseEvent) => {
    if (!isMoveMode || isPreview || element.id === 'root' || !elementRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(element.id);

    const el = elementRef.current;
    const parent = (el.offsetParent as HTMLElement) || (el.parentElement as HTMLElement | null);
    if (!parent) return;

    const elementRect = el.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const computed = window.getComputedStyle(el);
    const currentPosition = String(computed.position || '').toLowerCase();
    const isAlreadyAbsolute = currentPosition === 'absolute' || currentPosition === 'fixed';

    const parsedLeft = Number.parseFloat(computed.left || '');
    const parsedTop = Number.parseFloat(computed.top || '');
    const startLeft = Number.isFinite(parsedLeft)
      ? parsedLeft
      : elementRect.left - parentRect.left + parent.scrollLeft;
    const startTop = Number.isFinite(parsedTop)
      ? parsedTop
      : elementRect.top - parentRect.top + parent.scrollTop;

    const lockSize = !isAlreadyAbsolute;
    const basePatch: Partial<React.CSSProperties> = {
      position: 'absolute',
      left: `${Math.round(startLeft)}px`,
      top: `${Math.round(startTop)}px`,
    };
    if (lockSize) {
      basePatch.width = `${Math.round(elementRect.width)}px`;
      basePatch.height = `${Math.round(elementRect.height)}px`;
    }

    const applyPatchToLiveElement = (patch: Partial<React.CSSProperties>) => {
      for (const [key, rawValue] of Object.entries(patch)) {
        const value = rawValue == null ? '' : String(rawValue);
        const cssKey = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
        if (!value) el.style.removeProperty(cssKey);
        else el.style.setProperty(cssKey, value);
      }
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    el.style.cursor = 'grab';

    const startPointerX = e.clientX;
    const startPointerY = e.clientY;
    let latestLeft = startLeft;
    let latestTop = startTop;
    let hasDragged = false;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startPointerX;
      const deltaY = moveEvent.clientY - startPointerY;
      if (!hasDragged) {
        if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
        hasDragged = true;
        applyPatchToLiveElement(basePatch);
        el.style.cursor = 'grabbing';
      }
      const maxLeft = Math.max(0, parent.clientWidth - elementRect.width);
      const maxTop = Math.max(0, parent.clientHeight - elementRect.height);
      const nextLeft = Math.max(0, Math.min(maxLeft, startLeft + deltaX));
      const nextTop = Math.max(0, Math.min(maxTop, startTop + deltaY));
      latestLeft = nextLeft;
      latestTop = nextTop;
      el.style.left = `${Math.round(nextLeft)}px`;
      el.style.top = `${Math.round(nextTop)}px`;
    };

    const cleanup = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      el.style.cursor = 'grab';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    const onMouseUp = () => {
      cleanup();
      if (!hasDragged) return;
      onMoveByPosition(element.id, {
        ...basePatch,
        left: `${Math.round(latestLeft)}px`,
        top: `${Math.round(latestTop)}px`,
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Move mode: resize via handle drag
  const handleResizeMouseDown = (e: React.MouseEvent, dir: ResizeDir) => {
    if (!isMoveMode || !elementRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const el = elementRef.current;
    const computed = window.getComputedStyle(el);
    const startW = parseFloat(computed.width) || 0;
    const startH = parseFloat(computed.height) || 0;
    const startX = e.clientX;
    const startY = e.clientY;
    const parsedLeft = parseFloat(computed.left) || 0;
    const parsedTop = parseFloat(computed.top) || 0;

    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      let newW = startW;
      let newH = startH;
      let newLeft = parsedLeft;
      let newTop = parsedTop;

      if (dir.includes('e')) newW = Math.max(10, startW + dx);
      if (dir.includes('s')) newH = Math.max(10, startH + dy);
      if (dir.includes('w')) { newW = Math.max(10, startW - dx); newLeft = parsedLeft + (startW - newW); }
      if (dir.includes('n')) { newH = Math.max(10, startH - dy); newTop = parsedTop + (startH - newH); }

      el.style.width = `${Math.round(newW)}px`;
      el.style.height = `${Math.round(newH)}px`;
      if (dir.includes('w') || dir.includes('n')) {
        el.style.left = `${Math.round(newLeft)}px`;
        el.style.top = `${Math.round(newTop)}px`;
      }
    };

    const onMouseUp = () => {
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      const finalW = el.style.width;
      const finalH = el.style.height;
      const finalLeft = el.style.left;
      const finalTop = el.style.top;
      onResize(element.id, finalW, finalH);
      if (dir.includes('w') || dir.includes('n')) {
        onMoveByPosition(element.id, {
          position: 'absolute',
          left: finalLeft,
          top: finalTop,
          width: finalW,
          height: finalH,
        });
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const mergedStyle: React.CSSProperties = {
    ...element.styles,
    animation: element.animation,
    outline: !isPreview && isSelected
      ? '2px solid #3b82f6'
      : (element.id === 'root' ? 'none' : (!isPreview ? '1px dashed transparent' : 'none')),
    outlineOffset: !isPreview && isSelected ? '-2px' : '0px',
    boxShadow: !isPreview && isSelected ? '0 0 0 4px rgba(59, 130, 246, 0.2)' : 'none',
    // In move mode, use custom handles instead of CSS resize
    resize: (!isPreview && !isMoveMode && isSelected ? 'both' : 'none') as React.CSSProperties['resize'],
    overflow: (
      !isPreview && isSelected && element.type !== 'img'
        ? 'hidden'
        : (element.styles.overflow || 'visible')
    ) as React.CSSProperties['overflow'],
    position: (element.styles.position as React.CSSProperties['position']) || 'relative',
    cursor: (
      isPreview
        ? (element.type === 'a' || element.type === 'button' ? 'pointer' : 'default')
        : isMoveMode && element.id !== 'root'
          ? 'grab'
          : (isSelected ? 'default' : 'pointer')
    ) as React.CSSProperties['cursor'],
    minHeight: !isPreview && element.children.length === 0 && !element.styles.height && element.type === 'div'
      ? '50px'
      : undefined,
  };

  const commonProps = {
    id: element.id,
    ref: elementRef as any,
    draggable: !isPreview && !isMoveMode && element.id !== 'root',
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    onMouseUp: handleMouseUp,
    onMouseDown: handleMoveMouseDown,
    ...(element.attributes || {}),
    style: mergedStyle,
    onClick: handleClick,
    className: `transition-colors ${element.id === 'root' ? 'min-h-full' : (!isPreview ? 'hover:outline-blue-300 hover:outline-dashed hover:outline-1' : '')} ${element.className || ''}`
  };

  // Render children recursively
  const children = element.children.map(child => (
    <EditorCanvas
      key={child.id}
      element={child}
      selectedId={selectedId}
      selectedPathIds={selectedPathIds}
      onSelect={onSelect}
      resolveImage={resolveImage}
      onMoveElement={onMoveElement}
      onMoveByPosition={onMoveByPosition}
      onResize={onResize}
      interactionMode={interactionMode}
    />
  ));

  // Resize handle overlay — visible only when selected in move mode
  const resizeHandles = isMoveMode && isSelected && element.id !== 'root' ? (
    <>
      {RESIZE_HANDLES.map(({ dir, cursor, style }) => (
        <span
          key={dir}
          onMouseDown={(e) => handleResizeMouseDown(e, dir)}
          style={{
            position: 'absolute',
            background: '#3b82f6',
            border: '1.5px solid #fff',
            borderRadius: dir.length === 2 ? '3px' : '4px',
            zIndex: 9999,
            cursor,
            pointerEvents: 'auto',
            ...style,
          } as React.CSSProperties}
        />
      ))}
    </>
  ) : null;

  // Wrap with a relative-positioned container so handles sit over the element
  const wrapWithHandles = (el: React.ReactElement) => {
    if (!isMoveMode || !isSelected || element.id === 'root') return el;
    return (
      <div style={{ position: 'relative', display: 'inline-block', boxSizing: 'border-box' }}>
        {el}
        {resizeHandles}
      </div>
    );
  };

  const renderElement = (): React.ReactElement => {
    switch (element.type) {
      case 'img': {
        const imgSrc = resolveImage && element.src ? resolveImage(element.src) : (element.src || 'https://picsum.photos/200/200');
        return <img src={imgSrc} alt={element.name} {...commonProps} />;
      }
      case 'button':
        return <button {...commonProps}>{element.content}{children}</button>;
      case 'a':
        return (
          <a href={element.href || '#'} {...commonProps} onClick={(e) => {
            if (!isPreview) { e.preventDefault(); handleClick(e); }
          }}>
            {element.content}{children}
          </a>
        );
      case 'h1': return <h1 {...commonProps}>{element.content}{children}</h1>;
      case 'h2': return <h2 {...commonProps}>{element.content}{children}</h2>;
      case 'p': return <p {...commonProps}>{element.content}{children}</p>;
      case 'section': return <section {...commonProps}>{children}</section>;
      case 'span': return <span {...commonProps}>{element.content}{children}</span>;
      case 'sup':
        return (
          <span style={{ position: 'relative', display: 'inline' }}>
            <sup {...commonProps}>{element.content}{children}</sup>
            {!isPreview && isSelected && (
              <span style={{
                position: 'absolute', top: '-18px', left: '50%', transform: 'translateX(-50%)',
                backgroundColor: '#8b5cf6', color: 'white', padding: '2px 6px', borderRadius: '4px',
                fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap', zIndex: 1000,
                pointerEvents: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}>SUP</span>
            )}
          </span>
        );
      case 'sub':
        return (
          <span style={{ position: 'relative', display: 'inline' }}>
            <sub {...commonProps}>{element.content}{children}</sub>
            {!isPreview && isSelected && (
              <span style={{
                position: 'absolute', bottom: '-18px', left: '50%', transform: 'translateX(-50%)',
                backgroundColor: '#f59e0b', color: 'white', padding: '2px 6px', borderRadius: '4px',
                fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap', zIndex: 1000,
                pointerEvents: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}>SUB</span>
            )}
          </span>
        );
      case 'br': return <br {...commonProps} />;
      case 'text': return <>{element.content}</> as React.ReactElement;
      default: return <div {...commonProps}>{element.content}{children}</div>;
    }
  };

  return wrapWithHandles(renderElement());
};

const areEditorCanvasPropsEqual = (
  prev: Readonly<EditorCanvasProps>,
  next: Readonly<EditorCanvasProps>,
): boolean => {
  if (prev.element !== next.element) return false;
  if (prev.interactionMode !== next.interactionMode) return false;
  if (prev.onSelect !== next.onSelect) return false;
  if (prev.resolveImage !== next.resolveImage) return false;
  if (prev.onMoveElement !== next.onMoveElement) return false;
  if (prev.onMoveByPosition !== next.onMoveByPosition) return false;
  if (prev.onResize !== next.onResize) return false;
  if (prev.selectedPathIds === next.selectedPathIds && prev.selectedId === next.selectedId) {
    return true;
  }

  const prevOnPath = prev.selectedPathIds?.has(prev.element.id) ?? false;
  const nextOnPath = next.selectedPathIds?.has(next.element.id) ?? false;
  if (!prevOnPath && !nextOnPath) {
    return true;
  }
  if (prev.selectedId === next.selectedId) return true;

  return false;
};

const EditorCanvas = React.memo(EditorCanvasBase, areEditorCanvasPropsEqual);
EditorCanvas.displayName = 'EditorCanvas';

export default EditorCanvas;
