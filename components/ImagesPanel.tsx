import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileMap } from "../types";
import { ChevronDown, ChevronLeft, ChevronRight, Image as ImageIcon, Search, X } from "lucide-react";

interface ImagesPanelProps {
  files: FileMap;
  activeFile: string | null;
  onLoadImage: (path: string) => void;
  theme: "light" | "dark";
}

const getSlideBucket = (path: string): string => {
  const normalized = String(path || "").replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return "other";
  if (parts[0].toLowerCase() === "shared") return "shared";
  return parts[0];
};

const ImagesPanel: React.FC<ImagesPanelProps> = ({ files, activeFile, onLoadImage, theme }) => {
  const [search, setSearch] = useState("");
  const [activeImagePath, setActiveImagePath] = useState<string | null>(null);
  const [expandedSlide, setExpandedSlide] = useState<string | null>(null);

  const imageFiles = useMemo(() => {
    return Object.values(files)
      .filter((file) => file.type === "image")
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [files]);

  const groupedBySlide = useMemo(() => {
    const groups: Record<string, typeof imageFiles> = {};
    imageFiles.forEach((img) => {
      const bucket = getSlideBucket(img.path);
      if (!groups[bucket]) groups[bucket] = [];
      groups[bucket].push(img);
    });
    return groups;
  }, [imageFiles]);

  const slideOrder = useMemo(() => {
    return Object.keys(groupedBySlide).sort((a, b) => a.localeCompare(b));
  }, [groupedBySlide]);

  useEffect(() => {
    if (!activeFile) return;
    const bucket = getSlideBucket(activeFile);
    setExpandedSlide((prev) => prev || bucket);
  }, [activeFile]);

  const filteredSlides = useMemo(() => {
    if (!search.trim()) return slideOrder;
    const q = search.toLowerCase();
    return slideOrder.filter((slide) =>
      slide.toLowerCase().includes(q) ||
      (groupedBySlide[slide] || []).some((img) =>
        img.path.toLowerCase().includes(q),
      ),
    );
  }, [groupedBySlide, search, slideOrder]);

  useEffect(() => {
    if (!expandedSlide || !groupedBySlide[expandedSlide]) return;
    groupedBySlide[expandedSlide].forEach((img) => {
      if (!img.content) {
        onLoadImage(img.path);
      }
    });
  }, [expandedSlide, groupedBySlide, onLoadImage]);

  const activeImage = activeImagePath ? files[activeImagePath] : null;
  const activeSrc = activeImage?.type === "image" ? activeImage.content : "";
  const modalImageSequence = useMemo(() => {
    const list: string[] = [];
    filteredSlides.forEach((slideId) => {
      (groupedBySlide[slideId] || []).forEach((img) => list.push(img.path));
    });
    return list;
  }, [filteredSlides, groupedBySlide]);
  const activeImageIndex = useMemo(
    () => (activeImagePath ? modalImageSequence.indexOf(activeImagePath) : -1),
    [activeImagePath, modalImageSequence],
  );

  const goToPrevImage = () => {
    if (modalImageSequence.length === 0 || activeImageIndex < 0) return;
    const nextIndex =
      activeImageIndex === 0
        ? modalImageSequence.length - 1
        : activeImageIndex - 1;
    setActiveImagePath(modalImageSequence[nextIndex]);
  };

  const goToNextImage = () => {
    if (modalImageSequence.length === 0 || activeImageIndex < 0) return;
    const nextIndex =
      activeImageIndex === modalImageSequence.length - 1
        ? 0
        : activeImageIndex + 1;
    setActiveImagePath(modalImageSequence[nextIndex]);
  };

  useEffect(() => {
    if (!activeImagePath) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPrevImage();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextImage();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setActiveImagePath(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeImagePath, activeImageIndex, modalImageSequence]);

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden" style={{ backgroundColor: "var(--bg-glass)", color: "var(--text-main)" }}>
      <div className="p-2.5 border-b" style={{ borderColor: "var(--border-color)" }}>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search images..."
            className="w-full pl-8 pr-2 py-1.5 rounded-md border text-xs outline-none"
            style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--border-color)", color: "var(--text-main)" }}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 custom-scrollbar" style={{ overscrollBehavior: "contain" as any }}>
        {filteredSlides.length === 0 ? (
          <div className="text-xs text-center mt-10" style={{ color: "var(--text-muted)" }}>
            No images found.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSlides.map((slideId) => {
              const images = groupedBySlide[slideId] || [];
              const open = expandedSlide === slideId;
              return (
                <div
                  key={slideId}
                  className="rounded-lg border overflow-hidden"
                  style={{ borderColor: "var(--border-color)" }}
                >
                  <button
                    className="w-full px-2.5 py-2 text-xs font-semibold flex items-center justify-between"
                    style={{ backgroundColor: theme === "dark" ? "rgba(15,23,42,0.5)" : "rgba(255,255,255,0.85)", color: "var(--text-main)" }}
                    onClick={() => setExpandedSlide((prev) => (prev === slideId ? null : slideId))}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span className="truncate">{slideId}</span>
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>{images.length}</span>
                  </button>
                  {open && (
                    <div className="grid grid-cols-2 gap-2 p-2">
                      {images.map((img) => (
                        <button
                          key={img.path}
                          className="rounded-lg border overflow-hidden text-left"
                          style={{ borderColor: "var(--border-color)", backgroundColor: theme === "dark" ? "rgba(15,23,42,0.6)" : "rgba(255,255,255,0.9)" }}
                          onClick={() => setActiveImagePath(img.path)}
                          title={img.path}
                        >
                          <div className="aspect-square w-full border-b flex items-center justify-center" style={{ borderColor: "var(--border-color)" }}>
                            {img.content ? (
                              <img src={img.content} alt={img.name} className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon size={18} style={{ color: "var(--text-muted)" }} />
                            )}
                          </div>
                          <div className="px-2 py-1.5 text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                            {img.name}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {activeImagePath && typeof document !== "undefined"
        ? createPortal(
          <div
            className="fixed inset-0 z-[5000] flex items-center justify-center p-6"
            style={{ backgroundColor: "rgba(0,0,0,0.72)" }}
            onClick={() => setActiveImagePath(null)}
          >
            {modalImageSequence.length > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-[5001] p-2.5 rounded-full bg-black/50 text-white hover:bg-black/75"
                  onClick={(e) => {
                    e.stopPropagation();
                    goToPrevImage();
                  }}
                  title="Previous image"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-[5001] p-2.5 rounded-full bg-black/50 text-white hover:bg-black/75"
                  onClick={(e) => {
                    e.stopPropagation();
                    goToNextImage();
                  }}
                  title="Next image"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            )}
            <div
              className="relative max-w-[92vw] max-h-[90vh] rounded-xl border overflow-hidden"
              style={{
                borderColor: theme === "dark" ? "rgba(148,163,184,0.35)" : "rgba(15,23,42,0.15)",
                backgroundColor: theme === "dark" ? "rgba(2,6,23,0.95)" : "rgba(255,255,255,0.98)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-black/45 text-white hover:bg-black/70"
                onClick={() => setActiveImagePath(null)}
              >
                <X size={16} />
              </button>
              {activeSrc ? (
                <>
                  <img src={activeSrc} alt={activeImage?.name || "Image"} className="max-w-[92vw] max-h-[90vh] object-contain" />
                  {modalImageSequence.length > 1 && activeImageIndex >= 0 && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] px-2 py-1 rounded bg-black/55 text-white">
                      {activeImageIndex + 1} / {modalImageSequence.length}
                    </div>
                  )}
                </>
              ) : (
                <div className="w-[60vw] h-[50vh] flex items-center justify-center text-sm" style={{ color: "var(--text-muted)" }}>
                  Loading image...
                </div>
              )}
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
};

export default ImagesPanel;
