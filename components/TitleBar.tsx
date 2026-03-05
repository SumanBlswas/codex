import React, { useEffect, useRef, useState } from 'react';
import * as Neutralino from '@neutralinojs/lib';

const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const dragRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dragRegion = dragRegionRef.current;
    if (!dragRegion) return;

    (async () => {
      try {
        const api = Neutralino as any;
        if (api?.window?.setDraggableRegion) {
          await api.window.setDraggableRegion(dragRegion);
        }
      } catch (err) {
        console.error('Set draggable region:', err);
      }
    })();

    return () => {
      (async () => {
        try {
          const api = Neutralino as any;
          if (api?.window?.unsetDraggableRegion) {
            await api.window.unsetDraggableRegion(dragRegion);
          }
        } catch {
          // Ignore cleanup failures in browser mode.
        }
      })();
    };
  }, []);

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      const api = Neutralino as any;
      if (api?.window?.minimize) await api.window.minimize();
    } catch (err) {
      console.error('Minimize:', err);
    }
  };

  const handleMaximize = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    try {
      const api = Neutralino as any;
      if (api?.window) {
        if (isMaximized) {
          await api.window.unmaximize();
        } else {
          await api.window.maximize();
        }
        setIsMaximized((prev) => !prev);
      }
    } catch (err) {
      console.error('Maximize:', err);
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const api = Neutralino as any;
    try {
      if (api?.app?.exit) {
        await api.app.exit(0);
        return;
      }
    } catch (err) {
      console.warn('Close via app.exit failed, trying fallback:', err);
    }

    try {
      if (api?.app?.killProcess) {
        await api.app.killProcess();
        return;
      }
    } catch (err) {
      console.warn('Close via app.killProcess failed, trying fallback:', err);
    }

    try {
      window.close();
    } catch (err) {
      console.error('Close fallback failed:', err);
    }
  };

  return (
    <div
      className="shrink-0 w-full flex items-center justify-end"
      style={{
        height: '32px',
        paddingTop: '0.7rem',
        paddingRight: '0.3rem',
      }}
      onDoubleClick={() => handleMaximize()}
    >
      <div ref={dragRegionRef} className="h-full flex-1" />

      <div
        className="flex items-center gap-[6px] mr-2 px-2 py-1 rounded-full"
        style={{
          background: 'var(--bg-glass-strong)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--border-color)',
        }}
      >
        <button
          onClick={handleMinimize}
          onMouseEnter={() => setHovered('min')}
          onMouseLeave={() => setHovered(null)}
          className="relative w-[12px] h-[12px] rounded-full flex items-center justify-center transition-all duration-300"
          style={{
            background: '#FBBF24',
            transform: hovered === 'min' ? 'scale(1.35)' : 'scale(1)',
            boxShadow:
              hovered === 'min'
                ? '0 0 8px rgba(251,191,36,0.6)'
                : '0 1px 2px rgba(251,191,36,0.3)',
          }}
        >
          <svg width="7" height="1" viewBox="0 0 7 1" fill="none">
            <line
              x1="0.5"
              y1="0.5"
              x2="6.5"
              y2="0.5"
              stroke="rgba(0,0,0,0.6)"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          onClick={handleMaximize}
          onMouseEnter={() => setHovered('max')}
          onMouseLeave={() => setHovered(null)}
          className="relative w-[12px] h-[12px] rounded-full flex items-center justify-center transition-all duration-300"
          style={{
            background: '#34D399',
            transform: hovered === 'max' ? 'scale(1.35)' : 'scale(1)',
            boxShadow:
              hovered === 'max'
                ? '0 0 8px rgba(52,211,153,0.6)'
                : '0 1px 2px rgba(52,211,153,0.3)',
          }}
        >
          <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
            {isMaximized ? (
              <>
                <polyline
                  points="1,4.5 1,1 4.5,1"
                  fill="none"
                  stroke="rgba(0,0,0,0.6)"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points="6,2.5 6,6 2.5,6"
                  fill="none"
                  stroke="rgba(0,0,0,0.6)"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            ) : (
              <>
                <line
                  x1="0.5"
                  y1="3.5"
                  x2="3"
                  y2="0.8"
                  stroke="rgba(0,0,0,0.6)"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                />
                <line
                  x1="6.5"
                  y1="3.5"
                  x2="4"
                  y2="6.2"
                  stroke="rgba(0,0,0,0.6)"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                />
              </>
            )}
          </svg>
        </button>

        <button
          onClick={handleClose}
          onMouseEnter={() => setHovered('close')}
          onMouseLeave={() => setHovered(null)}
          className="relative w-[12px] h-[12px] rounded-full flex items-center justify-center transition-all duration-300"
          style={{
            background: '#F87171',
            transform: hovered === 'close' ? 'scale(1.35)' : 'scale(1)',
            boxShadow:
              hovered === 'close'
                ? '0 0 8px rgba(248,113,113,0.6)'
                : '0 1px 2px rgba(248,113,113,0.3)',
          }}
        >
          <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
            <line
              x1="1"
              y1="1"
              x2="6"
              y2="6"
              stroke="rgba(0,0,0,0.6)"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <line
              x1="6"
              y1="1"
              x2="1"
              y2="6"
              stroke="rgba(0,0,0,0.6)"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
