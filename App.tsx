import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
  useMemo,
} from "react";
import { flushSync } from "react-dom";
import Sidebar from "./components/Sidebar";
import EditorCanvas from "./components/EditorCanvas";
import PropertiesPanel from "./components/PropertiesPanel";
import StyleInspectorPanel from "./components/StyleInspectorPanel";
import Terminal from "./components/Terminal";
import CodeWorkspace from "./components/CodeWorkspace";
import CommandPalette from "./components/CommandPalette";
import ConfigEditorModal from "./components/ConfigEditorModal";
import { INITIAL_ROOT, INJECTED_STYLES } from "./constants";
import {
  VirtualElement,
  ElementType,
  FileMap,
  HistoryState,
  ProjectFile,
} from "./types";
import * as Neutralino from "@neutralinojs/lib";
import {
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  PanelRight,
  Maximize2,
  Minimize2,
  Command,
  Play,
  Tablet,
  RotateCw,
  FolderOpen,
  Globe,
  Wifi,
  Sun,
  Moon,
  Save,
  Undo2,
  Redo2,
  Settings2,
  Code2,
  Sparkles,
  Copy,
  Trash2,
  MoveUp,
  MoveDown,
  Shrink,
  Expand,
} from "lucide-react";

import VibeAssistant from "./components/VibeAssistant";
import VibeErrorBoundary from "./components/VibeErrorBoundary";

// --- Helper Functions (Same as before) ---
const isEdaProject = (files: FileMap) => {
  return Object.keys(files).some(
    (key) =>
      key.endsWith("config.json") ||
      key.endsWith("config.js") ||
      key.endsWith("portfolioconfig.js") ||
      key.endsWith("portfolioconfig.json") ||
      key.includes("shared/js/config.json") ||
      key.includes("shared/config.json"),
  );
};
const findElementById = (
  root: VirtualElement,
  id: string,
): VirtualElement | null => {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findElementById(child, id);
    if (found) return found;
  }
  return null;
};

const collectPathIdsToElement = (
  root: VirtualElement,
  id: string | null,
): Set<string> | null => {
  if (!id) return null;
  const path: string[] = [];
  const walk = (node: VirtualElement): boolean => {
    if (node.id === id) {
      path.push(node.id);
      return true;
    }
    for (const child of node.children) {
      if (walk(child)) {
        path.push(node.id);
        return true;
      }
    }
    return false;
  };
  if (!walk(root)) return null;
  return new Set(path);
};

const updateElementInTree = (
  root: VirtualElement,
  id: string,
  updater: (el: VirtualElement) => VirtualElement,
): VirtualElement => {
  if (root.id === id) {
    const updated = updater(root);
    return updated === root ? root : updated;
  }
  let didChange = false;
  const nextChildren = root.children.map((child) => {
    const updatedChild = updateElementInTree(child, id, updater);
    if (updatedChild !== child) {
      didChange = true;
    }
    return updatedChild;
  });
  if (!didChange) return root;
  return { ...root, children: nextChildren };
};

const deleteElementFromTree = (
  root: VirtualElement,
  id: string,
): VirtualElement => {
  let didChange = false;
  const nextChildren: VirtualElement[] = [];
  for (const child of root.children) {
    if (child.id === id) {
      didChange = true;
      continue;
    }
    const updatedChild = deleteElementFromTree(child, id);
    if (updatedChild !== child) {
      didChange = true;
    }
    nextChildren.push(updatedChild);
  }
  if (!didChange) return root;
  return { ...root, children: nextChildren };
};

const normalizePath = (path: string): string => path.replace(/\\/g, "/");
const PREVIEW_LAYER_ID_PREFIX = "preview-path:";
const PREVIEW_MOUNT_PATH = "/__vh__";
const SHARED_MOUNT_PATH = "/shared";
const SHARED_MOUNT_PATH_IN_PREVIEW = "/__vh__/shared";

const joinPath = (base: string, entry: string): string =>
  `${base.replace(/[\\/]$/, "")}/${entry}`;

const getParentPath = (path: string): string | null => {
  const normalized = normalizePath(path).replace(/[\\/]$/, "");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return null;
  return normalized.slice(0, idx);
};

const IGNORED_FOLDERS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
]);
const THEME_STORAGE_KEY = "nocode-x-studio-theme";
const PREVIEW_AUTOSAVE_STORAGE_KEY = "nocode-x-studio-preview-autosave";
const AI_BACKEND_STORAGE_KEY = "nocode-x-studio-ai-backend";
const COLAB_URL_STORAGE_KEY = "nocode-x-studio-colab-url";
const SHOW_AI_FEATURES = !import.meta.env.PROD;
const SHOW_MASTER_TOOLS = !import.meta.env.PROD;
const MAX_CANVAS_HISTORY = 80;
const MAX_PREVIEW_HISTORY = 60;
const MAX_PREVIEW_CONSOLE_ENTRIES = 400;
const MAX_PREVIEW_DOC_CACHE_ENTRIES = 8;
const MAX_PREVIEW_DOC_CACHE_CHARS = 2_500_000;
const SHARED_FONT_VIRTUAL_DIR = "shared/media/fonts";
const PRESENTATION_CSS_VIRTUAL_PATH = "shared/css/presentation.css";
const FONT_CACHE_VIRTUAL_PATH = "shared/js/nocodex-fonts.json";
const FONT_CACHE_VERSION = 1;
const CONFIG_JSON_PATH = "shared/config.json";
const PORTFOLIO_CONFIG_PATH = "shared/portfolioconfig.json";
const ADD_TOOL_COMPONENT_PRESETS = new Set([
  "preset:carousel",
  "preset:flip-card",
  "preset:scroll-reveal",
  "preset:drag-card",
  "preset:drop-zone",
  "preset:sortable-list",
  "preset:calendar-dialog",
  "preset:internal-swipe",
  "preset:dots-swipe",
  "preset:video-panel",
  "preset:race-checklist",
  "preset:segmentation-cards",
  "preset:reference-tabs",
  "preset:anim-001-jquery",
  "preset:anim-002-css",
  "preset:clickstream-011",
  "preset:clickstream-012-form",
  "preset:timeline-steps",
  "preset:metric-counters",
]);
const ADD_TOOL_CSS_MARKER_START = "/* nocodex-add-tool:start */";
const ADD_TOOL_CSS_MARKER_END = "/* nocodex-add-tool:end */";
const ADD_TOOL_JS_MARKER_START = "// nocodex-add-tool:start";
const ADD_TOOL_JS_MARKER_END = "// nocodex-add-tool:end";
const ADD_TOOL_COMPONENTS_CSS_CONTENT = `/* Nocode-X Add Tool component styles */
.nx-carousel {
  position: relative;
  display: grid;
  gap: 12px;
  width: min(860px, 100%);
  padding: 14px;
  border: 1px solid rgba(14, 165, 233, 0.35);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(2, 6, 23, 0.92), rgba(15, 23, 42, 0.88));
  box-shadow: 0 18px 40px rgba(2, 6, 23, 0.45);
  overflow: hidden;
}

.nx-carousel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.nx-carousel-viewport {
  overflow: hidden;
  border-radius: 12px;
}

.nx-carousel-track {
  display: flex;
  width: 100%;
  transition: transform 0.35s ease;
  will-change: transform;
}

.nx-carousel-slide {
  min-width: 100%;
  height: 170px;
  border-radius: 12px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 16px;
  font-weight: 800;
  font-size: 20px;
}

.nx-carousel-slide.is-a {
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.55), rgba(59, 130, 246, 0.55));
  color: #0f172a;
}

.nx-carousel-slide.is-b {
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.62), rgba(99, 102, 241, 0.6));
  color: #fff;
}

.nx-carousel-slide.is-c {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.58), rgba(20, 184, 166, 0.56));
  color: #06281f;
}

.nx-carousel-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.nx-carousel-dot {
  width: 9px;
  height: 9px;
  border: 0;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.55);
  cursor: pointer;
}

.nx-carousel-dot.is-active {
  background: rgba(56, 189, 248, 0.95);
}

.nx-carousel-nav {
  position: absolute;
  top: calc(50% + 12px);
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  background: rgba(15, 23, 42, 0.72);
  color: #e2e8f0;
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 2;
}

.nx-carousel-nav.prev { left: 8px; }
.nx-carousel-nav.next { right: 8px; }

.nx-flip-card {
  width: 280px;
  height: 180px;
  perspective: 1000px;
  position: relative;
  cursor: pointer;
}

.nx-flip-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.6s ease;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 12px 30px rgba(2, 6, 23, 0.16);
}

.nx-flip-card:hover .nx-flip-inner,
.nx-flip-card.is-flipped .nx-flip-inner {
  transform: rotateY(180deg);
}

.nx-flip-face {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-weight: 700;
  backface-visibility: hidden;
}

.nx-flip-face.front {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(99, 102, 241, 0.24));
}

.nx-flip-face.back {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(34, 197, 94, 0.24));
  transform: rotateY(180deg);
}

.nx-scroll-reveal {
  padding: 24px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid rgba(148, 163, 184, 0.3);
  opacity: 0;
  transform: translateY(28px);
  transition: transform 0.5s ease, opacity 0.5s ease;
}

.nx-scroll-reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.nx-scroll-reveal-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
}

.nx-scroll-reveal-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
}

.nx-dd-stage {
  display: grid;
  gap: 12px;
  width: min(860px, 100%);
  padding: 14px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
}

.nx-dd-stage-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.nx-dd-stage-help {
  margin: 0;
  font-size: 12px;
  color: #475569;
}

.nx-draggable-card {
  width: 180px;
  min-height: 92px;
  border-radius: 10px;
  background: linear-gradient(135deg, #22d3ee, #3b82f6);
  color: #ffffff;
  padding: 12px;
  font-weight: 700;
  cursor: grab;
  user-select: none;
  box-shadow: 0 10px 20px rgba(59, 130, 246, 0.24);
}

.nx-draggable-card.nx-dragging {
  cursor: grabbing;
  opacity: 0.7;
}

.nx-drop-zone {
  min-height: 120px;
  border: 2px dashed #94a3b8;
  border-radius: 12px;
  padding: 14px;
  background: #fff;
  display: grid;
  gap: 8px;
  place-items: center;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.nx-drop-zone.nx-drop-over {
  border-color: #2563eb;
  background: #eff6ff;
}

.nx-sortable-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.nx-sortable-item {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  padding: 10px 12px;
  cursor: grab;
  user-select: none;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

.nx-sortable-item.nx-dragging {
  opacity: 0.65;
  cursor: grabbing;
}

.nx-file-drop {
  min-height: 128px;
  border: 2px dashed #64748b;
  border-radius: 12px;
  background: #f8fafc;
  display: grid;
  place-items: center;
  padding: 12px;
  text-align: center;
  color: #0f172a;
}

.nx-file-drop.nx-drop-over {
  border-color: #0ea5e9;
  background: #ecfeff;
}

.nx-calendar-wrap {
  display: grid;
  gap: 12px;
  width: min(720px, 100%);
  padding: 14px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
}

.nx-calendar-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nx-calendar-reset {
  border: 1px solid #94a3b8;
  background: #fff;
  color: #0f172a;
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
}

.nx-calendar-shell {
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #fff;
  padding: 10px;
}

.nx-calendar-head {
  display: grid;
  grid-template-columns: 36px 1fr auto 36px;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.nx-calendar-month,
.nx-calendar-year {
  font-size: 30px;
  font-weight: 700;
  color: #0f172a;
}

.nx-calendar-nav {
  border: 0;
  background: transparent;
  font-size: 24px;
  color: #475569;
  cursor: pointer;
}

.nx-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
}

.nx-calendar-day-name {
  background: #475569;
  color: #fff;
  text-align: center;
  font-weight: 700;
  font-size: 12px;
  padding: 8px 0;
}

.nx-calendar-cell {
  background: #f1f5f9;
  min-height: 34px;
  display: grid;
  place-items: center;
  color: #0f172a;
  font-size: 13px;
}

.nx-calendar-cell.is-muted { color: #94a3b8; }
.nx-calendar-cell.is-today { background: #fef08a; }

.nx-swipe-board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  width: min(980px, 100%);
}

.nx-swipe-panel {
  border: 1px solid rgba(15, 23, 42, 0.28);
  border-radius: 14px;
  padding: 10px;
  background: #e5e7eb;
  min-height: 320px;
  position: relative;
}

.nx-swipe-panel-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.nx-swipe-panel .nx-carousel {
  width: 100%;
  min-height: 220px;
  background: transparent;
  box-shadow: none;
  border-color: rgba(15, 23, 42, 0.18);
}

.nx-swipe-panel .nx-carousel-slide {
  height: 150px;
  font-size: 16px;
}

.nx-swipe-panel .nx-carousel-nav {
  top: 55%;
}

.nx-swipe-panel .nx-carousel-dots {
  margin-top: 6px;
}

.nx-function-card {
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
  padding: 14px;
  display: grid;
  gap: 10px;
  width: min(720px, 100%);
}

.nx-function-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.nx-function-sub {
  margin: 0;
  font-size: 12px;
  color: #475569;
}

.nx-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.nx-chip {
  border: 1px solid #94a3b8;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 11px;
  color: #0f172a;
  background: #fff;
}

.nx-reference-tabs {
  display: grid;
  gap: 8px;
}

.nx-reference-tabs-head {
  display: flex;
  gap: 8px;
}

.nx-reference-tab {
  border: 1px solid #94a3b8;
  background: #fff;
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 12px;
}

.nx-reference-list {
  border: 1px dashed #94a3b8;
  border-radius: 10px;
  background: #fff;
  padding: 10px 12px;
  display: grid;
  gap: 6px;
}

.nx-anim-card {
  display: grid;
  gap: 10px;
  width: min(760px, 100%);
  padding: 14px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
}

.nx-anim-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.nx-arrow-track {
  width: 100%;
  height: 38px;
  border-radius: 10px;
  background: #ffffff;
  overflow: hidden;
  border: 1px solid #cbd5e1;
}

.nx-arrow-fill {
  width: 0%;
  height: 100%;
  opacity: 1;
  overflow: hidden;
}

.nx-arrow-fill.is-css {
  width: 100%;
  opacity: 0;
}

.nx-arrow-fill img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.nx-anim-card[data-nx-anim-001-ready="true"] .nx-arrow-fill {
  transition: width 2s ease-in-out;
  width: 100%;
}

.nx-arrow-fill.load1 {
  transition: opacity 3s ease-in;
  opacity: 1;
}

.nx-arrow-fill.load2 {
  opacity: 1;
}

.nx-clickstream-card {
  display: grid;
  gap: 10px;
  width: min(760px, 100%);
  padding: 14px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
}

.nx-clickstream-grid {
  display: grid;
  gap: 8px;
}

.nx-clickstream-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #0f172a;
}

.nx-clickstream-select,
.nx-clickstream-slider,
.nx-clickstream-submit {
  border: 1px solid #94a3b8;
  border-radius: 8px;
  background: #fff;
  padding: 6px 10px;
}

.nx-clickstream-status {
  font-size: 12px;
  color: #475569;
}

.nx-video-demo {
  display: grid;
  gap: 12px;
  width: min(820px, 100%);
  padding: 16px;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  background: #e5e7eb;
}

.nx-video-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.nx-video-dialog-btn {
  border: 1px solid #9ca3af;
  background: #ffffff;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  color: #111827;
  font-weight: 600;
}

.nx-video-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.nx-video-shell {
  border: 1px solid #c7c7c7;
  border-radius: 10px;
  background: #ffffff;
  padding: 8px;
  position: relative;
}

.nx-video-header {
  padding: 4px 4px 8px;
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}

.nx-video-frame {
  height: 136px;
  border-radius: 8px;
  border: 1px solid #9ca3af;
  background: linear-gradient(130deg, #384454 0%, #1f2937 100%);
  position: relative;
  overflow: hidden;
}

.nx-video-frame::after {
  content: "";
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 2px solid #ffffff;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.08);
}

.nx-video-frame::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-40%, -50%);
  width: 0;
  height: 0;
  border-left: 11px solid #ffffff;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
  z-index: 2;
}

.nx-video-tabs {
  display: flex;
  gap: 8px;
  margin: 0 0 8px;
}

.nx-video-tab {
  min-width: 110px;
  border: 1px solid #9ca3af;
  background: #9ca3af;
  border-radius: 12px 12px 0 0;
  padding: 6px 10px;
  font-size: 10px;
  font-weight: 700;
  color: #ffffff;
  text-align: center;
}

.nx-video-tab.is-active {
  background: #ec6608;
  border-color: #ec6608;
}

.nx-video-inline {
  border: 1px solid #c7c7c7;
  border-radius: 10px;
  background: #ffffff;
  padding: 8px;
}

.nx-video-inline-title {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  color: #111827;
}

.nx-video-inline-player {
  width: 100%;
  height: 220px;
  border-radius: 8px;
  background: #0f172a;
  object-fit: cover;
}

/* Backward-compat cleanup for older inserted video blocks */
[data-nx-video-tool] > .nx-function-title,
[data-nx-video-tool] > .nx-function-sub,
[data-nx-video-tool] > .nx-video-actions,
[data-nx-video-tool] .nx-video-inline-title {
  display: none !important;
}

[data-nx-video-tool] .dialog.videoDialog,
[data-nx-video-tool] .videoDialog {
  display: none !important;
}

.nx-file-drop-output {
  margin-top: 8px;
  width: 100%;
  font-size: 12px;
  color: #334155;
  display: grid;
  gap: 4px;
}
`;
const ADD_TOOL_COMPONENTS_JS_CONTENT = `(function () {
  if (window.NXAddToolComponents) return;

  var activeDragId = '';
  var activeSortableId = '';
  var revealObserver = null;

  function closestBySelector(target, selector) {
    return target && target.closest ? target.closest(selector) : null;
  }

  function toInt(value, fallback) {
    var parsed = parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function updateCarousel(root, nextIndex) {
    if (!root) return;
    var track = root.querySelector('[data-nx-carousel-track]');
    var slides = root.querySelectorAll('[data-nx-carousel-slide]');
    if (!track || !slides || slides.length === 0) return;
    var maxIndex = Math.max(0, slides.length - 1);
    var index = Math.max(0, Math.min(maxIndex, nextIndex));
    root.setAttribute('data-nx-carousel-index', String(index));
    track.style.transform = 'translateX(' + (-100 * index) + '%)';

    var dots = root.querySelectorAll('[data-nx-carousel-dot]');
    for (var i = 0; i < dots.length; i += 1) {
      var dot = dots[i];
      if (toInt(dot.getAttribute('data-index'), 0) === index) dot.classList.add('is-active');
      else dot.classList.remove('is-active');
    }
  }

  function initCarousel(root) {
    if (!root || root.getAttribute('data-nx-carousel-ready') === 'true') return;
    root.setAttribute('data-nx-carousel-ready', 'true');
    updateCarousel(root, toInt(root.getAttribute('data-nx-carousel-index'), 0));
  }

  function setupRevealObserver() {
    if (revealObserver || !('IntersectionObserver' in window)) return;
    revealObserver = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i += 1) {
        var entry = entries[i];
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      }
    }, { threshold: 0.18 });
  }

  function initScrollReveal(root) {
    setupRevealObserver();
    if (!root || root.getAttribute('data-nx-reveal-ready') === 'true') return;
    root.setAttribute('data-nx-reveal-ready', 'true');
    if (revealObserver) revealObserver.observe(root);
    else root.classList.add('is-visible');
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function renderCalendar(root) {
    if (!root) return;
    var month = toInt(root.getAttribute('data-nx-calendar-month'), new Date().getMonth());
    var year = toInt(root.getAttribute('data-nx-calendar-year'), new Date().getFullYear());
    var grid = root.querySelector('[data-nx-calendar-grid]');
    var monthLabel = root.querySelector('[data-nx-calendar-month-label]');
    var yearLabel = root.querySelector('[data-nx-calendar-year-label]');
    if (!(grid instanceof HTMLElement)) return;
    if (monthLabel) monthLabel.textContent = new Date(year, month, 1).toLocaleString('default', { month: 'short' });
    if (yearLabel) yearLabel.textContent = String(year);

    var firstDay = new Date(year, month, 1).getDay();
    var total = daysInMonth(year, month);
    var today = new Date();
    var cells = [];
    var dayNames = ['Su', 'Mo', 'Te', 'We', 'Th', 'Fr', 'Sa'];
    for (var d = 0; d < dayNames.length; d += 1) {
      cells.push('<div class="nx-calendar-day-name">' + dayNames[d] + '</div>');
    }
    for (var i = 0; i < 42; i += 1) {
      var dayNum = i - firstDay + 1;
      var classes = 'nx-calendar-cell';
      var text = '';
      if (dayNum < 1 || dayNum > total) {
        classes += ' is-muted';
      } else {
        text = String(dayNum);
        if (dayNum === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
          classes += ' is-today';
        }
      }
      cells.push('<div class="' + classes + '">' + text + '</div>');
    }
    grid.innerHTML = cells.join('');
  }

  function initCalendar(root) {
    if (!root) return;
    if (!root.getAttribute('data-nx-calendar-month')) root.setAttribute('data-nx-calendar-month', String(new Date().getMonth()));
    if (!root.getAttribute('data-nx-calendar-year')) root.setAttribute('data-nx-calendar-year', String(new Date().getFullYear()));
    renderCalendar(root);
  }

  function initAnim001(root) {
    if (!root || root.getAttribute('data-nx-anim-001-ready') === 'true') return;
    root.setAttribute('data-nx-anim-001-ready', 'pending');
    window.setTimeout(function () {
      root.setAttribute('data-nx-anim-001-ready', 'true');
    }, 500);
  }

  function initAnim002(root) {
    if (!root || root.getAttribute('data-nx-anim-002-ready') === 'true') return;
    root.setAttribute('data-nx-anim-002-ready', 'true');
    var fill = root.querySelector('[data-nx-anim-002-fill]');
    if (!fill) return;
    var mode = root.getAttribute('data-nx-anim-mode') || 'animated';
    if (mode === 'animated') {
      window.setTimeout(function () {
        fill.classList.add('load1');
      }, 120);
    } else fill.classList.add('load2');
  }

  function initAll(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var carousels = scope.querySelectorAll('[data-nx-carousel]');
    for (var i = 0; i < carousels.length; i += 1) initCarousel(carousels[i]);
    var reveals = scope.querySelectorAll('[data-nx-scroll-reveal]');
    for (var j = 0; j < reveals.length; j += 1) initScrollReveal(reveals[j]);
    var calendars = scope.querySelectorAll('[data-nx-calendar]');
    for (var k = 0; k < calendars.length; k += 1) initCalendar(calendars[k]);
    var anim001 = scope.querySelectorAll('[data-nx-anim-001]');
    for (var a = 0; a < anim001.length; a += 1) initAnim001(anim001[a]);
    var anim002 = scope.querySelectorAll('[data-nx-anim-002]');
    for (var b = 0; b < anim002.length; b += 1) initAnim002(anim002[b]);
  }

  function moveSortableItem(container, dragItem, pointerY) {
    var siblings = Array.prototype.slice.call(container.querySelectorAll('[data-nx-sortable-item]'));
    var beforeNode = null;
    for (var i = 0; i < siblings.length; i += 1) {
      var sibling = siblings[i];
      if (sibling === dragItem) continue;
      var rect = sibling.getBoundingClientRect();
      if (pointerY < rect.top + rect.height / 2) { beforeNode = sibling; break; }
    }
    if (beforeNode) container.insertBefore(dragItem, beforeNode);
    else container.appendChild(dragItem);
  }

  function onClick(event) {
    var prevBtn = closestBySelector(event.target, '[data-nx-carousel-prev]');
    if (prevBtn) {
      var prevRoot = closestBySelector(prevBtn, '[data-nx-carousel]');
      updateCarousel(prevRoot, toInt(prevRoot && prevRoot.getAttribute('data-nx-carousel-index'), 0) - 1);
      return;
    }
    var nextBtn = closestBySelector(event.target, '[data-nx-carousel-next]');
    if (nextBtn) {
      var nextRoot = closestBySelector(nextBtn, '[data-nx-carousel]');
      updateCarousel(nextRoot, toInt(nextRoot && nextRoot.getAttribute('data-nx-carousel-index'), 0) + 1);
      return;
    }
    var dot = closestBySelector(event.target, '[data-nx-carousel-dot]');
    if (dot) {
      var dotRoot = closestBySelector(dot, '[data-nx-carousel]');
      updateCarousel(dotRoot, toInt(dot.getAttribute('data-index'), 0));
      return;
    }
    var flipRoot = closestBySelector(event.target, '[data-nx-flip-card]');
    if (flipRoot) flipRoot.classList.toggle('is-flipped');

    var calPrev = closestBySelector(event.target, '[data-nx-calendar-prev]');
    if (calPrev) {
      var calRootPrev = closestBySelector(calPrev, '[data-nx-calendar]');
      if (calRootPrev) {
        var pm = toInt(calRootPrev.getAttribute('data-nx-calendar-month'), new Date().getMonth()) - 1;
        var py = toInt(calRootPrev.getAttribute('data-nx-calendar-year'), new Date().getFullYear());
        if (pm < 0) { pm = 11; py -= 1; }
        calRootPrev.setAttribute('data-nx-calendar-month', String(pm));
        calRootPrev.setAttribute('data-nx-calendar-year', String(py));
        renderCalendar(calRootPrev);
      }
      return;
    }
    var calNext = closestBySelector(event.target, '[data-nx-calendar-next]');
    if (calNext) {
      var calRootNext = closestBySelector(calNext, '[data-nx-calendar]');
      if (calRootNext) {
        var nm = toInt(calRootNext.getAttribute('data-nx-calendar-month'), new Date().getMonth()) + 1;
        var ny = toInt(calRootNext.getAttribute('data-nx-calendar-year'), new Date().getFullYear());
        if (nm > 11) { nm = 0; ny += 1; }
        calRootNext.setAttribute('data-nx-calendar-month', String(nm));
        calRootNext.setAttribute('data-nx-calendar-year', String(ny));
        renderCalendar(calRootNext);
      }
      return;
    }
    var calReset = closestBySelector(event.target, '[data-nx-calendar-reset]');
    if (calReset) {
      var calRootReset = closestBySelector(calReset, '[data-nx-calendar]');
      if (calRootReset) {
        calRootReset.setAttribute('data-nx-calendar-month', String(new Date().getMonth()));
        calRootReset.setAttribute('data-nx-calendar-year', String(new Date().getFullYear()));
        renderCalendar(calRootReset);
      }
    }

    var formSubmit = closestBySelector(event.target, '[data-nx-form-submit]');
    if (formSubmit) {
      var formRoot = closestBySelector(formSubmit, '[data-nx-clickstream-form]');
      if (formRoot) {
        var status = formRoot.querySelector('[data-nx-form-status]');
        if (status) status.textContent = 'Form submitted (OnClickstreamDone)';
      }
    }
  }

  function onKeyDown(event) {
    var flipRoot = closestBySelector(event.target, '[data-nx-flip-card]');
    if (!flipRoot) return;
    var key = String(event.key || '').toLowerCase();
    if (key === 'enter' || key === ' ') {
      event.preventDefault();
      flipRoot.classList.toggle('is-flipped');
    }
  }

  function onDragStart(event) {
    var dragItem = closestBySelector(event.target, '[data-nx-drag-item], [data-nx-sortable-item]');
    if (!dragItem) return;
    var isSortable = dragItem.hasAttribute('data-nx-sortable-item');
    var itemId = dragItem.getAttribute('data-nx-drag-item') || dragItem.getAttribute('data-nx-sortable-item') || '';
    if (!itemId) return;
    if (isSortable) activeSortableId = itemId;
    else activeDragId = itemId;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', itemId);
    }
    dragItem.classList.add('nx-dragging');
  }

  function onDragOver(event) {
    var dropZone = closestBySelector(event.target, '[data-nx-drop-zone], [data-nx-file-drop]');
    var sortableContainer = closestBySelector(event.target, '[data-nx-sortable]');
    if (dropZone || sortableContainer) event.preventDefault();
    if (dropZone) {
      dropZone.classList.add('nx-drop-over');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    }
    if (sortableContainer && activeSortableId) {
      var dragItem = document.querySelector('[data-nx-sortable-item="' + activeSortableId + '"]');
      if (dragItem) moveSortableItem(sortableContainer, dragItem, event.clientY);
    }
  }

  function onDrop(event) {
    var dropZone = closestBySelector(event.target, '[data-nx-drop-zone]');
    var fileDrop = closestBySelector(event.target, '[data-nx-file-drop]');
    if (dropZone) {
      event.preventDefault();
      var dragItem = activeDragId ? document.querySelector('[data-nx-drag-item="' + activeDragId + '"]') : null;
      if (dragItem) dropZone.appendChild(dragItem);
      dropZone.classList.remove('nx-drop-over');
      return;
    }
    if (fileDrop) {
      event.preventDefault();
      fileDrop.classList.remove('nx-drop-over');
      var output = fileDrop.querySelector('.nx-file-drop-output');
      if (!(output instanceof HTMLElement)) return;
      var files = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : null;
      if (!files || files.length === 0) {
        output.textContent = 'No files dropped.';
        return;
      }
      var names = [];
      for (var i = 0; i < files.length; i += 1) names.push(files[i].name);
      output.innerHTML = names.map(function (name) { return '<div>' + name + '</div>'; }).join('');
    }
  }

  function onDragLeave(event) {
    var dropZone = closestBySelector(event.target, '[data-nx-drop-zone], [data-nx-file-drop]');
    if (dropZone) dropZone.classList.remove('nx-drop-over');
  }

  function onDragEnd() {
    var active = document.querySelector('.nx-dragging');
    if (active) active.classList.remove('nx-dragging');
    var activeOver = document.querySelectorAll('.nx-drop-over');
    for (var i = 0; i < activeOver.length; i += 1) activeOver[i].classList.remove('nx-drop-over');
    activeDragId = '';
    activeSortableId = '';
  }

  function init() {
    initAll(document);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragover', onDragOver, true);
    document.addEventListener('drop', onDrop, true);
    document.addEventListener('dragleave', onDragLeave, true);
    document.addEventListener('dragend', onDragEnd, true);
    if ('MutationObserver' in window && document.body) {
      var mo = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i += 1) {
          var m = mutations[i];
          for (var j = 0; j < m.addedNodes.length; j += 1) {
            var node = m.addedNodes[j];
            if (node && node.nodeType === 1) initAll(node);
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  function registerDraggable(element, id) {
    if (!element) return;
    var nextId = id || element.getAttribute('data-nx-drag-item') || ('drag-' + Math.random().toString(36).slice(2, 9));
    element.setAttribute('draggable', 'true');
    element.setAttribute('data-nx-drag-item', nextId);
    element.classList.add('nx-draggable-card');
  }

  function registerDropZone(element, zoneId) {
    if (!element) return;
    var nextId = zoneId || element.getAttribute('data-nx-drop-zone') || ('zone-' + Math.random().toString(36).slice(2, 9));
    element.setAttribute('data-nx-drop-zone', nextId);
    element.classList.add('nx-drop-zone');
  }

  function makeSortable(container) {
    if (!container) return;
    container.setAttribute('data-nx-sortable', 'true');
    var items = container.querySelectorAll('[data-nx-sortable-item]');
    for (var i = 0; i < items.length; i += 1) items[i].setAttribute('draggable', 'true');
  }

  function enableFileDrop(element) {
    if (!element) return;
    element.setAttribute('data-nx-file-drop', 'true');
    element.classList.add('nx-file-drop');
  }

  init();
  window.NXAddToolComponents = {
    init: init,
    registerDraggable: registerDraggable,
    registerDropZone: registerDropZone,
    makeSortable: makeSortable,
    enableFileDrop: enableFileDrop
  };
})();`;
const resolveConfigPathFromFiles = (
  files: FileMap,
  suffix: "config.json" | "portfolioconfig.json",
) => {
  const baseName =
    suffix === "portfolioconfig.json" ? "portfolioconfig" : "config";
  const normalizedPaths = Object.keys(files).map((path) => normalizePath(path));
  const candidates = [
    `shared/${baseName}.json`,
    `shared/${baseName}.js`,
    `shared/js/${baseName}.json`,
    `shared/js/${baseName}.js`,
  ];
  for (const candidate of candidates) {
    const matched = normalizedPaths.find(
      (path) => path.toLowerCase() === candidate.toLowerCase(),
    );
    if (matched) return matched;
  }
  const matcher = new RegExp(
    `(^|/)shared/(?:js/)?${baseName}\\.(?:json|js)$`,
    "i",
  );
  return normalizedPaths.find((path) => matcher.test(path)) || null;
};

const getConfigPathCandidates = (
  files: FileMap,
  suffix: "config.json" | "portfolioconfig.json",
): string[] => {
  const baseName =
    suffix === "portfolioconfig.json" ? "portfolioconfig" : "config";
  const normalizedPaths = Object.keys(files).map((path) => normalizePath(path));
  const preferred = [
    `shared/${baseName}.json`,
    `shared/${baseName}.js`,
    `shared/js/${baseName}.json`,
    `shared/js/${baseName}.js`,
  ];
  const out: string[] = [];
  for (const candidate of preferred) {
    const matched = normalizedPaths.find(
      (path) => path.toLowerCase() === candidate.toLowerCase(),
    );
    if (matched && !out.includes(matched)) out.push(matched);
  }
  const matcher = new RegExp(
    `(^|/)shared/(?:js/)?${baseName}\\.(?:json|js)$`,
    "i",
  );
  for (const path of normalizedPaths) {
    if (matcher.test(path) && !out.includes(path)) out.push(path);
  }
  return out;
};

const scoreConfigContent = (raw: string, kind: "config" | "portfolio"): number => {
  const content = String(raw || "");
  if (!content.trim()) return -1000;
  let score = 0;
  if (/com\.gsk\.mtconfig/i.test(content)) score += 60;
  if (/\"pagesAll\"|'pagesAll'|\bpagesAll\b/.test(content)) score += 40;
  if (/\"presentation\"|'presentation'|\bpresentation\b/.test(content)) score += 20;
  if (/^\s*\{[\s\S]*\}\s*$/.test(content)) score += 25;
  if (/\/\*+\s*GSK Veeva Master Template - Presentation CSS/i.test(content)) score -= 150;
  if (/\bfont-face\b|\.maincontainer|\.contentFrame|\.mainContent/i.test(content)) score -= 60;
  if (kind === "portfolio" && /\bportfolio\b/i.test(content)) score += 15;
  return score;
};
const DEFAULT_EDITOR_FONTS = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Georgia",
  "Courier New",
  "Verdana",
  "Trebuchet MS",
  "Impact",
  "sans-serif",
  "serif",
  "monospace",
];
const PREVIEW_DRAW_ALLOWED_TAGS = new Set([
  "div",
  "section",
  "p",
  "span",
  "h1",
  "h2",
  "h3",
  "button",
  "img",
]);
const normalizePreviewDrawTag = (raw: string): string => {
  const next = String(raw || "")
    .trim()
    .toLowerCase();
  if (PREVIEW_DRAW_ALLOWED_TAGS.has(next)) return next;
  return "div";
};

type FontCachePayload = {
  version: number;
  source: "presentation.css";
  generatedAt: string;
  fonts: string[];
};

type MaybeViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => {
    finished: Promise<void>;
  };
};

const sanitizeFontFamilyName = (raw: string): string =>
  String(raw || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .trim();

const dedupeFontFamilies = (families: string[]): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of families) {
    const normalized = sanitizeFontFamilyName(raw);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
};

const buildEditorFontOptions = (projectFamilies: string[]): string[] =>
  dedupeFontFamilies([...projectFamilies, ...DEFAULT_EDITOR_FONTS]);

const parsePresentationCssFontFamilies = (cssContent: string): string[] => {
  if (!cssContent) return [];
  const out: string[] = [];
  const faceRegex = /@font-face\s*\{[\s\S]*?\}/gi;
  let blockMatch: RegExpExecArray | null = null;
  while ((blockMatch = faceRegex.exec(cssContent)) !== null) {
    const block = blockMatch[0];
    const familyMatch = block.match(/font-family\s*:\s*([^;]+);/i);
    if (!familyMatch) continue;
    out.push(sanitizeFontFamilyName(familyMatch[1]));
  }
  return dedupeFontFamilies(out);
};

const parseFontCacheFamilies = (raw: string): string[] => {
  try {
    const parsed = JSON.parse(raw) as Partial<FontCachePayload> | null;
    if (!parsed || !Array.isArray(parsed.fonts)) return [];
    return dedupeFontFamilies(parsed.fonts.map((item) => String(item || "")));
  } catch {
    return [];
  }
};

const deriveFontFamilyFromFontFileName = (fileName: string): string => {
  const base = String(fileName || "").replace(/\.[^.]+$/, "");
  const normalized = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized || base || "Custom Font";
};

const fontFormatFromFileName = (fileName: string): string => {
  const ext =
    String(fileName || "")
      .split(".")
      .pop()
      ?.toLowerCase() || "";
  if (ext === "woff2") return "woff2";
  if (ext === "woff") return "woff";
  if (ext === "ttf") return "truetype";
  if (ext === "otf") return "opentype";
  if (ext === "eot") return "embedded-opentype";
  return ext || "truetype";
};

const relativePathBetweenVirtualFiles = (
  fromFilePath: string,
  toFilePath: string,
): string => {
  const fromParts = normalizeProjectRelative(fromFilePath)
    .split("/")
    .filter(Boolean);
  const toParts = normalizeProjectRelative(toFilePath)
    .split("/")
    .filter(Boolean);
  if (fromParts.length > 0) fromParts.pop();
  let pivot = 0;
  while (
    pivot < fromParts.length &&
    pivot < toParts.length &&
    fromParts[pivot].toLowerCase() === toParts[pivot].toLowerCase()
  ) {
    pivot += 1;
  }
  const upward = new Array(Math.max(0, fromParts.length - pivot)).fill("..");
  const downward = toParts.slice(pivot);
  const combined = [...upward, ...downward].join("/");
  return combined || toParts[toParts.length - 1] || "";
};

const collectSharedFontFamiliesFromFileMap = (fileMap: FileMap): string[] =>
  dedupeFontFamilies(
    Object.values(fileMap)
      .filter((file) => {
        if (file.type !== "font") return false;
        const normalized = normalizeProjectRelative(file.path).toLowerCase();
        return normalized.startsWith(`${SHARED_FONT_VIRTUAL_DIR}/`);
      })
      .map((file) => deriveFontFamilyFromFontFileName(file.name)),
  );

const inferFileType = (name: string): ProjectFile["type"] => {
  const lower = name.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".js")) return "js";
  if (lower.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) return "image";
  if (lower.match(/\.(woff|woff2|ttf|otf|eot)$/)) return "font";
  return "unknown";
};

const isTextFileType = (type: ProjectFile["type"]): boolean =>
  type !== "image" && type !== "font";

const isSvgPath = (path: string): boolean =>
  normalizePath(path).toLowerCase().endsWith(".svg");

const isCodeEditableFile = (path: string, type: ProjectFile["type"]): boolean =>
  isTextFileType(type) || isSvgPath(path);

const toFileUrl = (absolutePath: string): string => {
  const normalized = normalizePath(absolutePath);
  return normalized.startsWith("/")
    ? `file://${normalized}`
    : `file:///${normalized}`;
};

const mimeFromType = (type: ProjectFile["type"], fileName: string): string => {
  if (type === "image") {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "svg") return "image/svg+xml";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "gif") return "image/gif";
    if (ext === "webp") return "image/webp";
    return "image/png";
  }
  if (type === "font") {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "woff2") return "font/woff2";
    if (ext === "woff") return "font/woff";
    if (ext === "ttf") return "font/ttf";
    if (ext === "otf") return "font/otf";
    if (ext === "eot") return "application/vnd.ms-fontobject";
    return "application/octet-stream";
  }
  return "application/octet-stream";
};

const toByteArray = (value: any): Uint8Array => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return new Uint8Array(value);
  if (value?.buffer instanceof ArrayBuffer) return new Uint8Array(value.buffer);
  return new Uint8Array();
};

const isExternalUrl = (raw: string): boolean =>
  /^(https?:|data:|blob:|mailto:|tel:|#|javascript:)/i.test(raw);

const normalizeProjectRelative = (rawPath: string): string => {
  const normalized = rawPath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
};

const resolveProjectRelativePath = (
  currentFile: string,
  target: string,
): string | null => {
  const trimmed = target.trim();
  if (!trimmed || isExternalUrl(trimmed)) return null;

  const pathOnly = trimmed.split("#")[0].split("?")[0];
  if (!pathOnly) return null;

  if (pathOnly.startsWith("/")) {
    return normalizeProjectRelative(pathOnly.slice(1));
  }
  const currentDir = currentFile.includes("/")
    ? currentFile.slice(0, currentFile.lastIndexOf("/"))
    : "";
  const joined = currentDir ? `${currentDir}/${pathOnly}` : pathOnly;
  return normalizeProjectRelative(joined);
};

const findFilePathCaseInsensitive = (
  fileMap: FileMap,
  candidate: string,
): string | null => {
  if (!candidate) return null;
  if (fileMap[candidate]) return candidate;
  const lower = candidate.toLowerCase();
  const exactLower = Object.keys(fileMap).find(
    (k) => k.toLowerCase() === lower,
  );
  return exactLower ?? null;
};

const resolvePreviewNavigationPath = (
  currentHtmlPath: string,
  rawTarget: string,
  fileMap: FileMap,
): string | null => {
  const normalizedRaw = String(rawTarget || "").trim();
  if (!normalizedRaw) return null;
  if (
    /^(https?:|data:|blob:|mailto:|tel:|javascript:|#)/i.test(normalizedRaw)
  ) {
    return null;
  }

  const directCandidate = normalizeProjectRelative(
    normalizedRaw.replace(/^\/+/, ""),
  );
  const variants = directCandidate.startsWith("shared/")
    ? [directCandidate, directCandidate.slice("shared/".length)]
    : [directCandidate, `shared/${directCandidate}`];

  for (const candidate of variants) {
    const matched = findFilePathCaseInsensitive(fileMap, candidate);
    if (!matched) continue;
    const file = fileMap[matched];
    if (file?.type === "html") {
      const lower = matched.toLowerCase();
      if (lower.startsWith("shared/media/")) return null;
      return matched;
    }
  }

  const resolved = resolveProjectRelativePath(currentHtmlPath, normalizedRaw);
  if (!resolved) return null;
  const resolvedVariants = resolved.startsWith("shared/")
    ? [resolved, resolved.slice("shared/".length)]
    : [resolved, `shared/${resolved}`];
  for (const candidate of resolvedVariants) {
    const matched = findFilePathCaseInsensitive(fileMap, candidate);
    if (!matched) continue;
    const file = fileMap[matched];
    if (file?.type === "html") {
      const lower = matched.toLowerCase();
      if (lower.startsWith("shared/media/")) return null;
      return matched;
    }
  }

  return null;
};

const isPathWithinBase = (basePath: string, candidatePath: string): boolean => {
  const base = normalizePath(basePath)
    .replace(/[\\/]$/, "")
    .toLowerCase();
  const candidate = normalizePath(candidatePath).toLowerCase();
  return candidate === base || candidate.startsWith(`${base}/`);
};

const toMountRelativePath = (
  basePath: string,
  absolutePath: string,
): string | null => {
  const base = normalizePath(basePath).replace(/[\\/]$/, "");
  const absolute = normalizePath(absolutePath);
  if (!isPathWithinBase(base, absolute)) return null;
  const trimmed = absolute.startsWith(`${base}/`)
    ? absolute.slice(base.length + 1)
    : absolute.slice(base.length);
  return normalizeProjectRelative(trimmed.replace(/^\/+/, ""));
};

const rewriteInlineAssetRefs = (
  raw: string,
  currentFile: string,
  fileMap: FileMap,
): string => {
  let content = raw;

  content = content.replace(
    /\b(src|href)=["']([^"']+)["']/gi,
    (full, attrName, rawValue) => {
      const resolved = resolveProjectRelativePath(currentFile, rawValue);
      if (!resolved) return full;
      const file = fileMap[resolved];
      if (
        !file ||
        typeof file.content !== "string" ||
        file.content.trim().length === 0
      ) {
        return full;
      }
      if (file.type === "image" || file.type === "font") {
        return `${attrName}="${file.content}"`;
      }
      return full;
    },
  );

  content = content.replace(
    /url\((['"]?)([^'")]+)\1\)/gi,
    (full, quote, rawValue) => {
      const resolved = resolveProjectRelativePath(currentFile, rawValue);
      if (!resolved) return full;
      const file = fileMap[resolved];
      if (
        !file ||
        typeof file.content !== "string" ||
        file.content.trim().length === 0
      ) {
        return full;
      }
      if (file.type === "image" || file.type === "font") {
        return `url("${file.content}")`;
      }
      return full;
    },
  );

  content = content.replace(/\bsrcset=["']([^"']+)["']/gi, (full, rawValue) => {
    const rawSrcset = String(rawValue || "").trim();
    if (!rawSrcset || /^data:/i.test(rawSrcset)) return full;
    const parts = rawSrcset.split(",");
    let changed = false;
    const nextParts = parts.map((part) => {
      const token = part.trim();
      if (!token) return token;
      const [rawUrl, ...descriptorParts] = token.split(/\s+/);
      const resolved = resolveProjectRelativePath(currentFile, rawUrl);
      if (!resolved) return token;
      const file = fileMap[resolved];
      if (
        !file ||
        typeof file.content !== "string" ||
        file.content.trim().length === 0 ||
        (file.type !== "image" && file.type !== "font")
      ) {
        return token;
      }
      changed = true;
      const descriptor = descriptorParts.join(" ");
      return descriptor ? `${file.content} ${descriptor}` : file.content;
    });
    if (!changed) return full;
    return `srcset="${nextParts.join(", ")}"`;
  });

  return content;
};

const buildPreviewRuntimeScript = (
  fileMap: FileMap,
  htmlPath: string,
  includePaths?: string[],
): string => {
  const includeSet =
    includePaths && includePaths.length > 0 ? new Set(includePaths) : null;
  const records: Record<
    string,
    { kind: "text"; content: string } | { kind: "data"; data: string }
  > = {};

  for (const [path, file] of Object.entries(fileMap)) {
    const lowerPath = String(path || "").toLowerCase();
    const allowShared = lowerPath.startsWith("shared/");
    if (includeSet && !includeSet.has(path) && !allowShared) continue;
    if (typeof file.content !== "string" || file.content.trim().length === 0) {
      continue;
    }
    if (file.type === "image" || file.type === "font") {
      records[path] = { kind: "data", data: file.content };
      continue;
    }
    const transformed =
      file.type === "html" || file.type === "css"
        ? rewriteInlineAssetRefs(file.content, path, fileMap)
        : file.content;
    records[path] = { kind: "text", content: transformed };
  }

  const payload = JSON.stringify(records).replace(/<\//g, "<\\/");
  const safeEntry = JSON.stringify(htmlPath).replace(/<\//g, "<\\/");

  return `
  (function () {
    var __FILES = ${payload};
    var __FILE_KEYS = Object.keys(__FILES);
    var __LOWER_KEY_MAP = {};
    for (var i = 0; i < __FILE_KEYS.length; i++) {
      __LOWER_KEY_MAP[__FILE_KEYS[i].toLowerCase()] = __FILE_KEYS[i];
    }
    var __ENTRY = ${safeEntry};
    var __ENTRY_DIR = __ENTRY.indexOf('/') > -1 ? __ENTRY.slice(0, __ENTRY.lastIndexOf('/')) : '';
    var __ORIG_FETCH = window.fetch ? window.fetch.bind(window) : null;
    var __XHR_OPEN = XMLHttpRequest.prototype.open;
    var __XHR_SEND = XMLHttpRequest.prototype.send;

    function normalize(path) {
      var normalized = String(path || '').replace(/\\\\/g, '/');
      var parts = normalized.split('/');
      var out = [];
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (!part || part === '.') continue;
        if (part === '..') { out.pop(); continue; }
        out.push(part);
      }
      return out.join('/');
    }

    function resolveFrom(baseFile, target) {
      if (!target) return null;
      if (/^(data:|blob:|mailto:|tel:|javascript:)/i.test(target)) return null;
      var cleaned = String(target).split('#')[0].split('?')[0];
      try { cleaned = decodeURIComponent(cleaned); } catch (e) {}
      if (!cleaned) return null;
      if (/^https?:/i.test(cleaned)) {
        try {
          var u = new URL(cleaned);
          cleaned = u.pathname || '';
        } catch (e) { return null; }
      }
      if (cleaned.startsWith('/')) return normalize(cleaned.slice(1));
      var baseDir = baseFile.indexOf('/') > -1 ? baseFile.slice(0, baseFile.lastIndexOf('/')) : '';
      return normalize(baseDir ? (baseDir + '/' + cleaned) : cleaned);
    }

    function getMime(path) {
      var lower = String(path || '').toLowerCase();
      if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
      if (lower.endsWith('.css')) return 'text/css';
      if (lower.endsWith('.js')) return 'text/javascript';
      if (lower.endsWith('.json')) return 'application/json';
      if (lower.endsWith('.svg')) return 'image/svg+xml';
      return 'text/plain';
    }

    function lookupRecord(path) {
      if (!path) return null;
      if (__FILES[path]) return { key: path, rec: __FILES[path] };

      var lowerPath = String(path).toLowerCase();
      var exactLower = __LOWER_KEY_MAP[lowerPath];
      if (exactLower && __FILES[exactLower]) {
        return { key: exactLower, rec: __FILES[exactLower] };
      }

      for (var i = 0; i < __FILE_KEYS.length; i++) {
        var key = __FILE_KEYS[i];
        var lowerKey = key.toLowerCase();
        if (lowerKey === lowerPath || lowerKey.endsWith('/' + lowerPath)) {
          return { key: key, rec: __FILES[key] };
        }
      }
      return null;
    }

    function getPathVariants(path) {
      var variants = [];
      var normalized = normalize(path);
      if (!normalized) return variants;
      variants.push(normalized);
      if (normalized.startsWith('shared/')) {
        variants.push(normalized.slice('shared/'.length));
      } else {
        variants.push('shared/' + normalized);
      }
      return variants;
    }

    function toPath(input) {
      var raw = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (!raw) return null;
      return resolveFrom(__ENTRY, raw);
    }

    function getRecord(input) {
      var path = toPath(input);
      if (!path) return null;
      var variants = getPathVariants(path);
      for (var i = 0; i < variants.length; i++) {
        var found = lookupRecord(variants[i]);
        if (found) return { path: found.key, rec: found.rec };
      }

      if (__ENTRY_DIR) {
        for (var j = 0; j < variants.length; j++) {
          var prefixed = normalize(__ENTRY_DIR + '/' + variants[j]);
          var prefixedFound = lookupRecord(prefixed);
          if (prefixedFound) {
            return { path: prefixedFound.key, rec: prefixedFound.rec };
          }
        }
      }
      return { path: path, rec: null };
    }

    function resolveNavigationTarget(target) {
      if (!target) return null;
      var raw = String(target || '').trim();
      if (!raw) return null;
      if (/^(https?:|data:|blob:|mailto:|tel:|javascript:|#)/i.test(raw)) return null;

      var resolved = resolveFrom(__ENTRY, raw);
      if (!resolved) return null;
      var variants = getPathVariants(resolved);

      for (var i = 0; i < variants.length; i++) {
        var found = lookupRecord(variants[i]);
        if (!found || !found.rec || found.rec.kind !== 'text') continue;
        var lower = String(found.key || '').toLowerCase();
        if (lower.endsWith('.html') || lower.endsWith('.htm')) {
          if (lower.startsWith('shared/media/')) return null;
          return found.key;
        }
      }
      return null;
    }

    function toDataUrl(path, rec) {
      if (!rec) return null;
      if (rec.kind === 'data') return rec.data;
      var mime = getMime(path);
      return 'data:' + mime + ';charset=utf-8,' + encodeURIComponent(rec.content);
    }

    function rewriteCssText(cssText) {
      return String(cssText || '').replace(/url\\((['"]?)([^'")]+)\\1\\)/gi, function(full, _quote, raw) {
        var rewritten = rewriteAttrValue(raw);
        if (!rewritten) return full;
        return 'url("' + rewritten + '")';
      });
    }

    function rewriteHtmlMarkup(markup) {
      var next = String(markup || '');
      next = next.replace(/\\b(src|href|srcset)=["']([^"']+)["']/gi, function(full, attr, raw) {
        if (String(attr).toLowerCase() === 'srcset') {
          var rewrittenSet = rewriteSrcsetValue(raw);
          if (!rewrittenSet) return full;
          return attr + '="' + rewrittenSet + '"';
        }
        var rewritten = rewriteAttrValue(raw);
        if (!rewritten) return full;
        return attr + '="' + rewritten + '"';
      });
      next = next.replace(/url\\((['"]?)([^'")]+)\\1\\)/gi, function(full, _q, raw) {
        var rewritten = rewriteAttrValue(raw);
        if (!rewritten) return full;
        return 'url("' + rewritten + '")';
      });
      return next;
    }

    function rewriteAttrValue(rawValue) {
      if (!rawValue) return null;
      var resolved = getRecord(rawValue);
      if (!resolved || !resolved.rec) {
         // Prevent Missing JS from crashing Veeva and bouncing to _000
         var lower = String(rawValue).toLowerCase();
         if (lower.endsWith('.js')) {
             return 'data:text/javascript;charset=utf-8,' + encodeURIComponent('console.warn("[NoCodeX] JS file stubbed: ' + rawValue + '");');
         }
         return null;
      }
      return toDataUrl(resolved.path, resolved.rec);
    }

    function rewriteSrcsetValue(rawValue) {
      if (!rawValue) return null;
      var srcset = String(rawValue).trim();
      if (!srcset || /^data:/i.test(srcset)) return null;
      var parts = srcset.split(',');
      var changed = false;
      for (var i = 0; i < parts.length; i++) {
        var token = String(parts[i] || '').trim();
        if (!token) continue;
        var segs = token.split(/\s+/);
        var rawUrl = segs[0];
        var rewritten = rewriteAttrValue(rawUrl);
        if (!rewritten) continue;
        changed = true;
        var descriptor = segs.slice(1).join(' ');
        parts[i] = descriptor ? (rewritten + ' ' + descriptor) : rewritten;
      }
      return changed ? parts.join(', ') : null;
    }

    function patchElementAttributes(root) {
      if (!root || !root.querySelectorAll) return;
      if (root.tagName === 'STYLE' && root.textContent) {
        root.textContent = rewriteCssText(root.textContent);
      }
      var nodes = root.querySelectorAll('[src], [href], [srcset]');
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.tagName === 'STYLE' && node.textContent) {
          node.textContent = rewriteCssText(node.textContent);
        }
        if (node.hasAttribute('src')) {
          var src = node.getAttribute('src');
          var nextSrc = rewriteAttrValue(src);
          if (nextSrc) node.setAttribute('src', nextSrc);
        }
        if (node.hasAttribute('href')) {
          var href = node.getAttribute('href');
          var rel = (node.getAttribute('rel') || '').toLowerCase();
          var nextHref = rewriteAttrValue(href);
          if (nextHref && (rel === 'stylesheet' || node.tagName === 'A' || node.tagName === 'LINK')) {
            node.setAttribute('href', nextHref);
          }
        }
        if (node.hasAttribute('srcset')) {
          var srcset = node.getAttribute('srcset');
          var nextSrcset = rewriteSrcsetValue(srcset);
          if (nextSrcset) node.setAttribute('srcset', nextSrcset);
        }
      }
    }

    var __APPEND_CHILD = Node.prototype.appendChild;
    Node.prototype.appendChild = function(child) {
      patchElementAttributes(child);
      return __APPEND_CHILD.call(this, child);
    };

    var __INSERT_BEFORE = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function(newNode, referenceNode) {
      patchElementAttributes(newNode);
      return __INSERT_BEFORE.call(this, newNode, referenceNode);
    };

    var __SET_ATTR = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      var lower = String(name || '').toLowerCase();
      if (lower === 'srcset') {
        var rewrittenSet = rewriteSrcsetValue(value);
        if (rewrittenSet) value = rewrittenSet;
      } else if (lower === 'src' || lower === 'href') {
        var rewritten = rewriteAttrValue(value);
        if (rewritten) value = rewritten;
      } else if (lower === 'style' && typeof value === 'string') {
        value = rewriteCssText(value);
      }
      return __SET_ATTR.call(this, name, value);
    };

    function patchUrlProperty(proto, propName) {
      if (!proto) return;
      var desc = Object.getOwnPropertyDescriptor(proto, propName);
      if (!desc || !desc.set || !desc.get) return;
      if (!desc.configurable) return;
      Object.defineProperty(proto, propName, {
        configurable: true,
        enumerable: desc.enumerable,
        get: function() {
          return desc.get.call(this);
        },
        set: function(value) {
          if (propName === 'srcset') {
            var rewrittenSet = rewriteSrcsetValue(value);
            return desc.set.call(this, rewrittenSet || value);
          }
          var rewritten = rewriteAttrValue(value);
          return desc.set.call(this, rewritten || value);
        }
      });
    }

    patchUrlProperty(window.HTMLImageElement && window.HTMLImageElement.prototype, 'src');
    patchUrlProperty(window.HTMLImageElement && window.HTMLImageElement.prototype, 'srcset');
    patchUrlProperty(window.HTMLScriptElement && window.HTMLScriptElement.prototype, 'src');
    patchUrlProperty(window.HTMLLinkElement && window.HTMLLinkElement.prototype, 'href');
    patchUrlProperty(window.HTMLAnchorElement && window.HTMLAnchorElement.prototype, 'href');
    patchUrlProperty(window.HTMLSourceElement && window.HTMLSourceElement.prototype, 'src');
    patchUrlProperty(window.HTMLSourceElement && window.HTMLSourceElement.prototype, 'srcset');
    patchUrlProperty(window.HTMLIFrameElement && window.HTMLIFrameElement.prototype, 'src');

    var __INSERT_ADJ = Element.prototype.insertAdjacentHTML;
    Element.prototype.insertAdjacentHTML = function(position, text) {
      return __INSERT_ADJ.call(this, position, rewriteHtmlMarkup(text));
    };

    var innerHtmlDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (innerHtmlDesc && innerHtmlDesc.set && innerHtmlDesc.get) {
      Object.defineProperty(Element.prototype, 'innerHTML', {
        configurable: true,
        enumerable: innerHtmlDesc.enumerable,
        get: function() {
          return innerHtmlDesc.get.call(this);
        },
        set: function(value) {
          return innerHtmlDesc.set.call(this, rewriteHtmlMarkup(value));
        }
      });
    }

    var __DOC_WRITE = document.write ? document.write.bind(document) : null;
    if (__DOC_WRITE) {
      document.write = function() {
        var args = [];
        for (var i = 0; i < arguments.length; i++) {
          args.push(rewriteHtmlMarkup(arguments[i]));
        }
        return __DOC_WRITE.apply(document, args);
      };
    }

    if (document && document.documentElement) {
      patchElementAttributes(document.documentElement);
      var observer = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          for (var j = 0; j < m.addedNodes.length; j++) {
            patchElementAttributes(m.addedNodes[j]);
          }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function notifyNavigate(targetPath) {
      if (!targetPath || !window.parent || window.parent === window) return;
      try {
        window.parent.postMessage({ type: 'PREVIEW_NAVIGATE', path: targetPath }, '*');
      } catch (e) {}
    }

    var __previewSelectedEl = null;
    var __previewEditingEl = null;
    var __previewMode = 'preview';
    var __previewSelectionMode = 'default';
    var __previewEditableTags = {
      p: true, span: true, h1: true, h2: true, h3: true, h4: true, h5: true, h6: true,
      a: true, button: true, label: true, strong: true, em: true, small: true, b: true,
      i: true, u: true, li: true, td: true, th: true, blockquote: true, pre: true
    };

    function postPreviewMessage(type, payload) {
      if (!window.parent || window.parent === window) return;
      try {
        var message = { type: type };
        if (payload && typeof payload === 'object') {
          for (var key in payload) {
            if (Object.prototype.hasOwnProperty.call(payload, key)) {
              message[key] = payload[key];
            }
          }
        }
        window.parent.postMessage(message, '*');
      } catch (e) {}
    }

    function clearPreviewSelection() {
      if (__previewSelectedEl && __previewSelectedEl.classList) {
        __previewSelectedEl.classList.remove('__nx-preview-selected');
      }
      __previewSelectedEl = null;
    }
    function isPreviewEditMode() {
      return __previewMode === 'edit';
    }

    function isPreviewBaseSelectable(el) {
      if (!el) return false;
      var tag = String(el.tagName || '').toLowerCase();
      return Boolean(
        tag &&
        tag !== 'script' &&
        tag !== 'style' &&
        tag !== 'head' &&
        tag !== 'meta' &&
        tag !== 'link' &&
        tag !== 'html' &&
        tag !== 'body'
      );
    }

    function hasOwnTextNode(el) {
      if (!el) return false;
      for (var i = 0; i < el.childNodes.length; i++) {
        var child = el.childNodes[i];
        if (child && child.nodeType === 3 && String(child.textContent || '').trim()) {
          return true;
        }
      }
      return false;
    }

    function isElementImageCandidate(el) {
      if (!el || !isPreviewBaseSelectable(el)) return false;
      var tag = String(el.tagName || '').toLowerCase();
      if (tag === 'img' || tag === 'picture' || tag === 'source') return true;
      try {
        var computed = window.getComputedStyle(el);
        var bg = computed ? String(computed.backgroundImage || '') : '';
        if (bg && bg !== 'none' && /url\\(/i.test(bg)) return true;
      } catch (e) {}
      return false;
    }

    function normalizeSelectionMode(raw) {
      var mode = String(raw || '').toLowerCase();
      if (mode === 'text' || mode === 'image' || mode === 'css') return mode;
      return 'default';
    }

    function findBestDescendant(root, selector, predicate, pointX, pointY) {
      var descendants = root.querySelectorAll ? root.querySelectorAll(selector) : [];
      var best = null;
      var bestArea = Number.POSITIVE_INFINITY;
      var bestDistance = Number.POSITIVE_INFINITY;
      for (var d = 0; d < descendants.length; d++) {
        var candidate = descendants[d];
        if (!candidate || candidate === root) continue;
        if (predicate && !predicate(candidate)) continue;
        var rect = candidate.getBoundingClientRect ? candidate.getBoundingClientRect() : null;
        if (!rect || rect.width <= 0 || rect.height <= 0) continue;
        var distance = 0;
        if (pointX !== null && pointY !== null) {
          var dx = pointX < rect.left ? (rect.left - pointX) : (pointX > rect.right ? (pointX - rect.right) : 0);
          var dy = pointY < rect.top ? (rect.top - pointY) : (pointY > rect.bottom ? (pointY - rect.bottom) : 0);
          distance = (dx * dx) + (dy * dy);
        }
        var area = rect.width * rect.height;
        if (
          distance < bestDistance ||
          (distance === bestDistance && area < bestArea)
        ) {
          best = candidate;
          bestArea = area;
          bestDistance = distance;
        }
      }
      return best;
    }

    function applySelectionModeDecorations() {
      if (!document || !document.body) return;
      var staleImages = document.querySelectorAll('.__nx-preview-image-candidate');
      for (var si = 0; si < staleImages.length; si++) {
        staleImages[si].classList.remove('__nx-preview-image-candidate');
      }
      var staleCss = document.querySelectorAll('.__nx-preview-css-candidate');
      for (var sc = 0; sc < staleCss.length; sc++) {
        staleCss[sc].classList.remove('__nx-preview-css-candidate');
      }
      if (!isPreviewEditMode()) return;
      if (__previewSelectionMode === 'image') {
        var all = document.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          if (isElementImageCandidate(el)) {
            el.classList.add('__nx-preview-image-candidate');
          }
        }
      } else if (__previewSelectionMode === 'css') {
        var cssEls = document.querySelectorAll('body *');
        for (var j = 0; j < cssEls.length; j++) {
          var cssEl = cssEls[j];
          if (isPreviewBaseSelectable(cssEl)) {
            cssEl.classList.add('__nx-preview-css-candidate');
          }
        }
      }
    }

    function getPreviewSelectableTarget(node, event) {
      var current = node && node.nodeType === 1 ? node : (node && node.parentElement ? node.parentElement : null);
      var pointX = event && typeof event.clientX === 'number' ? event.clientX : null;
      var pointY = event && typeof event.clientY === 'number' ? event.clientY : null;
      while (current && current !== document.body) {
        if (!isPreviewBaseSelectable(current)) {
          current = current.parentElement;
          continue;
        }
        if (__previewSelectionMode === 'text') {
          if (hasOwnTextNode(current)) return current;
          var nearText = findBestDescendant(
            current,
            'p,span,h1,h2,h3,h4,h5,h6,a,button,label,strong,em,small,b,i,u,li,td,th,blockquote,pre,div',
            hasOwnTextNode,
            pointX,
            pointY,
          );
          if (nearText) return nearText;
        } else if (__previewSelectionMode === 'image') {
          if (isElementImageCandidate(current)) return current;
          var nearImage = findBestDescendant(current, '*', isElementImageCandidate, pointX, pointY);
          if (nearImage) return nearImage;
        } else {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    }

    function getPreviewElementPath(el) {
      if (!el || !document.body || !document.body.contains(el)) return null;
      var path = [];
      var cursor = el;
      while (cursor && cursor !== document.body) {
        var parent = cursor.parentElement;
        if (!parent) return null;
        var children = parent.children;
        var idx = -1;
        for (var i = 0; i < children.length; i++) {
          if (children[i] === cursor) {
            idx = i;
            break;
          }
        }
        if (idx < 0) return null;
        path.unshift(idx);
        cursor = parent;
      }
      return path;
    }

    function readElementByPath(path) {
      if (!document.body || !path || !path.length) return null;
      var cursor = document.body;
      for (var i = 0; i < path.length; i++) {
        var idx = Number(path[i]);
        if (!isFinite(idx) || idx < 0) return null;
        var children = cursor.children || [];
        cursor = children[idx];
        if (!cursor) return null;
      }
      return cursor;
    }

    function toCamelStyleKey(raw) {
      return String(raw || '').replace(/-([a-z])/g, function(_all, c) { return c.toUpperCase(); });
    }

    function toCssStyleKey(raw) {
      return String(raw || '').replace(/[A-Z]/g, function(m) { return '-' + m.toLowerCase(); });
    }

    function normalizeFontFamilyValue(raw) {
      var value = String(raw || '').trim();
      if (!value) return '';
      if (value.indexOf(',') > -1) return value;
      if (
        (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'") ||
        (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"')
      ) {
        return value;
      }
      var lower = value.toLowerCase();
      if (
        lower === 'serif' ||
        lower === 'sans-serif' ||
        lower === 'monospace' ||
        lower === 'cursive' ||
        lower === 'fantasy' ||
        lower === 'system-ui'
      ) {
        return value;
      }
      if (/\\s/.test(value)) {
        return "'" + value.replace(/'/g, "\\\\'") + "'";
      }
      return value;
    }

    function getElementComputedStyles(el) {
      var out = {};
      if (!el || !window.getComputedStyle) return out;
      try {
        var computed = window.getComputedStyle(el);
        for (var i = 0; i < computed.length; i++) {
          var key = computed[i];
          var value = computed.getPropertyValue(key);
          if (!value) continue;
          out[toCamelStyleKey(key)] = value;
        }
      } catch (e) {}
      return out;
    }

    function getCustomAttributes(el) {
      var out = {};
      if (!el || !el.attributes) return out;
      var reserved = { id: true, class: true, style: true, src: true, href: true };
      for (var i = 0; i < el.attributes.length; i++) {
        var attr = el.attributes[i];
        if (!attr || !attr.name) continue;
        var lower = String(attr.name).toLowerCase();
        if (reserved[lower]) continue;
        out[attr.name] = attr.value || '';
      }
      return out;
    }

    function applyStylePatchToElement(el, styles) {
      if (!el || !el.style || !styles || typeof styles !== 'object') return;
      for (var key in styles) {
        if (!Object.prototype.hasOwnProperty.call(styles, key)) continue;
        var cssKey = toCssStyleKey(key);
        var rawValue = styles[key];
        var value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
        if (cssKey === 'font-family') {
          value = normalizeFontFamilyValue(value);
        }
        if (!value) {
          el.style.removeProperty(cssKey);
        } else {
          if (cssKey === 'animation') {
            el.style.setProperty('animation', 'none');
            if (typeof el.offsetWidth === 'number') {
              el.offsetWidth;
            }
          }
          el.style.setProperty(cssKey, value, cssKey === 'font-family' ? 'important' : '');
        }
      }
    }

    function canInlineEdit(el) {
      if (!el) return false;
      if (el.isContentEditable) return false;
      var tag = String(el.tagName || '').toLowerCase();
      if (!__previewEditableTags[tag] && !(tag === 'div' && hasOwnTextNode(el))) return false;
      if (el.closest('svg,canvas,video,audio,iframe,select,input,textarea')) return false;
      return true;
    }

    function beginInlineEdit(el) {
      if (!el || !canInlineEdit(el)) return;
      if (__previewEditingEl && __previewEditingEl !== el) {
        __previewEditingEl.blur();
      }
      var path = getPreviewElementPath(el);
      if (!path) return;

      __previewEditingEl = el;
      el.classList.add('__nx-preview-editing');
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('data-nx-inline-editing', 'true');
      try {
        var range = document.createRange();
        range.selectNodeContents(el);
        var selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } catch (e) {}
      try { el.focus(); } catch (e) {}

      var done = false;
      var normalizeEditableHtml = function(raw) {
        var html = String(raw || '');
        // Normalize block splits produced by contentEditable Enter behavior.
        html = html.split('<div><br></div>').join('<br>');
        html = html.split('<div>').join('<br>');
        html = html.split('</div>').join('');
        html = html.split('<p>').join('<br>');
        html = html.split('</p>').join('');
        while (
          html.startsWith('<br>') ||
          html.startsWith('<br/>') ||
          html.startsWith('<br />')
        ) {
          if (html.startsWith('<br />')) {
            html = html.slice(6);
          } else if (html.startsWith('<br/>')) {
            html = html.slice(5);
          } else {
            html = html.slice(4);
          }
        }
        return html;
      };
      var insertLineBreakAtCursor = function() {
        try {
          var sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          var range = sel.getRangeAt(0);
          range.deleteContents();
          var br = document.createElement('br');
          range.insertNode(br);
          range.setStartAfter(br);
          range.setEndAfter(br);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (e) {}
      };
      var draftRaf = 0;
      var scheduleDraftSync = function() {
        if (draftRaf) return;
        draftRaf = requestAnimationFrame(function() {
          draftRaf = 0;
          postPreviewMessage('PREVIEW_INLINE_EDIT_DRAFT', {
            path: path,
            html: normalizeEditableHtml(el.innerHTML)
          });
        });
      };
      var finish = function(commit) {
        if (done) return;
        done = true;
        if (draftRaf) {
          cancelAnimationFrame(draftRaf);
          draftRaf = 0;
        }
        el.removeEventListener('blur', onBlur, true);
        el.removeEventListener('keydown', onKeyDown, true);
        el.removeEventListener('input', onInput, true);
        el.removeAttribute('contenteditable');
        el.removeAttribute('data-nx-inline-editing');
        el.classList.remove('__nx-preview-editing');
        __previewEditingEl = null;
        if (commit) {
          postPreviewMessage('PREVIEW_INLINE_EDIT', {
            path: path,
            html: normalizeEditableHtml(el.innerHTML)
          });
        }
      };

      var onBlur = function() {
        finish(true);
      };
      var onKeyDown = function(event) {
        if (!event) return;
        if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          insertLineBreakAtCursor();
          scheduleDraftSync();
        } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          finish(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        }
      };
      var onInput = function() {
        scheduleDraftSync();
      };

      el.addEventListener('blur', onBlur, true);
      el.addEventListener('keydown', onKeyDown, true);
      el.addEventListener('input', onInput, true);
    }

    try {
      var __previewStyle = document.createElement('style');
      __previewStyle.setAttribute('data-preview-inline-editor', 'true');
      __previewStyle.textContent =
        '.__nx-preview-selected{outline:2px solid rgba(14,165,233,0.95)!important;outline-offset:1px;}' +
        '.__nx-preview-editing{outline:2px dashed rgba(249,115,22,0.95)!important;outline-offset:1px;}' +
        '.__nx-preview-image-candidate{outline:2px solid rgba(245,158,11,0.92)!important;outline-offset:1px;}' +
        '.__nx-preview-css-candidate{outline:1px solid rgba(56,189,248,0.65)!important;outline-offset:0px;}' +
        '.__nx-preview-dirty{box-shadow:inset 0 0 0 2px rgba(245,158,11,0.95)!important;}' +
        '.__nx-draw-new{outline:2px dashed rgba(99,102,241,0.85)!important;outline-offset:0;}' +
        '[data-nx-inline-editing=\"true\"]{cursor:text!important;}' +
        '@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}' +
        '@keyframes slideUp{from{transform:translateY(20px);opacity:0;}to{transform:translateY(0);opacity:1;}}' +
        '@keyframes zoomIn{from{transform:scale(0.8);opacity:0;}to{transform:scale(1);opacity:1;}}' +
        '@keyframes bounce{0%,100%{transform:translateY(0);}50%{transform:translateY(-10px);}}' +
        '@keyframes pulse{0%{opacity:1;}50%{opacity:.5;}100%{opacity:1;}}' +
        '@keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}' +
        '@keyframes flip{0%{transform:perspective(400px) rotateY(90deg);opacity:0;}100%{transform:perspective(400px) rotateY(0deg);opacity:1;}}' +
        '@keyframes wiggle{0%,100%{transform:rotate(-3deg);}50%{transform:rotate(3deg);}}' +
        '@keyframes revealScroll{from{opacity:0;transform:translateY(30px);}to{opacity:1;transform:translateY(0);}}';
      if (document.head) document.head.appendChild(__previewStyle);
    } catch (e) {}

    window.addEventListener('message', function(event) {
      var payload = event && event.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          return;
        }
      }
      if (!payload || !payload.type) return;
      if (payload.type === 'PREVIEW_SET_MODE') {
        var nextMode = payload.mode === 'preview' ? 'preview' : 'edit';
        __previewSelectionMode = normalizeSelectionMode(payload.selectionMode);
        __previewMode = nextMode;
        if (nextMode !== 'edit') {
          clearPreviewSelection();
        }
        applySelectionModeDecorations();
        return;
      }
      if (payload.type === 'PREVIEW_APPLY_STYLE') {
        var target = null;
        if (payload.path && payload.path.length) {
          target = readElementByPath(payload.path);
        }
        if (!target && __previewSelectedEl && document.body && document.body.contains(__previewSelectedEl)) {
          target = __previewSelectedEl;
        }
        if (!target) {
          target = document.querySelector('.__nx-preview-selected');
        }
        if (target) {
          applyStylePatchToElement(target, payload.styles);
        }
      }
    });

    document.addEventListener('click', function(event) {
      if (!isPreviewEditMode()) {
        var navCandidate = event && event.target && event.target.closest ? event.target.closest('a[href]') : null;
        if (navCandidate) {
          var rawHref = navCandidate.getAttribute('href');
          if (rawHref) {
            var trimmedHref = String(rawHref).trim();
            if (
              trimmedHref &&
              !/^(javascript:|mailto:|tel:|#)/i.test(trimmedHref)
            ) {
              var navTarget = resolveNavigationTarget(trimmedHref);
              if (navTarget) {
                event.preventDefault();
                event.stopPropagation();
                notifyNavigate(navTarget);
              }
            }
          }
        }
        return;
      }
      var target = event && event.target;
      var selected = getPreviewSelectableTarget(target, event);
      if (selected) {
        clearPreviewSelection();
        __previewSelectedEl = selected;
        if (__previewSelectedEl.classList) {
          __previewSelectedEl.classList.add('__nx-preview-selected');
        }
        postPreviewMessage('PREVIEW_SELECT', {
          path: getPreviewElementPath(__previewSelectedEl),
          tag: String(__previewSelectedEl.tagName || '').toLowerCase(),
          id: __previewSelectedEl.id || '',
          className: typeof __previewSelectedEl.className === 'string' ? __previewSelectedEl.className : '',
          attributes: getCustomAttributes(__previewSelectedEl),
          text: __previewSelectedEl.textContent || '',
          html: __previewSelectedEl.innerHTML || '',
          src: (__previewSelectedEl.getAttribute ? (__previewSelectedEl.getAttribute('src') || '') : ''),
          href: (__previewSelectedEl.getAttribute ? (__previewSelectedEl.getAttribute('href') || '') : ''),
          inlineStyle: __previewSelectedEl.getAttribute ? (__previewSelectedEl.getAttribute('style') || '') : '',
          computedStyles: getElementComputedStyles(__previewSelectedEl)
        });
      }

      if (__previewEditingEl) return;
      var target = event && event.target;
      if (!target || !target.closest) return;
      if (event.detail && event.detail > 1) return;
      var anchor = target.closest('a[href]');
      if (!anchor) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    document.addEventListener('dblclick', function(event) {
      if (!isPreviewEditMode()) return;
      var target = event && event.target;
      if (__previewEditingEl) {
        if (
          target &&
          (__previewEditingEl === target ||
            (__previewEditingEl.contains &&
              __previewEditingEl.contains(target)))
        ) {
          return;
        }
        try { __previewEditingEl.blur(); } catch (e) {}
      }
      var selected = getPreviewSelectableTarget(target, event);
      if (!selected || !canInlineEdit(selected)) return;
      event.preventDefault();
      event.stopPropagation();
      beginInlineEdit(selected);
    }, true);

    document.addEventListener('keydown', function(event) {
      if (!event) return;
      var key = String(event.key || '').toLowerCase();
      var code = String(event.code || '');
      if (!key) return;
      var hasModifier = !!(event.ctrlKey || event.metaKey);
      var target = event.target;
      var targetTag =
        target && target.tagName ? String(target.tagName).toLowerCase() : '';
      var isInlineEditing =
        !!(
          __previewEditingEl &&
          target &&
          (target === __previewEditingEl ||
            (__previewEditingEl.contains && __previewEditingEl.contains(target)))
        );
      var isTargetEditable =
        isInlineEditing ||
        !!(target && target.isContentEditable) ||
        targetTag === 'input' ||
        targetTag === 'textarea' ||
        targetTag === 'select';

      var shouldForward = false;
      if (isTargetEditable) {
        shouldForward =
          hasModifier &&
          (key === 's' ||
            key === 'p' ||
            key === 't' ||
            key === 'f' ||
            key === 'e' ||
            key === 'k' ||
            code === 'Backquote');
      } else if (key === 'escape') {
        shouldForward = true;
      } else if (!hasModifier && !event.altKey && (key === 'w' || key === 'e')) {
        shouldForward = true;
      } else if (
        hasModifier &&
        (key === 'k' ||
          key === 'f' ||
          key === 'p' ||
          key === 'e' ||
          code === 'Backquote' ||
          key === 'j' ||
          key === 's' ||
          key === 't' ||
          key === 'z' ||
          key === 'u' ||
          key === 'y')
      ) {
        shouldForward = true;
      }
      if (!shouldForward) return;

      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
      postPreviewMessage('PREVIEW_HOTKEY', {
        key: key,
        code: code,
        ctrlKey: !!event.ctrlKey,
        metaKey: !!event.metaKey,
        shiftKey: !!event.shiftKey,
        altKey: !!event.altKey,
        editable: isTargetEditable
      });
    }, true);

    var __LOCATION_ASSIGN = window.location.assign ? window.location.assign.bind(window.location) : null;
    if (__LOCATION_ASSIGN) {
      try {
        window.location.assign = function(url) {
          var navTarget = resolveNavigationTarget(url);
          if (navTarget) {
            notifyNavigate(navTarget);
            return;
          }
          return __LOCATION_ASSIGN(url);
        };
      } catch (e) {}
    }

    var __LOCATION_REPLACE = window.location.replace ? window.location.replace.bind(window.location) : null;
    if (__LOCATION_REPLACE) {
      try {
        window.location.replace = function(url) {
          var navTarget = resolveNavigationTarget(url);
          if (navTarget) {
            notifyNavigate(navTarget);
            return;
          }
          return __LOCATION_REPLACE(url);
        };
      } catch (e) {}
    }

    if (__ORIG_FETCH) {
      window.fetch = function(input, init) {
        var method = (init && init.method) || (input && input.method) || 'GET';
        if (String(method).toUpperCase() !== 'GET') return __ORIG_FETCH(input, init);
        var resolved = getRecord(input);
        if (!resolved || !resolved.rec) return __ORIG_FETCH(input, init);
        if (resolved.rec.kind === 'data') return __ORIG_FETCH(resolved.rec.data, init);
        return Promise.resolve(
          new Response(resolved.rec.content, {
            status: 200,
            headers: { 'Content-Type': getMime(resolved.path) + '; charset=utf-8' }
          })
        );
      };
    }

    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
      this.__codexMethod = method;
      this.__codexUrl = url;
      this.__codexAsync = async;
      this.__codexUser = user;
      this.__codexPassword = password;
      return __XHR_OPEN.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
      var method = String(this.__codexMethod || 'GET').toUpperCase();
      if (method === 'GET') {
        var resolved = getRecord(this.__codexUrl);
        if (resolved && resolved.rec) {
          var dataUrl = resolved.rec.kind === 'data'
            ? resolved.rec.data
            : ('data:' + getMime(resolved.path) + ';charset=utf-8,' + encodeURIComponent(resolved.rec.content));
          __XHR_OPEN.call(
            this,
            method,
            dataUrl,
            this.__codexAsync !== false,
            this.__codexUser,
            this.__codexPassword
          );
        }
      }
      return __XHR_SEND.call(this, body);
    };
  })();
  `;
};

const createPreviewDocument = (
  fileMap: FileMap,
  htmlPath: string,
  includePaths?: string[],
): string => {
  const entry = fileMap[htmlPath];
  if (
    !entry ||
    typeof entry.content !== "string" ||
    entry.content.trim().length === 0
  ) {
    return "";
  }
  let html = entry.content;
  const runtimeScript = buildPreviewRuntimeScript(
    fileMap,
    htmlPath,
    includePaths,
  );

  if (/<head[\s>]/i.test(html)) {
    html = html.replace(
      /<head([^>]*)>/i,
      `<head$1>\n<script data-preview-runtime="true">\n${runtimeScript}\n</script>\n`,
    );
  } else {
    html = `<head><script data-preview-runtime="true">\n${runtimeScript}\n</script></head>\n${html}`;
  }

  html = html.replace(
    /<link\b([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
    (full, beforeHref, hrefValue, afterHref) => {
      if (!/rel=["']stylesheet["']/i.test(full)) return full;
      const resolved = resolveProjectRelativePath(htmlPath, hrefValue);
      if (!resolved) return full;
      const cssFile = fileMap[resolved];
      if (
        !cssFile ||
        typeof cssFile.content !== "string" ||
        cssFile.content.trim().length === 0
      ) {
        return full;
      }
      return `<style data-source="${resolved}">\n${rewriteInlineAssetRefs(cssFile.content, resolved, fileMap)}\n</style>`;
    },
  );

  html = html.replace(
    /<script\b([^>]*?)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
    (full, beforeSrc, srcValue, afterSrc) => {
      const resolved = resolveProjectRelativePath(htmlPath, srcValue);
      if (!resolved) return full;
      const jsFile = fileMap[resolved];
      if (
        !jsFile ||
        typeof jsFile.content !== "string" ||
        jsFile.content.trim().length === 0
      ) {
        return full;
      }
      return `<script${beforeSrc}${afterSrc} data-source="${resolved}">\n${jsFile.content}\n</script>`;
    },
  );

  html = rewriteInlineAssetRefs(html, htmlPath, fileMap);

  return html;
};

const pickDefaultHtmlFile = (fileMap: FileMap): string | null => {
  const htmlFiles = Object.values(fileMap).filter((f) => f.type === "html");
  if (htmlFiles.length === 0) return null;

  const slide000 = htmlFiles.find((f) =>
    /_000\/index\.html$/i.test(normalizePath(f.path)),
  );
  if (slide000) return slide000.path;

  const slide001 = htmlFiles.find((f) =>
    /_001\/index\.html$/i.test(normalizePath(f.path)),
  );
  if (slide001) return slide001.path;

  const slideIndexFiles = htmlFiles
    .map((f) => ({ file: f, normalizedPath: normalizePath(f.path) }))
    .filter(({ normalizedPath }) =>
      /_([0-9]{3,})\/index\.html$/i.test(normalizedPath),
    )
    .sort((a, b) => {
      const aMatch = a.normalizedPath.match(/_([0-9]{3,})\/index\.html$/i);
      const bMatch = b.normalizedPath.match(/_([0-9]{3,})\/index\.html$/i);
      const aNum = aMatch
        ? Number.parseInt(aMatch[1], 10)
        : Number.MAX_SAFE_INTEGER;
      const bNum = bMatch
        ? Number.parseInt(bMatch[1], 10)
        : Number.MAX_SAFE_INTEGER;
      if (aNum !== bNum) return aNum - bNum;
      return a.normalizedPath.localeCompare(b.normalizedPath);
    });
  if (slideIndexFiles.length > 0) {
    return slideIndexFiles[0].file.path;
  }

  const indexHtml =
    htmlFiles.find((f) => f.path.toLowerCase() === "index.html") ||
    htmlFiles.find((f) => f.name.toLowerCase() === "index.html");
  return (indexHtml || htmlFiles[0]).path;
};

const MOUNTED_PREVIEW_BRIDGE_SCRIPT = `
(function () {
  var __docEl = document && document.documentElement ? document.documentElement : null;
  if (__docEl && __docEl.getAttribute('data-nx-mounted-preview-bridge') === '1') return;
  if (__docEl) __docEl.setAttribute('data-nx-mounted-preview-bridge', '1');
  window.__nxMountedPreviewBridgeInstalled = true;

  var __previewSelectedEl = null;
  var __previewEditingEl = null;
  var __previewHoverEl = null;
  var __previewHoverBadge = null;
  var __previewHoverOutline = null;
  var __previewHoverRaf = 0;
  var __previewMode = 'preview';
  var __previewSelectionMode = 'default';
  var __previewToolMode = 'edit';
  var __previewDrawTag = 'div';
  var __previewMoveDrag = null;
  var __previewDrawDraft = null;
  var __previewDrawState = null;
  var __previewEditableTags = {
    p: true, span: true, h1: true, h2: true, h3: true, h4: true, h5: true, h6: true,
    a: true, button: true, label: true, strong: true, em: true, small: true, b: true,
    i: true, u: true, li: true, td: true, th: true, blockquote: true, pre: true
  };

  function syncModeFromHost() {
    try {
      var hostMode = String(window.__nxPreviewHostMode || '').toLowerCase();
      if (hostMode === 'preview' || hostMode === 'edit') {
        __previewMode = hostMode;
      }
      __previewSelectionMode = normalizeSelectionMode(window.__nxPreviewHostSelectionMode);
      __previewToolMode = normalizeToolMode(window.__nxPreviewHostToolMode);
      __previewDrawTag = normalizeDrawTag(window.__nxPreviewHostDrawTag);
    } catch (e) {}
  }

  function postPreviewMessage(type, payload) {
    if (!window.parent || window.parent === window) return;
    try {
      var message = { type: type };
      if (payload && typeof payload === 'object') {
        for (var key in payload) {
          if (Object.prototype.hasOwnProperty.call(payload, key)) {
            message[key] = payload[key];
          }
        }
      }
      window.parent.postMessage(message, '*');
    } catch (e) {}
  }

  function clearPreviewSelection() {
    if (__previewSelectedEl && __previewSelectedEl.classList) {
      __previewSelectedEl.classList.remove('__nx-preview-selected');
    }
    __previewSelectedEl = null;
    // Also sweep the DOM to catch any elements that had the class added directly
    // (e.g. via PREVIEW_INJECT_ELEMENT) without going through __previewSelectedEl.
    try {
      var extras = document.querySelectorAll('.__nx-preview-selected');
      for (var ci = 0; ci < extras.length; ci++) {
        extras[ci].classList.remove('__nx-preview-selected');
      }
    } catch (e) {}
  }

  function emitPreviewSelection(el) {
    if (!el) return;
    postPreviewMessage('PREVIEW_SELECT', {
      path: getPreviewElementPath(el),
      tag: String(el.tagName || '').toLowerCase(),
      id: el.id || '',
      className: typeof el.className === 'string' ? el.className : '',
      attributes: getCustomAttributes(el),
      text: el.textContent || '',
      html: el.innerHTML || '',
      src: extractImageSource(el),
      href: el.getAttribute ? (el.getAttribute('href') || '') : '',
      inlineStyle: el.getAttribute ? (el.getAttribute('style') || '') : '',
      computedStyles: getElementComputedStyles(el)
    });
  }

  function selectPreviewElement(el) {
    if (!el) return;
    clearPreviewSelection();
    __previewSelectedEl = el;
    if (__previewSelectedEl.classList) {
      __previewSelectedEl.classList.add('__nx-preview-selected');
    }
    emitPreviewSelection(__previewSelectedEl);
  }

  function clearPreviewHover() {
    __previewHoverEl = null;
    if (__previewHoverRaf) {
      cancelAnimationFrame(__previewHoverRaf);
      __previewHoverRaf = 0;
    }
    if (__previewHoverBadge) {
      __previewHoverBadge.style.display = 'none';
    }
    if (__previewHoverOutline) {
      __previewHoverOutline.style.display = 'none';
    }
  }

  function isPreviewEditMode() {
    syncModeFromHost();
    return __previewMode === 'edit';
  }

  function isPreviewBaseSelectable(el) {
    if (!el) return false;
    var tag = String(el.tagName || '').toLowerCase();
    return Boolean(
      tag &&
      tag !== 'script' &&
      tag !== 'style' &&
      tag !== 'head' &&
      tag !== 'meta' &&
      tag !== 'link' &&
      tag !== 'html' &&
      tag !== 'body'
    );
  }

  function hasOwnTextNode(el) {
    if (!el) return false;
    for (var i = 0; i < el.childNodes.length; i++) {
      var child = el.childNodes[i];
      if (child && child.nodeType === 3 && String(child.textContent || '').trim()) {
        return true;
      }
    }
    return false;
  }

  function isElementImageCandidate(el) {
    if (!el || !isPreviewBaseSelectable(el)) return false;
    var tag = String(el.tagName || '').toLowerCase();
    if (tag === 'img' || tag === 'picture' || tag === 'source') return true;
    try {
      var computed = window.getComputedStyle(el);
      var bg = computed ? String(computed.backgroundImage || '') : '';
      if (bg && bg !== 'none' && /url\\(/i.test(bg)) return true;
    } catch (e) {}
    return false;
  }

  function extractImageSource(el) {
    if (!el) return '';
    var tag = String(el.tagName || '').toLowerCase();
    if (tag === 'img' || tag === 'source') {
      var attrSrc = el.getAttribute ? (el.getAttribute('src') || '') : '';
      if (attrSrc) return attrSrc;
    }
    try {
      var computed = window.getComputedStyle(el);
      var bg = computed ? String(computed.backgroundImage || '') : '';
      var match = bg && bg.match(/url\\((['"]?)(.*?)\\1\\)/i);
      if (match && match[2]) return match[2];
    } catch (e) {}
    return '';
  }

  function normalizeSelectionMode(raw) {
    var mode = String(raw || '').toLowerCase();
    if (mode === 'text' || mode === 'image' || mode === 'css') return mode;
    return 'default';
  }

  function normalizeToolMode(raw) {
    var mode = String(raw || '').toLowerCase();
    if (mode === 'move' || mode === 'draw' || mode === 'inspect') return mode;
    return 'edit';
  }

  function normalizeDrawTag(raw) {
    var tag = String(raw || '').toLowerCase();
    var allowed = {
      div: true, section: true, p: true, span: true,
      h1: true, h2: true, h3: true, button: true, img: true
    };
    return allowed[tag] ? tag : 'div';
  }

  function findBestDescendant(root, selector, predicate, pointX, pointY) {
    var descendants = root.querySelectorAll ? root.querySelectorAll(selector) : [];
    var best = null;
    var bestArea = Number.POSITIVE_INFINITY;
    var bestDistance = Number.POSITIVE_INFINITY;
    for (var d = 0; d < descendants.length; d++) {
      var candidate = descendants[d];
      if (!candidate || candidate === root) continue;
      if (predicate && !predicate(candidate)) continue;
      var rect = candidate.getBoundingClientRect ? candidate.getBoundingClientRect() : null;
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;
      var distance = 0;
      if (pointX !== null && pointY !== null) {
        var dx = pointX < rect.left ? (rect.left - pointX) : (pointX > rect.right ? (pointX - rect.right) : 0);
        var dy = pointY < rect.top ? (rect.top - pointY) : (pointY > rect.bottom ? (pointY - rect.bottom) : 0);
        distance = (dx * dx) + (dy * dy);
      }
      var area = rect.width * rect.height;
      if (
        distance < bestDistance ||
        (distance === bestDistance && area < bestArea)
      ) {
        best = candidate;
        bestArea = area;
        bestDistance = distance;
      }
    }
    return best;
  }

  function applySelectionModeDecorations() {
    if (!document || !document.body) return;
    var staleImages = document.querySelectorAll('.__nx-preview-image-candidate');
    for (var si = 0; si < staleImages.length; si++) {
      staleImages[si].classList.remove('__nx-preview-image-candidate');
    }
    var staleCss = document.querySelectorAll('.__nx-preview-css-candidate');
    for (var sc = 0; sc < staleCss.length; sc++) {
      staleCss[sc].classList.remove('__nx-preview-css-candidate');
    }
    if (!isPreviewEditMode()) return;
    if (__previewSelectionMode === 'image') {
      var all = document.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (isElementImageCandidate(el)) {
          el.classList.add('__nx-preview-image-candidate');
        }
      }
    } else if (__previewSelectionMode === 'css') {
      var cssEls = document.querySelectorAll('body *');
      for (var j = 0; j < cssEls.length; j++) {
        var cssEl = cssEls[j];
        if (isPreviewBaseSelectable(cssEl)) {
          cssEl.classList.add('__nx-preview-css-candidate');
        }
      }
    }
  }

  function getPreviewSelectableTarget(node, event) {
    var current = node && node.nodeType === 1 ? node : (node && node.parentElement ? node.parentElement : null);
    var pointX = event && typeof event.clientX === 'number' ? event.clientX : null;
    var pointY = event && typeof event.clientY === 'number' ? event.clientY : null;
    while (current && current !== document.body) {
      if (!isPreviewBaseSelectable(current)) {
        current = current.parentElement;
        continue;
      }
      if (__previewSelectionMode === 'text') {
        if (hasOwnTextNode(current)) return current;
        var nearText = findBestDescendant(
          current,
          'p,span,h1,h2,h3,h4,h5,h6,a,button,label,strong,em,small,b,i,u,li,td,th,blockquote,pre,div',
          hasOwnTextNode,
          pointX,
          pointY,
        );
        if (nearText) return nearText;
      } else if (__previewSelectionMode === 'image') {
        if (isElementImageCandidate(current)) return current;
        var nearImage = findBestDescendant(current, '*', isElementImageCandidate, pointX, pointY);
        if (nearImage) return nearImage;
      } else {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function getPreviewElementPath(el) {
    if (!el || !document.body || !document.body.contains(el)) return null;
    var path = [];
    var cursor = el;
    while (cursor && cursor !== document.body) {
      var parent = cursor.parentElement;
      if (!parent) return null;
      var children = parent.children;
      var idx = -1;
      for (var i = 0; i < children.length; i++) {
        if (children[i] === cursor) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return null;
      path.unshift(idx);
      cursor = parent;
    }
    return path;
  }

  function readElementByPath(path) {
    if (!document.body || !path || !path.length) return null;
    var cursor = document.body;
    for (var i = 0; i < path.length; i++) {
      var idx = Number(path[i]);
      if (!isFinite(idx) || idx < 0) return null;
      var children = cursor.children || [];
      cursor = children[idx];
      if (!cursor) return null;
    }
    return cursor;
  }

  function toCamelStyleKey(raw) {
    return String(raw || '').replace(/-([a-z])/g, function(_all, c) { return c.toUpperCase(); });
  }

  function toCssStyleKey(raw) {
    return String(raw || '').replace(/[A-Z]/g, function(m) { return '-' + m.toLowerCase(); });
  }

  function normalizeFontFamilyValue(raw) {
    var value = String(raw || '').trim();
    if (!value) return '';
    if (value.indexOf(',') > -1) return value;
    if (
      (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'") ||
      (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"')
    ) {
      return value;
    }
    var lower = value.toLowerCase();
    if (
      lower === 'serif' ||
      lower === 'sans-serif' ||
      lower === 'monospace' ||
      lower === 'cursive' ||
      lower === 'fantasy' ||
      lower === 'system-ui'
    ) {
      return value;
    }
    if (/\\s/.test(value)) {
      return "'" + value.replace(/'/g, "\\\\'") + "'";
    }
    return value;
  }

  function getElementComputedStyles(el) {
    var out = {};
    if (!el || !window.getComputedStyle) return out;
    try {
      var computed = window.getComputedStyle(el);
      for (var i = 0; i < computed.length; i++) {
        var key = computed[i];
        var value = computed.getPropertyValue(key);
        if (!value) continue;
        out[toCamelStyleKey(key)] = value;
      }
    } catch (e) {}
    return out;
  }

  function getCustomAttributes(el) {
    var out = {};
    if (!el || !el.attributes) return out;
    var reserved = { id: true, class: true, style: true, src: true, href: true };
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      if (!attr || !attr.name) continue;
      var lower = String(attr.name).toLowerCase();
      if (reserved[lower]) continue;
      out[attr.name] = attr.value || '';
    }
    return out;
  }

  function applyStylePatchToElement(el, styles) {
    if (!el || !el.style || !styles || typeof styles !== 'object') return;
    for (var key in styles) {
      if (!Object.prototype.hasOwnProperty.call(styles, key)) continue;
      var cssKey = toCssStyleKey(key);
      var rawValue = styles[key];
      var value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
      if (cssKey === 'font-family') {
        value = normalizeFontFamilyValue(value);
      }
      if (!value) {
        el.style.removeProperty(cssKey);
      } else {
        if (cssKey === 'animation') {
          el.style.setProperty('animation', 'none');
          if (typeof el.offsetWidth === 'number') {
            el.offsetWidth;
          }
        }
        el.style.setProperty(cssKey, value, cssKey === 'font-family' ? 'important' : '');
      }
    }
  }

  function canInlineEdit(el) {
    if (!el) return false;
    if (el.isContentEditable) return false;
    var tag = String(el.tagName || '').toLowerCase();
    if (!__previewEditableTags[tag] && !(tag === 'div' && hasOwnTextNode(el))) return false;
    if (el.closest('svg,canvas,video,audio,iframe,select,input,textarea')) return false;
    return true;
  }

  function ensureHoverBadge() {
    if (__previewHoverBadge && document.body && document.body.contains(__previewHoverBadge)) {
      return __previewHoverBadge;
    }
    if (!document.body) return null;
    var badge = document.createElement('div');
    badge.setAttribute('data-preview-hover-badge', 'true');
    badge.style.display = 'none';
    document.body.appendChild(badge);
    __previewHoverBadge = badge;
    return badge;
  }

  function ensureHoverOutline() {
    if (__previewHoverOutline && document.body && document.body.contains(__previewHoverOutline)) {
      return __previewHoverOutline;
    }
    if (!document.body) return null;
    var outline = document.createElement('div');
    outline.setAttribute('data-preview-hover-outline', 'true');
    outline.style.display = 'none';
    document.body.appendChild(outline);
    __previewHoverOutline = outline;
    return outline;
  }

  function getElementMetaLabel(el, rect) {
    if (!el) return '';
    var width = rect ? Math.max(0, Math.round(rect.width)) : 0;
    var height = rect ? Math.max(0, Math.round(rect.height)) : 0;
    var tag = String(el.tagName || 'div').toLowerCase();
    var id = el.id ? ('#' + el.id) : '';
    var cls = '';
    if (typeof el.className === 'string' && el.className.trim()) {
      cls = '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.');
    }
    var dims = width + 'x' + height;
    if (__previewSelectionMode === 'image') {
      var imgSrc = extractImageSource(el);
      var shortSrc = imgSrc ? imgSrc.slice(0, 72) : '';
      return tag + id + cls + '  ' + dims + (shortSrc ? ('  ' + shortSrc) : '');
    }
    if (__previewSelectionMode === 'css') {
      var cssSnippet = '';
      try {
        var computed = window.getComputedStyle(el);
        if (computed) {
          var display = computed.display ? ('display:' + computed.display) : '';
          var position = computed.position ? ('position:' + computed.position) : '';
          var color = computed.color ? ('color:' + computed.color) : '';
          cssSnippet = [display, position, color].filter(Boolean).join('; ');
        }
      } catch (e) {}
      return tag + id + cls + '  ' + dims + (cssSnippet ? ('  ' + cssSnippet) : '');
    }
    return tag + id + cls + '  ' + dims;
  }

  function updateHoverBadgePosition() {
    if (!isPreviewEditMode() || !__previewHoverEl || __previewEditingEl) {
      if (__previewHoverBadge) __previewHoverBadge.style.display = 'none';
      if (__previewHoverOutline) __previewHoverOutline.style.display = 'none';
      return;
    }
    var badge = ensureHoverBadge();
    var outline = ensureHoverOutline();
    if (!badge || !outline) return;
    var rect = __previewHoverEl.getBoundingClientRect ? __previewHoverEl.getBoundingClientRect() : null;
    if (!rect) {
      badge.style.display = 'none';
      outline.style.display = 'none';
      return;
    }
    outline.style.display = 'block';
    outline.style.left = Math.round(rect.left - 2) + 'px';
    outline.style.top = Math.round(rect.top - 2) + 'px';
    outline.style.width = Math.max(0, Math.round(rect.width + 4)) + 'px';
    outline.style.height = Math.max(0, Math.round(rect.height + 4)) + 'px';

    badge.textContent = getElementMetaLabel(__previewHoverEl, rect);
    badge.style.display = 'block';
    var top = rect.top - badge.offsetHeight - 10;
    if (top < 6) top = rect.bottom + 10;
    var left = rect.left + 2;
    var maxLeft = Math.max(6, window.innerWidth - badge.offsetWidth - 6);
    if (left > maxLeft) left = maxLeft;
    if (left < 6) left = 6;
    badge.style.left = Math.round(left) + 'px';
    badge.style.top = Math.round(top) + 'px';
  }

  function setPreviewHover(el) {
    if (__previewHoverEl === el) {
      return;
    }
    __previewHoverEl = el || null;
    updateHoverBadgePosition();
  }

  function requestHoverUpdate() {
    if (__previewHoverRaf) return;
    __previewHoverRaf = requestAnimationFrame(function() {
      __previewHoverRaf = 0;
      updateHoverBadgePosition();
    });
  }

  function beginInlineEdit(el) {
    if (!el || !canInlineEdit(el)) return;
    if (__previewEditingEl && __previewEditingEl !== el) {
      __previewEditingEl.blur();
    }
    var path = getPreviewElementPath(el);
    if (!path) return;

    __previewEditingEl = el;
    el.classList.add('__nx-preview-editing');
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('data-nx-inline-editing', 'true');
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      var selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch (e) {}
    try { el.focus(); } catch (e) {}

    var done = false;
    var normalizeEditableHtml = function(raw) {
      var html = String(raw || '');
      html = html.split('<div><br></div>').join('<br>');
      html = html.split('<div>').join('<br>');
      html = html.split('</div>').join('');
      html = html.split('<p>').join('<br>');
      html = html.split('</p>').join('');
      while (
        html.startsWith('<br>') ||
        html.startsWith('<br/>') ||
        html.startsWith('<br />')
      ) {
        if (html.startsWith('<br />')) {
          html = html.slice(6);
        } else if (html.startsWith('<br/>')) {
          html = html.slice(5);
        } else {
          html = html.slice(4);
        }
      }
      return html;
    };
    var insertLineBreakAtCursor = function() {
      try {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        var range = sel.getRangeAt(0);
        range.deleteContents();
        var br = document.createElement('br');
        range.insertNode(br);
        range.setStartAfter(br);
        range.setEndAfter(br);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {}
    };
    var draftRaf = 0;
    var scheduleDraftSync = function() {
      if (draftRaf) return;
      draftRaf = requestAnimationFrame(function() {
        draftRaf = 0;
        postPreviewMessage('PREVIEW_INLINE_EDIT_DRAFT', {
          path: path,
          html: normalizeEditableHtml(el.innerHTML)
        });
      });
    };
    var finish = function(commit) {
      if (done) return;
      done = true;
      if (draftRaf) {
        cancelAnimationFrame(draftRaf);
        draftRaf = 0;
      }
      el.removeEventListener('blur', onBlur, true);
      el.removeEventListener('keydown', onKeyDown, true);
      el.removeEventListener('input', onInput, true);
      el.removeAttribute('contenteditable');
      el.removeAttribute('data-nx-inline-editing');
      el.classList.remove('__nx-preview-editing');
      __previewEditingEl = null;
      if (commit) {
        postPreviewMessage('PREVIEW_INLINE_EDIT', {
          path: path,
          html: normalizeEditableHtml(el.innerHTML)
        });
      }
    };

    var onBlur = function() {
      finish(true);
    };
    var onKeyDown = function(event) {
      if (!event) return;
      if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        insertLineBreakAtCursor();
        scheduleDraftSync();
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    };
    var onInput = function() {
      scheduleDraftSync();
    };

    el.addEventListener('blur', onBlur, true);
    el.addEventListener('keydown', onKeyDown, true);
    el.addEventListener('input', onInput, true);
  }

  function emitPathChanged() {
    postPreviewMessage('PREVIEW_PATH_CHANGED', {
      path: window.location.pathname || ''
    });
  }

  try {
    syncModeFromHost();
    if (!document.querySelector('style[data-preview-inline-editor]')) {
      var __previewStyle = document.createElement('style');
      __previewStyle.setAttribute('data-preview-inline-editor', 'true');
      __previewStyle.textContent =
        '.__nx-preview-selected{outline:2px solid rgba(14,165,233,0.95)!important;outline-offset:1px;}' +
        '.__nx-preview-editing{outline:2px dashed rgba(249,115,22,0.95)!important;outline-offset:1px;}' +
        '.__nx-preview-image-candidate{outline:2px solid rgba(245,158,11,0.92)!important;outline-offset:1px;}' +
        '.__nx-preview-css-candidate{outline:1px solid rgba(56,189,248,0.65)!important;outline-offset:0px;}' +
        '.__nx-preview-dirty{box-shadow:inset 0 0 0 2px rgba(245,158,11,0.95)!important;}' +
        '.__nx-draw-new{outline:2px dashed rgba(99,102,241,0.85)!important;outline-offset:0!important;}' +
        '[data-preview-draw-draft="true"]{position:fixed;z-index:2147483645;pointer-events:none;border:2px dashed rgba(250,204,21,0.95);background:rgba(250,204,21,0.18);border-radius:6px;box-shadow:0 0 0 1px rgba(234,179,8,0.7);}'+
        '[data-preview-hover-outline="true"]{position:fixed;z-index:2147483646;pointer-events:none;border:3px solid rgba(16,185,129,0.98);background:rgba(16,185,129,0.12);border-radius:8px;box-shadow:0 0 0 1px rgba(5,150,105,0.9),0 12px 28px rgba(0,0,0,0.28);transition:left .14s cubic-bezier(.2,.8,.2,1),top .14s cubic-bezier(.2,.8,.2,1),width .14s cubic-bezier(.2,.8,.2,1),height .14s cubic-bezier(.2,.8,.2,1),opacity .12s ease;}' +
        '[data-preview-hover-badge="true"]{position:fixed;z-index:2147483647;pointer-events:none;background:rgba(2,6,23,0.99);color:#ecfeff;border:3px solid rgba(34,211,238,0.95);font:800 20px/1.3 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,Liberation Mono,Courier New,monospace;letter-spacing:.2px;padding:12px 16px;border-radius:12px;white-space:nowrap;max-width:94vw;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 0 rgba(0,0,0,0.45);box-shadow:0 16px 32px rgba(2,6,23,0.6);}' +
        '[data-nx-inline-editing="true"]{cursor:text!important;}' +
        '@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}' +
        '@keyframes slideUp{from{transform:translateY(20px);opacity:0;}to{transform:translateY(0);opacity:1;}}' +
        '@keyframes zoomIn{from{transform:scale(0.8);opacity:0;}to{transform:scale(1);opacity:1;}}' +
        '@keyframes bounce{0%,100%{transform:translateY(0);}50%{transform:translateY(-10px);}}' +
        '@keyframes pulse{0%{opacity:1;}50%{opacity:.5;}100%{opacity:1;}}' +
        '@keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}' +
        '@keyframes flip{0%{transform:perspective(400px) rotateY(90deg);opacity:0;}100%{transform:perspective(400px) rotateY(0deg);opacity:1;}}' +
        '@keyframes wiggle{0%,100%{transform:rotate(-3deg);}50%{transform:rotate(3deg);}}' +
        '@keyframes revealScroll{from{opacity:0;transform:translateY(30px);}to{opacity:1;transform:translateY(0);}}';
      if (document.head) document.head.appendChild(__previewStyle);
    }
  } catch (e) {}

  window.addEventListener('message', function(event) {
    var payload = event && event.data;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        return;
      }
    }
    if (!payload || !payload.type) return;
    if (payload.type === 'PREVIEW_SET_MODE') {
      var nextMode = payload.mode === 'preview' ? 'preview' : 'edit';
      __previewSelectionMode = normalizeSelectionMode(payload.selectionMode);
      __previewToolMode = normalizeToolMode(payload.toolMode);
      __previewDrawTag = normalizeDrawTag(payload.drawTag);
      __previewMode = nextMode;
      // Clear temporary draw-highlight and selection state
      // whenever the user switches away from draw mode.
      if (__previewToolMode !== 'draw') {
        var drawNewEls = document.querySelectorAll('.__nx-draw-new');
        for (var di = 0; di < drawNewEls.length; di++) {
          drawNewEls[di].classList.remove('__nx-draw-new');
        }
        // Also clear the element selection outline — the drawn element should not
        // remain highlighted with the blue border after you switch tools.
        clearPreviewSelection();
        clearPreviewHover();
      }
      if (nextMode !== 'edit') {
        __previewMoveDrag = null;
        __previewDrawState = null;
        if (__previewDrawDraft) {
          __previewDrawDraft.style.display = 'none';
        }
        if (document.body) {
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
        }
      }
      if (nextMode !== 'edit') {
        clearPreviewSelection();
        clearPreviewHover();
        applySelectionModeDecorations();
      } else {
        applySelectionModeDecorations();
        requestHoverUpdate();
      }
      return;
    }
    if (payload.type === 'PREVIEW_APPLY_STYLE') {
      var target = null;
      if (payload.path && payload.path.length) {
        target = readElementByPath(payload.path);
      }
      if (!target && __previewSelectedEl && document.body && document.body.contains(__previewSelectedEl)) {
        target = __previewSelectedEl;
      }
      if (!target) {
        target = document.querySelector('.__nx-preview-selected');
      }
      if (target) {
        applyStylePatchToElement(target, payload.styles);
      }
    }
    if (payload.type === 'PREVIEW_INJECT_ELEMENT') {
      var injectParentPath = payload.parentPath;
      var injectTag = typeof payload.tag === 'string' ? payload.tag : 'div';
      var injectStyles = payload.styles || {};
      var injectIndex = typeof payload.index === 'number' ? payload.index : -1;
      var injectParent = null;
      if (Array.isArray(injectParentPath) && injectParentPath.length > 0) {
        injectParent = readElementByPath(injectParentPath);
      }
      if (!injectParent) injectParent = document.body;
      if (!injectParent) return;
      // Ensure the parent is positioned so absolute children are visible
      if (injectParent !== document.body) {
        var computedParentPos = window.getComputedStyle(injectParent).position;
        if (!computedParentPos || computedParentPos === 'static') {
          injectParent.style.position = 'relative';
        }
      }
      var newEl = document.createElement(injectTag);
      applyStylePatchToElement(newEl, injectStyles);
      // Default visual so empty divs are visible
      var lowerInjectTag = injectTag.toLowerCase();
      if (lowerInjectTag === 'img') {
        newEl.setAttribute('src', 'https://picsum.photos/420/260');
        newEl.setAttribute('alt', 'Image');
      } else if (lowerInjectTag === 'p' || lowerInjectTag === 'span' || lowerInjectTag === 'button' || lowerInjectTag === 'h1' || lowerInjectTag === 'h2' || lowerInjectTag === 'h3') {
        newEl.textContent = 'New Text';
      } else if (lowerInjectTag === 'div' || lowerInjectTag === 'section' || lowerInjectTag === 'article' || lowerInjectTag === 'aside' || lowerInjectTag === 'main' || lowerInjectTag === 'header' || lowerInjectTag === 'footer' || lowerInjectTag === 'nav') {
        // Apply temporary highlight class — no inline styles saved to HTML.
        newEl.classList.add('__nx-draw-new');
      }
      // Insert at the correct child index
      var refSibling = injectIndex >= 0 ? (injectParent.children[injectIndex] || null) : null;
      injectParent.insertBefore(newEl, refSibling);
      // Transfer selection to this new element
      var prevSelected = document.querySelectorAll('.__nx-preview-selected');
      for (var si = 0; si < prevSelected.length; si++) {
        prevSelected[si].classList.remove('__nx-preview-selected');
      }
      __previewSelectedEl = newEl;
      newEl.classList.add('__nx-preview-selected');
      newEl.classList.add('__nx-draw-new');
      // Emit a select event back to the host so the right panel syncs
      var newPath = Array.isArray(injectParentPath) ? injectParentPath.slice() : [];
      newPath.push(injectIndex >= 0 ? injectIndex : injectParent.children.length - 1);
      var computedStyles = getElementComputedStyles(newEl);
      window.parent.postMessage(JSON.stringify({
        type: 'PREVIEW_SELECT',
        path: newPath,
        tag: injectTag,
        id: newEl.id || '',
        className: newEl.className || '',
        attributes: getCustomAttributes(newEl),
        text: newEl.textContent || '',
        html: newEl.innerHTML || '',
        inlineStyle: newEl.getAttribute('style') || '',
        computedStyles: computedStyles
      }), '*');
    }
    if (payload.type === 'PREVIEW_APPLY_HTML' && payload.html) {
      if (document.body) document.body.innerHTML = payload.html;
      return;
    }
    if (payload.type === 'PREVIEW_GLOBAL_REPLACE' && payload.search) {
      if (!document.body) return;
      // Do a simple html replacement, same as the server
      const htmlTokens = document.body.innerHTML.split(payload.search);
      if (htmlTokens.length > 1) {
        document.body.innerHTML = htmlTokens.join(payload.replace || '');
      } else {
        // Fallback: full reload if we couldn't easily patch it
        location.reload();
      }
      return;
    }
  });

  try {
    var __PUSH = history.pushState ? history.pushState.bind(history) : null;
    if (__PUSH) {
      history.pushState = function() {
        var result = __PUSH.apply(history, arguments);
        emitPathChanged();
        return result;
      };
    }
    var __REPLACE = history.replaceState ? history.replaceState.bind(history) : null;
    if (__REPLACE) {
      history.replaceState = function() {
        var result = __REPLACE.apply(history, arguments);
        emitPathChanged();
        return result;
      };
    }
    window.addEventListener('popstate', emitPathChanged);
    window.addEventListener('hashchange', emitPathChanged);
    setTimeout(emitPathChanged, 0);
  } catch (e) {}

  function isInsideInlineEditor(target) {
    if (!__previewEditingEl || !target || !target.nodeType) return false;
    return target === __previewEditingEl || (__previewEditingEl.contains && __previewEditingEl.contains(target));
  }

  function swallowInteraction(event) {
    if (!isPreviewEditMode()) return;
    if (__previewToolMode === 'move' || __previewToolMode === 'draw') return;
    if (!event) return;
    var target = event.target;
    if (isInsideInlineEditor(target)) return;
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    event.stopPropagation();
    if (event.cancelable) {
      event.preventDefault();
    }
  }

  var __BLOCK_INTERACTION_EVENTS = [
    'touchstart',
    'touchmove',
    'touchend',
    'mousedown',
    'mouseup',
    'pointerdown',
    'pointermove',
    'pointerup',
    'dragstart',
    'wheel'
  ];
  for (var __blockIdx = 0; __blockIdx < __BLOCK_INTERACTION_EVENTS.length; __blockIdx++) {
    document.addEventListener(__BLOCK_INTERACTION_EVENTS[__blockIdx], swallowInteraction, true);
  }

  var __NAV_KEYS = {
    ArrowLeft: true,
    ArrowRight: true,
    ArrowUp: true,
    ArrowDown: true,
    PageUp: true,
    PageDown: true,
    Home: true,
    End: true,
    ' ': true,
    Spacebar: true
  };
  document.addEventListener('keydown', function(event) {
    if (!isPreviewEditMode()) return;
    if (!event) return;
    if (isInsideInlineEditor(event.target)) return;
    var key = event.key || '';
    if (!__NAV_KEYS[key]) return;
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    event.stopPropagation();
    if (event.cancelable) {
      event.preventDefault();
    }
  }, true);

  document.addEventListener('keydown', function(event) {
    if (!event) return;
    var key = String(event.key || '').toLowerCase();
    var code = String(event.code || '');
    if (!key) return;
    var hasModifier = !!(event.ctrlKey || event.metaKey);
    var editableTarget = isInsideInlineEditor(event.target);
    var target = event.target;
    var targetTag =
      target && target.tagName ? String(target.tagName).toLowerCase() : '';
    if (!editableTarget) {
      editableTarget =
        !!(target && target.isContentEditable) ||
        targetTag === 'input' ||
        targetTag === 'textarea' ||
        targetTag === 'select';
    }

    var shouldForward = false;
    if (editableTarget) {
      shouldForward =
        hasModifier &&
        (key === 's' ||
          key === 'p' ||
          key === 't' ||
          key === 'f' ||
          key === 'e' ||
          key === 'k' ||
          code === 'Backquote');
    } else if (key === 'escape') {
      shouldForward = true;
    } else if (!hasModifier && !event.altKey && (key === 'w' || key === 'e')) {
      shouldForward = true;
    } else if (
      hasModifier &&
      (key === 'k' ||
        key === 'f' ||
        key === 'p' ||
        key === 'e' ||
        code === 'Backquote' ||
        key === 'j' ||
        key === 's' ||
        key === 't' ||
        key === 'z' ||
        key === 'u' ||
        key === 'y')
    ) {
      shouldForward = true;
    }
    if (!shouldForward) return;

    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    event.stopPropagation();
    if (event.cancelable) event.preventDefault();
    postPreviewMessage('PREVIEW_HOTKEY', {
      key: key,
      code: code,
      ctrlKey: !!event.ctrlKey,
      metaKey: !!event.metaKey,
      shiftKey: !!event.shiftKey,
      altKey: !!event.altKey,
      editable: editableTarget
    });
  }, true);

  function ensureDrawDraftElement() {
    if (__previewDrawDraft && document.body && document.body.contains(__previewDrawDraft)) {
      return __previewDrawDraft;
    }
    if (!document.body) return null;
    var draft = document.createElement('div');
    draft.setAttribute('data-preview-draw-draft', 'true');
    draft.style.display = 'none';
    document.body.appendChild(draft);
    __previewDrawDraft = draft;
    return draft;
  }

  document.addEventListener('mousedown', function(event) {
    if (!isPreviewEditMode()) return;
    if (!event || event.button !== 0) return;
    if (__previewEditingEl) return;
    var target = event.target;
    if (__previewToolMode === 'move') {
      var selected = getPreviewSelectableTarget(target, event);
      if (!selected) return;
      var path = getPreviewElementPath(selected);
      if (!path || !path.length) return;
      var parent = selected.offsetParent || selected.parentElement;
      if (!parent || !parent.getBoundingClientRect) return;
      var parentRect = parent.getBoundingClientRect();
      var selectedRect = selected.getBoundingClientRect();
      var computed = window.getComputedStyle(selected);
      var parsedLeft = parseFloat(computed.left || '');
      var parsedTop = parseFloat(computed.top || '');
      var startLeft = isFinite(parsedLeft) ? parsedLeft : (selectedRect.left - parentRect.left + parent.scrollLeft);
      var startTop = isFinite(parsedTop) ? parsedTop : (selectedRect.top - parentRect.top + parent.scrollTop);
      var currentPosition = String(computed.position || '').toLowerCase();
      var lockSize = !(currentPosition === 'absolute' || currentPosition === 'fixed');
      __previewMoveDrag = {
        element: selected,
        path: path,
        parent: parent,
        parentRect: parentRect,
        parentScrollLeft: parent.scrollLeft || 0,
        parentScrollTop: parent.scrollTop || 0,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startLeft: startLeft,
        startTop: startTop,
        latestLeft: startLeft,
        latestTop: startTop,
        width: selectedRect.width || selected.offsetWidth || 0,
        height: selectedRect.height || selected.offsetHeight || 0,
        lockSize: lockSize,
        hasDragged: false
      };
      selectPreviewElement(selected);
      if (document.body) {
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
      }
      selected.style.cursor = 'grabbing';
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
      return;
    }
    if (__previewToolMode === 'draw') {
      var parentTarget = getPreviewSelectableTarget(target, event);
      if (!parentTarget) parentTarget = document.body;
      if (!parentTarget || parentTarget === document.documentElement) parentTarget = document.body;
      var parentPath = parentTarget === document.body ? [] : (getPreviewElementPath(parentTarget) || []);
      var parentRectForDraw = parentTarget.getBoundingClientRect ? parentTarget.getBoundingClientRect() : null;
      if (!parentRectForDraw) return;
      var startX = event.clientX - parentRectForDraw.left + (parentTarget.scrollLeft || 0);
      var startY = event.clientY - parentRectForDraw.top + (parentTarget.scrollTop || 0);
      __previewDrawState = {
        parent: parentTarget,
        parentPath: parentPath,
        parentRect: parentRectForDraw,
        startX: startX,
        startY: startY,
        latestX: startX,
        latestY: startY
      };
      var draft = ensureDrawDraftElement();
      if (draft) {
        draft.style.display = 'block';
        draft.style.left = Math.round(event.clientX) + 'px';
        draft.style.top = Math.round(event.clientY) + 'px';
        draft.style.width = '0px';
        draft.style.height = '0px';
      }
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
    }
  }, true);

  document.addEventListener('mousemove', function(event) {
    if (!isPreviewEditMode()) return;
    if (__previewMoveDrag) {
      var drag = __previewMoveDrag;
      var dx = event.clientX - drag.startClientX;
      var dy = event.clientY - drag.startClientY;
      if (!drag.hasDragged && Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        return;
      }
      if (!drag.hasDragged) {
        drag.hasDragged = true;
        drag.element.style.position = 'absolute';
        drag.element.style.left = Math.round(drag.startLeft) + 'px';
        drag.element.style.top = Math.round(drag.startTop) + 'px';
        if (drag.lockSize) {
          drag.element.style.width = Math.round(drag.width) + 'px';
          drag.element.style.height = Math.round(drag.height) + 'px';
        }
      }
      var maxLeft = Math.max(0, (drag.parent.clientWidth || drag.parentRect.width) - drag.width);
      var maxTop = Math.max(0, (drag.parent.clientHeight || drag.parentRect.height) - drag.height);
      var nextLeft = Math.max(0, Math.min(maxLeft, drag.startLeft + dx));
      var nextTop = Math.max(0, Math.min(maxTop, drag.startTop + dy));
      drag.latestLeft = nextLeft;
      drag.latestTop = nextTop;
      drag.element.style.left = Math.round(nextLeft) + 'px';
      drag.element.style.top = Math.round(nextTop) + 'px';
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
      return;
    }
    if (__previewDrawState) {
      var draw = __previewDrawState;
      var parentRectNow = draw.parent.getBoundingClientRect ? draw.parent.getBoundingClientRect() : draw.parentRect;
      if (!parentRectNow) return;
      var currentX = event.clientX - parentRectNow.left + (draw.parent.scrollLeft || 0);
      var currentY = event.clientY - parentRectNow.top + (draw.parent.scrollTop || 0);
      draw.latestX = currentX;
      draw.latestY = currentY;
      var leftInParent = Math.min(draw.startX, currentX);
      var topInParent = Math.min(draw.startY, currentY);
      var widthInParent = Math.abs(currentX - draw.startX);
      var heightInParent = Math.abs(currentY - draw.startY);
      var draftBox = ensureDrawDraftElement();
      if (draftBox) {
        draftBox.style.display = 'block';
        draftBox.style.left = Math.round(parentRectNow.left - (draw.parent.scrollLeft || 0) + leftInParent) + 'px';
        draftBox.style.top = Math.round(parentRectNow.top - (draw.parent.scrollTop || 0) + topInParent) + 'px';
        draftBox.style.width = Math.round(widthInParent) + 'px';
        draftBox.style.height = Math.round(heightInParent) + 'px';
      }
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
    }
  }, true);

  document.addEventListener('mouseup', function(event) {
    if (__previewMoveDrag) {
      var drag = __previewMoveDrag;
      __previewMoveDrag = null;
      if (document.body) {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
      drag.element.style.cursor = 'grab';
      if (drag.hasDragged && drag.path && drag.path.length) {
        var moveStyles = {
          position: 'absolute',
          left: Math.round(drag.latestLeft) + 'px',
          top: Math.round(drag.latestTop) + 'px'
        };
        if (drag.lockSize) {
          moveStyles.width = Math.round(drag.width) + 'px';
          moveStyles.height = Math.round(drag.height) + 'px';
        }
        postPreviewMessage('PREVIEW_MOVE_COMMIT', {
          path: drag.path,
          styles: moveStyles
        });
      }
      if (event) {
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        event.stopPropagation();
        if (event.cancelable) event.preventDefault();
      }
      return;
    }
    if (__previewDrawState) {
      var draw = __previewDrawState;
      __previewDrawState = null;
      var draft = ensureDrawDraftElement();
      if (draft) draft.style.display = 'none';
      var left = Math.min(draw.startX, draw.latestX);
      var top = Math.min(draw.startY, draw.latestY);
      var width = Math.abs(draw.latestX - draw.startX);
      var height = Math.abs(draw.latestY - draw.startY);
      if (width >= 6 && height >= 6) {
        postPreviewMessage('PREVIEW_DRAW_CREATE', {
          parentPath: draw.parentPath || [],
          tag: __previewDrawTag,
          styles: {
            position: 'absolute',
            left: Math.round(left) + 'px',
            top: Math.round(top) + 'px',
            width: Math.round(width) + 'px',
            height: Math.round(height) + 'px',
            zIndex: '50'
          }
        });
      }
      if (event) {
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        event.stopPropagation();
        if (event.cancelable) event.preventDefault();
      }
    }
  }, true);

  document.addEventListener('click', function(event) {
    if (!isPreviewEditMode()) return;
    if (__previewToolMode === 'move' || __previewToolMode === 'draw') return;
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    event.stopPropagation();
    var target = event && event.target;
    var selected = getPreviewSelectableTarget(target, event);
    if (selected) {
      selectPreviewElement(selected);
    }

    if (__previewEditingEl) return;
    if (!target || !target.closest) return;
    if (event.detail && event.detail > 1) return;
    var anchor = target.closest('a[href]');
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener('mousemove', function(event) {
    if (!isPreviewEditMode()) return;
    if (__previewToolMode === 'move' || __previewToolMode === 'draw') return;
    if (__previewEditingEl) return;
    var target = event && event.target;
    var hovered = getPreviewSelectableTarget(target, event);
    setPreviewHover(hovered || null);
  }, true);

  document.addEventListener('mouseleave', function() {
    clearPreviewHover();
  }, true);
  window.addEventListener('scroll', requestHoverUpdate, true);
  window.addEventListener('resize', requestHoverUpdate, true);

  document.addEventListener('dblclick', function(event) {
    if (!isPreviewEditMode()) return;
    if (__previewToolMode === 'move' || __previewToolMode === 'draw') return;
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    event.stopPropagation();
    var target = event && event.target;
    if (__previewEditingEl) {
      if (
        target &&
        (__previewEditingEl === target ||
          (__previewEditingEl.contains && __previewEditingEl.contains(target)))
      ) {
        return;
      }
      try { __previewEditingEl.blur(); } catch (e) {}
    }
    var selected = getPreviewSelectableTarget(target, event);
    if (!selected || !canInlineEdit(selected)) return;
    event.preventDefault();
    event.stopPropagation();
    clearPreviewHover();
    beginInlineEdit(selected);
  }, true);
})();
`;

const toCssPropertyName = (key: string): string =>
  key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

const parseNumericCssValue = (value: unknown): number | null => {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const CSS_GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "emoji",
  "math",
  "fangsong",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

const normalizeFontFamilyCssValue = (raw: string): string => {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (trimmed.includes(",")) return trimmed;
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed;
  }
  if (CSS_GENERIC_FONT_FAMILIES.has(trimmed.toLowerCase())) return trimmed;
  if (/\s/.test(trimmed)) {
    return `'${trimmed.replace(/'/g, "\\'")}'`;
  }
  return trimmed;
};

const readElementByPath = (root: Element, path: number[]): Element | null => {
  let cursor: Element | null = root;
  for (const step of path) {
    if (!cursor) return null;
    const childElements: Element[] = Array.from(cursor.children);
    cursor = childElements[step] ?? null;
  }
  return cursor;
};

const normalizePreviewPath = (rawPath: unknown): number[] | null => {
  if (!Array.isArray(rawPath)) return null;
  const normalized = rawPath
    .map((segment) => Number(segment))
    .filter((segment) => Number.isFinite(segment))
    .map((segment) => Math.max(0, Math.trunc(segment)));
  if (normalized.length !== rawPath.length) return null;
  return normalized;
};

const toPreviewLayerId = (path: number[]): string =>
  `${PREVIEW_LAYER_ID_PREFIX}${path.join(".")}`;

const fromPreviewLayerId = (id: string): number[] | null => {
  if (!id.startsWith(PREVIEW_LAYER_ID_PREFIX)) return null;
  const raw = id.slice(PREVIEW_LAYER_ID_PREFIX.length).trim();
  if (!raw) return null;
  const parts = raw.split(".").map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0)) return null;
  return parts;
};

const parseInlineStyleText = (styleText: string): React.CSSProperties => {
  const styles: Record<string, string> = {};
  if (!styleText) return styles as React.CSSProperties;
  const entries = styleText
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const entry of entries) {
    const colonIndex = entry.indexOf(":");
    if (colonIndex <= 0) continue;
    const rawKey = entry.slice(0, colonIndex).trim();
    const rawValue = entry.slice(colonIndex + 1).trim();
    if (!rawKey) continue;
    const camelKey = rawKey.replace(/-([a-z])/g, (_all, c: string) =>
      c.toUpperCase(),
    );
    styles[camelKey] = rawValue;
  }
  return styles as React.CSSProperties;
};

const extractComputedStylesFromElement = (
  element: Element | null,
): React.CSSProperties | null => {
  if (!element || !(element instanceof HTMLElement)) return null;
  const computed = window.getComputedStyle(element);
  const out: Record<string, string> = {};
  for (let i = 0; i < computed.length; i += 1) {
    const key = computed[i];
    const value = computed.getPropertyValue(key);
    if (!value) continue;
    const camelKey = key.replace(/-([a-z])/g, (_all, c: string) =>
      c.toUpperCase(),
    );
    out[camelKey] = value;
  }
  return out as React.CSSProperties;
};

const RESERVED_ATTRIBUTE_NAMES = new Set([
  "id",
  "class",
  "style",
  "src",
  "href",
]);

const extractCustomAttributesFromElement = (
  element: Element | null,
): Record<string, string> | undefined => {
  if (!element || !element.attributes) return undefined;
  const out: Record<string, string> = {};
  const attrs = element.attributes;
  for (let index = 0; index < attrs.length; index += 1) {
    const attr = attrs.item(index);
    if (!attr || !attr.name) continue;
    if (RESERVED_ATTRIBUTE_NAMES.has(attr.name.toLowerCase())) continue;
    out[attr.name] = attr.value ?? "";
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

const normalizeEditorMultilineText = (raw: string): string => {
  const normalized = raw.replace(/\r\n?/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim());

  let start = 0;
  let end = lines.length - 1;
  while (start <= end && !lines[start]) start += 1;
  while (end >= start && !lines[end]) end -= 1;
  if (start > end) return "";

  const compacted: string[] = [];
  let previousEmpty = false;
  for (const line of lines.slice(start, end + 1)) {
    const isEmpty = line.length === 0;
    if (isEmpty && previousEmpty) continue;
    compacted.push(line);
    previousEmpty = isEmpty;
  }
  return compacted.join("\n");
};

const extractTextWithBreaks = (element: Element | null): string => {
  if (!element) return "";
  let out = "";
  const normalizeExtractedTextNode = (raw: string): string => {
    if (!raw) return "";
    const normalized = raw.replace(/\r\n?/g, "\n");
    if (normalized.trim().length === 0) {
      // Keep inline spacing, drop formatting-only line breaks from pretty HTML.
      return /[\n\r]/.test(normalized) ? "" : " ";
    }
    const lines = normalized
      .split("\n")
      .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim());
    const nonEmptyCount = lines.reduce(
      (count, line) => count + (line.length > 0 ? 1 : 0),
      0,
    );
    if (nonEmptyCount <= 1) {
      return normalized.replace(/[ \t\f\v]+/g, " ").trim();
    }
    return lines.join("\n");
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += normalizeExtractedTextNode(node.textContent || "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.tagName.toLowerCase() === "br") {
      out += "\n";
      return;
    }
    Array.from(el.childNodes).forEach(walk);
  };
  Array.from(element.childNodes).forEach(walk);
  return normalizeEditorMultilineText(out);
};

const extractTextFromHtmlFragment = (html: string): string => {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(
    `<div>${html || ""}</div>`,
    "text/html",
  );
  const root = parsed.body.firstElementChild;
  if (!root) return "";
  return extractTextWithBreaks(root);
};

const hasRichInlineTextStructure = (element: Element): boolean => {
  const walker = element.ownerDocument.createTreeWalker(
    element,
    NodeFilter.SHOW_ELEMENT,
  );
  let current = walker.currentNode as Element | null;
  while (current) {
    if (current !== element && current.tagName.toLowerCase() !== "br") {
      return true;
    }
    current = walker.nextNode() as Element | null;
  }
  return false;
};

const collectTextNodeGroupsByBreak = (element: Element): Text[][] => {
  const groups: Text[][] = [[]];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      groups[groups.length - 1].push(node as Text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.tagName.toLowerCase() === "br") {
      groups.push([]);
      return;
    }
    Array.from(el.childNodes).forEach(walk);
  };
  Array.from(element.childNodes).forEach(walk);
  return groups;
};

const chooseTextSplitPoint = (
  value: string,
  start: number,
  ideal: number,
  maxEnd: number,
): number => {
  let end = Math.max(start, Math.min(ideal, maxEnd));
  if (end <= start || end >= value.length) return end;
  const window = 24;
  const lower = Math.max(start + 1, end - window);
  const upper = Math.min(maxEnd, end + window);
  for (let offset = 0; offset <= window; offset += 1) {
    const right = end + offset;
    if (
      right <= upper &&
      right > start &&
      /\s/.test(value.charAt(right - 1) || "")
    ) {
      return right;
    }
    const left = end - offset;
    if (
      left >= lower &&
      left > start &&
      /\s/.test(value.charAt(left - 1) || "")
    ) {
      return left;
    }
  }
  return end;
};

const distributeTextAcrossNodes = (nodes: Text[], value: string): void => {
  if (!nodes.length) return;
  if (nodes.length === 1) {
    nodes[0].textContent = value;
    return;
  }
  const oldLengths = nodes.map((node) => (node.textContent || "").length);
  const totalOldLength = oldLengths.reduce((sum, len) => sum + len, 0) || 1;
  let cursor = 0;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (index === nodes.length - 1) {
      node.textContent = value.slice(cursor);
      break;
    }
    const remainingNodes = nodes.length - index - 1;
    const maxEnd = Math.max(cursor, value.length - remainingNodes);
    const proportional = Math.round(
      (oldLengths[index] / totalOldLength) * value.length,
    );
    const ideal = cursor + proportional;
    const split = chooseTextSplitPoint(value, cursor, ideal, maxEnd);
    node.textContent = value.slice(cursor, split);
    cursor = split;
  }
};

const applyMultilineTextToElement = (element: Element, text: string): void => {
  const normalizedInput = text.replace(/\r\n?/g, "\n");
  if (hasRichInlineTextStructure(element)) {
    const groups = collectTextNodeGroupsByBreak(element);
    const allNodes = groups.flat();
    if (allNodes.length > 0) {
      const rawLines = normalizedInput.split("\n");
      const normalizedLines =
        groups.length > 0 && rawLines.length > groups.length
          ? [
            ...rawLines.slice(0, groups.length - 1),
            rawLines.slice(groups.length - 1).join(" "),
          ]
          : rawLines;
      for (let index = 0; index < groups.length; index += 1) {
        const line = normalizedLines[index] ?? "";
        distributeTextAcrossNodes(groups[index], line);
      }
      return;
    }
  }

  const normalized = normalizeEditorMultilineText(normalizedInput);
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
  const lines = normalized.split("\n");
  lines.forEach((line, index) => {
    element.appendChild(element.ownerDocument.createTextNode(line));
    if (index < lines.length - 1) {
      element.appendChild(element.ownerDocument.createElement("br"));
    }
  });
};

type PreviewHistoryEntry = {
  past: string[];
  present: string;
  future: string[];
};

const addElementToTree = (
  root: VirtualElement,
  parentId: string,
  newElement: VirtualElement,
  position: "inside" | "before" | "after" = "inside",
): VirtualElement => {
  if (root.id === parentId && position === "inside") {
    return { ...root, children: [...root.children, newElement] };
  }
  if (
    root.children.some((child) => child.id === parentId) &&
    position !== "inside"
  ) {
    const targetIndex = root.children.findIndex(
      (child) => child.id === parentId,
    );
    const newChildren = [...root.children];
    if (position === "before") newChildren.splice(targetIndex, 0, newElement);
    else newChildren.splice(targetIndex + 1, 0, newElement);
    return { ...root, children: newChildren };
  }
  let didChange = false;
  const nextChildren = root.children.map((child) => {
    const updatedChild = addElementToTree(
      child,
      parentId,
      newElement,
      position,
    );
    if (updatedChild !== child) {
      didChange = true;
    }
    return updatedChild;
  });
  if (!didChange) return root;
  return { ...root, children: nextChildren };
};

const TOOLBOX_DRAG_MIME = "application/x-nocodex-element";
const hasToolboxDragType = (dataTransfer: DataTransfer | null): boolean => {
  if (!dataTransfer) return false;
  const types = Array.from(dataTransfer.types || []);
  return (
    types.includes(TOOLBOX_DRAG_MIME) ||
    types.includes("text/plain") ||
    types.includes("Text")
  );
};

const getToolboxDragPayload = (dataTransfer: DataTransfer | null): string => {
  if (!dataTransfer) return "";
  return (
    dataTransfer.getData(TOOLBOX_DRAG_MIME) ||
    dataTransfer.getData("text/plain") ||
    dataTransfer.getData("Text") ||
    ""
  );
};

const createPresetIdFactory = (
  prefix: string,
): ((segment: string) => string) => {
  const base = `${prefix.replace(/[^a-z0-9_-]/gi, "-")}-${Date.now()}`;
  let counter = 0;
  return (segment: string) => {
    counter += 1;
    return `${base}-${segment}-${counter}`;
  };
};

const createVirtualNode = (
  id: string,
  type: string,
  name: string,
  styles: React.CSSProperties,
  options?: {
    content?: string;
    className?: string;
    attributes?: Record<string, string>;
    children?: VirtualElement[];
    styles?: React.CSSProperties;
    src?: string;
  },
): VirtualElement => ({
  id,
  type,
  name,
  styles,
  children: options?.children || [],
  ...(options?.content !== undefined ? { content: options.content } : {}),
  ...(options?.className ? { className: options.className } : {}),
  ...(options?.attributes ? { attributes: options.attributes } : {}),
  ...(options?.styles ? { styles: { ...styles, ...options.styles } } : {}),
  ...(options?.src ? { src: options.src } : {}),
});

const buildPresetElement = (
  presetType: string,
  idFor: (segment: string) => string,
): VirtualElement | null => {
  if (presetType === "preset:carousel") {
    return createVirtualNode(
      idFor("carousel"),
      "section",
      "Carousel",
      {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        width: "min(860px, 100%)",
        minHeight: "260px",
        padding: "14px",
        borderRadius: "14px",
        border: "1px solid rgba(14,165,233,0.35)",
        background:
          "linear-gradient(180deg, rgba(2,6,23,0.9), rgba(15,23,42,0.86))",
        boxShadow: "0 18px 40px rgba(2,6,23,0.45)",
        overflow: "hidden",
      },
      {
        children: [
          createVirtualNode(
            idFor("header"),
            "div",
            "Carousel Header",
            {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "#e2e8f0",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            },
            { content: "Featured Carousel  •  3 Slides" },
          ),
          createVirtualNode(
            idFor("track"),
            "div",
            "Carousel Track",
            {
              display: "flex",
              gap: "12px",
              overflowX: "auto",
              padding: "4px 2px 8px",
              scrollSnapType: "x mandatory",
            },
            {
              children: [
                createVirtualNode(
                  idFor("card-a"),
                  "div",
                  "Slide Card",
                  {
                    minWidth: "280px",
                    height: "170px",
                    borderRadius: "12px",
                    background:
                      "linear-gradient(135deg, rgba(34,211,238,0.55), rgba(59,130,246,0.55))",
                    color: "#0f172a",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "flex-start",
                    padding: "16px",
                    scrollSnapAlign: "start",
                    fontWeight: 800,
                    fontSize: "20px",
                    boxShadow: "0 12px 24px rgba(14,116,144,0.35)",
                  },
                  { content: "Slide 1" },
                ),
                createVirtualNode(
                  idFor("card-b"),
                  "div",
                  "Slide Card",
                  {
                    minWidth: "280px",
                    height: "170px",
                    borderRadius: "12px",
                    background:
                      "linear-gradient(135deg, rgba(167,139,250,0.62), rgba(99,102,241,0.6))",
                    color: "#fff",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "flex-start",
                    padding: "16px",
                    scrollSnapAlign: "start",
                    fontWeight: 800,
                    fontSize: "20px",
                    boxShadow: "0 12px 24px rgba(91,33,182,0.35)",
                  },
                  { content: "Slide 2" },
                ),
                createVirtualNode(
                  idFor("card-c"),
                  "div",
                  "Slide Card",
                  {
                    minWidth: "280px",
                    height: "170px",
                    borderRadius: "12px",
                    background:
                      "linear-gradient(135deg, rgba(16,185,129,0.58), rgba(20,184,166,0.56))",
                    color: "#06281f",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "flex-start",
                    padding: "16px",
                    scrollSnapAlign: "start",
                    fontWeight: 800,
                    fontSize: "20px",
                    boxShadow: "0 12px 24px rgba(6,95,70,0.35)",
                  },
                  { content: "Slide 3" },
                ),
              ],
            },
          ),
          createVirtualNode(
            idFor("dots"),
            "div",
            "Carousel Indicators",
            {
              display: "flex",
              alignItems: "center",
              gap: "8px",
              justifyContent: "center",
            },
            {
              children: [
                createVirtualNode(
                  idFor("dot-1"),
                  "span",
                  "Dot",
                  {
                    width: "9px",
                    height: "9px",
                    display: "inline-block",
                    borderRadius: "999px",
                    backgroundColor: "rgba(56,189,248,0.95)",
                  },
                ),
                createVirtualNode(
                  idFor("dot-2"),
                  "span",
                  "Dot",
                  {
                    width: "9px",
                    height: "9px",
                    display: "inline-block",
                    borderRadius: "999px",
                    backgroundColor: "rgba(148,163,184,0.55)",
                  },
                ),
                createVirtualNode(
                  idFor("dot-3"),
                  "span",
                  "Dot",
                  {
                    width: "9px",
                    height: "9px",
                    display: "inline-block",
                    borderRadius: "999px",
                    backgroundColor: "rgba(148,163,184,0.55)",
                  },
                ),
              ],
            },
          ),
          createVirtualNode(
            idFor("nav-prev"),
            "button",
            "Carousel Prev",
            {
              position: "absolute",
              left: "8px",
              top: "50%",
              transform: "translateY(-50%)",
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              border: "1px solid rgba(148,163,184,0.45)",
              backgroundColor: "rgba(15,23,42,0.7)",
              color: "#e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              zIndex: 2,
            },
            { content: "<" },
          ),
          createVirtualNode(
            idFor("nav-next"),
            "button",
            "Carousel Next",
            {
              position: "absolute",
              right: "8px",
              top: "50%",
              transform: "translateY(-50%)",
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              border: "1px solid rgba(148,163,184,0.45)",
              backgroundColor: "rgba(15,23,42,0.7)",
              color: "#e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              zIndex: 2,
            },
            { content: ">" },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:flip-card") {
    return createVirtualNode(
      idFor("flip"),
      "div",
      "Flip Card",
      {
        width: "280px",
        height: "180px",
        perspective: "1000px",
        position: "relative",
      },
      {
        children: [
          createVirtualNode(
            idFor("inner"),
            "div",
            "Flip Inner",
            {
              position: "relative",
              width: "100%",
              height: "100%",
              transformStyle: "preserve-3d",
              transition: "transform 0.6s ease",
              borderRadius: "14px",
              overflow: "hidden",
              boxShadow: "0 12px 30px rgba(2,6,23,0.16)",
            },
            {
              children: [
                createVirtualNode(
                  idFor("front"),
                  "div",
                  "Front Face",
                  {
                    position: "absolute",
                    inset: "0px",
                    background:
                      "linear-gradient(135deg, rgba(14,165,233,0.2), rgba(99,102,241,0.24))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    backfaceVisibility: "hidden",
                  },
                  { content: "Front" },
                ),
                createVirtualNode(
                  idFor("back"),
                  "div",
                  "Back Face",
                  {
                    position: "absolute",
                    inset: "0px",
                    background:
                      "linear-gradient(135deg, rgba(16,185,129,0.22), rgba(34,197,94,0.24))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    transform: "rotateY(180deg)",
                    backfaceVisibility: "hidden",
                  },
                  { content: "Back" },
                ),
              ],
            },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:scroll-reveal") {
    return createVirtualNode(
      idFor("reveal"),
      "section",
      "Scroll Reveal Block",
      {
        padding: "24px",
        borderRadius: "12px",
        backgroundColor: "#f8fafc",
        border: "1px solid rgba(148,163,184,0.3)",
      },
      {
        attributes: { "data-scroll-reveal": "true" },
        children: [
          createVirtualNode(
            idFor("title"),
            "h2",
            "Reveal Heading",
            {
              marginBottom: "8px",
              fontSize: "24px",
              fontWeight: 700,
            },
            { content: "Reveal On Scroll" },
          ),
          createVirtualNode(
            idFor("body"),
            "p",
            "Reveal Text",
            {
              fontSize: "14px",
              lineHeight: "1.6",
            },
            {
              content:
                "This block is tagged for preview scroll-reveal animations.",
            },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:drag-card") {
    return createVirtualNode(
      idFor("drag-stage"),
      "section",
      "Drag Card Stage",
      {},
      {
        className: "nx-dd-stage",
        children: [
          createVirtualNode(
            idFor("title"),
            "h2",
            "Stage Title",
            {},
            {
              className: "nx-dd-stage-title",
              content: "Drag Card Demo",
            },
          ),
          createVirtualNode(
            idFor("help"),
            "p",
            "Stage Help",
            {},
            {
              className: "nx-dd-stage-help",
              content: "Drag the card and drop it inside the target zone.",
            },
          ),
          createVirtualNode(
            idFor("card"),
            "div",
            "Draggable Card",
            {},
            {
              className: "nx-draggable-card",
              attributes: {
                draggable: "true",
                "data-nx-drag-item": idFor("drag-item"),
              },
              content: "Drag me",
            },
          ),
          createVirtualNode(
            idFor("zone"),
            "div",
            "Drop Zone",
            {},
            {
              className: "nx-drop-zone",
              attributes: {
                "data-nx-drop-zone": idFor("drop-zone"),
              },
              content: "Drop here",
            },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:drop-zone") {
    return createVirtualNode(
      idFor("file-drop"),
      "section",
      "File Drop Zone",
      {},
      {
        className: "nx-dd-stage",
        children: [
          createVirtualNode(
            idFor("title"),
            "h2",
            "Drop Zone Title",
            {},
            {
              className: "nx-dd-stage-title",
              content: "File Drop Zone",
            },
          ),
          createVirtualNode(
            idFor("zone"),
            "div",
            "File Drop",
            {},
            {
              className: "nx-file-drop",
              attributes: {
                "data-nx-file-drop": "true",
              },
              children: [
                createVirtualNode(
                  idFor("hint"),
                  "p",
                  "Drop Hint",
                  {},
                  { content: "Drop files here" },
                ),
                createVirtualNode(
                  idFor("output"),
                  "div",
                  "Drop Output",
                  {},
                  {
                    className: "nx-file-drop-output",
                    content: "No files dropped.",
                  },
                ),
              ],
            },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:sortable-list") {
    return createVirtualNode(
      idFor("sortable-stage"),
      "section",
      "Sortable List",
      {},
      {
        className: "nx-dd-stage",
        children: [
          createVirtualNode(
            idFor("title"),
            "h2",
            "Sortable Title",
            {},
            {
              className: "nx-dd-stage-title",
              content: "Sortable List",
            },
          ),
          createVirtualNode(
            idFor("help"),
            "p",
            "Sortable Help",
            {},
            {
              className: "nx-dd-stage-help",
              content: "Drag list items to reorder them.",
            },
          ),
          createVirtualNode(
            idFor("list"),
            "ul",
            "Sortable Items",
            {},
            {
              className: "nx-sortable-list",
              attributes: {
                "data-nx-sortable": "true",
              },
              children: [
                createVirtualNode(
                  idFor("item-a"),
                  "li",
                  "Sortable Item",
                  {},
                  {
                    className: "nx-sortable-item",
                    attributes: {
                      draggable: "true",
                      "data-nx-sortable-item": idFor("sortable-a"),
                    },
                    content: "Task A",
                  },
                ),
                createVirtualNode(
                  idFor("item-b"),
                  "li",
                  "Sortable Item",
                  {},
                  {
                    className: "nx-sortable-item",
                    attributes: {
                      draggable: "true",
                      "data-nx-sortable-item": idFor("sortable-b"),
                    },
                    content: "Task B",
                  },
                ),
                createVirtualNode(
                  idFor("item-c"),
                  "li",
                  "Sortable Item",
                  {},
                  {
                    className: "nx-sortable-item",
                    attributes: {
                      draggable: "true",
                      "data-nx-sortable-item": idFor("sortable-c"),
                    },
                    content: "Task C",
                  },
                ),
              ],
            },
          ),
        ],
      },
    );
  }
  return null;
};

const buildPresetElementV2 = (
  presetType: string,
  idFor: (segment: string) => string,
): VirtualElement | null => {
  if (presetType === "preset:carousel") {
    return createVirtualNode(
      idFor("carousel"),
      "section",
      "Carousel",
      {},
      {
        className: "nx-carousel",
        attributes: {
          "data-nx-carousel": "true",
          "data-nx-carousel-index": "0",
        },
        children: [
          createVirtualNode(
            idFor("header"),
            "div",
            "Carousel Header",
            {},
            {
              className: "nx-carousel-header",
              content: "Featured Carousel - 3 Slides",
            },
          ),
          createVirtualNode(
            idFor("viewport"),
            "div",
            "Carousel Viewport",
            {},
            {
              className: "nx-carousel-viewport",
              children: [
                createVirtualNode(
                  idFor("track"),
                  "div",
                  "Carousel Track",
                  {},
                  {
                    className: "nx-carousel-track",
                    attributes: { "data-nx-carousel-track": "true" },
                    children: [
                      createVirtualNode(
                        idFor("card-a"),
                        "div",
                        "Slide Card",
                        {},
                        {
                          className: "nx-carousel-slide is-a",
                          attributes: { "data-nx-carousel-slide": "true" },
                          content: "Slide 1",
                        },
                      ),
                      createVirtualNode(
                        idFor("card-b"),
                        "div",
                        "Slide Card",
                        {},
                        {
                          className: "nx-carousel-slide is-b",
                          attributes: { "data-nx-carousel-slide": "true" },
                          content: "Slide 2",
                        },
                      ),
                      createVirtualNode(
                        idFor("card-c"),
                        "div",
                        "Slide Card",
                        {},
                        {
                          className: "nx-carousel-slide is-c",
                          attributes: { "data-nx-carousel-slide": "true" },
                          content: "Slide 3",
                        },
                      ),
                    ],
                  },
                ),
              ],
            },
          ),
          createVirtualNode(
            idFor("dots"),
            "div",
            "Carousel Indicators",
            {},
            {
              className: "nx-carousel-dots",
              children: [
                createVirtualNode(
                  idFor("dot-1"),
                  "button",
                  "Dot",
                  {},
                  {
                    className: "nx-carousel-dot is-active",
                    attributes: {
                      "data-nx-carousel-dot": "true",
                      "data-index": "0",
                      type: "button",
                      "aria-label": "Slide 1",
                    },
                  },
                ),
                createVirtualNode(
                  idFor("dot-2"),
                  "button",
                  "Dot",
                  {},
                  {
                    className: "nx-carousel-dot",
                    attributes: {
                      "data-nx-carousel-dot": "true",
                      "data-index": "1",
                      type: "button",
                      "aria-label": "Slide 2",
                    },
                  },
                ),
                createVirtualNode(
                  idFor("dot-3"),
                  "button",
                  "Dot",
                  {},
                  {
                    className: "nx-carousel-dot",
                    attributes: {
                      "data-nx-carousel-dot": "true",
                      "data-index": "2",
                      type: "button",
                      "aria-label": "Slide 3",
                    },
                  },
                ),
              ],
            },
          ),
          createVirtualNode(
            idFor("nav-prev"),
            "button",
            "Carousel Prev",
            {},
            {
              className: "nx-carousel-nav prev",
              attributes: {
                "data-nx-carousel-prev": "true",
                type: "button",
                "aria-label": "Previous slide",
              },
              content: "<",
            },
          ),
          createVirtualNode(
            idFor("nav-next"),
            "button",
            "Carousel Next",
            {},
            {
              className: "nx-carousel-nav next",
              attributes: {
                "data-nx-carousel-next": "true",
                type: "button",
                "aria-label": "Next slide",
              },
              content: ">",
            },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:flip-card") {
    return createVirtualNode(
      idFor("flip"),
      "div",
      "Flip Card",
      {},
      {
        className: "nx-flip-card",
        attributes: {
          "data-nx-flip-card": "true",
          tabindex: "0",
          role: "button",
          "aria-label": "Flip card",
        },
        children: [
          createVirtualNode(
            idFor("inner"),
            "div",
            "Flip Inner",
            {},
            {
              className: "nx-flip-inner",
              children: [
                createVirtualNode(
                  idFor("front"),
                  "div",
                  "Front Face",
                  {},
                  { className: "nx-flip-face front", content: "Front" },
                ),
                createVirtualNode(
                  idFor("back"),
                  "div",
                  "Back Face",
                  {},
                  { className: "nx-flip-face back", content: "Back" },
                ),
              ],
            },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:scroll-reveal") {
    return createVirtualNode(
      idFor("reveal"),
      "section",
      "Scroll Reveal Block",
      {},
      {
        className: "nx-scroll-reveal",
        attributes: { "data-nx-scroll-reveal": "true" },
        children: [
          createVirtualNode(
            idFor("title"),
            "h2",
            "Reveal Heading",
            {},
            {
              className: "nx-scroll-reveal-title",
              content: "Reveal On Scroll",
            },
          ),
          createVirtualNode(
            idFor("body"),
            "p",
            "Reveal Text",
            {},
            {
              className: "nx-scroll-reveal-text",
              content:
                "This block is tagged for preview scroll-reveal animations.",
            },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:calendar-dialog") {
    return createVirtualNode(
      idFor("calendar-wrap"),
      "section",
      "Calendar Dialog",
      {},
      {
        className: "nx-calendar-wrap",
        attributes: {
          "data-nx-calendar": "true",
        },
        children: [
          createVirtualNode(
            idFor("toolbar"),
            "div",
            "Calendar Toolbar",
            {},
            {
              className: "nx-calendar-toolbar",
              children: [
                createVirtualNode(
                  idFor("reset"),
                  "button",
                  "Reset Calendar",
                  {},
                  {
                    className: "nx-calendar-reset",
                    attributes: { type: "button", "data-nx-calendar-reset": "true" },
                    content: "Reset Calendar",
                  },
                ),
              ],
            },
          ),
          createVirtualNode(
            idFor("shell"),
            "div",
            "Calendar Shell",
            {},
            {
              className: "nx-calendar-shell",
              children: [
                createVirtualNode(
                  idFor("head"),
                  "div",
                  "Calendar Head",
                  {},
                  {
                    className: "nx-calendar-head",
                    children: [
                      createVirtualNode(
                        idFor("prev"),
                        "button",
                        "Calendar Prev",
                        {},
                        {
                          className: "nx-calendar-nav",
                          attributes: { type: "button", "data-nx-calendar-prev": "true", "aria-label": "Previous month" },
                          content: "«",
                        },
                      ),
                      createVirtualNode(
                        idFor("month"),
                        "div",
                        "Month Label",
                        {},
                        {
                          className: "nx-calendar-month",
                          attributes: { "data-nx-calendar-month-label": "true" },
                          content: "Mar",
                        },
                      ),
                      createVirtualNode(
                        idFor("year"),
                        "div",
                        "Year Label",
                        {},
                        {
                          className: "nx-calendar-year",
                          attributes: { "data-nx-calendar-year-label": "true" },
                          content: "2026",
                        },
                      ),
                      createVirtualNode(
                        idFor("next"),
                        "button",
                        "Calendar Next",
                        {},
                        {
                          className: "nx-calendar-nav",
                          attributes: { type: "button", "data-nx-calendar-next": "true", "aria-label": "Next month" },
                          content: "»",
                        },
                      ),
                    ],
                  },
                ),
                createVirtualNode(
                  idFor("grid"),
                  "div",
                  "Calendar Grid",
                  {},
                  {
                    className: "nx-calendar-grid",
                    attributes: { "data-nx-calendar-grid": "true" },
                  },
                ),
              ],
            },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:internal-swipe") {
    return createVirtualNode(
      idFor("internal-swipe"),
      "section",
      "Internal Swipe",
      {},
      {
        className: "nx-carousel",
        attributes: { "data-nx-carousel": "true", "data-nx-carousel-index": "0" },
        children: [
          createVirtualNode(idFor("header"), "div", "Swipe Header", {}, { className: "nx-carousel-header", content: "Internal Swiping - Arrow Controls" }),
          createVirtualNode(idFor("vp"), "div", "Viewport", {}, {
            className: "nx-carousel-viewport",
            children: [
              createVirtualNode(idFor("track"), "div", "Track", {}, {
                className: "nx-carousel-track",
                attributes: { "data-nx-carousel-track": "true" },
                children: [
                  createVirtualNode(idFor("slide1"), "div", "Slide 1", {}, { className: "nx-carousel-slide is-a", attributes: { "data-nx-carousel-slide": "true" }, content: "Page 1 - On Load Animation" }),
                  createVirtualNode(idFor("slide2"), "div", "Slide 2", {}, { className: "nx-carousel-slide is-b", attributes: { "data-nx-carousel-slide": "true" }, content: "Page 2 - Swipe Left/Right" }),
                  createVirtualNode(idFor("slide3"), "div", "Slide 3", {}, { className: "nx-carousel-slide is-c", attributes: { "data-nx-carousel-slide": "true" }, content: "Page 3 - CTA Section" }),
                ],
              }),
            ],
          }),
          createVirtualNode(idFor("prev"), "button", "Prev", {}, { className: "nx-carousel-nav prev", attributes: { "data-nx-carousel-prev": "true", type: "button" }, content: "<" }),
          createVirtualNode(idFor("next"), "button", "Next", {}, { className: "nx-carousel-nav next", attributes: { "data-nx-carousel-next": "true", type: "button" }, content: ">" }),
          createVirtualNode(idFor("dots"), "div", "Dots", {}, {
            className: "nx-carousel-dots",
            children: [
              createVirtualNode(idFor("dot1"), "button", "Dot", {}, { className: "nx-carousel-dot is-active", attributes: { "data-nx-carousel-dot": "true", "data-index": "0", type: "button" } }),
              createVirtualNode(idFor("dot2"), "button", "Dot", {}, { className: "nx-carousel-dot", attributes: { "data-nx-carousel-dot": "true", "data-index": "1", type: "button" } }),
              createVirtualNode(idFor("dot3"), "button", "Dot", {}, { className: "nx-carousel-dot", attributes: { "data-nx-carousel-dot": "true", "data-index": "2", type: "button" } }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:dots-swipe") {
    const buildSwipePanel = (label: string, suffix: string): VirtualElement =>
      createVirtualNode(
        idFor(`panel-${suffix}`),
        "div",
        "Swipe Panel",
        {},
        {
          className: "nx-swipe-panel",
          children: [
            createVirtualNode(idFor(`title-${suffix}`), "h3", "Panel Title", {}, { className: "nx-swipe-panel-title", content: label }),
            createVirtualNode(idFor(`carousel-${suffix}`), "section", "Carousel", {}, {
              className: "nx-carousel",
              attributes: { "data-nx-carousel": "true", "data-nx-carousel-index": "0" },
              children: [
                createVirtualNode(idFor(`vp-${suffix}`), "div", "Viewport", {}, {
                  className: "nx-carousel-viewport",
                  children: [
                    createVirtualNode(idFor(`track-${suffix}`), "div", "Track", {}, {
                      className: "nx-carousel-track",
                      attributes: { "data-nx-carousel-track": "true" },
                      children: [
                        createVirtualNode(idFor(`s1-${suffix}`), "div", "Slide 1", {}, { className: "nx-carousel-slide is-a", attributes: { "data-nx-carousel-slide": "true" }, content: "Slide 1" }),
                        createVirtualNode(idFor(`s2-${suffix}`), "div", "Slide 2", {}, { className: "nx-carousel-slide is-b", attributes: { "data-nx-carousel-slide": "true" }, content: "Slide 2" }),
                      ],
                    }),
                  ],
                }),
                createVirtualNode(idFor(`dots-${suffix}`), "div", "Dots", {}, {
                  className: "nx-carousel-dots",
                  children: [
                    createVirtualNode(idFor(`d1-${suffix}`), "button", "Dot", {}, { className: "nx-carousel-dot is-active", attributes: { "data-nx-carousel-dot": "true", "data-index": "0", type: "button" } }),
                    createVirtualNode(idFor(`d2-${suffix}`), "button", "Dot", {}, { className: "nx-carousel-dot", attributes: { "data-nx-carousel-dot": "true", "data-index": "1", type: "button" } }),
                  ],
                }),
              ],
            }),
          ],
        },
      );
    return createVirtualNode(
      idFor("swipe-board"),
      "section",
      "Multi Swipe Board",
      {},
      {
        className: "nx-swipe-board",
        children: [
          buildSwipePanel("Internal Swiping - Arrows", "a"),
          buildSwipePanel("Internal Swiping - Vertical Dots", "b"),
          buildSwipePanel("Internal Swiping - Bottom Dots", "c"),
        ],
      },
    );
  }
  if (presetType === "preset:video-panel") {
    return createVirtualNode(
      idFor("video-wrap"),
      "div",
      "Video Functionality",
      {},
      {
        className: "nx-video-inline",
        attributes: { "data-nx-video-tool": "true" },
        children: [
          createVirtualNode(idFor("inline-video"), "video", "Inline Video", {}, {
            className: "nx-video-inline-player noSwipe video-js vjs-default-skin",
            attributes: { controls: "true", preload: "metadata", poster: "media/images/poster.jpg" },
            children: [createVirtualNode(idFor("inline-src"), "source", "Source", {}, { attributes: { src: "media/videos/video.mp4", type: "video/mp4" } })],
          }),
          createVirtualNode(idFor("dialog1"), "div", "Dialog 1", {}, {
            className: "dialog hidden videoDialog",
            styles: { display: "none" },
            attributes: { id: "video1", title: "Video Dialog Demo", "data-width": "100", "data-height": "67" },
            children: [
              createVirtualNode(idFor("d1body"), "div", "Dialog Body", {}, {
                className: "dialogBody",
                children: [
                  createVirtualNode(idFor("d1h"), "h4", "Heading", {}, { content: "Dialog Video With Tracking" }),
                  createVirtualNode(idFor("d1v"), "video", "Video", {}, {
                    className: "noSwipe vjs-default-skin",
                    attributes: { "data-controls": "true", poster: "media/images/poster.jpg" },
                    children: [createVirtualNode(idFor("d1src"), "source", "Source", {}, { attributes: { src: "media/videos/video.mp4", type: "video/mp4" } })],
                  }),
                ],
              }),
            ],
          }),
          createVirtualNode(idFor("dialog2"), "div", "Dialog 2", {}, {
            className: "dialog hidden videoDialog",
            styles: { display: "none" },
            attributes: { id: "dialogTabPopup", title: "Dialog Videos on Tabs", "data-width": "100", "data-height": "67" },
            children: [
              createVirtualNode(idFor("d2body"), "div", "Dialog Body", {}, {
                className: "dialogBody",
                children: [
                  createVirtualNode(idFor("tab1"), "div", "Tab One", {}, { className: "tab1", content: "Video TAB1 content" }),
                  createVirtualNode(idFor("tab2"), "div", "Tab Two", {}, { className: "tab2", content: "Video TAB2 content" }),
                ],
              }),
              createVirtualNode(idFor("d2ext"), "div", "External tabs", {}, {
                className: "externalDialogBody",
                children: [
                  createVirtualNode(idFor("t1"), "div", "Tab", {}, {
                    className: "tab activeColor",
                    attributes: { id: "tab1" },
                    children: [createVirtualNode(idFor("t1s"), "span", "Tab label", {}, { content: "VIDEO TAB1" })],
                  }),
                  createVirtualNode(idFor("t2"), "div", "Tab", {}, {
                    className: "tab",
                    attributes: { id: "tab2" },
                    children: [
                      createVirtualNode(idFor("t2s"), "span", "Tab label", {}, { content: "VIDEO TAB2" }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:race-checklist") {
    return createVirtualNode(
      idFor("race-wrap"),
      "section",
      "Race Checklist",
      {},
      {
        className: "nx-function-card",
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-function-title", content: "Race Questionnaire" }),
          createVirtualNode(idFor("sub"), "p", "Sub", {}, { className: "nx-function-sub", content: "Reusable yes/no progression block from race workflow." }),
          createVirtualNode(idFor("list"), "ol", "Question List", { margin: "0", paddingLeft: "18px", display: "grid", gap: "8px" }, {
            children: [
              createVirtualNode(idFor("q1"), "li", "Question", {}, { content: "Does HCP know the brand and right patient profile?" }),
              createVirtualNode(idFor("q2"), "li", "Question", {}, { content: "Is HCP trying the brand 1-2 times only?" }),
              createVirtualNode(idFor("q3"), "li", "Question", {}, { content: "Any efficacy/safety concern remains?" }),
            ],
          }),
          createVirtualNode(idFor("actions"), "div", "Actions", {}, {
            className: "nx-chip-row",
            children: [
              createVirtualNode(idFor("yes"), "button", "Yes", {}, { className: "nx-chip", content: "Yes" }),
              createVirtualNode(idFor("no"), "button", "No", {}, { className: "nx-chip", content: "No" }),
              createVirtualNode(idFor("next"), "button", "Next", {}, { className: "nx-chip", content: "Next Step" }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:segmentation-cards") {
    return createVirtualNode(
      idFor("seg-wrap"),
      "section",
      "Segmentation Cards",
      {},
      {
        className: "nx-function-card",
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-function-title", content: "Attitudinal Segmentation" }),
          createVirtualNode(idFor("sub"), "p", "Sub", {}, { className: "nx-function-sub", content: "Drag-sort cards to map HCP segment quickly." }),
          createVirtualNode(idFor("cards"), "div", "Cards", { display: "grid", gap: "8px" }, {
            children: [
              createVirtualNode(idFor("c1"), "div", "Card", {}, { className: "nx-chip", content: "Evidence Seeker" }),
              createVirtualNode(idFor("c2"), "div", "Card", {}, { className: "nx-chip", content: "Guideline First" }),
              createVirtualNode(idFor("c3"), "div", "Card", {}, { className: "nx-chip", content: "Fast Adopter" }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:reference-tabs") {
    return createVirtualNode(
      idFor("refs-wrap"),
      "section",
      "Reference Tabs",
      {},
      {
        className: "nx-function-card",
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-function-title", content: "References / Footnotes / Abbreviations" }),
          createVirtualNode(idFor("tabs"), "div", "Tabs", {}, {
            className: "nx-reference-tabs",
            children: [
              createVirtualNode(idFor("head"), "div", "Tab Head", {}, {
                className: "nx-reference-tabs-head",
                children: [
                  createVirtualNode(idFor("tab1"), "button", "References Tab", {}, { className: "nx-reference-tab", content: "References" }),
                  createVirtualNode(idFor("tab2"), "button", "Footnotes Tab", {}, { className: "nx-reference-tab", content: "Footnotes" }),
                  createVirtualNode(idFor("tab3"), "button", "Abbreviations Tab", {}, { className: "nx-reference-tab", content: "Abbreviations" }),
                ],
              }),
              createVirtualNode(idFor("list"), "div", "List", {}, {
                className: "nx-reference-list",
                children: [
                  createVirtualNode(idFor("li1"), "div", "Reference", {}, { content: "1. Place supporting reference text here." }),
                  createVirtualNode(idFor("li2"), "div", "Reference", {}, { content: "2. Add footnote or abbreviation details." }),
                ],
              }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:anim-001-jquery") {
    return createVirtualNode(
      idFor("anim-001"),
      "section",
      "Animation 001 (jQuery style)",
      {},
      {
        className: "nx-anim-card",
        attributes: { "data-nx-anim-001": "true" },
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-anim-title", content: "Slide 001 - JQuery Animation" }),
          createVirtualNode(idFor("sub"), "p", "Sub", {}, { className: "nx-function-sub", content: "Arrow fill animation similar to local.js in slide 001." }),
          createVirtualNode(idFor("track"), "div", "Arrow Track", {}, {
            className: "nx-arrow-track",
            children: [
              createVirtualNode(idFor("fill"), "div", "Arrow Fill", {}, {
                className: "nx-arrow-fill",
                children: [
                  createVirtualNode(
                    idFor("img"),
                    "img",
                    "Arrow Image",
                    {},
                    {
                      src: "media/images/arrow.png",
                      attributes: { alt: "Arrow" },
                    },
                  ),
                ],
              }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:anim-002-css") {
    return createVirtualNode(
      idFor("anim-002"),
      "section",
      "Animation 002 (CSS class)",
      {},
      {
        className: "nx-anim-card",
        attributes: { "data-nx-anim-002": "true", "data-nx-anim-mode": "animated" },
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-anim-title", content: "Slide 002 - CSS Animation" }),
          createVirtualNode(idFor("sub"), "p", "Sub", {}, { className: "nx-function-sub", content: "Class-based load1/load2 animation pattern from slide 002." }),
          createVirtualNode(idFor("track"), "div", "Arrow Track", {}, {
            className: "nx-arrow-track",
            children: [
              createVirtualNode(idFor("fill"), "div", "Arrow Fill", {}, {
                className: "nx-arrow-fill",
                attributes: { "data-nx-anim-002-fill": "true" },
                children: [
                  createVirtualNode(
                    idFor("img"),
                    "img",
                    "Arrow Image",
                    {},
                    {
                      src: "media/images/arrow.png",
                      attributes: { alt: "Arrow" },
                    },
                  ),
                ],
              }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:clickstream-011") {
    return createVirtualNode(
      idFor("click-011"),
      "section",
      "Clickstream 011",
      {},
      {
        className: "nx-clickstream-card",
        attributes: { "data-nx-clickstream-011": "true" },
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-anim-title", content: "Slide 011 - Clickstream Without Form" }),
          createVirtualNode(idFor("grid"), "div", "Fields", {}, {
            className: "nx-clickstream-grid",
            children: [
              createVirtualNode(idFor("line1"), "label", "Checkbox", {}, { className: "nx-clickstream-line", content: "Checkbox" }),
              createVirtualNode(idFor("check"), "input", "Checkbox Input", {}, { attributes: { type: "checkbox", class: "logField", "data-fields": "SurveyQuestion|Answer", "data-description": "checkbox|[data]" } }),
              createVirtualNode(idFor("select"), "select", "Select", {}, {
                className: "nx-clickstream-select logField",
                attributes: { "data-fields": "SurveyQuestion|Answer", "data-description": "select|[data]" },
                children: [
                  createVirtualNode(idFor("o1"), "option", "Option", {}, { attributes: { value: "Option One" }, content: "One" }),
                  createVirtualNode(idFor("o2"), "option", "Option", {}, { attributes: { value: "Option Two" }, content: "Two" }),
                ],
              }),
              createVirtualNode(idFor("slider"), "input", "Slider", {}, { className: "nx-clickstream-slider logField", attributes: { type: "range", min: "1", max: "10", value: "5", "data-fields": "SurveyQuestion|Answer", "data-description": "slider value|[data]" } }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:clickstream-012-form") {
    return createVirtualNode(
      idFor("click-012"),
      "section",
      "Clickstream 012 Form",
      {},
      {
        className: "nx-clickstream-card",
        attributes: { "data-nx-clickstream-form": "true" },
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-anim-title", content: "Slide 012 - Clickstream With Form" }),
          createVirtualNode(idFor("grid"), "div", "Fields", {}, {
            className: "nx-clickstream-grid",
            children: [
              createVirtualNode(idFor("check"), "input", "Checkbox", {}, { attributes: { type: "checkbox", id: "slide12checkbox", class: "logFormField", "data-fields": "SurveyQuestion|Answer", "data-description": "formCheckbox|checked" } }),
              createVirtualNode(idFor("select"), "select", "Select", {}, {
                className: "nx-clickstream-select logFormField",
                attributes: { id: "slide12select", "data-fields": "SurveyQuestion|Answer", "data-description": "formSelect|[data]" },
                children: [
                  createVirtualNode(idFor("o1"), "option", "Option", {}, { attributes: { value: "Option One" }, content: "One" }),
                  createVirtualNode(idFor("o2"), "option", "Option", {}, { attributes: { value: "Option Two" }, content: "Two" }),
                ],
              }),
              createVirtualNode(idFor("slider"), "input", "Slider", {}, { className: "nx-clickstream-slider logFormField", attributes: { id: "slide12slider", type: "range", min: "0", max: "100", step: "10", value: "50", "data-fields": "SurveyQuestion|Answer", "data-description": "slider value|[data]" } }),
              createVirtualNode(idFor("submit"), "button", "Submit", {}, { className: "nx-clickstream-submit logFormSubmit", attributes: { type: "button", "data-nx-form-submit": "true", "data-onetime": "1", "data-callback-name": "OnClickstreamDone" }, content: "Submit Form" }),
              createVirtualNode(idFor("status"), "div", "Status", {}, { className: "nx-clickstream-status", attributes: { "data-nx-form-status": "true" }, content: "Waiting for submit..." }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:timeline-steps") {
    return createVirtualNode(
      idFor("timeline"),
      "section",
      "Timeline Steps",
      {},
      {
        className: "nx-function-card",
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-function-title", content: "Timeline Steps" }),
          createVirtualNode(idFor("sub"), "p", "Sub", {}, { className: "nx-function-sub", content: "Reusable progression widget for key messages." }),
          createVirtualNode(idFor("row"), "div", "Steps", { display: "grid", gap: "8px" }, {
            children: [
              createVirtualNode(idFor("s1"), "div", "Step", {}, { className: "nx-chip", content: "1. Discover" }),
              createVirtualNode(idFor("s2"), "div", "Step", {}, { className: "nx-chip", content: "2. Compare" }),
              createVirtualNode(idFor("s3"), "div", "Step", {}, { className: "nx-chip", content: "3. Act" }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:metric-counters") {
    return createVirtualNode(
      idFor("metrics"),
      "section",
      "Metric Counters",
      {},
      {
        className: "nx-function-card",
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-function-title", content: "Metric Counters" }),
          createVirtualNode(idFor("row"), "div", "Counter Row", { display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "8px" }, {
            children: [
              createVirtualNode(idFor("m1"), "div", "Counter", {}, { className: "nx-chip", content: "85%" }),
              createVirtualNode(idFor("m2"), "div", "Counter", {}, { className: "nx-chip", content: "3.2x" }),
              createVirtualNode(idFor("m3"), "div", "Counter", {}, { className: "nx-chip", content: "120" }),
            ],
          }),
        ],
      },
    );
  }
  return buildPresetElement(presetType, idFor);
};

const buildStandardElement = (type: string, id: string): VirtualElement => {
  const normalized = type === "container" || type === "flex" ? "div" : type;
  const baseStyles: React.CSSProperties = {
    padding: "10px",
    minHeight: "20px",
  };
  if (type === "flex") {
    baseStyles.display = "flex";
    baseStyles.gap = "8px";
    baseStyles.alignItems = "center";
  }
  if (type === "container") {
    baseStyles.width = "100%";
    baseStyles.maxWidth = "960px";
    baseStyles.margin = "0 auto";
  }
  return {
    id,
    type: normalized as ElementType,
    name: normalized.charAt(0).toUpperCase() + normalized.slice(1),
    styles: baseStyles,
    children: [],
    content: ["p", "h1", "h2", "h3", "button", "span"].includes(normalized)
      ? "New Text"
      : undefined,
    ...(normalized === "img"
      ? { src: "https://picsum.photos/200/300", name: "Image" }
      : {}),
  };
};

const materializeVirtualElement = (
  doc: Document,
  element: VirtualElement,
): Node => {
  if (element.type === "text") {
    return doc.createTextNode(element.content || "");
  }
  const node = doc.createElement(element.type);
  if (element.id) {
    node.setAttribute("id", element.id);
  }
  if (element.className) {
    node.setAttribute("class", element.className);
  }
  if (element.src) {
    node.setAttribute("src", element.src);
  }
  if (element.href) {
    node.setAttribute("href", element.href);
  }
  if (element.attributes) {
    for (const [key, value] of Object.entries(element.attributes)) {
      if (!key) continue;
      node.setAttribute(key, value);
    }
  }
  for (const [key, rawValue] of Object.entries(element.styles || {})) {
    if (rawValue === undefined || rawValue === null || rawValue === "")
      continue;
    const cssKey = key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
    (node as HTMLElement).style.setProperty(cssKey, String(rawValue));
  }
  if (element.animation) {
    (node as HTMLElement).style.setProperty("animation", element.animation);
  }
  if (element.content) {
    node.appendChild(doc.createTextNode(element.content));
  }
  for (const child of element.children) {
    node.appendChild(materializeVirtualElement(doc, child));
  }
  return node;
};

const buildPreviewLayerTreeFromElement = (
  element: Element,
  path: number[] = [],
): VirtualElement => {
  const tag = String(element.tagName || "div").toLowerCase();
  const id = toPreviewLayerId(path);
  const elementId = (element.getAttribute("id") || "").trim();
  const classList = (element.getAttribute("class") || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const displayName =
    [
      elementId ? `#${elementId}` : "",
      classList.length > 0 ? `.${classList.join(".")}` : "",
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || tag.toUpperCase();
  const children = Array.from(element.children).map((child, index) =>
    buildPreviewLayerTreeFromElement(child, [...path, index]),
  );
  return {
    id,
    type: tag,
    name: displayName,
    content: normalizeEditorMultilineText(extractTextWithBreaks(element)),
    html: element instanceof HTMLElement ? element.innerHTML || "" : "",
    styles: {},
    children,
  };
};

// --- Device Context Menu ---
const DeviceContextMenu: React.FC<{
  type: "mobile" | "desktop" | "tablet";
  position: { x: number; y: number };
  mobileFrameStyle: "dynamic-island" | "punch-hole" | "notch";
  setMobileFrameStyle: (s: "dynamic-island" | "punch-hole" | "notch") => void;
  desktopResolution: "1080p" | "1.5k" | "2k" | "4k" | "resizable";
  setDesktopResolution: (
    r: "1080p" | "1.5k" | "2k" | "4k" | "resizable",
  ) => void;
  tabletModel: "ipad" | "ipad-pro";
  tabletOrientation: "portrait" | "landscape";
  setTabletModel: (m: "ipad" | "ipad-pro") => void;
  onClose: () => void;
}> = ({
  type,
  position,
  mobileFrameStyle,
  setMobileFrameStyle,
  desktopResolution,
  setDesktopResolution,
  tabletModel,
  tabletOrientation,
  setTabletModel,
  onClose,
}) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const onClickOut = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) onClose();
      };
      const onEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("mousedown", onClickOut);
      document.addEventListener("keydown", onEsc);
      return () => {
        document.removeEventListener("mousedown", onClickOut);
        document.removeEventListener("keydown", onEsc);
      };
    }, [onClose]);

    const mobileItems = [
      { label: "📱  iPhone — Dynamic Island", value: "dynamic-island" as const },
      { label: "📱  iPhone — Notch", value: "notch" as const },
      { label: "🤖  Android — Punch Hole", value: "punch-hole" as const },
    ];

    const desktopItems = [
      { label: "🖥️  1080p (1920 × 1080)", value: "1080p" as const },
      { label: "🖥️  1.5K (1600 × 900)", value: "1.5k" as const },
      { label: "🖥️  2K (2560 × 1440)", value: "2k" as const },
      { label: "🖥️  4K (3840 × 2160)", value: "4k" as const },
      { label: "↔️  Resizable", value: "resizable" as const },
    ];

    const isLandscape = tabletOrientation === "landscape";
    const tabletItems = [
      {
        label: `iPad (${isLandscape ? "2048 x 1536" : "1536 x 2048"})`,
        value: "ipad" as const,
      },
      {
        label: `iPad Pro (${isLandscape ? "2732 x 2048" : "2048 x 2732"})`,
        value: "ipad-pro" as const,
      },
    ];

    const items =
      type === "mobile"
        ? mobileItems
        : type === "desktop"
          ? desktopItems
          : tabletItems;
    const currentValue =
      type === "mobile"
        ? mobileFrameStyle
        : type === "desktop"
          ? desktopResolution
          : tabletModel;

    return (
      <div
        ref={ref}
        className="fixed z-[2000] py-1.5 rounded-xl overflow-hidden animate-fadeIn"
        style={{
          left: position.x,
          top: position.y,
          minWidth: "200px",
          background: "var(--bg-glass-strong)",
          backdropFilter: "blur(24px)",
          border: "1px solid var(--border-color)",
          boxShadow: "0 12px 40px -8px rgba(0,0,0,0.5)",
        }}
      >
        <div
          className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          {type === "mobile"
            ? "Frame Style"
            : type === "desktop"
              ? "Resolution"
              : "iPad Model"}
        </div>
        {items.map((item) => (
          <button
            key={item.value}
            onClick={() => {
              if (type === "mobile") setMobileFrameStyle(item.value as any);
              else if (type === "desktop")
                setDesktopResolution(item.value as any);
              else setTabletModel(item.value as any);
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-[12px] font-medium flex items-center gap-2 transition-all duration-150"
            style={{
              color:
                currentValue === item.value
                  ? "var(--accent-primary)"
                  : "var(--text-main)",
              backgroundColor:
                currentValue === item.value
                  ? "var(--accent-glow)"
                  : "transparent",
            }}
            onMouseEnter={(e) => {
              if (currentValue !== item.value)
                e.currentTarget.style.backgroundColor = "var(--input-bg)";
            }}
            onMouseLeave={(e) => {
              if (currentValue !== item.value)
                e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <span>{item.label}</span>
            {currentValue === item.value && (
              <span className="ml-auto text-[10px] opacity-60">✓</span>
            )}
          </button>
        ))}
      </div>
    );
  };

type PreviewConsoleLevel = "log" | "info" | "warn" | "error" | "debug";
type PreviewConsoleEntry = {
  id: number;
  level: PreviewConsoleLevel;
  message: string;
  source: string;
  time: number;
};
type PreviewSelectionMode = "default" | "text" | "image" | "css";
type PreviewSyncSource = "load" | "navigate" | "path_changed" | "explorer";
type PendingPageSwitch = {
  mode: "switch" | "refresh" | "preview" | "preview_mode";
  fromPath: string;
  nextPath: string;
  source: PreviewSyncSource;
  nextPreviewMode?: "edit" | "preview";
};
const PREVIEW_SELECTION_MODE_OPTIONS: Array<{
  value: PreviewSelectionMode;
  label: string;
}> = [
    { value: "default", label: "Default" },
    { value: "text", label: "Text" },
    { value: "image", label: "Image" },
    { value: "css", label: "CSS" },
  ];

const App: React.FC = () => {
  // --- Neutralino Setup ---
  useEffect(() => {
    Neutralino.events.on("ready", () =>
      console.log("Neutralino functionality is ready."),
    );
  }, []);

  // --- State ---
  const [root, setRoot] = useState<VirtualElement>(INITIAL_ROOT);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configModalConfigPath, setConfigModalConfigPath] = useState<string | null>(null);
  const [configModalPortfolioPath, setConfigModalPortfolioPath] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: INITIAL_ROOT,
    future: [],
  });
  const [files, setFiles] = useState<FileMap>({});
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [previewMountBasePath, setPreviewMountBasePath] = useState<
    string | null
  >(null);
  const [isPreviewMountReady, setIsPreviewMountReady] = useState(false);
  const [activeFile, setActiveFileRaw] = useState<string | null>(null);
  const setActiveFile = useCallback((path: string | null | ((prev: string | null) => string | null)) => {
    setActiveFileRaw(prev => {
      const next = typeof path === 'function' ? path(prev) : path;
      console.log("[DEBUG] activeFile changing from", prev, "to", next);
      return next;
    });
  }, []);
  const [previewSyncedFile, setPreviewSyncedFile] = useState<string | null>(
    null,
  );
  const [previewNavigationFile, setPreviewNavigationFile] = useState<
    string | null
  >(null);
  const [deviceMode, setDeviceMode] = useState<"desktop" | "mobile" | "tablet">(
    "tablet",
  );
  const [interactionMode, setInteractionMode] = useState<
    "edit" | "preview" | "inspect" | "draw" | "move"
  >("edit");
  const [sidebarToolMode, setSidebarToolMode] = useState<
    "edit" | "inspect" | "draw" | "move"
  >("edit");
  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("preview");
  const [previewSelectionMode, setPreviewSelectionMode] =
    useState<PreviewSelectionMode>("default");
  const [availableFonts, setAvailableFonts] =
    useState<string[]>(DEFAULT_EDITOR_FONTS);
  const [drawElementTag, setDrawElementTag] = useState<string>("div");
  const [showTerminal, setShowTerminal] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const [isCodePanelOpen, setIsCodePanelOpen] = useState(false);
  const [bottomPanelTab, setBottomPanelTab] = useState<"terminal" | "console">(
    "terminal",
  );
  const [codeDraftByPath, setCodeDraftByPath] = useState<
    Record<string, string>
  >({});
  const [codeDirtyPathSet, setCodeDirtyPathSet] = useState<
    Record<string, true>
  >({});
  const [previewConsoleEntries, setPreviewConsoleEntries] = useState<
    PreviewConsoleEntry[]
  >([]);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "dark" || saved === "light") return saved;
    } catch {
      // Ignore storage errors and use default theme.
    }
    return "light";
  });
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PREVIEW_AUTOSAVE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [aiBackend, setAiBackend] = useState<"local" | "colab">(() => {
    try {
      const saved = localStorage.getItem(AI_BACKEND_STORAGE_KEY);
      return (saved as "local" | "colab") || "colab"; // Default to colab as requested
    } catch {
      return "colab";
    }
  });
  const [colabUrl, setColabUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(COLAB_URL_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const [dirtyFiles, setDirtyFiles] = useState<string[]>([]);
  const [dirtyPathKeysByFile, setDirtyPathKeysByFile] = useState<
    Record<string, string[]>
  >({});

  // Design Revamp States
  const [mobileFrameStyle, setMobileFrameStyle] = useState<
    "dynamic-island" | "punch-hole" | "notch"
  >("dynamic-island");
  const [desktopResolution, setDesktopResolution] = useState<
    "1080p" | "1.5k" | "2k" | "4k" | "resizable"
  >("1080p");
  const [tabletModel, setTabletModel] = useState<"ipad" | "ipad-pro">("ipad");
  const [tabletOrientation, setTabletOrientation] = useState<
    "portrait" | "landscape"
  >("landscape");
  const [previewRefreshNonce, setPreviewRefreshNonce] = useState(0);
  const [frameZoom, setFrameZoom] = useState<50 | 75 | 100>(100);
  const [deviceCtxMenu, setDeviceCtxMenu] = useState<{
    type: "mobile" | "desktop" | "tablet";
    x: number;
    y: number;
  } | null>(null);

  const [isVibeAssistantOpen, setIsVibeAssistantOpen] = useState(false);
  const [vibeErrorContext, setVibeErrorContext] = useState<string | undefined>();

  // Use a ref to track if a vibe update was just applied to handle errors
  const lastVibeUpdateRef = useRef<number>(0);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isToolboxDragging, setIsToolboxDragging] = useState(false);
  const toolboxDragTypeRef = useRef("");
  const [pendingPageSwitch, setPendingPageSwitch] =
    useState<PendingPageSwitch | null>(null);
  const [isPageSwitchPromptOpen, setIsPageSwitchPromptOpen] = useState(false);
  const [isPageSwitchPromptBusy, setIsPageSwitchPromptBusy] = useState(false);
  // Keep both implementations available: switch to "docked" anytime.
  const panelLayoutMode: "docked" | "floating" = "floating";
  const [selectedPreviewDoc, setSelectedPreviewDoc] = useState("");
  const [previewSelectedPath, setPreviewSelectedPath] = useState<
    number[] | null
  >(null);
  const [previewSelectedElement, setPreviewSelectedElement] =
    useState<VirtualElement | null>(null);
  const [previewSelectedComputedStyles, setPreviewSelectedComputedStyles] =
    useState<React.CSSProperties | null>(null);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const [previewSelectionBox, setPreviewSelectionBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [isPreviewResizing, setIsPreviewResizing] = useState(false);
  const previewResizeDragRef = useRef<{
    path: number[];
    target: HTMLElement;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    scaleX: number;
    scaleY: number;
  } | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(256);
  const [isResizingLeftPanel, setIsResizingLeftPanel] = useState(false);
  const filePathIndexRef = useRef<Record<string, string>>({});
  const presentationCssPathRef = useRef<string | null>(null);
  const fontCachePathRef = useRef<string | null>(null);
  const previewRootAliasPathRef = useRef<string | null>(null);
  const loadingFilesRef = useRef<Set<string>>(new Set());
  const loadingFilePromisesRef = useRef<
    Partial<Record<string, Promise<string | undefined>>>
  >({});
  const textFileCacheRef = useRef<Record<string, string>>({});
  const binaryAssetUrlCacheRef = useRef<Record<string, string>>({});
  const previewDependencyIndexRef = useRef<Record<string, string[]>>({});
  const filesRef = useRef<FileMap>({});
  const configModalConfigPathRef = useRef<string | null>(null);
  const configModalPortfolioPathRef = useRef<string | null>(null);
  const activeFileRef = useRef<string | null>(null);
  const selectedPreviewHtmlRef = useRef<string | null>(null);
  const interactionModeRef = useRef<
    "edit" | "preview" | "inspect" | "draw" | "move"
  >("edit");
  const previewModeRef = useRef<"edit" | "preview">("preview");
  const zenRestoreRef = useRef<{
    isLeftPanelOpen: boolean;
    isRightPanelOpen: boolean;
    showTerminal: boolean;
    isCodePanelOpen: boolean;
    interactionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  } | null>(null);
  const lastPreviewSyncRef = useRef<{
    path: string;
    at: number;
    source: "load" | "navigate" | "path_changed" | "explorer";
  } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const appRootRef = useRef<HTMLDivElement>(null);
  const leftPanelResizeStartXRef = useRef(0);
  const leftPanelResizeStartWidthRef = useRef(256);
  const leftPanelPendingWidthRef = useRef(256);
  const leftPanelResizeRafRef = useRef<number | null>(null);
  const previewConsoleSeqRef = useRef(0);
  const previewConsoleBufferRef = useRef<PreviewConsoleEntry[]>([]);
  const previewConsoleFlushTimerRef = useRef<number | null>(null);
  const saveMenuRef = useRef<HTMLDivElement | null>(null);
  const isRefreshingFilesRef = useRef(false);
  const saveCodeDraftsRef = useRef<(() => Promise<void>) | null>(null);
  const pendingPreviewWritesRef = useRef<Record<string, string>>({});
  const codeDraftByPathRef = useRef<Record<string, string>>({});
  const codeDirtyPathSetRef = useRef<Record<string, true>>({});
  const dirtyFilesRef = useRef<string[]>([]);
  const previewHistoryRef = useRef<Record<string, PreviewHistoryEntry>>({});
  const previewDocCacheRef = useRef<Record<string, string>>({});
  const previewDocCacheOrderRef = useRef<string[]>([]);
  const autoSaveTimerRef = useRef<number | null>(null);
  const inlineEditDraftTimerRef = useRef<number | null>(null);
  const inlineEditDraftPendingRef = useRef<{
    filePath: string;
    elementPath: number[];
    html: string;
  } | null>(null);
  const applyPreviewDropCreateRef = useRef<
    ((type: string, clientX: number, clientY: number) => Promise<void>) | null
  >(null);
  const explorerSelectionLockRef = useRef<string | null>(null);
  const themeTransitionInFlightRef = useRef(false);
  const lastPreviewPageSignalRef = useRef<{ path: string; at: number } | null>(
    null,
  );
  const BASE_STAGE_PADDING = 40;
  const LEFT_PANEL_MIN_WIDTH = 220;
  const LEFT_PANEL_MAX_WIDTH = 520;
  const RIGHT_PANEL_WIDTH = 264;
  const CODE_PANEL_WIDTH = 620;
  const previewConsoleErrorCount = useMemo(
    () =>
      previewConsoleEntries.reduce(
        (count, item) => count + (item.level === "error" ? 1 : 0),
        0,
      ),
    [previewConsoleEntries],
  );
  const previewConsoleWarnCount = useMemo(
    () =>
      previewConsoleEntries.reduce(
        (count, item) => count + (item.level === "warn" ? 1 : 0),
        0,
      ),
    [previewConsoleEntries],
  );
  const appendPreviewConsole = useCallback(
    (level: PreviewConsoleLevel, message: string, source = "preview") => {
      const nextId = previewConsoleSeqRef.current + 1;
      previewConsoleSeqRef.current = nextId;
      previewConsoleBufferRef.current.push({
        id: nextId,
        level,
        message,
        source,
        time: Date.now(),
      });
      if (previewConsoleFlushTimerRef.current !== null) return;
      previewConsoleFlushTimerRef.current = window.setTimeout(() => {
        previewConsoleFlushTimerRef.current = null;
        const buffered = previewConsoleBufferRef.current.splice(0);
        if (buffered.length === 0) return;
        setPreviewConsoleEntries((prev) => {
          const next = [...prev, ...buffered];
          return next.length > MAX_PREVIEW_CONSOLE_ENTRIES
            ? next.slice(next.length - MAX_PREVIEW_CONSOLE_ENTRIES)
            : next;
        });
      }, 120);
    },
    [],
  );

  const revokeBinaryAssetUrls = useCallback(() => {
    const cache = binaryAssetUrlCacheRef.current;
    for (const url of Object.values(cache)) {
      if (typeof url === "string" && url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore revoke failures for stale object URLs.
        }
      }
    }
    binaryAssetUrlCacheRef.current = {};
  }, []);


  const invalidatePreviewDocCache = useCallback((path: string) => {
    if (!path) return;
    delete previewDocCacheRef.current[path];
    previewDocCacheOrderRef.current = previewDocCacheOrderRef.current.filter(
      (item) => item !== path,
    );
  }, []);

  const cachePreviewDoc = useCallback((path: string, doc: string) => {
    if (!path) return;
    previewDocCacheRef.current[path] = doc;
    const nextOrder = previewDocCacheOrderRef.current.filter(
      (item) => item !== path,
    );
    nextOrder.push(path);

    let totalChars = nextOrder.reduce(
      (sum, key) => sum + (previewDocCacheRef.current[key]?.length || 0),
      0,
    );
    while (
      nextOrder.length > MAX_PREVIEW_DOC_CACHE_ENTRIES ||
      totalChars > MAX_PREVIEW_DOC_CACHE_CHARS
    ) {
      const evicted = nextOrder.shift();
      if (!evicted) break;
      totalChars -= previewDocCacheRef.current[evicted]?.length || 0;
      delete previewDocCacheRef.current[evicted];
    }

    previewDocCacheOrderRef.current = nextOrder;
  }, []);

  // Desktop only: both panels open in overlay mode with horizontal scroll.
  const isFloatingPanels = panelLayoutMode === "floating";
  const bothPanelsOpen =
    !isFloatingPanels &&
    isLeftPanelOpen &&
    isRightPanelOpen &&
    deviceMode !== "mobile";
  const rightOverlayInset = bothPanelsOpen ? RIGHT_PANEL_WIDTH : 0;
  const floatingHorizontalInset =
    isFloatingPanels && deviceMode !== "mobile"
      ? (isLeftPanelOpen ? leftPanelWidth : 0) +
      (isRightPanelOpen ? leftPanelWidth : 0)
      : 0;
  useEffect(() => {
    const next: FileMap = { ...files };
    for (const [path, content] of Object.entries(
      textFileCacheRef.current,
    ) as Array<[string, string]>) {
      const existing = next[path];
      if (
        existing &&
        (typeof existing.content !== "string" || existing.content.length === 0)
      ) {
        next[path] = { ...existing, content };
      }
    }
    for (const [path, content] of Object.entries(
      binaryAssetUrlCacheRef.current,
    ) as Array<[string, string]>) {
      const existing = next[path];
      if (
        existing &&
        (typeof existing.content !== "string" || existing.content.length === 0)
      ) {
        next[path] = { ...existing, content };
      }
    }
    filesRef.current = next;
  }, [files]);
  useEffect(() => {
    return () => {
      revokeBinaryAssetUrls();
      if (previewConsoleFlushTimerRef.current !== null) {
        window.clearTimeout(previewConsoleFlushTimerRef.current);
      }
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
      if (inlineEditDraftTimerRef.current !== null) {
        window.clearTimeout(inlineEditDraftTimerRef.current);
      }
    };
  }, [revokeBinaryAssetUrls]);
  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);
  useEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);
  useEffect(() => {
    previewModeRef.current = previewMode;
  }, [previewMode]);
  useEffect(() => {
    codeDraftByPathRef.current = codeDraftByPath;
  }, [codeDraftByPath]);
  useEffect(() => {
    codeDirtyPathSetRef.current = codeDirtyPathSet;
  }, [codeDirtyPathSet]);
  useEffect(() => {
    dirtyFilesRef.current = dirtyFiles;
  }, [dirtyFiles]);
  useEffect(() => {
    configModalConfigPathRef.current = configModalConfigPath;
  }, [configModalConfigPath]);
  useEffect(() => {
    configModalPortfolioPathRef.current = configModalPortfolioPath;
  }, [configModalPortfolioPath]);

  const setActiveFileStable = useCallback((nextPath: string | null) => {
    activeFileRef.current = nextPath;
    setActiveFile((prev) => (prev === nextPath ? prev : nextPath));
  }, []);

  const persistLoadedContentToState = useCallback(
    (path: string, content: string) => {
      setFiles((prev) => {
        const existing = prev[path];
        if (!existing) return prev;
        if (
          typeof existing.content === "string" &&
          existing.content.length > 0 &&
          existing.content === content
        ) {
          return prev;
        }
        return {
          ...prev,
          [path]: {
            ...existing,
            content,
          },
        };
      });
    },
    [],
  );

  const loadFileContent = useCallback(
    async (
      relativePath: string,
      options?: {
        persistToState?: boolean;
      },
    ) => {
      const persistToState = options?.persistToState ?? true;
      const target = filesRef.current[relativePath];
      if (!target) return;

      if (typeof target.content === "string" && target.content.length > 0) {
        if (target.type === "image" || target.type === "font") {
          binaryAssetUrlCacheRef.current[relativePath] = target.content;
          return target.content;
        }
        textFileCacheRef.current[relativePath] = target.content;
        if (persistToState) {
          persistLoadedContentToState(relativePath, target.content);
        }
        return target.content;
      }

      const cachedText = textFileCacheRef.current[relativePath];
      if (typeof cachedText === "string" && cachedText.length > 0) {
        if (persistToState) {
          persistLoadedContentToState(relativePath, cachedText);
        }
        return cachedText;
      }

      const cachedBinary = binaryAssetUrlCacheRef.current[relativePath];
      if (
        (target.type === "image" || target.type === "font") &&
        typeof cachedBinary === "string" &&
        cachedBinary.length > 0
      ) {
        return cachedBinary;
      }

      const existingPending = loadingFilePromisesRef.current[relativePath];
      if (existingPending) {
        if (
          !persistToState ||
          target.type === "image" ||
          target.type === "font"
        ) {
          return existingPending;
        }
        return existingPending.then((content) => {
          if (typeof content === "string" && content.length > 0) {
            persistLoadedContentToState(relativePath, content);
          }
          return content;
        });
      }

      const absolutePath = filePathIndexRef.current[relativePath];
      if (!absolutePath) return;

      const pending = (async (): Promise<string | undefined> => {
        loadingFilesRef.current.add(relativePath);
        try {
          let content = "";
          if (target.type === "image" || target.type === "font") {
            const binaryData = await (
              Neutralino as any
            ).filesystem.readBinaryFile(absolutePath);
            const bytes = toByteArray(binaryData);
            if (bytes.length === 0) return;
            const mime = mimeFromType(target.type, target.name);
            const sourceBuffer = bytes.buffer;
            const binaryBuffer: ArrayBuffer =
              sourceBuffer instanceof ArrayBuffer
                ? sourceBuffer.slice(
                  bytes.byteOffset,
                  bytes.byteOffset + bytes.byteLength,
                )
                : (() => {
                  const copy = new Uint8Array(bytes.byteLength);
                  copy.set(bytes);
                  return copy.buffer;
                })();
            const blob = new Blob([binaryBuffer], { type: mime });
            const previousUrl = binaryAssetUrlCacheRef.current[relativePath];
            if (previousUrl && previousUrl.startsWith("blob:")) {
              try {
                URL.revokeObjectURL(previousUrl);
              } catch {
                // Ignore stale blob revocation errors.
              }
            }
            content = URL.createObjectURL(blob);
            binaryAssetUrlCacheRef.current[relativePath] = content;
          } else {
            const loaded = await (Neutralino as any).filesystem.readFile(
              absolutePath,
            );
            content =
              typeof loaded === "string" ? loaded : String(loaded || "");
            if (content.length > 0) {
              textFileCacheRef.current[relativePath] = content;
            }
          }

          const existingRefEntry = filesRef.current[relativePath];
          if (existingRefEntry) {
            filesRef.current = {
              ...filesRef.current,
              [relativePath]: {
                ...existingRefEntry,
                content,
              },
            };
          }

          if (persistToState && content.length > 0) {
            persistLoadedContentToState(relativePath, content);
          }

          return content;
        } catch (error) {
          console.warn(
            `Failed loading file content for ${relativePath}:`,
            error,
          );
        } finally {
          loadingFilesRef.current.delete(relativePath);
          delete loadingFilePromisesRef.current[relativePath];
        }
      })();

      loadingFilePromisesRef.current[relativePath] = pending;
      return pending;
    },
    [persistLoadedContentToState],
  );
  const persistProjectFontCache = useCallback(
    async (fontFamilies: string[]) => {
      const cacheVirtualPath = fontCachePathRef.current;
      if (!cacheVirtualPath) return;
      const cacheAbsolutePath = filePathIndexRef.current[cacheVirtualPath];
      if (!cacheAbsolutePath) return;
      const payload: FontCachePayload = {
        version: FONT_CACHE_VERSION,
        source: "presentation.css",
        generatedAt: new Date().toISOString(),
        fonts: dedupeFontFamilies(fontFamilies),
      };
      const serialized = JSON.stringify(payload, null, 2);
      try {
        await (Neutralino as any).filesystem.writeFile(
          cacheAbsolutePath,
          serialized,
        );
      } catch (error) {
        console.warn("Failed to write font cache file:", error);
        return;
      }
      setFiles((prev) => {
        const existing = prev[cacheVirtualPath];
        const name = cacheVirtualPath.includes("/")
          ? cacheVirtualPath.slice(cacheVirtualPath.lastIndexOf("/") + 1)
          : cacheVirtualPath;
        if (existing) {
          return {
            ...prev,
            [cacheVirtualPath]: {
              ...existing,
              content: serialized,
            },
          };
        }
        return {
          ...prev,
          [cacheVirtualPath]: {
            path: cacheVirtualPath,
            name,
            type: inferFileType(name),
            content: serialized,
          },
        };
      });
    },
    [],
  );
  const handleAddFontToPresentationCss = useCallback(
    async (rawFontPath: string) => {
      const fontPath = normalizeProjectRelative(rawFontPath);
      const file = filesRef.current[fontPath];
      if (!file || file.type !== "font") return;
      if (!fontPath.toLowerCase().startsWith(`${SHARED_FONT_VIRTUAL_DIR}/`)) {
        window.alert(
          `Font must be inside "${SHARED_FONT_VIRTUAL_DIR}" to register.`,
        );
        return;
      }

      const presentationPath =
        presentationCssPathRef.current ??
        findFilePathCaseInsensitive(
          filesRef.current,
          PRESENTATION_CSS_VIRTUAL_PATH,
        );
      if (!presentationPath) {
        window.alert(
          `presentation.css not found at "${PRESENTATION_CSS_VIRTUAL_PATH}".`,
        );
        return;
      }
      presentationCssPathRef.current = presentationPath;
      const presentationAbsolutePath =
        filePathIndexRef.current[presentationPath];
      if (!presentationAbsolutePath) {
        window.alert("Unable to resolve presentation.css absolute path.");
        return;
      }

      let currentCss = "";
      try {
        const rawCss = await (Neutralino as any).filesystem.readFile(
          presentationAbsolutePath,
        );
        currentCss = typeof rawCss === "string" ? rawCss : String(rawCss || "");
      } catch (error) {
        console.warn("Failed reading presentation.css:", error);
        window.alert("Unable to read presentation.css.");
        return;
      }

      const family = deriveFontFamilyFromFontFileName(file.name);
      const existingFamilies = parsePresentationCssFontFamilies(currentCss);
      const alreadyRegistered = existingFamilies.some(
        (name) => name.toLowerCase() === family.toLowerCase(),
      );
      if (alreadyRegistered) {
        setAvailableFonts(buildEditorFontOptions(existingFamilies));
        await persistProjectFontCache(existingFamilies);
        return;
      }

      const relativeFontPath = relativePathBetweenVirtualFiles(
        presentationPath,
        fontPath,
      );
      const fontFormat = fontFormatFromFileName(file.name);
      const fontFaceBlock =
        `@font-face {\n` +
        `  font-family: '${family}';\n` +
        `  src: url('${relativeFontPath}') format('${fontFormat}');\n` +
        `  font-weight: normal;\n` +
        `  font-style: normal;\n` +
        `  font-display: swap;\n` +
        `}`;
      const nextCss = `${currentCss.trimEnd()}\n\n${fontFaceBlock}\n`;

      try {
        await (Neutralino as any).filesystem.writeFile(
          presentationAbsolutePath,
          nextCss,
        );
      } catch (error) {
        console.warn("Failed writing presentation.css:", error);
        window.alert("Unable to update presentation.css.");
        return;
      }

      setFiles((prev) => {
        const existing = prev[presentationPath];
        if (!existing) return prev;
        return {
          ...prev,
          [presentationPath]: {
            ...existing,
            content: nextCss,
          },
        };
      });
      const nextProjectFamilies = parsePresentationCssFontFamilies(nextCss);
      setAvailableFonts(buildEditorFontOptions(nextProjectFamilies));
      await persistProjectFontCache(nextProjectFamilies);
    },
    [persistProjectFontCache],
  );
  const shouldProcessPreviewPageSignal = useCallback((path: string) => {
    if (!path) return false;
    const now = Date.now();
    const last = lastPreviewPageSignalRef.current;
    if (last && last.path === path && now - last.at < 700) {
      return false;
    }
    lastPreviewPageSignalRef.current = { path, at: now };
    return true;
  }, []);
  const hasUnsavedChangesForFile = useCallback(
    (path: string | null): boolean => {
      if (!path) return false;
      if (typeof pendingPreviewWritesRef.current[path] === "string")
        return true;
      if (typeof codeDraftByPathRef.current[path] === "string") return true;
      if (codeDirtyPathSetRef.current[path]) return true;
      return dirtyFilesRef.current.includes(path);
    },
    [],
  );
  const commitPreviewActiveFileSync = useCallback(
    (nextPath: string, source: PreviewSyncSource) => {
      if (!nextPath) return;
      setPreviewSyncedFile((prev) => (prev === nextPath ? prev : nextPath));
      if (source === "navigate" || source === "explorer") {
        setPreviewNavigationFile((prev) =>
          prev === nextPath ? prev : nextPath,
        );
      }

      if (activeFileRef.current === nextPath) {
        if (interactionModeRef.current !== "preview" && (source === "load" || source === "path_changed")) {
          setInteractionMode("preview");
        }
        return;
      }

      const now = Date.now();
      const last = lastPreviewSyncRef.current;
      if (
        last &&
        last.path === nextPath &&
        last.source !== source &&
        now - last.at < 1200
      ) {
        return;
      }

      lastPreviewSyncRef.current = { path: nextPath, at: now, source };
      setActiveFileStable(nextPath);
      if (interactionModeRef.current !== "preview") {
        setInteractionMode("preview");
      }
    },
    [setActiveFileStable],
  );
  const syncPreviewActiveFile = useCallback(
    (
      nextPath: string,
      source: PreviewSyncSource,
      options?: { skipUnsavedPrompt?: boolean },
    ) => {
      if (!nextPath) return;
      const currentPath = selectedPreviewHtmlRef.current;
      const nextFile = filesRef.current[nextPath];
      const shouldPrompt =
        !options?.skipUnsavedPrompt &&
        source !== "load" &&
        interactionModeRef.current === "preview" &&
        previewModeRef.current === "edit" &&
        Boolean(currentPath) &&
        currentPath !== nextPath &&
        nextFile?.type === "html" &&
        hasUnsavedChangesForFile(currentPath);
      if (shouldPrompt && currentPath) {
        setPendingPageSwitch({
          mode: "switch",
          fromPath: currentPath,
          nextPath,
          source,
        });
        setIsPageSwitchPromptOpen(true);
        return;
      }
      commitPreviewActiveFileSync(nextPath, source);
    },
    [commitPreviewActiveFileSync, hasUnsavedChangesForFile],
  );
  useEffect(() => {
    console.log("Both panels open?", bothPanelsOpen, {
      isLeftPanelOpen,
      isRightPanelOpen,
      deviceMode,
    });
  }, [bothPanelsOpen, isLeftPanelOpen, isRightPanelOpen, deviceMode]);
  useLayoutEffect(() => {
    if (
      (bothPanelsOpen || floatingHorizontalInset > 0) &&
      scrollerRef.current
    ) {
      const el = scrollerRef.current;
      const alignInitialScroll = () => {
        // Center default view; user can still scroll both sides manually.
        el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
      };

      // Multiple attempts while transitions settle.
      alignInitialScroll();
      requestAnimationFrame(() => {
        alignInitialScroll();
        setTimeout(alignInitialScroll, 100);
        setTimeout(alignInitialScroll, 300);
        setTimeout(alignInitialScroll, 550);
        setTimeout(alignInitialScroll, 700);
      });
    }
  }, [
    bothPanelsOpen,
    floatingHorizontalInset,
    desktopResolution,
    deviceMode,
    isLeftPanelOpen,
    isRightPanelOpen,
  ]);
  useLayoutEffect(() => {
    if (!scrollerRef.current) return;
    const el = scrollerRef.current;
    const recenter = () => {
      el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    };
    recenter();
    requestAnimationFrame(() => {
      recenter();
      setTimeout(recenter, 120);
      setTimeout(recenter, 260);
    });
  }, [frameZoom]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors.
    }
  }, [theme]);
  useEffect(() => {
    try {
      localStorage.setItem(
        PREVIEW_AUTOSAVE_STORAGE_KEY,
        autoSaveEnabled ? "1" : "0",
      );
    } catch {
      // Ignore storage errors.
    }
  }, [autoSaveEnabled]);
  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!saveMenuRef.current) return;
      if (!saveMenuRef.current.contains(event.target as Node)) {
        setIsSaveMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);
  useEffect(
    () => () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
      if (previewConsoleFlushTimerRef.current !== null) {
        window.clearTimeout(previewConsoleFlushTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!appRootRef.current) return;
    appRootRef.current.style.setProperty(
      "--left-panel-width",
      `${leftPanelWidth}px`,
    );
  }, [leftPanelWidth]);

  useEffect(() => {
    if (!isResizingLeftPanel) return;

    const onMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - leftPanelResizeStartXRef.current;
      leftPanelPendingWidthRef.current = Math.min(
        LEFT_PANEL_MAX_WIDTH,
        Math.max(
          LEFT_PANEL_MIN_WIDTH,
          leftPanelResizeStartWidthRef.current + delta,
        ),
      );
      if (leftPanelResizeRafRef.current !== null) return;
      leftPanelResizeRafRef.current = requestAnimationFrame(() => {
        leftPanelResizeRafRef.current = null;
        if (appRootRef.current) {
          appRootRef.current.style.setProperty(
            "--left-panel-width",
            `${leftPanelPendingWidthRef.current}px`,
          );
        }
      });
    };

    const onMouseUp = () => {
      if (leftPanelResizeRafRef.current !== null) {
        cancelAnimationFrame(leftPanelResizeRafRef.current);
        leftPanelResizeRafRef.current = null;
      }
      setLeftPanelWidth(leftPanelPendingWidthRef.current);
      setIsResizingLeftPanel(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizingLeftPanel]);

  const handleLeftPanelResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isLeftPanelOpen) return;
      event.preventDefault();
      leftPanelResizeStartXRef.current = event.clientX;
      leftPanelResizeStartWidthRef.current = leftPanelWidth;
      leftPanelPendingWidthRef.current = leftPanelWidth;
      setIsResizingLeftPanel(true);
    },
    [isLeftPanelOpen, leftPanelWidth],
  );

  // --- History Management ---
  const pushHistory = useCallback((newState: VirtualElement) => {
    setHistory((curr) => ({
      past: [...curr.past.slice(-(MAX_CANVAS_HISTORY - 1)), curr.present],
      present: newState,
      future: [],
    }));
    setRoot(newState);
  }, []);

  const handleUndo = useCallback(() => {
    setHistory((curr) => {
      if (curr.past.length === 0) return curr;
      const previous = curr.past[curr.past.length - 1];
      const newPast = curr.past.slice(0, -1);
      setRoot(previous);
      return {
        past: newPast,
        present: previous,
        future: [curr.present, ...curr.future],
      };
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistory((curr) => {
      if (curr.future.length === 0) return curr;
      const next = curr.future[0];
      const newFuture = curr.future.slice(1);
      setRoot(next);
      return {
        past: [...curr.past.slice(-(MAX_CANVAS_HISTORY - 1)), curr.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);
  const pushPreviewHistory = useCallback(
    (filePath: string, nextHtml: string, previousHtml?: string) => {
      const current = previewHistoryRef.current[filePath];
      if (!current) {
        const baseline = typeof previousHtml === "string" ? previousHtml : "";
        previewHistoryRef.current[filePath] =
          baseline && baseline !== nextHtml
            ? {
              past: [baseline],
              present: nextHtml,
              future: [],
            }
            : {
              past: [],
              present: nextHtml,
              future: [],
            };
        return;
      }
      if (current.present === nextHtml) return;
      previewHistoryRef.current[filePath] = {
        past: [
          ...current.past.slice(-(MAX_PREVIEW_HISTORY - 1)),
          current.present,
        ],
        present: nextHtml,
        future: [],
      };
    },
    [],
  );

  const markPreviewPathDirty = useCallback(
    (filePath: string, elementPath: number[]) => {
      if (!elementPath || elementPath.length === 0) return;
      const key = elementPath.join(".");
      setDirtyPathKeysByFile((prev) => {
        const curr = prev[filePath] || [];
        if (curr.includes(key)) return prev;
        return { ...prev, [filePath]: [...curr, key] };
      });

      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!frameDocument?.body) return;
      const liveTarget = readElementByPath(frameDocument.body, elementPath);
      if (liveTarget instanceof HTMLElement) {
        liveTarget.classList.add("__nx-preview-dirty");
      }
    },
    [],
  );
  const flushPendingPreviewSaves = useCallback(async () => {
    const entries = Object.entries(pendingPreviewWritesRef.current);
    if (entries.length === 0) return;

    const savedPaths: string[] = [];
    for (const [filePath, content] of entries) {
      const absolutePath = filePathIndexRef.current[filePath];
      if (!absolutePath) continue;
      try {
        await (Neutralino as any).filesystem.writeFile(absolutePath, content);
        delete pendingPreviewWritesRef.current[filePath];
        savedPaths.push(filePath);
      } catch (error) {
        console.warn(`Failed to save ${filePath}:`, error);
      }
    }
    if (savedPaths.length === 0) return;

    dirtyFilesRef.current = dirtyFilesRef.current.filter(
      (path) => !savedPaths.includes(path),
    );
    setDirtyFiles((prev) => prev.filter((path) => !savedPaths.includes(path)));
    setDirtyPathKeysByFile((prev) => {
      const next = { ...prev };
      for (const path of savedPaths) {
        delete next[path];
      }
      return next;
    });

    const activePath = selectedPreviewHtmlRef.current;
    if (activePath && savedPaths.includes(activePath)) {
      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (frameDocument) {
        Array.from(
          frameDocument.querySelectorAll<HTMLElement>(".__nx-preview-dirty"),
        ).forEach((el) => {
          if (el instanceof HTMLElement) {
            el.classList.remove("__nx-preview-dirty");
          }
        });
      }
    }
  }, []);
  const schedulePreviewAutoSave = useCallback(() => {
    if (!autoSaveEnabled) return;
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void flushPendingPreviewSaves();
    }, 1200);
  }, [autoSaveEnabled, flushPendingPreviewSaves]);
  const discardUnsavedChangesForFile = useCallback(
    async (path: string) => {
      if (!path) return;
      const hadCodeDraft =
        typeof codeDraftByPath[path] === "string" ||
        Boolean(codeDirtyPathSet[path]);
      if (hadCodeDraft) {
        delete codeDraftByPathRef.current[path];
        delete codeDirtyPathSetRef.current[path];
        setCodeDraftByPath((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
        setCodeDirtyPathSet((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
      }
      const hadPreviewDraft =
        typeof pendingPreviewWritesRef.current[path] === "string";
      if (!hadPreviewDraft) {
        if (hadCodeDraft) {
          dirtyFilesRef.current = dirtyFilesRef.current.filter(
            (entry) => entry !== path,
          );
          setDirtyFiles((prev) => prev.filter((entry) => entry !== path));
        }
        return;
      }

      const absolutePath = filePathIndexRef.current[path];
      if (!absolutePath) return;
      let diskContent = "";
      try {
        diskContent = await (Neutralino as any).filesystem.readFile(
          absolutePath,
        );
      } catch (error) {
        console.warn(`Failed discarding unsaved changes for ${path}:`, error);
        window.alert("Could not discard changes. Please try again.");
        return;
      }

      delete pendingPreviewWritesRef.current[path];
      textFileCacheRef.current[path] = diskContent;
      setFiles((prev) => {
        const existing = prev[path];
        if (!existing) return prev;
        return {
          ...prev,
          [path]: {
            ...existing,
            content: diskContent,
          },
        };
      });
      dirtyFilesRef.current = dirtyFilesRef.current.filter(
        (entry) => entry !== path,
      );
      setDirtyFiles((prev) => prev.filter((entry) => entry !== path));
      setDirtyPathKeysByFile((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
      previewHistoryRef.current[path] = {
        past: [],
        present: diskContent,
        future: [],
      };
      invalidatePreviewDocCache(path);

      const currentEntry = filesRef.current[path];
      if (currentEntry) {
        const previewSnapshot: FileMap = {
          ...filesRef.current,
          [path]: {
            ...currentEntry,
            content: diskContent,
          },
        };
        const previewDoc = createPreviewDocument(
          previewSnapshot,
          path,
          previewDependencyIndexRef.current[path],
        );
        cachePreviewDoc(path, previewDoc);
        if (selectedPreviewHtmlRef.current === path) {
          setSelectedPreviewDoc(previewDoc);
          setPreviewRefreshNonce((prev) => prev + 1);
        }
      }
    },
    [
      cachePreviewDoc,
      codeDirtyPathSet,
      codeDraftByPath,
      invalidatePreviewDocCache,
    ],
  );
  const requestPreviewRefreshWithUnsavedGuard = useCallback(() => {
    const candidate =
      previewSyncedFile && filesRef.current[previewSyncedFile]?.type === "html"
        ? previewSyncedFile
        : selectedPreviewHtmlRef.current &&
          filesRef.current[selectedPreviewHtmlRef.current]?.type === "html"
          ? selectedPreviewHtmlRef.current
          : null;
    if (!candidate) {
      setPreviewRefreshNonce((prev) => prev + 1);
      return;
    }
    if (hasUnsavedChangesForFile(candidate)) {
      setPendingPageSwitch({
        mode: "refresh",
        fromPath: candidate,
        nextPath: candidate,
        source: "navigate",
      });
      setIsPageSwitchPromptOpen(true);
      return;
    }
    setPreviewNavigationFile((prev) => (prev === candidate ? prev : candidate));
    setPreviewRefreshNonce((prev) => prev + 1);
  }, [hasUnsavedChangesForFile, previewSyncedFile]);
  const handleOpenConfigModal = useCallback(() => {
    const pickBestPath = async (
      suffix: "config.json" | "portfolioconfig.json",
      kind: "config" | "portfolio",
    ): Promise<string> => {
      const candidates = getConfigPathCandidates(filesRef.current, suffix);
      const fallback =
        resolveConfigPathFromFiles(filesRef.current, suffix) ||
        (suffix === "config.json" ? CONFIG_JSON_PATH : PORTFOLIO_CONFIG_PATH);
      if (candidates.length === 0) return fallback;

      let bestPath = fallback;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const path of candidates) {
        const loaded = await loadFileContent(path, { persistToState: true });
        const score = scoreConfigContent(String(loaded || ""), kind);
        console.info("[ConfigModal] Candidate score", { kind, path, score });
        if (score > bestScore) {
          bestScore = score;
          bestPath = path;
        }
      }
      return bestPath;
    };

    void (async () => {
      const [configPath, portfolioPath] = await Promise.all([
        pickBestPath("config.json", "config"),
        pickBestPath("portfolioconfig.json", "portfolio"),
      ]);
      setConfigModalConfigPath(configPath);
      setConfigModalPortfolioPath(portfolioPath);
      console.groupCollapsed("[ConfigModal] Open");
      console.info("[ConfigModal] Chosen config path:", configPath);
      console.info("[ConfigModal] Chosen portfolio path:", portfolioPath);
      console.groupEnd();
      for (const [path, entry] of Object.entries(filesRef.current)) {
        if (
          entry?.type === "image" &&
          /(^|\/)thumb\.(png|jpg|jpeg|webp|gif|svg)$/i.test(path)
        ) {
          void loadFileContent(path, { persistToState: true });
        }
      }
      setIsConfigModalOpen(true);
    })();
  }, [loadFileContent]);
  const handleSidebarLoadImage = useCallback(
    (path: string) => {
      void loadFileContent(path, { persistToState: true });
    },
    [loadFileContent],
  );

  const handleSaveConfig = useCallback(
    async (newConfig: string, newPortfolio: string) => {
      try {
        const configPath =
          configModalConfigPathRef.current ||
          resolveConfigPathFromFiles(filesRef.current, "config.json") ||
          CONFIG_JSON_PATH;
        const portfolioPath =
          configModalPortfolioPathRef.current ||
          resolveConfigPathFromFiles(filesRef.current, "portfolioconfig.json") ||
          PORTFOLIO_CONFIG_PATH;

        if (filesRef.current[configPath]) {
          filesRef.current = {
            ...filesRef.current,
            [configPath]: {
              ...filesRef.current[configPath],
              content: newConfig,
            },
          };
          setFiles(filesRef.current);

          // mark dirty
          if (!dirtyFilesRef.current.includes(configPath)) {
            dirtyFilesRef.current.push(configPath);
            setDirtyFiles((prev) => [...prev, configPath]);
          }

          if (filePathIndexRef.current[configPath]) {
            await (Neutralino as any).filesystem.writeFile(
              filePathIndexRef.current[configPath],
              newConfig,
            );

            // mark clean
            dirtyFilesRef.current = dirtyFilesRef.current.filter(
              (entry) => entry !== configPath,
            );
            setDirtyFiles((prev) =>
              prev.filter((entry) => entry !== configPath),
            );
          }
        }

        if (filesRef.current[portfolioPath]) {
          filesRef.current = {
            ...filesRef.current,
            [portfolioPath]: {
              ...filesRef.current[portfolioPath],
              content: newPortfolio,
            },
          };
          setFiles(filesRef.current);

          // mark dirty
          if (!dirtyFilesRef.current.includes(portfolioPath)) {
            dirtyFilesRef.current.push(portfolioPath);
            setDirtyFiles((prev) => [...prev, portfolioPath]);
          }

          if (filePathIndexRef.current[portfolioPath]) {
            await (Neutralino as any).filesystem.writeFile(
              filePathIndexRef.current[portfolioPath],
              newPortfolio,
            );

            // mark clean
            dirtyFilesRef.current = dirtyFilesRef.current.filter(
              (entry) => entry !== portfolioPath,
            );
            setDirtyFiles((prev) =>
              prev.filter((entry) => entry !== portfolioPath),
            );
          }
        }

        requestPreviewRefreshWithUnsavedGuard();
      } catch (err) {
        console.error("Failed to save config:", err);
        alert("Failed to save configuration files.");
      }
    },
    [requestPreviewRefreshWithUnsavedGuard],
  );

  const requestSwitchToPreviewMode = useCallback(() => {
    if (interactionModeRef.current === "preview") {
      const currentPath = selectedPreviewHtmlRef.current;
      if (
        previewModeRef.current === "edit" &&
        currentPath &&
        hasUnsavedChangesForFile(currentPath)
      ) {
        setPendingPageSwitch({
          mode: "preview_mode",
          fromPath: currentPath,
          nextPath: currentPath,
          source: "navigate",
          nextPreviewMode: "preview",
        });
        setIsPageSwitchPromptOpen(true);
        return;
      }
      setPreviewMode("preview");
      return;
    }
    if (interactionModeRef.current !== "edit") {
      setInteractionMode("preview");
      setPreviewMode("preview");
      return;
    }
    const currentPath = selectedPreviewHtmlRef.current;
    if (currentPath && hasUnsavedChangesForFile(currentPath)) {
      setPendingPageSwitch({
        mode: "preview",
        fromPath: currentPath,
        nextPath: currentPath,
        source: "navigate",
      });
      setIsPageSwitchPromptOpen(true);
      return;
    }
    setInteractionMode("preview");
    setPreviewMode("preview");
  }, [hasUnsavedChangesForFile]);
  const resolvePendingPageSwitchWithSave = useCallback(async () => {
    if (!pendingPageSwitch) return;
    setIsPageSwitchPromptBusy(true);
    const pending = pendingPageSwitch;
    const waitForStateFlush = () =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });
    try {
      await saveCodeDraftsRef.current?.();
      await flushPendingPreviewSaves();
      // React state cleanup for dirty flags may settle one tick later.
      await waitForStateFlush();
      let stillUnsaved = hasUnsavedChangesForFile(pending.fromPath);
      if (stillUnsaved) {
        await waitForStateFlush();
        stillUnsaved = hasUnsavedChangesForFile(pending.fromPath);
      }
      if (stillUnsaved) {
        window.alert("Some changes could not be saved. Please retry.");
        return;
      }
      setIsPageSwitchPromptOpen(false);
      setPendingPageSwitch(null);
      if (pending.mode === "refresh") {
        setPreviewNavigationFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewRefreshNonce((prev) => prev + 1);
      } else if (pending.mode === "preview_mode") {
        setActiveFileStable(pending.fromPath);
        setPreviewSyncedFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewNavigationFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewMode(pending.nextPreviewMode ?? "preview");
      } else if (pending.mode === "preview") {
        setInteractionMode("preview");
      } else {
        commitPreviewActiveFileSync(pending.nextPath, pending.source);
      }
    } finally {
      setIsPageSwitchPromptBusy(false);
    }
  }, [
    commitPreviewActiveFileSync,
    flushPendingPreviewSaves,
    hasUnsavedChangesForFile,
    pendingPageSwitch,
  ]);
  const resolvePendingPageSwitchWithDiscard = useCallback(async () => {
    if (!pendingPageSwitch) return;
    setIsPageSwitchPromptBusy(true);
    const pending = pendingPageSwitch;
    try {
      await discardUnsavedChangesForFile(pending.fromPath);
      setIsPageSwitchPromptOpen(false);
      setPendingPageSwitch(null);
      if (pending.mode === "refresh") {
        setPreviewNavigationFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewRefreshNonce((prev) => prev + 1);
      } else if (pending.mode === "preview_mode") {
        setActiveFileStable(pending.fromPath);
        setPreviewSyncedFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewNavigationFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewMode(pending.nextPreviewMode ?? "preview");
      } else if (pending.mode === "preview") {
        setInteractionMode("preview");
      } else {
        commitPreviewActiveFileSync(pending.nextPath, pending.source);
      }
    } finally {
      setIsPageSwitchPromptBusy(false);
    }
  }, [
    commitPreviewActiveFileSync,
    discardUnsavedChangesForFile,
    pendingPageSwitch,
  ]);
  const closePendingPageSwitchPrompt = useCallback(() => {
    if (isPageSwitchPromptBusy) return;
    setIsPageSwitchPromptOpen(false);
    setPendingPageSwitch(null);
  }, [isPageSwitchPromptBusy]);

  const handlePreviewUndo = useCallback(async () => {
    const filePath = selectedPreviewHtmlRef.current;
    if (!filePath) return;
    const current = previewHistoryRef.current[filePath];
    if (!current || current.past.length === 0) return;
    const previous = current.past[current.past.length - 1];
    previewHistoryRef.current[filePath] = {
      past: current.past.slice(0, -1),
      present: previous,
      future: [current.present, ...current.future],
    };
    textFileCacheRef.current[filePath] = previous;
    setFiles((prev) => {
      const existing = prev[filePath];
      if (!existing) return prev;
      return {
        ...prev,
        [filePath]: {
          ...existing,
          content: previous,
        },
      };
    });
    pendingPreviewWritesRef.current[filePath] = previous;
    setDirtyFiles((prev) =>
      prev.includes(filePath) ? prev : [...prev, filePath],
    );
    setDirtyPathKeysByFile((prev) => ({
      ...prev,
      [filePath]: [],
    }));
    const currentEntry = filesRef.current[filePath];
    if (currentEntry) {
      const previewSnapshot: FileMap = {
        ...filesRef.current,
        [filePath]: {
          ...currentEntry,
          content: previous,
        },
      };
      const previewDoc = createPreviewDocument(
        previewSnapshot,
        filePath,
        previewDependencyIndexRef.current[filePath],
      );
      cachePreviewDoc(filePath, previewDoc);
      setSelectedPreviewDoc(previewDoc);
    }
    await flushPendingPreviewSaves();
    setPreviewRefreshNonce((prev) => prev + 1);
    schedulePreviewAutoSave();
  }, [cachePreviewDoc, flushPendingPreviewSaves, schedulePreviewAutoSave]);

  const handlePreviewRedo = useCallback(async () => {
    const filePath = selectedPreviewHtmlRef.current;
    if (!filePath) return;
    const current = previewHistoryRef.current[filePath];
    if (!current || current.future.length === 0) return;
    const next = current.future[0];
    previewHistoryRef.current[filePath] = {
      past: [
        ...current.past.slice(-(MAX_PREVIEW_HISTORY - 1)),
        current.present,
      ],
      present: next,
      future: current.future.slice(1),
    };
    textFileCacheRef.current[filePath] = next;
    setFiles((prev) => {
      const existing = prev[filePath];
      if (!existing) return prev;
      return {
        ...prev,
        [filePath]: {
          ...existing,
          content: next,
        },
      };
    });
    pendingPreviewWritesRef.current[filePath] = next;
    setDirtyFiles((prev) =>
      prev.includes(filePath) ? prev : [...prev, filePath],
    );
    setDirtyPathKeysByFile((prev) => ({
      ...prev,
      [filePath]: [],
    }));
    const currentEntry = filesRef.current[filePath];
    if (currentEntry) {
      const previewSnapshot: FileMap = {
        ...filesRef.current,
        [filePath]: {
          ...currentEntry,
          content: next,
        },
      };
      const previewDoc = createPreviewDocument(
        previewSnapshot,
        filePath,
        previewDependencyIndexRef.current[filePath],
      );
      cachePreviewDoc(filePath, previewDoc);
      setSelectedPreviewDoc(previewDoc);
    }
    await flushPendingPreviewSaves();
    setPreviewRefreshNonce((prev) => prev + 1);
    schedulePreviewAutoSave();
  }, [cachePreviewDoc, flushPendingPreviewSaves, schedulePreviewAutoSave]);

  const runUndo = useCallback(() => {
    if (
      interactionModeRef.current === "preview" &&
      selectedPreviewHtmlRef.current
    ) {
      void handlePreviewUndo();
      return;
    }
    handleUndo();
  }, [handlePreviewUndo, handleUndo]);

  const runRedo = useCallback(() => {
    if (
      interactionModeRef.current === "preview" &&
      selectedPreviewHtmlRef.current
    ) {
      void handlePreviewRedo();
      return;
    }
    handleRedo();
  }, [handlePreviewRedo, handleRedo]);

  const toggleZenMode = useCallback(() => {
    setIsZenMode((prev) => {
      if (!prev) {
        zenRestoreRef.current = {
          isLeftPanelOpen,
          isRightPanelOpen,
          showTerminal,
          isCodePanelOpen,
          interactionMode,
        };
        setIsLeftPanelOpen(false);
        setIsRightPanelOpen(false);
        setShowTerminal(false);
        setIsCodePanelOpen(false);
        setInteractionMode("preview");
        return true;
      }

      const restore = zenRestoreRef.current;
      if (restore) {
        setIsLeftPanelOpen(restore.isLeftPanelOpen);
        setIsRightPanelOpen(restore.isRightPanelOpen);
        setShowTerminal(restore.showTerminal);
        setIsCodePanelOpen(restore.isCodePanelOpen);
        setInteractionMode(restore.interactionMode);
      }
      zenRestoreRef.current = null;
      return false;
    });
  }, [
    interactionMode,
    isLeftPanelOpen,
    isRightPanelOpen,
    isCodePanelOpen,
    showTerminal,
  ]); // --- Keyboard Shortcuts ---
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        target.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const hasModifier = e.ctrlKey || e.metaKey;
      const editableTarget = isEditableTarget(e.target);

      if (hasModifier && editableTarget) {
        if (key === "s") {
          e.preventDefault();
          void saveCodeDraftsRef.current?.();
          void flushPendingPreviewSaves();
          return;
        }
        if (key === "t") {
          e.preventDefault();
          requestPreviewRefreshWithUnsavedGuard();
          return;
        }
        if (key === "p") {
          e.preventDefault();
          requestSwitchToPreviewMode();
          return;
        }
        if (key === "f") {
          e.preventDefault();
          setIsLeftPanelOpen(true);
          setIsRightPanelOpen(true);
          setIsCodePanelOpen(false);
          return;
        }
        if (key === "e") {
          e.preventDefault();
          setSidebarToolMode("edit");
          setInteractionMode("preview");
          setPreviewMode("edit");
          return;
        }
        if (key === "k") {
          e.preventDefault();
          setIsCommandPaletteOpen((prev) => !prev);
          return;
        }
        if (e.code === "Backquote") {
          e.preventDefault();
          setShowTerminal((prev) => !prev);
        }
        // Let native editor undo/redo work inside inputs/contentEditable.
        return;
      }
      if (
        key === "escape" &&
        isPageSwitchPromptOpen &&
        !isPageSwitchPromptBusy
      ) {
        e.preventDefault();
        closePendingPageSwitchPrompt();
        return;
      }

      if (key === "escape" && isZenMode) {
        e.preventDefault();
        toggleZenMode();
        return;
      }

      if (!hasModifier && !e.altKey && !editableTarget) {
        if (key === "w") {
          e.preventDefault();
          if (!e.repeat) {
            setIsLeftPanelOpen((prev) => !prev);
          }
          return;
        }
        if (key === "e") {
          e.preventDefault();
          if (!e.repeat) {
            setIsRightPanelOpen((prev) => {
              const next = !prev;
              if (next) setIsCodePanelOpen(false);
              return next;
            });
          }
          return;
        }
      }

      if (!hasModifier) return;

      if (key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }
      if (key === "f") {
        e.preventDefault();
        setIsLeftPanelOpen(true);
        setIsRightPanelOpen(true);
        setIsCodePanelOpen(false);
        return;
      }
      if (key === "p") {
        e.preventDefault();
        requestSwitchToPreviewMode();
        return;
      }
      if (key === "e") {
        e.preventDefault();
        setSidebarToolMode("edit");
        setInteractionMode("preview");
        setPreviewMode("edit");
        return;
      }
      if (key === "`") {
        e.preventDefault();
        setShowTerminal((prev) => !prev);
        return;
      }
      if (key === "j") {
        e.preventDefault();
        toggleZenMode();
        return;
      }
      if (key === "s") {
        e.preventDefault();
        void saveCodeDraftsRef.current?.();
        void flushPendingPreviewSaves();
        return;
      }
      if (key === "t") {
        e.preventDefault();
        requestPreviewRefreshWithUnsavedGuard();
        return;
      }
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        runUndo();
        return;
      }
      if (key === "u" || key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        runRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    closePendingPageSwitchPrompt,
    flushPendingPreviewSaves,
    isPageSwitchPromptBusy,
    isPageSwitchPromptOpen,
    isZenMode,
    previewSyncedFile,
    requestPreviewRefreshWithUnsavedGuard,
    requestSwitchToPreviewMode,
    runRedo,
    runUndo,
    toggleZenMode,
  ]);

  // --- Actions ---
  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      setPreviewSelectedPath(null);
      setPreviewSelectedElement(null);
      setPreviewSelectedComputedStyles(null);
      if (deviceMode === "tablet") {
        setIsCodePanelOpen(false);
        setIsRightPanelOpen(true);
      }
    },
    [deviceMode],
  );

  const handleUpdateStyle = useCallback(
    (styles: Partial<React.CSSProperties>) => {
      if (!selectedId) return;
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        styles: { ...el.styles, ...styles },
      }));
      pushHistory(newRoot);
    },
    [root, selectedId, pushHistory],
  );

  const handleUpdateContent = useCallback(
    (data: {
      content?: string;
      html?: string;
      src?: string;
      href?: string;
    }) => {
      if (!selectedId) return;
      const normalizedData =
        typeof data.html === "string" && typeof data.content !== "string"
          ? {
            ...data,
            content: extractTextFromHtmlFragment(data.html),
          }
          : data;
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        ...normalizedData,
      }));
      pushHistory(newRoot);
    },
    [root, selectedId, pushHistory],
  );

  const handleUpdateAttributes = useCallback(
    (attributes: Record<string, string>) => {
      if (!selectedId) return;
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        attributes,
      }));
      pushHistory(newRoot);
    },
    [root, selectedId, pushHistory],
  );

  const handleUpdateAnimation = useCallback(
    (animation: string) => {
      if (!selectedId) return;
      const nextAnimation =
        typeof animation === "string" ? animation.trim() : "";
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        animation: nextAnimation,
        styles: {
          ...el.styles,
          animation: nextAnimation,
        },
      }));
      pushHistory(newRoot);
    },
    [root, selectedId, pushHistory],
  );

  const handleMoveElement = useCallback(
    (draggedId: string, targetId: string) => {
      const draggedEl = findElementById(root, draggedId);
      if (!draggedEl) return;
      let newRoot = deleteElementFromTree(root, draggedId);
      newRoot = addElementToTree(newRoot, targetId, draggedEl, "inside");
      pushHistory(newRoot);
    },
    [root, pushHistory],
  );

  const handleMoveElementByPosition = useCallback(
    (id: string, styles: Partial<React.CSSProperties>) => {
      const target = findElementById(root, id);
      if (!target) return;
      let changed = false;
      for (const [key, value] of Object.entries(styles)) {
        if (
          String((target.styles as any)?.[key] ?? "") !== String(value ?? "")
        ) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      const newRoot = updateElementInTree(root, id, (el) => ({
        ...el,
        styles: { ...el.styles, ...styles },
      }));
      pushHistory(newRoot);
    },
    [root, pushHistory],
  );

  const handleResize = useCallback(
    (id: string, width: string, height: string) => {
      const newRoot = updateElementInTree(root, id, (el) => ({
        ...el,
        styles: { ...el.styles, width, height },
      }));
      pushHistory(newRoot);
    },
    [root, pushHistory],
  );

  const handleAddElement = useCallback(
    (type: string, position: "inside" | "before" | "after" = "inside") => {
      const idFor = createPresetIdFactory(type);
      const newElement =
        buildPresetElementV2(type, idFor) ??
        buildStandardElement(type, idFor("element"));
      const targetId = selectedId || root.id;
      const newRoot = addElementToTree(root, targetId, newElement, position);
      pushHistory(newRoot);
      setSelectedId(newElement.id);
    },
    [root, selectedId, pushHistory],
  );

  const handleDeleteElement = useCallback(() => {
    if (!selectedId || selectedId === "root") return;
    const newRoot = deleteElementFromTree(root, selectedId);
    pushHistory(newRoot);
    setSelectedId(null);
  }, [root, selectedId, pushHistory]);
  const handleSidebarAddElement = useCallback(
    (type: string) => {
      if (
        interactionModeRef.current === "preview" &&
        selectedPreviewHtmlRef.current
      ) {
        const frameRect = previewFrameRef.current?.getBoundingClientRect();
        const clientX = frameRect
          ? Math.round(frameRect.left + frameRect.width / 2)
          : Math.round(window.innerWidth / 2);
        const clientY = frameRect
          ? Math.round(frameRect.top + frameRect.height / 2)
          : Math.round(window.innerHeight / 2);
        setSidebarToolMode("edit");
        setInteractionMode("preview");
        setPreviewMode("edit");
        void applyPreviewDropCreateRef.current?.(type, clientX, clientY);
        return;
      }
      handleAddElement(type, "inside");
    },
    [handleAddElement],
  );
  const handleSidebarAddFontToPresentationCss = useCallback(
    (path: string) => {
      void handleAddFontToPresentationCss(path);
    },
    [handleAddFontToPresentationCss],
  );
  const handlePreviewRefresh = useCallback(() => {
    requestPreviewRefreshWithUnsavedGuard();
  }, [requestPreviewRefreshWithUnsavedGuard]);
  const openCodePanel = useCallback(() => {
    const currentPreview = selectedPreviewHtmlRef.current;
    if (currentPreview && filesRef.current[currentPreview]?.type === "html") {
      setActiveFileStable(currentPreview);
      setPreviewSyncedFile((prev) =>
        prev === currentPreview ? prev : currentPreview,
      );
      setPreviewNavigationFile((prev) =>
        prev === currentPreview ? prev : currentPreview,
      );
    }
    setIsCodePanelOpen(true);
    setIsLeftPanelOpen(false);
    setIsRightPanelOpen(false);
    setShowTerminal(false);
  }, [setActiveFileStable]);
  const toggleThemeWithTransition = useCallback(() => {
    if (themeTransitionInFlightRef.current) return;
    themeTransitionInFlightRef.current = true;
    const nextTheme = theme === "dark" ? "light" : "dark";
    const rootEl = document.documentElement;
    rootEl.classList.add("theme-transitioning");
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanupTransitionVars = () => {
      const rootStyle = document.documentElement.style;
      rootStyle.removeProperty("--theme-transition-x");
      rootStyle.removeProperty("--theme-transition-y");
      rootStyle.removeProperty("--theme-transition-radius");
      rootEl.classList.remove("theme-transitioning");
      themeTransitionInFlightRef.current = false;
    };
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--theme-transition-x", `${window.innerWidth}px`);
    rootStyle.setProperty("--theme-transition-y", "0px");
    rootStyle.setProperty(
      "--theme-transition-radius",
      `${Math.hypot(window.innerWidth, window.innerHeight)}px`,
    );

    if (prefersReducedMotion) {
      setTheme(nextTheme);
      cleanupTransitionVars();
      return;
    }

    const doc = document as MaybeViewTransitionDocument;
    if (typeof doc.startViewTransition !== "function") {
      setTheme(nextTheme);
      cleanupTransitionVars();
      return;
    }

    const transition = doc.startViewTransition(() => {
      flushSync(() => {
        setTheme(nextTheme);
      });
    });
    void transition.finished.finally(cleanupTransitionVars);
  }, [theme]);

  const handleCommandAction = (actionId: string, payload?: any) => {
    switch (actionId) {
      case "undo":
        runUndo();
        break;
      case "redo":
        runRedo();
        break;
      case "view-desktop":
        setDeviceMode("desktop");
        break;
      case "view-mobile":
        setDeviceMode("mobile");
        break;
      case "toggle-preview":
        if (interactionModeRef.current === "preview") {
          setSidebarToolMode("edit");
          setPreviewMode("edit");
        } else {
          setSidebarToolMode("edit");
          requestSwitchToPreviewMode();
        }
        break;
      case "clear-selection":
        setSelectedId(null);
        break;
      default:
        if (actionId.startsWith("add-")) handleAddElement(payload, "inside");
    }
  };


  // --- Neutralino File System Integration ---
  const handleOpenFolder = async () => {
    try {
      const selectedFolder = await (Neutralino as any).os.showFolderDialog(
        "Select project folder",
      );
      if (!selectedFolder) return;

      setIsLeftPanelOpen(true);

      const rootPath = normalizePath(selectedFolder);
      const fsFiles: FileMap = {};
      const absolutePathIndex: Record<string, string> = {};
      let sharedDirectoryPath: string | null = null;
      let nearestSharedParent: string | null = null;

      const upsertIndexedFile = (virtualPath: string, absolutePath: string) => {
        const normalizedVirtual = normalizeProjectRelative(virtualPath);
        if (!normalizedVirtual) return;
        if (fsFiles[normalizedVirtual]) return;
        const name = normalizedVirtual.includes("/")
          ? normalizedVirtual.slice(normalizedVirtual.lastIndexOf("/") + 1)
          : normalizedVirtual;
        fsFiles[normalizedVirtual] = {
          path: normalizedVirtual,
          name,
          type: inferFileType(name),
          content: "",
        };
        absolutePathIndex[normalizedVirtual] = normalizePath(absolutePath);
      };

      const walkDirectory = async (directoryPath: string): Promise<void> => {
        const entries = await (Neutralino as any).filesystem.readDirectory(
          directoryPath,
        );

        for (const entry of entries as Array<{ entry: string; type: string }>) {
          if (!entry?.entry || entry.entry === "." || entry.entry === "..") {
            continue;
          }

          const absolutePath = joinPath(directoryPath, entry.entry);
          if (entry.type === "DIRECTORY") {
            if (IGNORED_FOLDERS.has(entry.entry.toLowerCase())) continue;
            await walkDirectory(absolutePath);
            continue;
          }
          if (entry.type !== "FILE") continue;

          const normalizedAbsolute = normalizePath(absolutePath);
          const relativePath = normalizedAbsolute
            .replace(`${rootPath}/`, "")
            .replace(rootPath, "");
          const normalizedRelative = relativePath.replace(/^\/+/, "");
          if (!normalizedRelative) continue;
          upsertIndexedFile(normalizedRelative, normalizedAbsolute);
        }
      };

      const indexSharedDirectory = async (
        sharedRoot: string,
      ): Promise<void> => {
        const sharedBase = normalizePath(sharedRoot);
        const walkShared = async (directoryPath: string): Promise<void> => {
          const entries = await (Neutralino as any).filesystem.readDirectory(
            directoryPath,
          );
          for (const entry of entries as Array<{
            entry: string;
            type: string;
          }>) {
            if (!entry?.entry || entry.entry === "." || entry.entry === "..") {
              continue;
            }
            const absolutePath = joinPath(directoryPath, entry.entry);
            if (entry.type === "DIRECTORY") {
              await walkShared(absolutePath);
              continue;
            }
            if (entry.type !== "FILE") continue;
            const normalizedAbsolute = normalizePath(absolutePath);
            const relativeFromShared = normalizedAbsolute
              .replace(`${sharedBase}/`, "")
              .replace(sharedBase, "");
            const sharedVirtual = `shared/${relativeFromShared.replace(/^\/+/, "")}`;
            upsertIndexedFile(sharedVirtual, normalizedAbsolute);
          }
        };
        await walkShared(sharedBase);
      };

      const patchMtVeevaCheck = async (sharedRoot: string): Promise<void> => {
        const mtPath = joinPath(sharedRoot, "js/mt.js");
        let raw = "";
        try {
          raw = await (Neutralino as any).filesystem.readFile(mtPath);
        } catch {
          console.warn(
            "Preview mt.js patch skipped: shared/js/mt.js not found at:",
            mtPath,
          );
          return;
        }
        if (typeof raw !== "string" || raw.length === 0) return;

        const markerStart = "// nocode-x-veeva-bypass:start";
        const markerEnd = "// nocode-x-veeva-bypass:end";

        const markerBlock = `
  ${markerStart}
  try {
    var host = (window.location && window.location.hostname) ? window.location.hostname : "";
    var isLocalPreviewHost = (host === "127.0.0.1" || host === "localhost");
    var isInIframe = window.parent && window.parent !== window;

    if (isLocalPreviewHost && isInIframe) {
      try {
        if (!window.__nocodeXPreviewConsoleBridge) {
          window.__nocodeXPreviewConsoleBridge = true;
          var toText = function(v) {
            if (typeof v === "string") return v;
            try { return JSON.stringify(v); } catch (_e) { return String(v); }
          };
          var postToHost = function(level, args, source) {
            if (typeof window.parent.postMessage !== "function") return;
            var msg = Array.prototype.map.call(args || [], toText).join(" ");
            window.parent.postMessage({ type: "PREVIEW_CONSOLE", level: level, source: source || "preview", message: msg }, "*");
          };
          ["log", "info", "warn", "error", "debug"].forEach(function(level) {
            if (!window.console || typeof window.console[level] !== "function") return;
            var original = window.console[level].bind(window.console);
            window.console[level] = function() {
              try { postToHost(level, arguments, "console"); } catch (_e) {}
              return original.apply(window.console, arguments);
            };
          });
          window.addEventListener("error", function(ev) {
            try { postToHost("error", [ev.message, ev.filename + ":" + ev.lineno + ":" + ev.colno], "window.onerror"); } catch (_e) {}
          });
          window.addEventListener("unhandledrejection", function(ev) {
            try {
              var reason = ev && ev.reason ? ev.reason : "Unhandled promise rejection";
              postToHost("error", [reason], "unhandledrejection");
            } catch (_e) {}
          });
        }
      } catch (e) {}

      // MOCK NATIVE DEVICE BRIDGES
      window.external = window.external || {};
      if (typeof window.external.notify !== "function") {
          window.external.notify = function(msg) {};
      }
      window.webkit = window.webkit || {};
      window.webkit.messageHandlers = window.webkit.messageHandlers || {};
      window.webkit.messageHandlers.veeva = window.webkit.messageHandlers.veeva || { postMessage: function(msg) {} };

      // MOCK VEEVA CLM API
      window.com = window.com || {};
      window.com.veeva = window.com.veeva || {};
      window.com.veeva.clm = window.com.veeva.clm || {};
      window.com.veeva.clm.isEngage = function() { return false; };
      
      window.com.veeva.clm.gotoSlide = function(slide, presentation) {
          if (typeof window.parent.postMessage === "function") {
              window.parent.postMessage({ type: "PREVIEW_NAVIGATE", path: slide + "/index.html" }, "*");
          }
      };
      
      window.com.veeva.clm.getDataForCurrentObject = function(obj, col, callback) {
          if (callback) {
              setTimeout(function() {
                  var recordData = {};
                  recordData[col] = "stub-" + col;
                  recordData.Id = "stub-id"; 
                  var response = { success: true };
                  response[obj] = recordData; 
                  callback(response);
              }, 0);
          }
      };

      // --- NOCODE-X NATIVE SWIPE EMULATOR ---
      var swipeStartX = 0;
      var swipeStartY = 0;
      window.addEventListener('touchstart', function(e) {
          if (e.touches && e.touches.length === 1) {
              swipeStartX = e.touches[0].clientX;
              swipeStartY = e.touches[0].clientY;
          }
      }, { passive: true });
      
      window.addEventListener('touchend', function(e) {
          if (e.changedTouches && e.changedTouches.length === 1) {
              var endX = e.changedTouches[0].clientX;
              var endY = e.changedTouches[0].clientY;
              var diffX = swipeStartX - endX;
              var diffY = swipeStartY - endY;
              
              // 60px horizontal swipe threshold
              if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY)) {
                  if (typeof window.parent.postMessage === "function") {
                      window.parent.postMessage({ 
                          type: "PREVIEW_SWIPE_DIR", 
                          dir: diffX > 0 ? "next" : "prev" 
                      }, "*");
                  }
              }
          }
      }, { passive: true });

      if (typeof window.parent.postMessage === "function") {
        window.parent.postMessage({ type: "PREVIEW_PATH_CHANGED", path: window.location.pathname || "" }, "*");
      }
      try {
        console.log("[NoCodeX] Preview Veeva bypass active (Simulating Veeva + Emulating Swipes)");
      } catch (e) {}

      return true; // Force mt.js to think it's IN Veeva to permanently stop bouncing
    }
  } catch (e) {}
  ${markerEnd}
`;

        const patchTargetRegex = /isVeevaEnvironment:\s*function\s*\(\)\s*\{/;
        let patched = raw;

        if (raw.includes(markerStart) && raw.includes(markerEnd)) {
          const startIndex = raw.indexOf(markerStart);
          const endMarkerIndex = raw.indexOf(markerEnd, startIndex);
          const endLineIndex = raw.indexOf("\n", endMarkerIndex);
          const afterEnd = endLineIndex >= 0 ? endLineIndex + 1 : raw.length;
          patched = `${raw.slice(0, startIndex)}${markerBlock}${raw.slice(afterEnd)}`;
        } else if (patchTargetRegex.test(raw)) {
          patched = raw.replace(
            patchTargetRegex,
            (matched) => `${matched}${markerBlock}`,
          );
        } else {
          console.warn(
            "Preview mt.js patch skipped: isVeevaEnvironment hook not found.",
          );
          return;
        }

        if (patched === raw) return;

        try {
          await (Neutralino as any).filesystem.writeFile(mtPath, patched);
          console.log("[Preview] Applied mt.js Veeva bypass patch:", mtPath);
        } catch (error) {
          console.warn("Preview mt.js patch failed:", error);
        }
      };

      await walkDirectory(rootPath);

      // Some legacy projects keep `/shared` as a sibling/ancestor directory.
      // Index all discovered ancestor shared dirs as virtual `shared/...`.
      let cursor: string | null = rootPath;
      for (let level = 0; level < 10 && cursor; level += 1) {
        const sharedCandidate = joinPath(cursor, "shared");
        try {
          await (Neutralino as any).filesystem.readDirectory(sharedCandidate);
          await indexSharedDirectory(sharedCandidate);
          if (!sharedDirectoryPath) {
            sharedDirectoryPath = sharedCandidate;
          }
          if (!nearestSharedParent) {
            nearestSharedParent = cursor;
          }
        } catch {
          // shared directory doesn't exist at this ancestor; continue upward.
        }
        cursor = getParentPath(cursor);
      }

      if (sharedDirectoryPath) {
        await patchMtVeevaCheck(sharedDirectoryPath);
      }

      const presentationCssVirtualPath = findFilePathCaseInsensitive(
        fsFiles,
        PRESENTATION_CSS_VIRTUAL_PATH,
      );
      presentationCssPathRef.current = presentationCssVirtualPath;

      let fontCacheVirtualPath: string | null = null;
      let fontCacheAbsolutePath: string | null = null;
      if (sharedDirectoryPath) {
        const existingCachePath = findFilePathCaseInsensitive(
          fsFiles,
          FONT_CACHE_VIRTUAL_PATH,
        );
        if (existingCachePath) {
          fontCacheVirtualPath = existingCachePath;
          fontCacheAbsolutePath = absolutePathIndex[existingCachePath] || null;
        } else {
          fontCacheVirtualPath = FONT_CACHE_VIRTUAL_PATH;
          fontCacheAbsolutePath = normalizePath(
            joinPath(sharedDirectoryPath, "js/nocodex-fonts.json"),
          );
          absolutePathIndex[fontCacheVirtualPath] = fontCacheAbsolutePath;
        }
      }
      fontCachePathRef.current = fontCacheVirtualPath;

      let projectFontFamilies: string[] = [];
      let loadedFromCache = false;
      if (fontCacheVirtualPath && fontCacheAbsolutePath) {
        try {
          const cacheRaw = await (Neutralino as any).filesystem.readFile(
            fontCacheAbsolutePath,
          );
          if (typeof cacheRaw === "string" && cacheRaw.trim().length > 0) {
            const cachedFamilies = parseFontCacheFamilies(cacheRaw);
            if (cachedFamilies.length > 0) {
              projectFontFamilies = cachedFamilies;
              loadedFromCache = true;
            }
          }
        } catch {
          // Cache file may not exist yet for first-time projects.
        }
      }

      if (!loadedFromCache && presentationCssVirtualPath) {
        const presentationAbsolutePath =
          absolutePathIndex[presentationCssVirtualPath];
        if (presentationAbsolutePath) {
          try {
            const presentationCss = await (
              Neutralino as any
            ).filesystem.readFile(presentationAbsolutePath);
            if (
              typeof presentationCss === "string" &&
              presentationCss.length > 0
            ) {
              projectFontFamilies =
                parsePresentationCssFontFamilies(presentationCss);
            }
          } catch {
            // Ignore missing presentation.css reads and fall back to fonts folder.
          }
        }
      }

      if (projectFontFamilies.length === 0) {
        projectFontFamilies = collectSharedFontFamiliesFromFileMap(fsFiles);
      }
      setAvailableFonts(buildEditorFontOptions(projectFontFamilies));

      if (
        !loadedFromCache &&
        projectFontFamilies.length > 0 &&
        fontCacheVirtualPath &&
        fontCacheAbsolutePath
      ) {
        const cachePayload: FontCachePayload = {
          version: FONT_CACHE_VERSION,
          source: "presentation.css",
          generatedAt: new Date().toISOString(),
          fonts: dedupeFontFamilies(projectFontFamilies),
        };
        const serializedCache = JSON.stringify(cachePayload, null, 2);
        try {
          await (Neutralino as any).filesystem.writeFile(
            fontCacheAbsolutePath,
            serializedCache,
          );
          if (!fsFiles[fontCacheVirtualPath]) {
            fsFiles[fontCacheVirtualPath] = {
              path: fontCacheVirtualPath,
              name: "nocodex-fonts.json",
              type: inferFileType("nocodex-fonts.json"),
              content: serializedCache,
            };
            absolutePathIndex[fontCacheVirtualPath] = fontCacheAbsolutePath;
          } else {
            fsFiles[fontCacheVirtualPath] = {
              ...fsFiles[fontCacheVirtualPath],
              content: serializedCache,
            };
          }
        } catch (error) {
          console.warn("Failed writing initial font cache:", error);
        }
      }

      const mountBasePath = nearestSharedParent || rootPath;
      const mountBaseName =
        normalizePath(mountBasePath).split("/").filter(Boolean).pop() || "";
      const previewRootAliasPath =
        mountBaseName && !mountBaseName.startsWith(".")
          ? `/${mountBaseName}`
          : null;
      let mountReady = false;
      try {
        const mounts = await (Neutralino as any).server.getMounts();
        if (
          previewRootAliasPathRef.current &&
          mounts?.[previewRootAliasPathRef.current]
        ) {
          await (Neutralino as any).server.unmount(
            previewRootAliasPathRef.current,
          );
        }
        if (mounts?.[PREVIEW_MOUNT_PATH]) {
          await (Neutralino as any).server.unmount(PREVIEW_MOUNT_PATH);
        }
        await (Neutralino as any).server.mount(
          PREVIEW_MOUNT_PATH,
          mountBasePath,
        );
        if (
          previewRootAliasPath &&
          previewRootAliasPath !== PREVIEW_MOUNT_PATH &&
          previewRootAliasPath !== SHARED_MOUNT_PATH &&
          previewRootAliasPath !== SHARED_MOUNT_PATH_IN_PREVIEW
        ) {
          if (mounts?.[previewRootAliasPath]) {
            await (Neutralino as any).server.unmount(previewRootAliasPath);
          }
          await (Neutralino as any).server.mount(
            previewRootAliasPath,
            mountBasePath,
          );
          previewRootAliasPathRef.current = previewRootAliasPath;
        } else {
          previewRootAliasPathRef.current = null;
        }

        if (sharedDirectoryPath) {
          if (mounts?.[SHARED_MOUNT_PATH]) {
            await (Neutralino as any).server.unmount(SHARED_MOUNT_PATH);
          }
          await (Neutralino as any).server.mount(
            SHARED_MOUNT_PATH,
            sharedDirectoryPath,
          );
          if (mounts?.[SHARED_MOUNT_PATH_IN_PREVIEW]) {
            await (Neutralino as any).server.unmount(
              SHARED_MOUNT_PATH_IN_PREVIEW,
            );
          }
          await (Neutralino as any).server.mount(
            SHARED_MOUNT_PATH_IN_PREVIEW,
            sharedDirectoryPath,
          );
        } else if (mounts?.[SHARED_MOUNT_PATH]) {
          await (Neutralino as any).server.unmount(SHARED_MOUNT_PATH);
          if (mounts?.[SHARED_MOUNT_PATH_IN_PREVIEW]) {
            await (Neutralino as any).server.unmount(
              SHARED_MOUNT_PATH_IN_PREVIEW,
            );
          }
        }

        mountReady = true;
      } catch (error) {
        console.warn(
          "Virtual host mount failed. Falling back to srcDoc preview.",
          error,
        );
      }

      filePathIndexRef.current = absolutePathIndex;
      loadingFilesRef.current.clear();
      loadingFilePromisesRef.current = {};
      textFileCacheRef.current = {};
      revokeBinaryAssetUrls();
      previewConsoleSeqRef.current = 0;
      previewConsoleBufferRef.current = [];
      if (previewConsoleFlushTimerRef.current !== null) {
        window.clearTimeout(previewConsoleFlushTimerRef.current);
        previewConsoleFlushTimerRef.current = null;
      }
      setPreviewConsoleEntries([]);
      pendingPreviewWritesRef.current = {};
      previewHistoryRef.current = {};
      previewDependencyIndexRef.current = {};
      previewDocCacheRef.current = {};
      previewDocCacheOrderRef.current = [];
      setDirtyFiles([]);
      setDirtyPathKeysByFile({});
      setFiles(fsFiles);
      setProjectPath(rootPath);
      setPreviewMountBasePath(mountBasePath);
      setIsPreviewMountReady(mountReady);

      const defaultHtmlFile = pickDefaultHtmlFile(fsFiles);
      const firstOpenableFile = Object.values(fsFiles).find((file) =>
        ["html", "css", "js", "unknown"].includes(file.type),
      );
      const initialFile = defaultHtmlFile ?? firstOpenableFile?.path ?? null;
      setActiveFileStable(initialFile);
      setPreviewSyncedFile(initialFile);
      setPreviewNavigationFile(initialFile);
      selectedPreviewHtmlRef.current =
        initialFile && fsFiles[initialFile]?.type === "html"
          ? initialFile
          : null;
      setSidebarToolMode("edit");
      setPreviewMode("preview");
      setInteractionMode("preview");
    } catch (error) {
      console.error("Failed to open folder:", error);
      alert("Could not open folder. Please try again.");
    }
  };
  const ensureDirectoryTree = useCallback(async (absolutePath: string) => {
    const normalized = normalizePath(absolutePath).replace(/[\\/]$/, "");
    if (!normalized) return;
    const parts = normalized.split("/");
    if (parts.length === 0) return;
    let current = "";
    let startIndex = 0;
    if (/^[A-Za-z]:$/.test(parts[0])) {
      current = `${parts[0]}/`;
      startIndex = 1;
    } else if (parts[0] === "") {
      current = "/";
      startIndex = 1;
    } else {
      current = parts[0];
      startIndex = 1;
    }
    for (let index = startIndex; index < parts.length; index += 1) {
      const segment = parts[index];
      if (!segment) continue;
      current = current.replace(/[\\/]$/, "");
      current = `${current}/${segment}`;
      try {
        await (Neutralino as any).filesystem.createDirectory(current);
      } catch {
        // Ignore "already exists" and permission rejections for existing roots.
      }
    }
  }, []);
  const refreshProjectFiles = useCallback(async () => {
    if (!projectPath) return;
    if (isRefreshingFilesRef.current) return;
    isRefreshingFilesRef.current = true;
    try {
      const rootPath = normalizePath(projectPath);
      const nextFiles: FileMap = {};
      const absolutePathIndex: Record<string, string> = {};
      const upsertFile = (virtualPath: string, absolutePath: string) => {
        const normalizedVirtual = normalizeProjectRelative(virtualPath);
        if (!normalizedVirtual) return;
        const existing = nextFiles[normalizedVirtual];
        if (existing) return;
        const name = normalizedVirtual.includes("/")
          ? normalizedVirtual.slice(normalizedVirtual.lastIndexOf("/") + 1)
          : normalizedVirtual;
        const oldEntry = filesRef.current[normalizedVirtual];
        const cachedText = textFileCacheRef.current[normalizedVirtual];
        const cachedBinary = binaryAssetUrlCacheRef.current[normalizedVirtual];
        let content: string | Blob = "";
        if (
          oldEntry &&
          typeof oldEntry.content === "string" &&
          oldEntry.content.length > 0
        ) {
          content = oldEntry.content;
        } else if (typeof cachedText === "string" && cachedText.length > 0) {
          content = cachedText;
        } else if (
          typeof cachedBinary === "string" &&
          cachedBinary.length > 0
        ) {
          content = cachedBinary;
        }
        nextFiles[normalizedVirtual] = {
          path: normalizedVirtual,
          name,
          type: inferFileType(name),
          content,
        };
        absolutePathIndex[normalizedVirtual] = normalizePath(absolutePath);
      };

      const walkDirectory = async (directoryPath: string): Promise<void> => {
        const entries = await (Neutralino as any).filesystem.readDirectory(
          directoryPath,
        );
        for (const entry of entries as Array<{ entry: string; type: string }>) {
          if (!entry?.entry || entry.entry === "." || entry.entry === "..")
            continue;
          const absolutePath = joinPath(directoryPath, entry.entry);
          if (entry.type === "DIRECTORY") {
            if (IGNORED_FOLDERS.has(entry.entry.toLowerCase())) continue;
            await walkDirectory(absolutePath);
            continue;
          }
          if (entry.type !== "FILE") continue;
          const normalizedAbsolute = normalizePath(absolutePath);
          const relativePath = normalizedAbsolute
            .replace(`${rootPath}/`, "")
            .replace(rootPath, "")
            .replace(/^\/+/, "");
          if (!relativePath) continue;
          upsertFile(relativePath, normalizedAbsolute);
        }
      };

      await walkDirectory(rootPath);

      for (const [virtualPath, absolutePath] of Object.entries(
        filePathIndexRef.current,
      )) {
        if (!virtualPath.toLowerCase().startsWith("shared/")) continue;
        if (absolutePathIndex[virtualPath]) continue;
        try {
          await (Neutralino as any).filesystem.getStats(absolutePath);
          upsertFile(virtualPath, absolutePath);
        } catch {
          // Removed shared file; ignore.
        }
      }

      filePathIndexRef.current = absolutePathIndex;
      setFiles(nextFiles);
      setCodeDraftByPath((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(
            ([path]) => nextFiles[path] && isTextFileType(nextFiles[path].type),
          ),
        ),
      );
      setCodeDirtyPathSet(
        (prev) =>
          Object.fromEntries(
            Object.entries(prev).filter(
              ([path]) =>
                nextFiles[path] && isTextFileType(nextFiles[path].type),
            ),
          ) as Record<string, true>,
      );
      setDirtyFiles((prev) => prev.filter((path) => Boolean(nextFiles[path])));

      const existingActive = activeFileRef.current;
      if (!existingActive || !nextFiles[existingActive]) {
        const fallback =
          pickDefaultHtmlFile(nextFiles) ??
          Object.keys(nextFiles).find((path) =>
            isTextFileType(nextFiles[path].type),
          ) ??
          null;
        setActiveFileStable(fallback);
        setPreviewSyncedFile(fallback);
        setPreviewNavigationFile(fallback);
      }
    } catch (error) {
      console.warn("Failed to refresh file index:", error);
    } finally {
      isRefreshingFilesRef.current = false;
    }
  }, [projectPath, setActiveFileStable]);
  const handleCreateFileAtPath = useCallback(
    async (parentPath: string) => {
      if (!projectPath) return;
      const defaultName = "new-file.html";
      const nextName = window.prompt("New file name", defaultName);
      if (!nextName) return;
      const cleanedName = normalizeProjectRelative(nextName);
      if (!cleanedName) return;

      const baseVirtual = normalizeProjectRelative(parentPath || "");
      const nextVirtual = normalizeProjectRelative(
        baseVirtual ? `${baseVirtual}/${cleanedName}` : cleanedName,
      );
      if (!nextVirtual) return;
      if (filesRef.current[nextVirtual]) {
        window.alert("A file with the same path already exists.");
        return;
      }

      const absolutePath = normalizePath(joinPath(projectPath, nextVirtual));
      const absoluteParent = getParentPath(absolutePath);
      if (absoluteParent) {
        await ensureDirectoryTree(absoluteParent);
      }
      try {
        await (Neutralino as any).filesystem.writeFile(absolutePath, "");
      } catch (error) {
        console.warn("Failed to create file:", error);
        window.alert("Could not create file.");
        return;
      }
      await refreshProjectFiles();
      setActiveFileStable(nextVirtual);
      setPreviewSyncedFile((prev) =>
        prev === nextVirtual ? prev : nextVirtual,
      );
      setPreviewNavigationFile((prev) =>
        prev === nextVirtual ? prev : nextVirtual,
      );
      setIsLeftPanelOpen(true);
    },
    [
      ensureDirectoryTree,
      projectPath,
      refreshProjectFiles,
      setActiveFileStable,
    ],
  );
  const handleCreateFolderAtPath = useCallback(
    async (parentPath: string) => {
      if (!projectPath) return;
      const nextName = window.prompt("New folder name", "new-folder");
      if (!nextName) return;
      const cleanedName = normalizeProjectRelative(nextName);
      if (!cleanedName) return;
      const baseVirtual = normalizeProjectRelative(parentPath || "");
      const nextVirtual = normalizeProjectRelative(
        baseVirtual ? `${baseVirtual}/${cleanedName}` : cleanedName,
      );
      if (!nextVirtual) return;
      const absolutePath = normalizePath(joinPath(projectPath, nextVirtual));
      try {
        await ensureDirectoryTree(absolutePath);
      } catch (error) {
        console.warn("Failed to create directory:", error);
        window.alert("Could not create folder.");
        return;
      }
      await refreshProjectFiles();
      setIsLeftPanelOpen(true);
    },
    [ensureDirectoryTree, projectPath, refreshProjectFiles],
  );
  const handleRenamePath = useCallback(
    async (path: string) => {
      if (!projectPath) return;
      if (!path) return;
      const currentName = path.includes("/")
        ? path.slice(path.lastIndexOf("/") + 1)
        : path;
      const nextName = window.prompt("Rename to", currentName);
      if (!nextName) return;
      const normalizedName = normalizeProjectRelative(nextName);
      if (!normalizedName) return;
      const parentVirtual = getParentPath(path) || "";
      const nextVirtual = normalizeProjectRelative(
        parentVirtual ? `${parentVirtual}/${normalizedName}` : normalizedName,
      );
      if (!nextVirtual || nextVirtual === path) return;
      if (filesRef.current[nextVirtual]) {
        window.alert("Another item with the same name already exists.");
        return;
      }
      const absoluteSource =
        filePathIndexRef.current[path] ||
        normalizePath(joinPath(projectPath, path));
      const absoluteParent = getParentPath(absoluteSource);
      if (!absoluteParent) return;
      const absoluteDestination = normalizePath(
        joinPath(absoluteParent, normalizedName),
      );
      try {
        await (Neutralino as any).filesystem.move(
          absoluteSource,
          absoluteDestination,
        );
      } catch (error) {
        console.warn("Rename failed:", error);
        window.alert("Could not rename item.");
        return;
      }
      await refreshProjectFiles();
      if (activeFileRef.current === path) {
        setActiveFileStable(nextVirtual);
      }
      setIsLeftPanelOpen(true);
    },
    [projectPath, refreshProjectFiles, setActiveFileStable],
  );
  const handleDeletePath = useCallback(
    async (path: string, kind: "file" | "folder") => {
      if (!projectPath || !path) return;
      const label = kind === "folder" ? "folder" : "file";
      const ok = window.confirm(`Delete ${label} "${path}"?`);
      if (!ok) return;
      const absoluteTarget =
        filePathIndexRef.current[path] ||
        normalizePath(joinPath(projectPath, path));
      try {
        await (Neutralino as any).filesystem.remove(absoluteTarget);
      } catch (error) {
        console.warn("Delete failed:", error);
        window.alert("Could not delete item.");
        return;
      }
      if (
        activeFileRef.current &&
        (activeFileRef.current === path ||
          activeFileRef.current.startsWith(`${path}/`))
      ) {
        setActiveFileStable(null);
      }
      await refreshProjectFiles();
      setIsLeftPanelOpen(true);
    },
    [projectPath, refreshProjectFiles, setActiveFileStable],
  );
  const handleDuplicateFile = useCallback(
    async (path: string) => {
      if (!projectPath || !path) return;
      const absoluteSource =
        filePathIndexRef.current[path] ||
        normalizePath(joinPath(projectPath, path));
      const currentName = path.includes("/")
        ? path.slice(path.lastIndexOf("/") + 1)
        : path;
      const dotIndex = currentName.lastIndexOf(".");
      const stem = dotIndex > 0 ? currentName.slice(0, dotIndex) : currentName;
      const ext = dotIndex > 0 ? currentName.slice(dotIndex) : "";
      const defaultName = `${stem}-copy${ext}`;
      const nextName = window.prompt("Duplicate as", defaultName);
      if (!nextName) return;
      const normalizedName = normalizeProjectRelative(nextName);
      if (!normalizedName) return;
      const parentVirtual = getParentPath(path) || "";
      const nextVirtual = normalizeProjectRelative(
        parentVirtual ? `${parentVirtual}/${normalizedName}` : normalizedName,
      );
      if (!nextVirtual) return;
      if (filesRef.current[nextVirtual]) {
        window.alert("A file with this name already exists.");
        return;
      }
      const absoluteParent = getParentPath(absoluteSource);
      if (!absoluteParent) return;
      const absoluteDestination = normalizePath(
        joinPath(absoluteParent, normalizedName),
      );
      try {
        await (Neutralino as any).filesystem.copy(
          absoluteSource,
          absoluteDestination,
          {
            recursive: false,
            overwrite: false,
            skip: false,
          },
        );
      } catch (error) {
        console.warn("Duplicate failed:", error);
        window.alert("Could not duplicate file.");
        return;
      }
      await refreshProjectFiles();
      setActiveFileStable(nextVirtual);
      setIsLeftPanelOpen(true);
    },
    [projectPath, refreshProjectFiles, setActiveFileStable],
  );
  useEffect(() => {
    if (!projectPath) return;
    const timer = window.setInterval(() => {
      void refreshProjectFiles();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [projectPath, refreshProjectFiles]);
  const resolveExplorerHtmlPath = useCallback((rawPath: string): string | null => {
    const normalized = normalizeProjectRelative(String(rawPath || ""));
    if (!normalized) return null;

    const direct =
      findFilePathCaseInsensitive(filesRef.current, normalized) || normalized;
    const directFile = filesRef.current[direct];
    if (directFile?.type === "html") return direct;

    const baseFolder = direct.replace(/\/+$/, "");
    const directIndex = findFilePathCaseInsensitive(
      filesRef.current,
      `${baseFolder}/index.html`,
    );
    if (directIndex && filesRef.current[directIndex]?.type === "html") {
      return directIndex;
    }

    const htmlUnderFolder = Object.keys(filesRef.current)
      .filter((path) => {
        const normalizedPath = normalizeProjectRelative(path);
        if (!normalizedPath.startsWith(`${baseFolder}/`)) return false;
        return filesRef.current[path]?.type === "html";
      })
      .sort((a, b) => a.localeCompare(b));
    if (htmlUnderFolder.length === 0) return null;
    return htmlUnderFolder[0];
  }, []);
  const handleSelectFile = useCallback(
    (path: string) => {
      const resolvedPath = resolveExplorerHtmlPath(path) || path;
      console.log("[Preview] Current page:", resolvedPath);
      const currentPath = selectedPreviewHtmlRef.current;
      const targetIsHtml = filesRef.current[resolvedPath]?.type === "html";
      if (targetIsHtml) {
        explorerSelectionLockRef.current = resolvedPath;
      } else {
        explorerSelectionLockRef.current = null;
      }
      if (
        interactionModeRef.current === "preview" &&
        previewModeRef.current === "edit" &&
        targetIsHtml &&
        currentPath &&
        currentPath !== resolvedPath &&
        hasUnsavedChangesForFile(currentPath)
      ) {
        setPendingPageSwitch({
          mode: "switch",
          fromPath: currentPath,
          nextPath: resolvedPath,
          source: "explorer",
        });
        setIsPageSwitchPromptOpen(true);
        setIsLeftPanelOpen(true);
        return;
      }
      if (activeFileRef.current === resolvedPath) {
        setIsLeftPanelOpen(true);
        if (
          filesRef.current[resolvedPath]?.type === "html" &&
          interactionModeRef.current !== "preview"
        ) {
          setInteractionMode("preview");
        }
        return;
      }
      syncPreviewActiveFile(resolvedPath, "explorer");
      setIsLeftPanelOpen(true);
    },
    [hasUnsavedChangesForFile, resolveExplorerHtmlPath, syncPreviewActiveFile],
  );
  const selectedElement = selectedId ? findElementById(root, selectedId) : null;
  const selectedPathIds = useMemo(
    () => collectPathIdsToElement(root, selectedId),
    [root, selectedId],
  );
  const previewLayerSelectedId = useMemo(() => {
    if (
      interactionMode !== "preview" ||
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0
    ) {
      return null;
    }
    return toPreviewLayerId(previewSelectedPath);
  }, [interactionMode, previewSelectedPath]);
  const previewLayersRoot = useMemo<VirtualElement>(() => {
    if (interactionMode !== "preview") return root;
    const emptyPreviewRoot: VirtualElement = {
      id: "preview-live-root",
      type: "body",
      name: "Body",
      content: "",
      html: "",
      styles: {},
      children: [],
    };
    const liveDocument =
      previewFrameRef.current?.contentDocument ??
      previewFrameRef.current?.contentWindow?.document ??
      null;
    const liveBody = liveDocument?.body ?? null;
    if (liveBody) {
      return {
        id: "preview-live-root",
        type: "body",
        name: "Body",
        content: "",
        html: liveBody.innerHTML || "",
        styles: {},
        children: Array.from(liveBody.children).map((child, index) =>
          buildPreviewLayerTreeFromElement(child, [index]),
        ),
      };
    }
    const activeHtmlPath = selectedPreviewHtmlRef.current;
    const activeHtmlFile =
      activeHtmlPath && files[activeHtmlPath] ? files[activeHtmlPath] : null;
    const activeHtmlContent =
      activeHtmlFile && typeof activeHtmlFile.content === "string"
        ? activeHtmlFile.content
        : "";
    const fallbackHtml =
      activeHtmlPath &&
        typeof textFileCacheRef.current[activeHtmlPath] === "string"
        ? textFileCacheRef.current[activeHtmlPath]
        : "";
    const sourceHtml =
      activeHtmlContent && activeHtmlContent.trim().length > 0
        ? activeHtmlContent
        : fallbackHtml && fallbackHtml.trim().length > 0
          ? fallbackHtml
          : selectedPreviewDoc;
    if (!sourceHtml || sourceHtml.trim().length === 0) return emptyPreviewRoot;
    try {
      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const body = parsed.body;
      return {
        id: "preview-live-root",
        type: "body",
        name: "Body",
        content: "",
        html: body?.innerHTML || "",
        styles: {},
        children: body
          ? Array.from(body.children).map((child, index) =>
            buildPreviewLayerTreeFromElement(child, [index]),
          )
          : [],
      };
    } catch {
      return emptyPreviewRoot;
    }
  }, [files, interactionMode, previewRefreshNonce, root, selectedPreviewDoc]);
  const selectPreviewElementAtPath = useCallback((path: number[]) => {
    if (
      interactionModeRef.current !== "preview" ||
      !Array.isArray(path) ||
      path.length === 0
    ) {
      return;
    }
    const frameDocument =
      previewFrameRef.current?.contentDocument ??
      previewFrameRef.current?.contentWindow?.document ??
      null;
    if (!frameDocument?.body) return;
    const target = readElementByPath(frameDocument.body, path);
    if (!target) return;
    Array.from(
      frameDocument.querySelectorAll<HTMLElement>(".__nx-preview-selected"),
    ).forEach((el) => el.classList.remove("__nx-preview-selected"));
    target.classList.add("__nx-preview-selected");
    const inlineStyles = parseInlineStyleText(
      target.getAttribute("style") || "",
    );
    const computedStyles = extractComputedStylesFromElement(target);
    const mergedStyles: React.CSSProperties = {
      ...(computedStyles || {}),
      ...inlineStyles,
    };
    const nextElement: VirtualElement = {
      id:
        target.getAttribute("id") ||
        `preview-${toPreviewLayerId(path)}-${Date.now()}`,
      type: String(target.tagName || "div").toLowerCase(),
      name: String(target.tagName || "div").toUpperCase(),
      content: normalizeEditorMultilineText(extractTextWithBreaks(target)),
      html: target instanceof HTMLElement ? target.innerHTML || "" : "",
      ...(target.getAttribute("src")
        ? { src: target.getAttribute("src") || "" }
        : {}),
      ...(target.getAttribute("href")
        ? { href: target.getAttribute("href") || "" }
        : {}),
      ...(target.getAttribute("class")
        ? { className: target.getAttribute("class") || "" }
        : {}),
      ...(extractCustomAttributesFromElement(target)
        ? { attributes: extractCustomAttributesFromElement(target) || {} }
        : {}),
      styles: mergedStyles,
      children: [],
    };
    setPreviewSelectedPath(path);
    setPreviewSelectedElement(nextElement);
    setPreviewSelectedComputedStyles(computedStyles);
    setSelectedId(null);
    setIsCodePanelOpen(false);
    setIsRightPanelOpen(true);
  }, []);
  const handleSidebarSelectElement = useCallback(
    (id: string) => {
      const previewPath = fromPreviewLayerId(id);
      if (previewPath) {
        selectPreviewElementAtPath(previewPath);
        return;
      }
      handleSelect(id);
    },
    [handleSelect, selectPreviewElementAtPath],
  );
  const inspectorElement = previewSelectedElement ?? selectedElement;
  const selectedPreviewHtml = useMemo(() => {
    if (!projectPath) return null;
    if (previewSyncedFile && files[previewSyncedFile]?.type === "html") {
      return previewSyncedFile;
    }
    if (activeFile && files[activeFile]?.type === "html") return activeFile;
    return pickDefaultHtmlFile(files);
  }, [activeFile, files, previewSyncedFile, projectPath]);
  const selectedMountedPreviewHtml = useMemo(() => {
    if (!projectPath) return null;
    if (
      previewNavigationFile &&
      files[previewNavigationFile]?.type === "html"
    ) {
      return previewNavigationFile;
    }
    return selectedPreviewHtml;
  }, [files, previewNavigationFile, projectPath, selectedPreviewHtml]);
  const selectedPreviewSrc = useMemo(() => {
    if (
      !selectedMountedPreviewHtml ||
      !isPreviewMountReady ||
      !previewMountBasePath
    ) {
      return null;
    }
    const absolutePath = filePathIndexRef.current[selectedMountedPreviewHtml];
    if (!absolutePath) return null;
    const relativePath = toMountRelativePath(
      previewMountBasePath,
      absolutePath,
    );
    if (!relativePath) return null;
    const nlPort = String((window as any).NL_PORT || "").trim();
    const previewServerOrigin = nlPort ? `http://127.0.0.1:${nlPort}` : "";
    const mountPath = encodeURI(`${PREVIEW_MOUNT_PATH}/${relativePath}`);
    const withRefresh = `${mountPath}${mountPath.includes("?") ? "&" : "?"}nx_refresh=${previewRefreshNonce}`;
    return previewServerOrigin
      ? `${previewServerOrigin}${withRefresh}`
      : withRefresh;
  }, [
    selectedMountedPreviewHtml,
    isPreviewMountReady,
    previewMountBasePath,
    previewRefreshNonce,
    projectPath,
  ]);
  const isMountedPreview = Boolean(
    selectedPreviewSrc && interactionMode === "preview",
  );
  useEffect(() => {
    if (isMountedPreview) return;
    setPreviewNavigationFile((prev) =>
      prev === selectedPreviewHtml ? prev : selectedPreviewHtml,
    );
  }, [isMountedPreview, selectedPreviewHtml]);
  const shouldPrepareEditPreviewDoc = Boolean(
    selectedPreviewHtml && !isMountedPreview,
  );
  const hasPreviewContent = Boolean(
    projectPath && (selectedPreviewSrc || selectedPreviewDoc),
  );
  useEffect(() => {
    const setActive = (active: boolean) => setIsToolboxDragging(active);
    const onToolboxDragState = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean; type?: string }>)
        .detail;
      const isActive = Boolean(detail?.active);
      const nextType = String(detail?.type || "").trim();
      setActive(isActive);
      if (isActive && nextType) {
        toolboxDragTypeRef.current = nextType;
      } else if (!isActive) {
        toolboxDragTypeRef.current = "";
      }
    };
    const onWindowDrop = () => {
      setActive(false);
      toolboxDragTypeRef.current = "";
    };
    const onWindowDragEnd = () => {
      setActive(false);
      toolboxDragTypeRef.current = "";
    };
    const onWindowDragOver = (event: DragEvent) => {
      if (hasToolboxDragType(event.dataTransfer)) {
        setActive(true);
      }
    };
    window.addEventListener(
      "nocodex-toolbox-drag-state",
      onToolboxDragState as EventListener,
    );
    window.addEventListener("drop", onWindowDrop);
    window.addEventListener("dragend", onWindowDragEnd);
    window.addEventListener("dragover", onWindowDragOver);
    return () => {
      window.removeEventListener(
        "nocodex-toolbox-drag-state",
        onToolboxDragState as EventListener,
      );
      window.removeEventListener("drop", onWindowDrop);
      window.removeEventListener("dragend", onWindowDragEnd);
      window.removeEventListener("dragover", onWindowDragOver);
    };
  }, []);
  useEffect(() => {
    selectedPreviewHtmlRef.current = selectedPreviewHtml;
    setPreviewSelectedPath(null);
    setPreviewSelectedElement(null);
    setPreviewSelectedComputedStyles(null);
  }, [selectedPreviewHtml]);
  const handlePreviewStageDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (
        !selectedPreviewHtml ||
        (!hasToolboxDragType(event.dataTransfer) && !toolboxDragTypeRef.current)
      ) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [selectedPreviewHtml],
  );

  const resolveVirtualPathFromMountRelative = useCallback(
    (mountRelativePath: string): string | null => {
      if (!previewMountBasePath || !mountRelativePath) return null;
      const normalizedTarget = normalizeProjectRelative(
        decodeURIComponent(mountRelativePath).replace(/^\/+|\/+$/g, ""),
      ).toLowerCase();
      if (!normalizedTarget) return null;

      for (const virtualPath in filePathIndexRef.current) {
        const absolutePath = filePathIndexRef.current[virtualPath];
        const relative = toMountRelativePath(
          previewMountBasePath,
          absolutePath,
        );
        if (!relative) continue;
        if (
          relative.toLowerCase() === normalizedTarget ||
          relative.toLowerCase() === `${normalizedTarget}/index.html`
        ) {
          return virtualPath;
        }
      }
      return null;
    },
    [previewMountBasePath],
  );

  const extractMountRelativePath = useCallback(
    (locationPath: string): string | null => {
      if (!locationPath) return null;
      if (locationPath.startsWith(`${PREVIEW_MOUNT_PATH}/`)) {
        return locationPath.slice(PREVIEW_MOUNT_PATH.length + 1);
      }
      const aliasPath = previewRootAliasPathRef.current;
      if (aliasPath && locationPath.startsWith(`${aliasPath}/`)) {
        return locationPath.slice(aliasPath.length + 1);
      }
      return null;
    },
    [],
  );
  const injectMountedPreviewBridge = useCallback(
    (frame: HTMLIFrameElement | null) => {
      const frameWindow = frame?.contentWindow ?? null;
      const frameDocument = frameWindow?.document ?? null;
      if (!frameWindow || !frameDocument) return;
      if (
        frameDocument.documentElement?.getAttribute(
          "data-nx-mounted-preview-bridge",
        ) === "1"
      ) {
        return;
      }
      try {
        const script = frameDocument.createElement("script");
        script.type = "text/javascript";
        script.text = MOUNTED_PREVIEW_BRIDGE_SCRIPT;
        const target =
          frameDocument.head ||
          frameDocument.documentElement ||
          frameDocument.body;
        if (!target) return;
        target.appendChild(script);
        script.remove();
      } catch {
        try {
          (frameWindow as any).eval(MOUNTED_PREVIEW_BRIDGE_SCRIPT);
        } catch {
          // Ignore bridge injection failures for locked-down page contexts.
        }
      }
    },
    [],
  );
  const postPreviewModeToFrame = useCallback(
    (overrides?: {
      mode?: "edit" | "preview";
      selectionMode?: PreviewSelectionMode;
      toolMode?: "edit" | "inspect" | "draw" | "move";
      drawTag?: string;
      force?: boolean;
    }) => {
      const frameWindow =
        previewFrameRef.current?.contentWindow ??
        previewFrameRef.current?.contentDocument?.defaultView ??
        null;
      if (!frameWindow) return;
      const nextMode = overrides?.mode ?? previewMode;
      const nextSelectionMode =
        overrides?.selectionMode ?? previewSelectionMode;
      const nextToolMode = overrides?.toolMode ?? sidebarToolMode;
      const nextDrawTag = overrides?.drawTag ?? drawElementTag;
      const shouldSend = overrides?.force
        ? true
        : interactionMode === "preview";
      if (!shouldSend) return;
      try {
        (frameWindow as any).__nxPreviewHostMode = nextMode;
        (frameWindow as any).__nxPreviewHostSelectionMode = nextSelectionMode;
        (frameWindow as any).__nxPreviewHostToolMode = nextToolMode;
        (frameWindow as any).__nxPreviewHostDrawTag = nextDrawTag;
      } catch {
        // Ignore host flag sync issues for transient frame reloads.
      }
      try {
        frameWindow.postMessage(
          JSON.stringify({
            type: "PREVIEW_SET_MODE",
            mode: nextMode,
            selectionMode: nextSelectionMode,
            toolMode: nextToolMode,
            drawTag: nextDrawTag,
          }),
          "*",
        );
      } catch {
        // Ignore postMessage failures for transient frame reloads.
      }
    },
    [
      drawElementTag,
      interactionMode,
      previewMode,
      previewSelectionMode,
      sidebarToolMode,
    ],
  );
  const setPreviewModeWithSync = useCallback(
    (
      nextMode: "edit" | "preview",
      options?: { skipUnsavedPrompt?: boolean },
    ) => {
      const currentPath = selectedPreviewHtmlRef.current;
      const shouldPromptUnsaved =
        !options?.skipUnsavedPrompt &&
        interactionModeRef.current === "preview" &&
        previewModeRef.current === "edit" &&
        nextMode === "preview" &&
        Boolean(currentPath) &&
        hasUnsavedChangesForFile(currentPath);
      if (shouldPromptUnsaved && currentPath) {
        setPendingPageSwitch({
          mode: "preview_mode",
          fromPath: currentPath,
          nextPath: currentPath,
          source: "navigate",
          nextPreviewMode: "preview",
        });
        setIsPageSwitchPromptOpen(true);
        return;
      }
      setPreviewMode(nextMode);
      if (interactionModeRef.current !== "preview") return;
      postPreviewModeToFrame({ mode: nextMode, force: true });
      window.setTimeout(() => {
        postPreviewModeToFrame({ mode: nextMode, force: true });
      }, 50);
      window.setTimeout(() => {
        postPreviewModeToFrame({ mode: nextMode, force: true });
      }, 180);
    },
    [hasUnsavedChangesForFile, postPreviewModeToFrame],
  );
  const handleSidebarInteractionModeChange = useCallback(
    (nextMode: "edit" | "preview" | "inspect" | "draw" | "move") => {
      if (nextMode === "preview") {
        setSidebarToolMode("edit");
        setInteractionMode("preview");
        return;
      }
      setSidebarToolMode(nextMode);
      if (interactionModeRef.current === "preview") {
        // Keep mounted project visible; only switch preview into edit sub-mode.
        setPreviewModeWithSync("edit");
        postPreviewModeToFrame({
          mode: "edit",
          toolMode: nextMode,
          drawTag: drawElementTag,
          force: true,
        });
        return;
      }
      if (projectPath) {
        setPreviewMode("edit");
        setInteractionMode("preview");
        return;
      }
      setInteractionMode(nextMode);
    },
    [
      drawElementTag,
      postPreviewModeToFrame,
      projectPath,
      setPreviewModeWithSync,
    ],
  );
  const sidebarInteractionMode = useMemo<
    "edit" | "preview" | "inspect" | "draw" | "move"
  >(() => {
    if (interactionMode === "preview") {
      return previewMode === "edit" ? sidebarToolMode : "preview";
    }
    return interactionMode;
  }, [interactionMode, previewMode, sidebarToolMode]);
  const resolvedConfigVirtualPath = useMemo(
    () => resolveConfigPathFromFiles(files, "config.json") || CONFIG_JSON_PATH,
    [files],
  );
  const resolvedPortfolioConfigVirtualPath = useMemo(
    () =>
      resolveConfigPathFromFiles(files, "portfolioconfig.json") ||
      PORTFOLIO_CONFIG_PATH,
    [files],
  );
  const configPathForModal = configModalConfigPath || resolvedConfigVirtualPath;
  const portfolioPathForModal =
    configModalPortfolioPath || resolvedPortfolioConfigVirtualPath;
  const isActivePreviewMessageSource = useCallback(
    (source: MessageEventSource | null): boolean => {
      const activeWindow = previewFrameRef.current?.contentWindow ?? null;
      if (!activeWindow || !source) return false;
      return source === activeWindow;
    },
    [],
  );
  const getLivePreviewSelectedElement = useCallback(
    (path?: number[] | null): Element | null => {
      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!frameDocument?.body) return null;
      const byMarker = frameDocument.querySelector(".__nx-preview-selected");
      if (byMarker) return byMarker;
      if (Array.isArray(path) && path.length > 0) {
        const byPath = readElementByPath(frameDocument.body, path);
        if (byPath) return byPath;
      }
      return null;
    },
    [],
  );
  const postPreviewPatchToFrame = useCallback(
    (payload: Record<string, unknown>) => {
      const frameWindow =
        previewFrameRef.current?.contentWindow ??
        previewFrameRef.current?.contentDocument?.defaultView ??
        null;
      if (!frameWindow) return;
      try {
        frameWindow.postMessage(JSON.stringify(payload), "*");
      } catch {
        // Ignore transient frame messaging errors.
      }
    },
    [],
  );

  const handlePreviewFrameLoad = useCallback(
    (event: React.SyntheticEvent<HTMLIFrameElement>) => {
      const frame = event.currentTarget;
      if (selectedPreviewSrc) {
        injectMountedPreviewBridge(frame);
      }
      postPreviewModeToFrame();
      window.setTimeout(postPreviewModeToFrame, 0);
      window.setTimeout(postPreviewModeToFrame, 120);
      window.setTimeout(postPreviewModeToFrame, 360);

      if (!isPreviewMountReady) return;
      const frameSrc = frame.getAttribute("src") || frame.src || "";
      if (!frameSrc) return;

      let locationPath = "";
      try {
        locationPath = new URL(frameSrc).pathname || "";
      } catch {
        return;
      }

      if (!locationPath) return;
      const mountRelativePath = extractMountRelativePath(locationPath);
      if (!mountRelativePath) return;
      const resolvedVirtualPath =
        resolveVirtualPathFromMountRelative(mountRelativePath);
      if (!resolvedVirtualPath) return;
      const lockPath = explorerSelectionLockRef.current;
      if (lockPath) {
        const resolvedNorm = normalizeProjectRelative(resolvedVirtualPath).toLowerCase();
        const lockNorm = normalizeProjectRelative(lockPath).toLowerCase();
        if (resolvedNorm !== lockNorm) {
          // Frame loaded a different page than what we locked to — redirect back.
          // Clear the lock first to prevent an infinite redirect loop.
          explorerSelectionLockRef.current = null;
          syncPreviewActiveFile(lockPath, "explorer", { skipUnsavedPrompt: true });
          setPreviewRefreshNonce((prev) => prev + 1);
          return;
        }
        // Frame loaded the locked page — clear the lock so future loads are free.
        explorerSelectionLockRef.current = null;
      }
      const resolvedFile = filesRef.current[resolvedVirtualPath];
      if (!resolvedFile || resolvedFile.type !== "html") return;
      if (resolvedVirtualPath === activeFileRef.current) return;

      if (!shouldProcessPreviewPageSignal(resolvedVirtualPath)) return;
      console.log("[Preview] Current page:", resolvedVirtualPath);
      syncPreviewActiveFile(resolvedVirtualPath, "load");
    },
    [
      extractMountRelativePath,
      injectMountedPreviewBridge,
      isPreviewMountReady,
      postPreviewModeToFrame,
      resolveVirtualPathFromMountRelative,
      selectedPreviewSrc,
      shouldProcessPreviewPageSignal,
      syncPreviewActiveFile,
    ],
  );
  useEffect(() => {
    if (selectedPreviewSrc) {
      injectMountedPreviewBridge(previewFrameRef.current);
    }
    postPreviewModeToFrame();
    const t0 = window.setTimeout(postPreviewModeToFrame, 0);
    const t120 = window.setTimeout(postPreviewModeToFrame, 120);
    const t360 = window.setTimeout(postPreviewModeToFrame, 360);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t120);
      window.clearTimeout(t360);
    };
  }, [
    injectMountedPreviewBridge,
    postPreviewModeToFrame,
    selectedPreviewDoc,
    selectedPreviewSrc,
    previewMode,
  ]);
  const persistPreviewHtmlContent = useCallback(
    async (
      updatedPath: string,
      serialized: string,
      options?: {
        refreshPreviewDoc?: boolean;
        saveNow?: boolean;
        skipAutoSave?: boolean;
        elementPath?: number[];
        pushToHistory?: boolean;
      },
    ) => {
      const shouldRefreshPreviewDoc = options?.refreshPreviewDoc ?? false;
      const shouldSaveNow = options?.saveNow ?? false;
      const shouldSkipAutoSave = options?.skipAutoSave ?? false;
      const shouldPushToHistory = options?.pushToHistory ?? true;
      const previousSerialized =
        typeof filesRef.current[updatedPath]?.content === "string"
          ? (filesRef.current[updatedPath]?.content as string)
          : typeof textFileCacheRef.current[updatedPath] === "string"
            ? textFileCacheRef.current[updatedPath]
            : "";

      // CRITICAL SAFETY GUARD: Prevent accidental wiping of files
      if (!serialized || (serialized.trim().length === 0)) {
        console.error(`[CRITICAL] Safety Guard: Blocked attempt to write empty content to ${updatedPath}`);
        return;
      }

      if (previousSerialized && previousSerialized.length > 500 && serialized.length < 100) {
        console.error(`[CRITICAL] Safety Guard: Blocked suspicious downsizing of ${updatedPath} (from ${previousSerialized.length} to ${serialized.length} bytes)`);
        return;
      }

      textFileCacheRef.current[updatedPath] = serialized;
      setFiles((prev) => {
        const current = prev[updatedPath];
        if (!current) return prev;
        return {
          ...prev,
          [updatedPath]: {
            ...current,
            content: serialized,
          },
        };
      });
      // Also synchronously update the ref so any code that reads filesRef.current
      // in the same tick (e.g. applyPreviewContentUpdate called right after draw)
      // immediately sees the new HTML with the just-created element.
      const existingRefEntry = filesRef.current[updatedPath];
      if (existingRefEntry) {
        filesRef.current = {
          ...filesRef.current,
          [updatedPath]: { ...existingRefEntry, content: serialized },
        };
      }
      invalidatePreviewDocCache(updatedPath);
      pendingPreviewWritesRef.current[updatedPath] = serialized;
      setDirtyFiles((prev) =>
        prev.includes(updatedPath) ? prev : [...prev, updatedPath],
      );
      if (options?.elementPath && options.elementPath.length > 0) {
        markPreviewPathDirty(updatedPath, options.elementPath);
      }
      if (shouldPushToHistory) {
        pushPreviewHistory(updatedPath, serialized, previousSerialized);
      }

      const currentEntry = filesRef.current[updatedPath];
      if (shouldRefreshPreviewDoc && currentEntry) {
        if (!isMountedPreview) {
          const previewSnapshot: FileMap = {
            ...filesRef.current,
            [updatedPath]: {
              ...currentEntry,
              content: serialized,
            },
          };
          setSelectedPreviewDoc(
            createPreviewDocument(
              previewSnapshot,
              updatedPath,
              previewDependencyIndexRef.current[updatedPath],
            ),
          );
        } else if (!shouldSaveNow) {
          setPreviewRefreshNonce((prev) => prev + 1);
        }
      }

      if (shouldSaveNow) {
        await flushPendingPreviewSaves();
        if (shouldRefreshPreviewDoc && isMountedPreview) {
          setPreviewRefreshNonce((prev) => prev + 1);
        }
        return;
      }
      if (!shouldSkipAutoSave) {
        schedulePreviewAutoSave();
      }
    },
    [
      flushPendingPreviewSaves,
      invalidatePreviewDocCache,
      isMountedPreview,
      markPreviewPathDirty,
      pushPreviewHistory,
      schedulePreviewAutoSave,
    ],
  );
  const applyPreviewInlineEditDraft = useCallback(
    async (filePath: string, elementPath: number[], nextInnerHtml: string) => {
      if (
        !filePath ||
        !Array.isArray(elementPath) ||
        elementPath.length === 0
      ) {
        return;
      }
      const sourceHtml =
        typeof filesRef.current[filePath]?.content === "string"
          ? (filesRef.current[filePath]?.content as string)
          : typeof textFileCacheRef.current[filePath] === "string"
            ? textFileCacheRef.current[filePath]
            : "";
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const target = readElementByPath(parsed.body, elementPath);
      if (!target) return;
      target.innerHTML = nextInnerHtml;
      const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
      await persistPreviewHtmlContent(filePath, serialized, {
        refreshPreviewDoc: false,
        pushToHistory: false,
      });
    },
    [persistPreviewHtmlContent],
  );
  const applyPreviewInlineEdit = useCallback(
    async (elementPath: number[], nextInnerHtml: string) => {
      if (
        !selectedPreviewHtml ||
        !Array.isArray(elementPath) ||
        elementPath.length === 0
      ) {
        return;
      }

      const normalizedPath = elementPath
        .map((segment) => {
          const numeric = Number(segment);
          if (!Number.isFinite(numeric)) return -1;
          return Math.max(0, Math.trunc(numeric));
        })
        .filter((segment) => segment >= 0);

      if (normalizedPath.length !== elementPath.length) return;

      const loaded = await loadFileContent(selectedPreviewHtml);
      const sourceHtml =
        typeof loaded === "string" && loaded.length > 0
          ? loaded
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : "";
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const target = readElementByPath(parsed.body, normalizedPath);
      if (!target) return;

      target.innerHTML = nextInnerHtml;
      const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
      await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
        refreshPreviewDoc: false,
        elementPath: normalizedPath,
      });
      const liveElement = getLivePreviewSelectedElement(normalizedPath);
      const snapshotElement =
        liveElement instanceof HTMLElement
          ? liveElement
          : target instanceof HTMLElement
            ? target
            : null;
      const snapshotNode: Element = snapshotElement || target;
      const snapshotInlineStyle =
        snapshotElement instanceof HTMLElement
          ? snapshotElement.getAttribute("style") || ""
          : snapshotNode.getAttribute("style") || "";
      const snapshotInlineStyles = parseInlineStyleText(snapshotInlineStyle);
      const snapshotComputedStyles =
        extractComputedStylesFromElement(snapshotElement || snapshotNode) ||
        null;
      const snapshotText = normalizeEditorMultilineText(
        extractTextWithBreaks(snapshotNode),
      );
      const snapshotHtml =
        snapshotElement instanceof HTMLElement
          ? snapshotElement.innerHTML || ""
          : target.innerHTML || nextInnerHtml;
      const snapshotAttributes =
        extractCustomAttributesFromElement(snapshotElement || snapshotNode) ||
        undefined;
      const snapshotSrc =
        snapshotElement instanceof HTMLElement
          ? snapshotElement.getAttribute("src") || undefined
          : snapshotNode.getAttribute("src") || undefined;
      const snapshotHref =
        snapshotElement instanceof HTMLElement
          ? snapshotElement.getAttribute("href") || undefined
          : snapshotNode.getAttribute("href") || undefined;
      const snapshotClassName =
        snapshotElement && typeof snapshotElement.className === "string"
          ? snapshotElement.className
          : typeof snapshotNode.className === "string"
            ? snapshotNode.className
            : undefined;
      const snapshotTag = String(snapshotNode.tagName || "div").toLowerCase();
      const inlineAnimation =
        typeof snapshotInlineStyles.animation === "string"
          ? snapshotInlineStyles.animation.trim()
          : "";
      const computedAnimationCandidate =
        snapshotComputedStyles &&
          typeof snapshotComputedStyles.animation === "string"
          ? snapshotComputedStyles.animation.trim()
          : "";
      const resolvedAnimation =
        inlineAnimation ||
        (computedAnimationCandidate &&
          !/^none(?:\s|$)/i.test(computedAnimationCandidate)
          ? computedAnimationCandidate
          : "");
      const mergedStyles: React.CSSProperties = {
        ...(snapshotComputedStyles || {}),
        ...snapshotInlineStyles,
      };

      setPreviewSelectedPath(normalizedPath);
      setPreviewSelectedComputedStyles(snapshotComputedStyles);
      setPreviewSelectedElement({
        id:
          snapshotElement?.id ||
          snapshotNode.getAttribute("id") ||
          `preview-${Date.now()}`,
        type: snapshotTag,
        name: snapshotTag.toUpperCase(),
        content: snapshotText,
        html: snapshotHtml,
        ...(snapshotSrc ? { src: snapshotSrc } : {}),
        ...(snapshotHref ? { href: snapshotHref } : {}),
        ...(snapshotClassName ? { className: snapshotClassName } : {}),
        ...(snapshotAttributes ? { attributes: snapshotAttributes } : {}),
        ...(resolvedAnimation ? { animation: resolvedAnimation } : {}),
        styles: mergedStyles,
        children: [],
      });
    },
    [
      getLivePreviewSelectedElement,
      loadFileContent,
      persistPreviewHtmlContent,
      selectedPreviewHtml,
    ],
  );
  const applyPreviewStyleUpdateAtPath = useCallback(
    async (
      elementPath: number[],
      styles: Partial<React.CSSProperties>,
      options?: { syncSelectedElement?: boolean },
    ) => {
      if (
        !selectedPreviewHtml ||
        !Array.isArray(elementPath) ||
        elementPath.length === 0
      ) {
        return;
      }

      const loaded = await loadFileContent(selectedPreviewHtml);
      const sourceHtml =
        typeof loaded === "string" && loaded.length > 0
          ? loaded
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : "";
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const target = readElementByPath(parsed.body, elementPath);
      const liveTarget = getLivePreviewSelectedElement(elementPath);
      if (
        !(target instanceof HTMLElement) &&
        !(liveTarget instanceof HTMLElement)
      )
        return;
      const previewStylePatch: Record<string, string> = {};

      for (const [key, rawValue] of Object.entries(styles)) {
        const cssKey = toCssPropertyName(key);
        const valueRaw =
          rawValue === undefined || rawValue === null ? "" : String(rawValue);
        const value =
          cssKey === "font-family"
            ? normalizeFontFamilyCssValue(valueRaw)
            : valueRaw;
        previewStylePatch[key] = value;
        if (!value) {
          if (target instanceof HTMLElement) {
            target.style.removeProperty(cssKey);
          }
          if (liveTarget instanceof HTMLElement) {
            liveTarget.style.removeProperty(cssKey);
          }
          continue;
        }
        if (target instanceof HTMLElement) {
          target.style.setProperty(
            cssKey,
            value,
            cssKey === "font-family" ? "important" : "",
          );
        }
        if (liveTarget instanceof HTMLElement) {
          if (cssKey === "animation") {
            liveTarget.style.setProperty("animation", "none");
            // Force layout so the next assignment retriggers animation playback.
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            liveTarget.offsetWidth;
          }
          liveTarget.style.setProperty(
            cssKey,
            value,
            cssKey === "font-family" ? "important" : "",
          );
        }
      }
      postPreviewPatchToFrame({
        type: "PREVIEW_APPLY_STYLE",
        path: elementPath,
        styles: previewStylePatch,
      });

      if (target instanceof HTMLElement) {
        const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
        await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
          refreshPreviewDoc: false,
          elementPath,
        });
      }

      const pathMatchesSelection =
        Array.isArray(previewSelectedPath) &&
        previewSelectedPath.length === elementPath.length &&
        previewSelectedPath.every(
          (segment, idx) => segment === elementPath[idx],
        );
      const shouldSyncSelected =
        options?.syncSelectedElement ?? pathMatchesSelection;
      if (!shouldSyncSelected) return;

      setPreviewSelectedElement((prev) =>
        prev
          ? {
            ...prev,
            styles: {
              ...prev.styles,
              ...Object.fromEntries(
                Object.entries(styles).map(([key, rawValue]) => {
                  if (key !== "fontFamily") return [key, rawValue];
                  return [
                    key,
                    typeof rawValue === "string"
                      ? normalizeFontFamilyCssValue(rawValue)
                      : rawValue,
                  ];
                }),
              ),
            },
          }
          : prev,
      );
    },
    [
      getLivePreviewSelectedElement,
      loadFileContent,
      postPreviewPatchToFrame,
      persistPreviewHtmlContent,
      previewSelectedPath,
      selectedPreviewHtml,
    ],
  );
  const applyPreviewStyleUpdate = useCallback(
    async (styles: Partial<React.CSSProperties>) => {
      if (
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }
      await applyPreviewStyleUpdateAtPath(previewSelectedPath, styles, {
        syncSelectedElement: true,
      });
    },
    [applyPreviewStyleUpdateAtPath, previewSelectedPath],
  );
  const applyPreviewContentUpdate = useCallback(
    async (data: {
      content?: string;
      html?: string;
      src?: string;
      href?: string;
    }) => {
      if (
        !selectedPreviewHtml ||
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }

      const loaded = await loadFileContent(selectedPreviewHtml);
      const sourceHtml =
        typeof loaded === "string" && loaded.length > 0
          ? loaded
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : "";
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const target = readElementByPath(parsed.body, previewSelectedPath);
      const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
      if (!target && !liveTarget) return;
      let didChangeContent = false;
      let didChangeSrc = false;
      let didChangeHref = false;
      let nextResolvedContent: string | null = null;
      let nextResolvedHtml: string | null = null;

      if (typeof data.html === "string") {
        const nextHtml = data.html;
        const currentHtml =
          target instanceof HTMLElement
            ? target.innerHTML
            : liveTarget instanceof HTMLElement
              ? liveTarget.innerHTML
              : "";
        if (currentHtml !== nextHtml) {
          if (target instanceof HTMLElement) {
            target.innerHTML = nextHtml;
          }
          if (liveTarget instanceof HTMLElement) {
            liveTarget.innerHTML = nextHtml;
          }
          didChangeContent = true;
        }
        if (didChangeContent) {
          const baselineElement =
            (target instanceof HTMLElement && target) ||
            (liveTarget instanceof HTMLElement && liveTarget) ||
            null;
          nextResolvedHtml =
            baselineElement instanceof HTMLElement
              ? baselineElement.innerHTML
              : nextHtml;
          nextResolvedContent = baselineElement
            ? normalizeEditorMultilineText(
              extractTextWithBreaks(baselineElement),
            )
            : normalizeEditorMultilineText(
              extractTextFromHtmlFragment(nextHtml),
            );
        }
      } else if (typeof data.content === "string") {
        const normalizedText = data.content.replace(/\r\n?/g, "\n");
        const baselineElement = target || liveTarget;
        const currentText = extractTextWithBreaks(baselineElement);
        const nextComparable = normalizeEditorMultilineText(normalizedText);
        const currentComparable = normalizeEditorMultilineText(currentText);
        if (nextComparable !== currentComparable) {
          if (target) {
            applyMultilineTextToElement(target, normalizedText);
          }
          if (liveTarget) {
            applyMultilineTextToElement(liveTarget, normalizedText);
          }
          didChangeContent = true;
        }
        if (didChangeContent) {
          const updatedElement = target || liveTarget;
          nextResolvedContent = normalizeEditorMultilineText(
            extractTextWithBreaks(updatedElement),
          );
          nextResolvedHtml =
            updatedElement instanceof HTMLElement
              ? updatedElement.innerHTML
              : null;
        }
      }
      if (
        typeof data.src === "string" &&
        (target instanceof HTMLElement || liveTarget instanceof HTMLElement)
      ) {
        const sourceValue = data.src.trim();
        const lowerTag =
          target instanceof HTMLElement
            ? target.tagName.toLowerCase()
            : liveTarget instanceof HTMLElement
              ? liveTarget.tagName.toLowerCase()
              : "";
        const isDirectImageTag =
          lowerTag === "img" || lowerTag === "source" || lowerTag === "video";
        if (isDirectImageTag) {
          if (target instanceof HTMLElement) {
            const previousSrc = target.getAttribute("src") || "";
            if (previousSrc !== sourceValue) {
              target.setAttribute("src", sourceValue);
              didChangeSrc = true;
            }
          }
          if (liveTarget instanceof HTMLElement) {
            const previousSrc = liveTarget.getAttribute("src") || "";
            if (previousSrc !== sourceValue) {
              liveTarget.setAttribute("src", sourceValue);
              didChangeSrc = true;
            }
          }
        } else {
          const nextBackground =
            sourceValue.length === 0
              ? ""
              : /^url\(/i.test(sourceValue)
                ? sourceValue
                : `url("${sourceValue}")`;
          if (nextBackground) {
            if (target instanceof HTMLElement) {
              const previous =
                target.style.getPropertyValue("background-image");
              if (previous !== nextBackground) {
                target.style.setProperty("background-image", nextBackground);
                didChangeSrc = true;
              }
            }
            if (liveTarget instanceof HTMLElement) {
              const previous =
                liveTarget.style.getPropertyValue("background-image");
              if (previous !== nextBackground) {
                liveTarget.style.setProperty(
                  "background-image",
                  nextBackground,
                );
                didChangeSrc = true;
              }
            }
          } else {
            if (target instanceof HTMLElement) {
              const previous =
                target.style.getPropertyValue("background-image");
              if (previous) {
                target.style.removeProperty("background-image");
                didChangeSrc = true;
              }
            }
            if (liveTarget instanceof HTMLElement) {
              const previous =
                liveTarget.style.getPropertyValue("background-image");
              if (previous) {
                liveTarget.style.removeProperty("background-image");
                didChangeSrc = true;
              }
            }
          }
        }
      }
      if (typeof data.href === "string") {
        if (target instanceof HTMLElement) {
          const previousHref = target.getAttribute("href") || "";
          if (previousHref !== data.href) {
            target.setAttribute("href", data.href);
            didChangeHref = true;
          }
        }
        if (liveTarget instanceof HTMLElement) {
          const previousHref = liveTarget.getAttribute("href") || "";
          if (previousHref !== data.href) {
            liveTarget.setAttribute("href", data.href);
            didChangeHref = true;
          }
        }
      }

      if (target && (didChangeContent || didChangeSrc || didChangeHref)) {
        const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
        await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
          refreshPreviewDoc: false,
          elementPath: previewSelectedPath,
        });
      }

      if (didChangeContent || didChangeSrc || didChangeHref) {
        setPreviewSelectedElement((prev) =>
          prev
            ? {
              ...prev,
              ...(didChangeContent
                ? {
                  content:
                    nextResolvedContent ??
                    (typeof data.content === "string"
                      ? data.content.replace(/\r\n?/g, "\n")
                      : prev.content),
                  ...(nextResolvedHtml !== null
                    ? { html: nextResolvedHtml }
                    : {}),
                }
                : {}),
              ...(didChangeSrc && typeof data.src === "string"
                ? { src: data.src }
                : {}),
              ...(didChangeHref && typeof data.href === "string"
                ? { href: data.href }
                : {}),
            }
            : prev,
        );
      }
    },
    [
      getLivePreviewSelectedElement,
      loadFileContent,
      persistPreviewHtmlContent,
      previewSelectedPath,
      selectedPreviewHtml,
    ],
  );
  const applyPreviewAttributesUpdate = useCallback(
    async (attributes: Record<string, string>) => {
      if (
        !selectedPreviewHtml ||
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }

      const loaded = await loadFileContent(selectedPreviewHtml);
      const sourceHtml =
        typeof loaded === "string" && loaded.length > 0
          ? loaded
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : "";
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const target = readElementByPath(parsed.body, previewSelectedPath);
      const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
      if (!target && !liveTarget) return;

      const reserved = new Set(["id", "class", "style", "src", "href"]);
      if (target) {
        const targetAttrs = target.attributes;
        Array.from(targetAttrs).forEach((attr) => {
          if (!reserved.has(attr.name.toLowerCase())) {
            target.removeAttribute(attr.name);
          }
        });
      }
      if (liveTarget) {
        const liveAttrs = liveTarget.attributes;
        Array.from(liveAttrs).forEach((attr) => {
          if (!reserved.has(attr.name.toLowerCase())) {
            liveTarget.removeAttribute(attr.name);
          }
        });
      }
      Object.entries(attributes || {}).forEach(([key, value]) => {
        if (!key) return;
        if (target) {
          target.setAttribute(key, value);
        }
        if (liveTarget) {
          liveTarget.setAttribute(key, value);
        }
      });

      if (target) {
        const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
        await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
          refreshPreviewDoc: false,
          elementPath: previewSelectedPath,
        });
      }

      setPreviewSelectedElement((prev) =>
        prev
          ? {
            ...prev,
            attributes,
          }
          : prev,
      );
    },
    [
      getLivePreviewSelectedElement,
      loadFileContent,
      persistPreviewHtmlContent,
      previewSelectedPath,
      selectedPreviewHtml,
    ],
  );
  const applyPreviewDeleteSelected = useCallback(async () => {
    if (
      !selectedPreviewHtml ||
      !previewSelectedPath ||
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0
    ) {
      return;
    }

    const loaded = await loadFileContent(selectedPreviewHtml);
    const sourceHtml =
      typeof loaded === "string" && loaded.length > 0
        ? loaded
        : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
          ? (filesRef.current[selectedPreviewHtml]?.content as string)
          : "";
    if (!sourceHtml) return;

    const parser = new DOMParser();
    const parsed = parser.parseFromString(sourceHtml, "text/html");
    const target = readElementByPath(parsed.body, previewSelectedPath);
    if (!target || !target.parentElement) return;

    target.parentElement.removeChild(target);

    const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
    if (liveTarget && liveTarget.parentElement) {
      liveTarget.parentElement.removeChild(liveTarget);
    }

    const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
    const parentPath = previewSelectedPath.slice(0, -1);
    await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
      refreshPreviewDoc: false,
      ...(parentPath.length > 0 ? { elementPath: parentPath } : {}),
    });

    setPreviewSelectedPath(null);
    setPreviewSelectedElement(null);
    setPreviewSelectedComputedStyles(null);
    setSelectedId(null);
  }, [
    getLivePreviewSelectedElement,
    loadFileContent,
    persistPreviewHtmlContent,
    previewSelectedPath,
    selectedPreviewHtml,
  ]);
  const handlePreviewDuplicateSelected = useCallback(async () => {
    if (
      !selectedPreviewHtml ||
      !previewSelectedPath ||
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0
    ) {
      return;
    }

    const loaded = await loadFileContent(selectedPreviewHtml);
    const sourceHtml =
      typeof loaded === "string" && loaded.length > 0
        ? loaded
        : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
          ? (filesRef.current[selectedPreviewHtml]?.content as string)
          : "";
    if (!sourceHtml) return;

    const parser = new DOMParser();
    const parsed = parser.parseFromString(sourceHtml, "text/html");
    const target = readElementByPath(parsed.body, previewSelectedPath);
    if (!(target instanceof HTMLElement) || !target.parentElement) return;

    const duplicate = target.cloneNode(true) as HTMLElement;
    if (duplicate.id) {
      duplicate.id = `${duplicate.id}-copy-${Date.now()}`;
    }
    target.parentElement.insertBefore(duplicate, target.nextSibling);
    const newPath = [...previewSelectedPath];
    newPath[newPath.length - 1] = newPath[newPath.length - 1] + 1;

    const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
    if (liveTarget instanceof HTMLElement && liveTarget.parentElement) {
      const liveDuplicate = liveTarget.cloneNode(true) as HTMLElement;
      if (liveDuplicate.id) {
        liveDuplicate.id = `${liveDuplicate.id}-copy-${Date.now()}`;
      }
      liveTarget.parentElement.insertBefore(
        liveDuplicate,
        liveTarget.nextSibling,
      );
    }

    const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
    await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
      refreshPreviewDoc: false,
      saveNow: false,
      skipAutoSave: true,
      elementPath: newPath,
    });
    if (selectedPreviewSrc && parsed.body) {
      postPreviewPatchToFrame({
        type: "PREVIEW_APPLY_HTML",
        html: parsed.body.innerHTML,
      });
    }
    selectPreviewElementAtPath(newPath);
    setIsCodePanelOpen(false);
    setIsRightPanelOpen(true);
    setSidebarToolMode("edit");
    setPreviewMode("edit");
    setInteractionMode("preview");
  }, [
    getLivePreviewSelectedElement,
    loadFileContent,
    persistPreviewHtmlContent,
    postPreviewPatchToFrame,
    previewSelectedPath,
    selectPreviewElementAtPath,
    selectedPreviewHtml,
    selectedPreviewSrc,
  ]);
  const handlePreviewNudgeZIndex = useCallback(
    (delta: number) => {
      if (
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }
      const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
      const styleValue =
        previewSelectedElement?.styles?.zIndex ??
        previewSelectedComputedStyles?.zIndex ??
        (liveTarget instanceof HTMLElement
          ? liveTarget.style.zIndex ||
          liveTarget.ownerDocument.defaultView
            ?.getComputedStyle(liveTarget)
            .getPropertyValue("z-index")
          : "");
      const current = parseNumericCssValue(styleValue) ?? 0;
      const next = Math.max(0, Math.round(current + delta));
      void applyPreviewStyleUpdateAtPath(
        previewSelectedPath,
        { zIndex: String(next) },
        { syncSelectedElement: true },
      );
    },
    [
      applyPreviewStyleUpdateAtPath,
      getLivePreviewSelectedElement,
      previewSelectedComputedStyles?.zIndex,
      previewSelectedElement?.styles?.zIndex,
      previewSelectedPath,
    ],
  );
  const handlePreviewResizeNudge = useCallback(
    (axis: "width" | "height", delta: number) => {
      if (
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }
      const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
      const liveRect =
        liveTarget instanceof HTMLElement
          ? liveTarget.getBoundingClientRect()
          : null;
      const fallbackBase = axis === "width" ? 120 : 48;
      const styleValue =
        axis === "width"
          ? previewSelectedElement?.styles?.width ??
          previewSelectedComputedStyles?.width
          : previewSelectedElement?.styles?.height ??
          previewSelectedComputedStyles?.height;
      const parsedStyle = parseNumericCssValue(styleValue);
      const liveValue =
        axis === "width" ? liveRect?.width ?? null : liveRect?.height ?? null;
      const base = parsedStyle ?? liveValue ?? fallbackBase;
      const next = Math.max(16, Math.round(base + delta));
      const stylePatch: Partial<React.CSSProperties> =
        axis === "width"
          ? { width: `${next}px` }
          : { height: `${next}px` };
      void applyPreviewStyleUpdateAtPath(previewSelectedPath, stylePatch, {
        syncSelectedElement: true,
      });
    },
    [
      applyPreviewStyleUpdateAtPath,
      getLivePreviewSelectedElement,
      previewSelectedComputedStyles?.height,
      previewSelectedComputedStyles?.width,
      previewSelectedElement?.styles?.height,
      previewSelectedElement?.styles?.width,
      previewSelectedPath,
    ],
  );
  const updatePreviewSelectionBox = useCallback(() => {
    if (
      interactionMode !== "preview" ||
      previewMode !== "edit" ||
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0
    ) {
      setPreviewSelectionBox(null);
      return;
    }
    const stage = previewStageRef.current;
    const frame = previewFrameRef.current;
    const frameDocument =
      frame?.contentDocument ?? frame?.contentWindow?.document ?? null;
    if (!stage || !frame || !frameDocument?.body) {
      setPreviewSelectionBox(null);
      return;
    }
    const target = readElementByPath(frameDocument.body, previewSelectedPath);
    if (!(target instanceof HTMLElement)) {
      setPreviewSelectionBox(null);
      return;
    }
    const stageRect = stage.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const left = targetRect.left - stageRect.left;
    const top = targetRect.top - stageRect.top;
    const width = targetRect.width;
    const height = targetRect.height;
    if (
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      setPreviewSelectionBox(null);
      return;
    }
    setPreviewSelectionBox({
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(width),
      height: Math.round(height),
    });
  }, [interactionMode, previewMode, previewSelectedPath]);
  const handlePreviewResizeHandleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }
      const frame = previewFrameRef.current;
      const frameDocument =
        frame?.contentDocument ?? frame?.contentWindow?.document ?? null;
      if (!frame || !frameDocument?.body) return;
      const target = readElementByPath(frameDocument.body, previewSelectedPath);
      if (!(target instanceof HTMLElement)) return;

      event.preventDefault();
      event.stopPropagation();

      const frameRect = frame.getBoundingClientRect();
      const frameClientWidth = Math.max(1, frame.clientWidth || 0);
      const frameClientHeight = Math.max(1, frame.clientHeight || 0);
      const scaleX = frameRect.width / frameClientWidth;
      const scaleY = frameRect.height / frameClientHeight;
      const targetRect = target.getBoundingClientRect();
      const startWidth = Math.max(16, Math.round(targetRect.width));
      const startHeight = Math.max(16, Math.round(targetRect.height));

      previewResizeDragRef.current = {
        path: [...previewSelectedPath],
        target,
        startX: event.clientX,
        startY: event.clientY,
        startWidth,
        startHeight,
        scaleX: Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1,
        scaleY: Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1,
      };
      setIsPreviewResizing(true);

      const onMove = (moveEvent: MouseEvent) => {
        const drag = previewResizeDragRef.current;
        if (!drag) return;
        const deltaX = (moveEvent.clientX - drag.startX) / drag.scaleX;
        const deltaY = (moveEvent.clientY - drag.startY) / drag.scaleY;
        const width = Math.max(16, Math.round(drag.startWidth + deltaX));
        const height = Math.max(16, Math.round(drag.startHeight + deltaY));
        drag.target.style.setProperty("width", `${width}px`);
        drag.target.style.setProperty("height", `${height}px`);
        setPreviewSelectedElement((prev) =>
          prev
            ? {
              ...prev,
              styles: {
                ...prev.styles,
                width: `${width}px`,
                height: `${height}px`,
              },
            }
            : prev,
        );
        updatePreviewSelectionBox();
      };
      const onUp = () => {
        const drag = previewResizeDragRef.current;
        previewResizeDragRef.current = null;
        setIsPreviewResizing(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (!drag) return;
        const finalWidth = drag.target.style.getPropertyValue("width");
        const finalHeight = drag.target.style.getPropertyValue("height");
        void applyPreviewStyleUpdateAtPath(
          drag.path,
          { width: finalWidth, height: finalHeight },
          { syncSelectedElement: true },
        );
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [
      applyPreviewStyleUpdateAtPath,
      previewSelectedPath,
      updatePreviewSelectionBox,
    ],
  );
  useEffect(() => {
    if (
      interactionMode !== "preview" ||
      previewMode !== "edit" ||
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0
    ) {
      setPreviewSelectionBox(null);
      return;
    }
    let rafId = 0;
    const tick = () => {
      updatePreviewSelectionBox();
      rafId = window.requestAnimationFrame(tick);
    };
    tick();
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [
    interactionMode,
    previewMode,
    previewRefreshNonce,
    previewSelectedPath,
    updatePreviewSelectionBox,
  ]);
  const applyPreviewAnimationUpdate = useCallback(
    async (animation: string) => {
      const nextAnimation =
        typeof animation === "string" ? animation.trim() : "";
      await applyPreviewStyleUpdate({ animation: nextAnimation });
      setPreviewSelectedElement((prev) =>
        prev
          ? {
            ...prev,
            animation: nextAnimation,
            styles: {
              ...prev.styles,
              animation: nextAnimation,
            },
          }
          : prev,
      );
    },
    [applyPreviewStyleUpdate],
  );
  const applyPreviewDrawCreate = useCallback(
    async (
      parentPath: number[],
      tag: string,
      rawStyles: Record<string, string>,
    ) => {
      if (!selectedPreviewHtml || !Array.isArray(parentPath)) return;
      const normalizedParentPath = parentPath
        .map((segment) => Number(segment))
        .filter((segment) => Number.isFinite(segment))
        .map((segment) => Math.max(0, Math.trunc(segment)));
      if (normalizedParentPath.length !== parentPath.length) return;

      const loaded = await loadFileContent(selectedPreviewHtml);
      const sourceHtml =
        typeof loaded === "string" && loaded.length > 0
          ? loaded
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : "";
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const parsedParent =
        normalizedParentPath.length > 0
          ? readElementByPath(parsed.body, normalizedParentPath)
          : parsed.body;
      if (
        !(parsedParent instanceof HTMLElement) &&
        !(parsedParent instanceof HTMLBodyElement)
      ) {
        return;
      }

      const drawTag = normalizePreviewDrawTag(tag);
      const normalizedStyles = {
        ...Object.fromEntries(
          Object.entries(rawStyles || {}).filter(([key]) => Boolean(key)),
        ),
        // Ensure drawn elements appear on top of existing content
        zIndex: (rawStyles?.zIndex ?? rawStyles?.['z-index']) ? undefined : '100',
      } as Record<string, string>;

      const applyStyleMap = (
        el: HTMLElement,
        styleMap: Record<string, string>,
      ) => {
        for (const [key, value] of Object.entries(styleMap)) {
          const cssKey = toCssPropertyName(key);
          const nextValue = String(value ?? "");
          if (!nextValue) {
            el.style.removeProperty(cssKey);
          } else {
            el.style.setProperty(cssKey, nextValue);
          }
        }
      };

      const buildDrawElement = (doc: Document): HTMLElement => {
        const element = doc.createElement(drawTag);
        applyStyleMap(element, normalizedStyles);
        if (drawTag === "img") {
          element.setAttribute("src", "https://picsum.photos/420/260");
          element.setAttribute("alt", "Image");
        } else if (
          drawTag === "p" ||
          drawTag === "span" ||
          drawTag === "button" ||
          drawTag === "h1" ||
          drawTag === "h2" ||
          drawTag === "h3"
        ) {
          element.textContent = "New Text";
        } else if (
          drawTag === "div" ||
          drawTag === "section" ||
          drawTag === "article" ||
          drawTag === "aside" ||
          drawTag === "main" ||
          drawTag === "header" ||
          drawTag === "footer" ||
          drawTag === "nav"
        ) {
          // No default styles saved to HTML — visual highlight is applied via
          // a temporary CSS class (__nx-draw-new) in the iframe only.
        }
        return element;
      };

      const parsedNewElement = buildDrawElement(parsed);
      parsedParent.appendChild(parsedNewElement);
      const newIndex = Math.max(0, parsedParent.children.length - 1);
      const newPath = [...normalizedParentPath, newIndex];

      // Send PREVIEW_INJECT_ELEMENT into the iframe via postMessage.
      // This is the correct architecture — the iframe inserts the element itself,
      // just like how PREVIEW_APPLY_STYLE works. Direct contentDocument mutation
      // can fail in sandboxed/mounted-preview contexts and causes index mismatches.
      postPreviewPatchToFrame({
        type: "PREVIEW_INJECT_ELEMENT",
        parentPath: normalizedParentPath,
        tag: drawTag,
        styles: normalizedStyles,
        index: newIndex,
      });

      // Also update parsedParent positioning in the serialized HTML
      if (normalizedParentPath.length > 0) {
        const computedStyleStr = parsedParent.getAttribute("style") || "";
        if (
          !computedStyleStr.includes("position") ||
          computedStyleStr.includes("position: static") ||
          computedStyleStr.includes("position:static")
        ) {
          parsedParent.style.position = "relative";
        }
      }

      const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
      await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
        refreshPreviewDoc: false,
        // Do NOT pass elementPath here — that triggers markPreviewPathDirty which
        // adds the orange __nx-preview-dirty overlay. A freshly drawn element is
        // already committed so it should not appear as unsaved.
      });

      // Set optimistic React state immediately so the right panel opens.
      // The iframe will send back PREVIEW_SELECT shortly which will fully sync the state.
      const optimisticInlineStyles = parseInlineStyleText(
        parsedNewElement.getAttribute("style") || "",
      );
      const mergedStyles: React.CSSProperties = {
        ...optimisticInlineStyles,
      };

      const isContainerTag = [
        "div",
        "section",
        "article",
        "aside",
        "main",
        "header",
        "footer",
        "nav",
      ].includes(drawTag);
      const nextElement: VirtualElement = {
        id: `preview-${Date.now()}`,
        type: drawTag,
        name: drawTag.toUpperCase(),
        content:
          drawTag === "img" ? undefined : isContainerTag ? "" : "New Text",
        ...(drawTag === "img" ? { src: "https://picsum.photos/420/260" } : {}),
        styles: mergedStyles,
        children: [],
      };

      setPreviewSelectedPath(newPath);
      setPreviewSelectedElement(nextElement);
      setPreviewSelectedComputedStyles(null);
      setSelectedId(null);
      setIsCodePanelOpen(false);
      setIsRightPanelOpen(true);
    },
    [
      loadFileContent,
      persistPreviewHtmlContent,
      postPreviewPatchToFrame,
      selectedPreviewHtml,
    ],
  );
  const applyPreviewDropCreate = useCallback(
    async (rawType: string, clientX: number, clientY: number) => {
      const dropType = String(rawType || "").trim();
      if (!dropType || !selectedPreviewHtml) return;
      const isMountedPreviewDrop = Boolean(selectedPreviewSrc);

      const idFor = createPresetIdFactory(dropType);
      const nextElement =
        buildPresetElementV2(dropType, idFor) ??
        buildStandardElement(dropType, idFor("element"));

      const loaded = await loadFileContent(selectedPreviewHtml);
      const sourceHtml =
        typeof loaded === "string" && loaded.length > 0
          ? loaded
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : "";
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const parsedNode = materializeVirtualElement(parsed, nextElement);
      if (!(parsedNode instanceof HTMLElement)) return;
      const requiresAddToolAssets = ADD_TOOL_COMPONENT_PRESETS.has(dropType);

      if (requiresAddToolAssets) {
        const htmlDirVirtual = selectedPreviewHtml.includes("/")
          ? selectedPreviewHtml.slice(0, selectedPreviewHtml.lastIndexOf("/"))
          : "";
        const cssLocalVirtualPath = normalizeProjectRelative(
          htmlDirVirtual ? `${htmlDirVirtual}/css/local.css` : "css/local.css",
        );
        const jsLocalVirtualPath = normalizeProjectRelative(
          htmlDirVirtual ? `${htmlDirVirtual}/js/local.js` : "js/local.js",
        );
        const ensureHeadElement = (doc: Document): HTMLHeadElement => {
          if (doc.head) return doc.head;
          const head = doc.createElement("head");
          if (doc.documentElement) {
            doc.documentElement.insertBefore(head, doc.body || null);
          } else {
            const html = doc.createElement("html");
            html.appendChild(head);
            if (doc.body) {
              html.appendChild(doc.body);
            }
            doc.appendChild(html);
          }
          return head;
        };
        const ensureAssetLinkInHead = (
          doc: Document,
          htmlPath: string,
          assetVirtualPath: string,
          tag: "link" | "script",
        ) => {
          const hasAssetRef = Array.from(
            doc.querySelectorAll<HTMLElement>(
              tag === "link" ? 'link[rel="stylesheet"][href]' : "script[src]",
            ),
          ).some((node) => {
            const refValue =
              tag === "link"
                ? (node.getAttribute("href") ?? "")
                : (node.getAttribute("src") ?? "");
            const resolved = resolveProjectRelativePath(htmlPath, refValue);
            return (
              normalizeProjectRelative(resolved || "") ===
              normalizeProjectRelative(assetVirtualPath)
            );
          });
          if (hasAssetRef) return;
          const head = ensureHeadElement(doc);
          const refPath = relativePathBetweenVirtualFiles(
            htmlPath,
            assetVirtualPath,
          );
          if (!refPath) return;
          if (tag === "link") {
            const link = doc.createElement("link");
            link.setAttribute("rel", "stylesheet");
            link.setAttribute("href", refPath);
            head.appendChild(link);
          } else {
            const script = doc.createElement("script");
            script.setAttribute("src", refPath);
            head.appendChild(script);
          }
        };
        const removeLegacySharedAssetRefs = (doc: Document, htmlPath: string) => {
          const legacyPaths = new Set([
            "shared/css/nx-add-tool-components.css",
            "shared/js/nx-add-tool-components.js",
            "__nx_add_tool.css",
            "__nx_add_tool.js",
          ]);
          const nodes = Array.from(
            doc.querySelectorAll<HTMLElement>(
              'link[rel="stylesheet"][href],script[src]',
            ),
          );
          for (const node of nodes) {
            const refValue =
              node.tagName.toLowerCase() === "link"
                ? (node.getAttribute("href") ?? "")
                : (node.getAttribute("src") ?? "");
            const resolved = normalizeProjectRelative(
              resolveProjectRelativePath(htmlPath, refValue) || "",
            );
            if (legacyPaths.has(resolved)) {
              node.parentElement?.removeChild(node);
            }
          }
          Array.from(
            doc.querySelectorAll<HTMLElement>(
              'style[data-nx-add-tool="css"],script[data-nx-add-tool="js"]',
            ),
          ).forEach((node) => node.parentElement?.removeChild(node));
        };
        const mergeMarkerBlock = (
          source: string,
          markerStart: string,
          markerEnd: string,
          blockContent: string,
        ): string => {
          const safeSource = source || "";
          const block = `${markerStart}\n${blockContent}\n${markerEnd}`;
          if (safeSource.includes(markerStart) && safeSource.includes(markerEnd)) {
            const start = safeSource.indexOf(markerStart);
            const endStart = safeSource.indexOf(markerEnd, start);
            const end = endStart >= 0 ? endStart + markerEnd.length : start;
            return `${safeSource.slice(0, start)}${block}${safeSource.slice(end)}`;
          }
          const needsGap = safeSource.length > 0 && !safeSource.endsWith("\n");
          return `${safeSource}${needsGap ? "\n\n" : ""}${block}\n`;
        };
        removeLegacySharedAssetRefs(parsed, selectedPreviewHtml);
        ensureAssetLinkInHead(
          parsed,
          selectedPreviewHtml,
          cssLocalVirtualPath,
          "link",
        );
        ensureAssetLinkInHead(
          parsed,
          selectedPreviewHtml,
          jsLocalVirtualPath,
          "script",
        );
        const absoluteHtmlPath = filePathIndexRef.current[selectedPreviewHtml];
        const absoluteHtmlDir = absoluteHtmlPath
          ? getParentPath(absoluteHtmlPath)
          : null;
        const assetDefs = [
          {
            path: cssLocalVirtualPath,
            relativePath: "css/local.css",
            markerStart: ADD_TOOL_CSS_MARKER_START,
            markerEnd: ADD_TOOL_CSS_MARKER_END,
            block: ADD_TOOL_COMPONENTS_CSS_CONTENT,
          },
          {
            path: jsLocalVirtualPath,
            relativePath: "js/local.js",
            markerStart: ADD_TOOL_JS_MARKER_START,
            markerEnd: ADD_TOOL_JS_MARKER_END,
            block: ADD_TOOL_COMPONENTS_JS_CONTENT,
          },
        ] as const;
        const upsertedAssets: Record<string, ProjectFile> = {};
        const dirtyAssetPaths: string[] = [];
        for (const asset of assetDefs) {
          const absoluteAssetPath = absoluteHtmlDir
            ? normalizePath(joinPath(absoluteHtmlDir, asset.relativePath))
            : null;
          if (absoluteAssetPath) {
            const absoluteParent = getParentPath(absoluteAssetPath);
            if (absoluteParent) {
              await ensureDirectoryTree(absoluteParent);
            }
            filePathIndexRef.current[asset.path] = absoluteAssetPath;
          }
          let existingContent =
            typeof filesRef.current[asset.path]?.content === "string"
              ? (filesRef.current[asset.path].content as string)
              : "";
          if (!existingContent && absoluteAssetPath) {
            try {
              existingContent = await (Neutralino as any).filesystem.readFile(
                absoluteAssetPath,
              );
            } catch {
              existingContent = "";
            }
          }
          const mergedContent = mergeMarkerBlock(
            existingContent,
            asset.markerStart,
            asset.markerEnd,
            asset.block,
          );
          textFileCacheRef.current[asset.path] = mergedContent;
          const name = asset.path.includes("/")
            ? asset.path.slice(asset.path.lastIndexOf("/") + 1)
            : asset.path;
          upsertedAssets[asset.path] = filesRef.current[asset.path]
            ? {
              ...filesRef.current[asset.path],
              content: mergedContent,
              type: inferFileType(name),
            }
            : {
              path: asset.path,
              name,
              type: inferFileType(name),
              content: mergedContent,
            };
          if (absoluteAssetPath) {
            try {
              await (Neutralino as any).filesystem.writeFile(
                absoluteAssetPath,
                mergedContent,
              );
              delete pendingPreviewWritesRef.current[asset.path];
            } catch (error) {
              console.warn("Failed writing slide local asset file:", error);
              pendingPreviewWritesRef.current[asset.path] = mergedContent;
              dirtyAssetPaths.push(asset.path);
            }
          } else {
            pendingPreviewWritesRef.current[asset.path] = mergedContent;
            dirtyAssetPaths.push(asset.path);
          }
        }
        if (Object.keys(upsertedAssets).length > 0) {
          filesRef.current = {
            ...filesRef.current,
            ...upsertedAssets,
          };
          setFiles((prev) => ({
            ...prev,
            ...upsertedAssets,
          }));
          if (dirtyAssetPaths.length > 0) {
            setDirtyFiles((prev) =>
              Array.from(new Set([...prev, ...dirtyAssetPaths])),
            );
          }
        }
      }

      const pickDropHost = (doc: Document): HTMLElement => {
        const candidates = [
          ".maincontainer",
          ".mainContainer",
          "#maincontainer",
          "#mainContainer",
          "#contentFrame",
          ".contentFrame",
          ".mainContent",
          "#container",
        ];
        for (const selector of candidates) {
          const found = doc.querySelector(selector);
          if (found instanceof HTMLElement) return found;
        }
        return doc.body;
      };
      const computePathFromBody = (element: Element | null): number[] => {
        if (!element) return [];
        const path: number[] = [];
        let cursor: Element | null = element;
        while (cursor && cursor.parentElement) {
          const parentEl: HTMLElement = cursor.parentElement;
          const index = Array.from(parentEl.children).indexOf(cursor);
          if (index < 0) break;
          path.unshift(index);
          if (parentEl === element.ownerDocument.body) break;
          cursor = parentEl;
        }
        return path;
      };
      const ensurePositionableHost = (host: HTMLElement) => {
        const computed = host.ownerDocument.defaultView?.getComputedStyle(host);
        if (!computed) return;
        if (!computed.position || computed.position === "static") {
          host.style.setProperty("position", "relative");
        }
      };

      const liveDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      const frameRect = previewFrameRef.current?.getBoundingClientRect();
      const liveWindow = liveDocument?.defaultView ?? null;
      const parsedDropHost = pickDropHost(parsed);
      ensurePositionableHost(parsedDropHost);

      let nextLeft = 0;
      let nextTop = 0;
      if (frameRect) {
        const frameClientWidth = Math.max(
          1,
          previewFrameRef.current?.clientWidth || 0,
        );
        const frameClientHeight = Math.max(
          1,
          previewFrameRef.current?.clientHeight || 0,
        );
        const scaleX =
          frameClientWidth > 0 ? frameRect.width / frameClientWidth : 1;
        const scaleY =
          frameClientHeight > 0 ? frameRect.height / frameClientHeight : 1;
        const docX =
          (clientX - frameRect.left) / (scaleX || 1) + (liveWindow?.scrollX || 0);
        const docY =
          (clientY - frameRect.top) / (scaleY || 1) + (liveWindow?.scrollY || 0);

        const liveDropHost = liveDocument ? pickDropHost(liveDocument) : null;
        const hostRect = liveDropHost?.getBoundingClientRect();
        const hostLeft = hostRect
          ? hostRect.left + (liveWindow?.scrollX || 0)
          : 0;
        const hostTop = hostRect ? hostRect.top + (liveWindow?.scrollY || 0) : 0;

        nextLeft = Math.max(0, Math.round(docX - hostLeft - 32));
        nextTop = Math.max(0, Math.round(docY - hostTop - 20));
      }
      const hostWidth = Math.max(0, parsedDropHost.clientWidth || 0);
      const hostHeight = Math.max(0, parsedDropHost.clientHeight || 0);
      if (hostWidth > 0) {
        nextLeft = Math.max(0, Math.min(nextLeft, Math.max(0, hostWidth - 24)));
      }
      if (hostHeight > 0) {
        nextTop = Math.max(0, Math.min(nextTop, Math.max(0, hostHeight - 24)));
      }
      parsedNode.style.setProperty("position", "absolute");
      parsedNode.style.setProperty("left", `${nextLeft}px`);
      parsedNode.style.setProperty("top", `${nextTop}px`);
      if (requiresAddToolAssets) {
        parsedNode.style.setProperty("max-width", "100%");
        parsedNode.style.setProperty("box-sizing", "border-box");
      }
      parsedDropHost.appendChild(parsedNode);
      const newPath = computePathFromBody(parsedNode);
      const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;

      let appliedLive = false;
      if (liveDocument?.body) {
        const liveNode = materializeVirtualElement(liveDocument, nextElement);
        if (liveNode instanceof HTMLElement) {
          const liveDropHost = pickDropHost(liveDocument);
          ensurePositionableHost(liveDropHost);
          liveNode.style.setProperty("position", "absolute");
          liveNode.style.setProperty("left", `${nextLeft}px`);
          liveNode.style.setProperty("top", `${nextTop}px`);
          if (requiresAddToolAssets) {
            liveNode.style.setProperty("max-width", "100%");
            liveNode.style.setProperty("box-sizing", "border-box");
          }
          liveDropHost.appendChild(liveNode);
          appliedLive = true;
        }
      }

      const needsAssetReload = requiresAddToolAssets && isMountedPreviewDrop;
      await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
        refreshPreviewDoc: needsAssetReload || (!appliedLive && !isMountedPreviewDrop),
        saveNow: isMountedPreviewDrop,
        skipAutoSave: !isMountedPreviewDrop,
        elementPath: newPath,
      });
      if (isMountedPreviewDrop && parsed.body && !needsAssetReload) {
        postPreviewPatchToFrame({
          type: "PREVIEW_APPLY_HTML",
          html: parsed.body.innerHTML,
        });
      }

      setPreviewSelectedPath(newPath);
      setPreviewSelectedElement({
        ...nextElement,
        styles: {
          ...nextElement.styles,
          position: "absolute",
          left: `${nextLeft}px`,
          top: `${nextTop}px`,
        },
      });
      setPreviewSelectedComputedStyles(null);
      setSelectedId(null);
      setIsCodePanelOpen(false);
      setIsRightPanelOpen(true);
      setSidebarToolMode("edit");
      setPreviewMode("edit");
      setInteractionMode("preview");
    },
    [
      loadFileContent,
      postPreviewPatchToFrame,
      persistPreviewHtmlContent,
      selectedPreviewHtml,
      selectedPreviewSrc,
    ],
  );
  useEffect(() => {
    applyPreviewDropCreateRef.current = applyPreviewDropCreate;
  }, [applyPreviewDropCreate]);
  const handlePreviewStageDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!selectedPreviewHtml) return;
      const payload = (
        getToolboxDragPayload(event.dataTransfer).trim() ||
        toolboxDragTypeRef.current
      ).trim();
      if (!payload) return;
      event.preventDefault();
      setIsToolboxDragging(false);
      toolboxDragTypeRef.current = "";
      void applyPreviewDropCreate(payload, event.clientX, event.clientY);
    },
    [applyPreviewDropCreate, selectedPreviewHtml],
  );
  const handlePreviewStyleUpdateStable = useCallback(
    (styles: Partial<React.CSSProperties>) => {
      void applyPreviewStyleUpdate(styles);
    },
    [applyPreviewStyleUpdate],
  );
  const handlePreviewContentUpdateStable = useCallback(
    (data: {
      content?: string;
      html?: string;
      src?: string;
      href?: string;
    }) => {
      void applyPreviewContentUpdate(data);
    },
    [applyPreviewContentUpdate],
  );
  const handlePreviewAttributesUpdateStable = useCallback(
    (attributes: Record<string, string>) => {
      void applyPreviewAttributesUpdate(attributes);
    },
    [applyPreviewAttributesUpdate],
  );
  const handlePreviewAnimationUpdateStable = useCallback(
    (animation: string) => {
      void applyPreviewAnimationUpdate(animation);
    },
    [applyPreviewAnimationUpdate],
  );
  const handlePreviewDeleteStable = useCallback(() => {
    void applyPreviewDeleteSelected();
  }, [applyPreviewDeleteSelected]);
  const noopPropertiesAction = useCallback(() => { }, []);
  const noopMoveOrder = useCallback((_dir: "up" | "down") => { }, []);

  useEffect(() => {
    const onPreviewMessage = (event: MessageEvent) => {
      if (!isActivePreviewMessageSource(event.source)) return;
      let payload = event.data as
        | {
          type?: string;
          path?: string | number[];
          level?: PreviewConsoleLevel;
          message?: string;
          source?: string;
          html?: string;
          tag?: string;
          id?: string;
          className?: string;
          attributes?: Record<string, string>;
          text?: string;
          inlineStyle?: string;
          src?: string;
          href?: string;
          key?: string;
          code?: string;
          ctrlKey?: boolean;
          metaKey?: boolean;
          shiftKey?: boolean;
          altKey?: boolean;
          editable?: boolean;
          computedStyles?: Record<string, string>;
          parentPath?: number[];
          styles?: Record<string, string | number>;
        }
        | undefined;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || !payload.type) return;

      if (payload.type === "PREVIEW_CONSOLE") {
        const level = payload.level ?? "log";
        const message =
          typeof payload.message === "string" ? payload.message : "";
        if (!message) return;
        appendPreviewConsole(level, message, payload.source || "preview");
        return;
      }
      if (payload.type === "PREVIEW_HOTKEY") {
        const key = String(payload.key || "").toLowerCase();
        const code = String(payload.code || "");
        if (!key && !code) return;
        const hasModifier = Boolean(payload.ctrlKey || payload.metaKey);
        const editableTarget = Boolean(payload.editable);
        const altKey = Boolean(payload.altKey);
        const shiftKey = Boolean(payload.shiftKey);

        if (hasModifier && editableTarget) {
          if (key === "s") {
            void saveCodeDraftsRef.current?.();
            void flushPendingPreviewSaves();
            return;
          }
          if (key === "t") {
            requestPreviewRefreshWithUnsavedGuard();
            return;
          }
          if (key === "p") {
            requestSwitchToPreviewMode();
            return;
          }
          if (key === "f") {
            setIsLeftPanelOpen(true);
            setIsRightPanelOpen(true);
            setIsCodePanelOpen(false);
            return;
          }
          if (key === "e") {
            setSidebarToolMode("edit");
            setInteractionMode("preview");
            setPreviewMode("edit");
            return;
          }
          if (key === "k") {
            setIsCommandPaletteOpen((prev) => !prev);
            return;
          }
          if (code === "Backquote") {
            setShowTerminal((prev) => !prev);
          }
          return;
        }
        if (
          key === "escape" &&
          isPageSwitchPromptOpen &&
          !isPageSwitchPromptBusy
        ) {
          closePendingPageSwitchPrompt();
          return;
        }
        if (key === "escape" && isZenMode) {
          toggleZenMode();
          return;
        }

        if (!hasModifier && !altKey && !editableTarget) {
          if (key === "w") {
            setIsLeftPanelOpen((prev) => !prev);
            return;
          }
          if (key === "e") {
            setIsRightPanelOpen((prev) => {
              const next = !prev;
              if (next) setIsCodePanelOpen(false);
              return next;
            });
            return;
          }
        }
        if (!hasModifier) return;

        if (key === "k") {
          setIsCommandPaletteOpen((prev) => !prev);
          return;
        }
        if (key === "f") {
          setIsLeftPanelOpen(true);
          setIsRightPanelOpen(true);
          setIsCodePanelOpen(false);
          return;
        }
        if (key === "p") {
          requestSwitchToPreviewMode();
          return;
        }
        if (key === "e") {
          setSidebarToolMode("edit");
          setInteractionMode("preview");
          setPreviewMode("edit");
          return;
        }
        if (key === "`" || code === "Backquote") {
          setShowTerminal((prev) => !prev);
          return;
        }
        if (key === "j") {
          toggleZenMode();
          return;
        }
        if (key === "s") {
          void saveCodeDraftsRef.current?.();
          void flushPendingPreviewSaves();
          return;
        }
        if (key === "t") {
          requestPreviewRefreshWithUnsavedGuard();
          return;
        }
        if (key === "z" && !shiftKey) {
          runUndo();
          return;
        }
        if (key === "u" || key === "y" || (key === "z" && shiftKey)) {
          runRedo();
        }
        return;
      }

      if (payload.type === "PREVIEW_NAVIGATE") {
        if (
          !selectedPreviewHtml ||
          typeof payload.path !== "string" ||
          !payload.path
        )
          return;
        const target = resolvePreviewNavigationPath(
          selectedPreviewHtml,
          payload.path,
          filesRef.current,
        );
        if (!target) return;
        const lockPath = explorerSelectionLockRef.current;
        if (lockPath) {
          const targetNorm = normalizeProjectRelative(target).toLowerCase();
          const lockNorm = normalizeProjectRelative(lockPath).toLowerCase();
          if (targetNorm !== lockNorm) {
            // Frame is navigating away from the locked page — redirect back.
            // Clear lock first to avoid an infinite redirect loop.
            explorerSelectionLockRef.current = null;
            syncPreviewActiveFile(lockPath, "explorer", {
              skipUnsavedPrompt: true,
            });
            setPreviewRefreshNonce((prev) => prev + 1);
            return;
          }
          // Target matches lock — clear the lock so future navigations are free.
          explorerSelectionLockRef.current = null;
        }
        if (!shouldProcessPreviewPageSignal(target)) return;
        console.log("[Preview] Current page:", target);
        if (target === activeFileRef.current) return;
        console.log("[DEBUG] syncPreviewActiveFile from PREVIEW_NAVIGATE", target);
        syncPreviewActiveFile(target, "navigate");
        return;
      }

      if (payload.type === "PREVIEW_PATH_CHANGED") {
        if (typeof payload.path !== "string" || !payload.path) return;
        const mountRelativePath = extractMountRelativePath(payload.path);
        if (!mountRelativePath) return;
        const resolvedVirtualPath =
          resolveVirtualPathFromMountRelative(mountRelativePath);
        if (!resolvedVirtualPath) return;
        const lockPath = explorerSelectionLockRef.current;
        if (lockPath) {
          const resolvedNorm = normalizeProjectRelative(resolvedVirtualPath).toLowerCase();
          const lockNorm = normalizeProjectRelative(lockPath).toLowerCase();
          if (resolvedNorm !== lockNorm) {
            // Frame changed to wrong page — redirect back.
            // Clear lock first to prevent infinite redirect.
            explorerSelectionLockRef.current = null;
            syncPreviewActiveFile(lockPath, "explorer", {
              skipUnsavedPrompt: true,
            });
            setPreviewRefreshNonce((prev) => prev + 1);
            return;
          }
          // Path matches lock — clear so future changes propagate freely.
          explorerSelectionLockRef.current = null;
        }
        const resolvedFile = filesRef.current[resolvedVirtualPath];
        if (!resolvedFile || resolvedFile.type !== "html") return;
        if (resolvedVirtualPath === activeFileRef.current) return;
        if (!shouldProcessPreviewPageSignal(resolvedVirtualPath)) return;
        console.log("[Preview] Current page:", resolvedVirtualPath);
        console.log("[DEBUG] syncPreviewActiveFile from PREVIEW_PATH_CHANGED", resolvedVirtualPath);
        syncPreviewActiveFile(resolvedVirtualPath, "path_changed");
        return;
      }

      if (payload.type === "PREVIEW_INLINE_EDIT") {
        const nextPath = normalizePreviewPath(payload.path);
        if (!nextPath) return;
        void applyPreviewInlineEdit(
          nextPath,
          typeof payload.html === "string" ? payload.html : "",
        );
        return;
      }
      if (payload.type === "PREVIEW_INLINE_EDIT_DRAFT") {
        const nextPath = normalizePreviewPath(payload.path);
        if (!nextPath) return;
        const draftHtml = typeof payload.html === "string" ? payload.html : "";
        const draftFile = selectedPreviewHtmlRef.current;
        if (draftFile) {
          setDirtyFiles((prev) =>
            prev.includes(draftFile) ? prev : [...prev, draftFile],
          );
          inlineEditDraftPendingRef.current = {
            filePath: draftFile,
            elementPath: nextPath,
            html: draftHtml,
          };
          if (inlineEditDraftTimerRef.current !== null) {
            window.clearTimeout(inlineEditDraftTimerRef.current);
          }
          inlineEditDraftTimerRef.current = window.setTimeout(() => {
            inlineEditDraftTimerRef.current = null;
            const pending = inlineEditDraftPendingRef.current;
            inlineEditDraftPendingRef.current = null;
            if (!pending) return;
            void applyPreviewInlineEditDraft(
              pending.filePath,
              pending.elementPath,
              pending.html,
            );
          }, 180);
        }
        const liveElement = getLivePreviewSelectedElement(nextPath);
        const draftText = normalizeEditorMultilineText(
          liveElement
            ? extractTextWithBreaks(liveElement)
            : extractTextFromHtmlFragment(draftHtml),
        );
        setPreviewSelectedPath(nextPath);
        if (!(liveElement instanceof HTMLElement)) {
          setPreviewSelectedElement((prev) =>
            prev
              ? {
                ...prev,
                content: draftText,
                html: draftHtml,
              }
              : prev,
          );
          return;
        }
        const computedStyles =
          extractComputedStylesFromElement(liveElement) || null;
        const inlineStyles = parseInlineStyleText(
          liveElement.getAttribute("style") || "",
        );
        const mergedStyles: React.CSSProperties = {
          ...(computedStyles || {}),
          ...inlineStyles,
        };
        const liveAttributes =
          extractCustomAttributesFromElement(liveElement) || undefined;
        const liveSrc = liveElement.getAttribute("src") || "";
        const liveHref = liveElement.getAttribute("href") || "";
        const liveTag = String(liveElement.tagName || "div").toLowerCase();
        const inlineAnimation =
          typeof inlineStyles.animation === "string"
            ? inlineStyles.animation.trim()
            : "";
        const computedAnimationCandidate =
          computedStyles && typeof computedStyles.animation === "string"
            ? computedStyles.animation.trim()
            : "";
        const resolvedAnimation =
          inlineAnimation ||
          (computedAnimationCandidate &&
            !/^none(?:\s|$)/i.test(computedAnimationCandidate)
            ? computedAnimationCandidate
            : "");
        setPreviewSelectedComputedStyles(computedStyles);
        setPreviewSelectedElement((prev) => ({
          id: liveElement.id || prev?.id || `preview-${Date.now()}`,
          type: liveTag,
          name: liveTag.toUpperCase(),
          content: draftText,
          html: draftHtml || liveElement.innerHTML || prev?.html || "",
          ...(liveSrc ? { src: liveSrc } : {}),
          ...(liveHref ? { href: liveHref } : {}),
          ...(liveElement.className
            ? { className: liveElement.className }
            : {}),
          ...(liveAttributes ? { attributes: liveAttributes } : {}),
          ...(resolvedAnimation ? { animation: resolvedAnimation } : {}),
          styles: mergedStyles,
          children: [],
        }));
        return;
      }

      if (payload.type === "PREVIEW_MOVE_COMMIT") {
        const nextPath = normalizePreviewPath(payload.path);
        if (!nextPath) return;
        if (!payload.styles || typeof payload.styles !== "object") return;
        const stylePatch = Object.fromEntries(
          Object.entries(payload.styles).map(([key, value]) => [
            key,
            value == null ? "" : String(value),
          ]),
        ) as Partial<React.CSSProperties>;
        void applyPreviewStyleUpdateAtPath(nextPath, stylePatch, {
          syncSelectedElement: true,
        });
        return;
      }

      if (payload.type === "PREVIEW_DRAW_CREATE") {
        const nextParentPath = normalizePreviewPath(payload.parentPath || []);
        if (!nextParentPath) return;
        if (typeof payload.tag !== "string" || !payload.tag.trim()) return;
        const stylePatch = Object.fromEntries(
          Object.entries(payload.styles || {}).map(([key, value]) => [
            key,
            value == null ? "" : String(value),
          ]),
        ) as Record<string, string>;
        void applyPreviewDrawCreate(nextParentPath, payload.tag, stylePatch);
        return;
      }

      if (payload.type === "PREVIEW_SELECT") {
        const nextPath = normalizePreviewPath(payload.path);
        if (!nextPath || nextPath.length === 0) return;

        const tag = (payload.tag || "div").toLowerCase();
        const id = payload.id ? String(payload.id) : `preview-${Date.now()}`;
        const inlineStyles = parseInlineStyleText(
          typeof payload.inlineStyle === "string" ? payload.inlineStyle : "",
        );
        const payloadComputedStyles =
          payload.computedStyles && typeof payload.computedStyles === "object"
            ? (payload.computedStyles as React.CSSProperties)
            : null;

        const liveElement = getLivePreviewSelectedElement(nextPath);
        const computedStyles =
          payloadComputedStyles ||
          extractComputedStylesFromElement(liveElement);

        // Prefer the text sent directly from the iframe at click time (el.textContent)
        // since it's the most reliable source. Fall back to DOM extraction if needed.
        const payloadText =
          typeof payload.text === "string" ? payload.text.trim() : "";
        const payloadHtml =
          typeof payload.html === "string" ? payload.html : "";
        const liveText = liveElement ? extractTextWithBreaks(liveElement) : "";
        const liveHtml =
          liveElement instanceof HTMLElement ? liveElement.innerHTML || "" : "";
        const payloadAttributes =
          payload.attributes && typeof payload.attributes === "object"
            ? (Object.fromEntries(
              Object.entries(payload.attributes).filter(
                ([key, value]) => Boolean(key) && typeof value === "string",
              ),
            ) as Record<string, string>)
            : {};
        const liveAttributes =
          extractCustomAttributesFromElement(liveElement) || {};

        // Third-layer fallback: parse the saved source HTML from filesRef and read
        // the text directly at the element path. This handles cases where the live
        // DOM was reloaded/refreshed and payload.text is empty (e.g. immediately
        // after a tool switch with no prior click).
        let savedHtmlText = "";
        let savedHtmlMarkup = "";
        let savedHtmlAttributes: Record<string, string> = {};
        if (
          ((!payloadText && !liveText) || (!payloadHtml && !liveHtml)) &&
          selectedPreviewHtml &&
          nextPath.length > 0
        ) {
          try {
            const savedHtmlContent =
              filesRef.current[selectedPreviewHtml]?.content;
            if (
              typeof savedHtmlContent === "string" &&
              savedHtmlContent.length > 0
            ) {
              const tempParser = new DOMParser();
              const tempDoc = tempParser.parseFromString(
                savedHtmlContent,
                "text/html",
              );
              const savedEl = readElementByPath(tempDoc.body, nextPath);
              if (savedEl) {
                savedHtmlText = extractTextWithBreaks(savedEl);
                savedHtmlMarkup = savedEl.innerHTML || "";
                savedHtmlAttributes =
                  extractCustomAttributesFromElement(savedEl) || {};
              }
            }
          } catch {
            // Ignore parse errors.
          }
        }

        const editableText = normalizeEditorMultilineText(
          payloadText || liveText || savedHtmlText,
        );
        const editableHtml = payloadHtml || liveHtml || savedHtmlMarkup;
        const payloadSrc =
          typeof payload.src === "string" && payload.src.trim().length > 0
            ? payload.src.trim()
            : "";
        const payloadHref =
          typeof payload.href === "string" && payload.href.trim().length > 0
            ? payload.href.trim()
            : "";
        const liveSrc =
          liveElement && liveElement instanceof HTMLElement
            ? liveElement.getAttribute("src") || ""
            : "";
        const liveHref =
          liveElement && liveElement instanceof HTMLElement
            ? liveElement.getAttribute("href") || ""
            : "";
        const resolvedSrc = payloadSrc || liveSrc || undefined;
        const resolvedHref = payloadHref || liveHref || undefined;
        const mergedAttributes = {
          ...savedHtmlAttributes,
          ...liveAttributes,
          ...payloadAttributes,
        };
        const resolvedAttributes =
          Object.keys(mergedAttributes).length > 0
            ? mergedAttributes
            : undefined;
        const mergedStyles: React.CSSProperties = {
          ...(computedStyles || {}),
          ...inlineStyles,
        };
        const inlineAnimation =
          typeof inlineStyles.animation === "string"
            ? inlineStyles.animation.trim()
            : "";
        const computedAnimationCandidate =
          computedStyles && typeof computedStyles.animation === "string"
            ? computedStyles.animation.trim()
            : "";
        const resolvedAnimation =
          inlineAnimation ||
          (computedAnimationCandidate &&
            !/^none(?:\s|$)/i.test(computedAnimationCandidate)
            ? computedAnimationCandidate
            : "");

        const nextElement: VirtualElement = {
          id,
          type: tag,
          name: tag.toUpperCase(),
          content: editableText,
          ...(editableHtml ? { html: editableHtml } : {}),
          ...(resolvedSrc ? { src: resolvedSrc } : {}),
          ...(resolvedHref ? { href: resolvedHref } : {}),
          className:
            typeof payload.className === "string" &&
              payload.className.length > 0
              ? payload.className
              : undefined,
          ...(resolvedAttributes ? { attributes: resolvedAttributes } : {}),
          styles: mergedStyles,
          ...(resolvedAnimation ? { animation: resolvedAnimation } : {}),
          children: [],
        };

        setPreviewSelectedPath(nextPath);
        setPreviewSelectedElement(nextElement);
        setPreviewSelectedComputedStyles(computedStyles);
        setSelectedId(null);
        setIsCodePanelOpen(false);
        setIsRightPanelOpen(true);
      }
    };

    window.addEventListener("message", onPreviewMessage);
    return () => window.removeEventListener("message", onPreviewMessage);
  }, [
    applyPreviewDrawCreate,
    applyPreviewStyleUpdateAtPath,
    appendPreviewConsole,
    closePendingPageSwitchPrompt,
    getLivePreviewSelectedElement,
    flushPendingPreviewSaves,
    isActivePreviewMessageSource,
    isMountedPreview,
    isPageSwitchPromptBusy,
    isPageSwitchPromptOpen,
    isZenMode,
    extractMountRelativePath,
    requestPreviewRefreshWithUnsavedGuard,
    requestSwitchToPreviewMode,
    previewSyncedFile,
    resolveVirtualPathFromMountRelative,
    runRedo,
    runUndo,
    selectedPreviewHtml,
    shouldProcessPreviewPageSignal,
    syncPreviewActiveFile,
    toggleZenMode,
    applyPreviewInlineEditDraft,
    applyPreviewInlineEdit,
  ]);
  useEffect(() => {
    if (!activeFile) return;
    void loadFileContent(activeFile);
  }, [activeFile, loadFileContent]);

  useEffect(() => {
    if (!shouldPrepareEditPreviewDoc) {
      setSelectedPreviewDoc("");
      return;
    }
    if (!selectedPreviewHtml) {
      setSelectedPreviewDoc("");
      return;
    }
    const cachedDoc = previewDocCacheRef.current[selectedPreviewHtml];
    if (cachedDoc) {
      setSelectedPreviewDoc(cachedDoc);
      return;
    }

    let canceled = false;
    const preloadPreviewDependencies = async () => {
      const htmlContent = await loadFileContent(selectedPreviewHtml);
      const fileMapSnapshot: FileMap = { ...filesRef.current };
      let html =
        typeof htmlContent === "string" && htmlContent.length > 0
          ? htmlContent
          : typeof fileMapSnapshot[selectedPreviewHtml]?.content === "string"
            ? (fileMapSnapshot[selectedPreviewHtml]?.content as string)
            : "";
      if (!html) {
        const absoluteHtmlPath = filePathIndexRef.current[selectedPreviewHtml];
        if (absoluteHtmlPath) {
          try {
            const directHtml = await (Neutralino as any).filesystem.readFile(
              absoluteHtmlPath,
            );
            if (typeof directHtml === "string" && directHtml.length > 0) {
              html = directHtml;
            }
          } catch {
            // Keep empty html; caller handles as unavailable preview.
          }
        }
      }
      if (!html) return;

      if (!previewHistoryRef.current[selectedPreviewHtml]) {
        previewHistoryRef.current[selectedPreviewHtml] = {
          past: [],
          present: html,
          future: [],
        };
      }

      if (fileMapSnapshot[selectedPreviewHtml]) {
        fileMapSnapshot[selectedPreviewHtml] = {
          ...fileMapSnapshot[selectedPreviewHtml],
          content: html,
        };
      }

      const dependencyPaths = new Set<string>();

      html.replace(
        /<link\b([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
        (full, _beforeHref, hrefValue) => {
          if (!/rel=["']stylesheet["']/i.test(full)) return full;
          const resolved = resolveProjectRelativePath(
            selectedPreviewHtml,
            hrefValue,
          );
          if (resolved && fileMapSnapshot[resolved])
            dependencyPaths.add(resolved);
          return full;
        },
      );

      html.replace(
        /<script\b([^>]*?)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
        (_full, _beforeSrc, srcValue) => {
          const resolved = resolveProjectRelativePath(
            selectedPreviewHtml,
            srcValue,
          );
          if (resolved && fileMapSnapshot[resolved])
            dependencyPaths.add(resolved);
          return _full;
        },
      );

      html.replace(/\b(src|href)=["']([^"']+)["']/gi, (_full, _attr, raw) => {
        const resolved = resolveProjectRelativePath(selectedPreviewHtml, raw);
        if (resolved && fileMapSnapshot[resolved])
          dependencyPaths.add(resolved);
        return _full;
      });

      // Legacy projects often request shared HTML fragments dynamically.
      // Keep preload intentionally narrow; avoid eager icon/font loading.
      for (const path of Object.keys(fileMapSnapshot)) {
        const lowerPath = path.toLowerCase();
        if (
          (lowerPath.includes("shared/media/content/") ||
            lowerPath.includes("/shared/media/content/")) &&
          (lowerPath.endsWith(".html") || lowerPath.endsWith(".htm"))
        ) {
          dependencyPaths.add(path);
        }
      }

      const loaded = await Promise.all(
        Array.from(dependencyPaths).map(async (path) => {
          const content = await loadFileContent(path, {
            persistToState: false,
          });
          return { path, content };
        }),
      );

      for (const item of loaded) {
        if (
          item &&
          fileMapSnapshot[item.path] &&
          typeof item.content === "string" &&
          item.content.length > 0
        ) {
          fileMapSnapshot[item.path] = {
            ...fileMapSnapshot[item.path],
            content: item.content,
          };
        }
      }

      if (canceled) return;
      previewDependencyIndexRef.current[selectedPreviewHtml] = [
        selectedPreviewHtml,
        ...Array.from(dependencyPaths),
      ];
      const doc = createPreviewDocument(
        fileMapSnapshot,
        selectedPreviewHtml,
        previewDependencyIndexRef.current[selectedPreviewHtml],
      );
      cachePreviewDoc(selectedPreviewHtml, doc);
      setSelectedPreviewDoc(doc);
    };

    void preloadPreviewDependencies();
    return () => {
      canceled = true;
    };
  }, [
    cachePreviewDoc,
    loadFileContent,
    selectedPreviewHtml,
    shouldPrepareEditPreviewDoc,
  ]);
  useEffect(() => {
    if (!selectedPreviewHtml) return;
    const keys = dirtyPathKeysByFile[selectedPreviewHtml] || [];
    if (keys.length === 0) return;
    const timer = window.setTimeout(() => {
      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!frameDocument?.body) return;
      for (const key of keys) {
        const path = key
          .split(".")
          .map((segment) => Number(segment))
          .filter((segment) => Number.isFinite(segment))
          .map((segment) => Math.max(0, Math.trunc(segment)));
        const element = readElementByPath(frameDocument.body, path);
        if (element instanceof HTMLElement) {
          element.classList.add("__nx-preview-dirty");
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dirtyPathKeysByFile, selectedPreviewDoc, selectedPreviewHtml]);
  const activeCodeFilePath = useMemo(() => {
    const candidate =
      activeFile &&
        files[activeFile] &&
        isCodeEditableFile(activeFile, files[activeFile].type)
        ? activeFile
        : selectedPreviewHtml &&
          files[selectedPreviewHtml] &&
          isCodeEditableFile(
            selectedPreviewHtml,
            files[selectedPreviewHtml].type,
          )
          ? selectedPreviewHtml
          : null;
    if (candidate) return candidate;
    const firstText = Object.keys(files).find((path) =>
      isCodeEditableFile(path, files[path].type),
    );
    return firstText ?? null;
  }, [activeFile, files, selectedPreviewHtml]);
  const activeCodeFileType: ProjectFile["type"] | null = activeCodeFilePath
    ? (files[activeCodeFilePath]?.type ?? null)
    : null;
  const activeCodeContent = useMemo(() => {
    if (!activeCodeFilePath) return "";
    if (typeof codeDraftByPath[activeCodeFilePath] === "string") {
      return codeDraftByPath[activeCodeFilePath];
    }
    const raw = files[activeCodeFilePath]?.content;
    return typeof raw === "string" ? raw : "";
  }, [activeCodeFilePath, codeDraftByPath, files]);
  const activeCodeIsDirty = activeCodeFilePath
    ? Boolean(codeDirtyPathSet[activeCodeFilePath])
    : false;
  const codeEditorFiles = useMemo(
    () =>
      Object.keys(files)
        .filter((path) => isCodeEditableFile(path, files[path].type))
        .sort((a, b) => a.localeCompare(b)),
    [files],
  );
  const handleCodeSelectFile = useCallback(
    (path: string) => {
      if (
        !path ||
        !files[path] ||
        !isCodeEditableFile(path, files[path].type)
      ) {
        return;
      }
      setActiveFileStable(path);
      if (files[path]?.type === "html") {
        setPreviewSyncedFile((prev) => (prev === path ? prev : path));
        setPreviewNavigationFile((prev) => (prev === path ? prev : path));
      }
      if (!isSvgPath(path)) {
        void loadFileContent(path, { persistToState: true });
        return;
      }
      const absolutePath = filePathIndexRef.current[path];
      if (!absolutePath) return;
      void (async () => {
        try {
          const raw = await (Neutralino as any).filesystem.readFile(
            absolutePath,
          );
          textFileCacheRef.current[path] = raw;
          setFiles((prev) => {
            const existing = prev[path];
            if (!existing) return prev;
            return {
              ...prev,
              [path]: {
                ...existing,
                content: raw,
              },
            };
          });
        } catch (error) {
          console.warn(`Failed reading SVG source ${path}:`, error);
        }
      })();
    },
    [files, loadFileContent, setActiveFileStable],
  );
  const saveCodeDraftAtPath = useCallback(
    async (path: string) => {
      const draft = codeDraftByPathRef.current[path];
      if (typeof draft !== "string") return;
      const file = filesRef.current[path];
      if (!file || !isCodeEditableFile(path, file.type)) return;
      try {
        if (file.type === "html") {
          await persistPreviewHtmlContent(path, draft, {
            refreshPreviewDoc: path === selectedPreviewHtmlRef.current,
            saveNow: true,
            pushToHistory: true,
          });
          if (path === selectedPreviewHtmlRef.current) {
            setPreviewNavigationFile((prev) => (prev === path ? prev : path));
            setPreviewRefreshNonce((prev) => prev + 1);
          }
        } else {
          const absolutePath = filePathIndexRef.current[path];
          if (!absolutePath) return;
          await (Neutralino as any).filesystem.writeFile(absolutePath, draft);
          textFileCacheRef.current[path] = draft;
          setFiles((prev) => {
            const existing = prev[path];
            if (!existing) return prev;
            return {
              ...prev,
              [path]: {
                ...existing,
                content: draft,
              },
            };
          });
          const currentPreview = selectedPreviewHtmlRef.current;
          if (currentPreview) {
            setPreviewNavigationFile((prev) =>
              prev === currentPreview ? prev : currentPreview,
            );
          }
          setPreviewRefreshNonce((prev) => prev + 1);
        }
        delete codeDraftByPathRef.current[path];
        delete codeDirtyPathSetRef.current[path];
        dirtyFilesRef.current = dirtyFilesRef.current.filter(
          (entry) => entry !== path,
        );
        setCodeDraftByPath((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
        setCodeDirtyPathSet((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
        setDirtyFiles((prev) => prev.filter((entry) => entry !== path));
      } catch (error) {
        console.warn(`Failed saving code file ${path}:`, error);
      }
    },
    [persistPreviewHtmlContent],
  );
  const saveAllCodeDrafts = useCallback(async () => {
    const dirtyPaths = Object.keys(codeDirtyPathSetRef.current);
    for (const path of dirtyPaths) {
      await saveCodeDraftAtPath(path);
    }
  }, [saveCodeDraftAtPath]);
  useEffect(() => {
    saveCodeDraftsRef.current = saveAllCodeDrafts;
    return () => {
      if (saveCodeDraftsRef.current === saveAllCodeDrafts) {
        saveCodeDraftsRef.current = null;
      }
    };
  }, [saveAllCodeDrafts]);
  const handleCodeDraftChange = useCallback(
    (nextValue: string) => {
      if (!activeCodeFilePath) return;
      codeDraftByPathRef.current = {
        ...codeDraftByPathRef.current,
        [activeCodeFilePath]: nextValue,
      };
      codeDirtyPathSetRef.current = {
        ...codeDirtyPathSetRef.current,
        [activeCodeFilePath]: true,
      };
      if (!dirtyFilesRef.current.includes(activeCodeFilePath)) {
        dirtyFilesRef.current = [...dirtyFilesRef.current, activeCodeFilePath];
      }
      setCodeDraftByPath((prev) => ({
        ...prev,
        [activeCodeFilePath]: nextValue,
      }));
      setCodeDirtyPathSet((prev) => ({
        ...prev,
        [activeCodeFilePath]: true,
      }));
      setDirtyFiles((prev) =>
        prev.includes(activeCodeFilePath)
          ? prev
          : [...prev, activeCodeFilePath],
      );
    },
    [activeCodeFilePath],
  );
  const handleCodeReload = useCallback(() => {
    if (!activeCodeFilePath) return;
    if (isSvgPath(activeCodeFilePath)) {
      const absolutePath = filePathIndexRef.current[activeCodeFilePath];
      if (absolutePath) {
        void (async () => {
          try {
            const raw = await (Neutralino as any).filesystem.readFile(
              absolutePath,
            );
            textFileCacheRef.current[activeCodeFilePath] = raw;
            setFiles((prev) => {
              const existing = prev[activeCodeFilePath];
              if (!existing) return prev;
              return {
                ...prev,
                [activeCodeFilePath]: {
                  ...existing,
                  content: raw,
                },
              };
            });
          } catch (error) {
            console.warn(
              `Failed reloading SVG source ${activeCodeFilePath}:`,
              error,
            );
          }
        })();
      }
    } else {
      void loadFileContent(activeCodeFilePath, { persistToState: true });
    }
    setCodeDraftByPath((prev) => {
      const next = { ...prev };
      delete next[activeCodeFilePath];
      return next;
    });
    setCodeDirtyPathSet((prev) => {
      const next = { ...prev };
      delete next[activeCodeFilePath];
      return next;
    });
    setDirtyFiles((prev) =>
      prev.filter((entry) => entry !== activeCodeFilePath),
    );
  }, [activeCodeFilePath, loadFileContent]);
  useEffect(() => {
    if (!isCodePanelOpen) return;
    if (!activeCodeFilePath) return;
    void loadFileContent(activeCodeFilePath, { persistToState: true });
  }, [activeCodeFilePath, isCodePanelOpen, loadFileContent]);

  const tabletMetrics = useMemo(() => {
    const base =
      tabletModel === "ipad-pro"
        ? {
          framePortraitWidth: 834,
          framePortraitHeight: 1112,
          contentPortraitWidth: 2048,
          contentPortraitHeight: 2732,
        }
        : {
          framePortraitWidth: 768,
          framePortraitHeight: 1024,
          contentPortraitWidth: 1536,
          contentPortraitHeight: 2048,
        };

    if (tabletOrientation === "landscape") {
      return {
        frameWidth: base.framePortraitHeight,
        frameHeight: base.framePortraitWidth,
        contentWidth: base.contentPortraitHeight,
        contentHeight: base.contentPortraitWidth,
      };
    }

    return {
      frameWidth: base.framePortraitWidth,
      frameHeight: base.framePortraitHeight,
      contentWidth: base.contentPortraitWidth,
      contentHeight: base.contentPortraitHeight,
    };
  }, [tabletModel, tabletOrientation]);
  const tabletViewportScale = useMemo(() => {
    const tabletBezelPx = 20; // 10px border on each side
    const usableWidth = Math.max(1, tabletMetrics.frameWidth - tabletBezelPx);
    const usableHeight = Math.max(1, tabletMetrics.frameHeight - tabletBezelPx);
    return Math.min(
      usableWidth / tabletMetrics.contentWidth,
      usableHeight / tabletMetrics.contentHeight,
    );
  }, [tabletMetrics]);
  const currentDevicePixelRatio =
    typeof window !== "undefined" && window.devicePixelRatio
      ? window.devicePixelRatio
      : 1;
  const shouldPushTabletFrame =
    deviceMode === "tablet" &&
    frameZoom === 75 &&
    currentDevicePixelRatio !== 1;
  const tabletPanelPushX = useMemo(() => {
    if (!shouldPushTabletFrame) return 0;
    if (isLeftPanelOpen === isRightPanelOpen) return 0;
    const push = Math.round(leftPanelWidth * 0.42);
    return isLeftPanelOpen ? push : -push;
  }, [
    isLeftPanelOpen,
    isRightPanelOpen,
    leftPanelWidth,
    shouldPushTabletFrame,
  ]);
  const baseOverflowX = bothPanelsOpen ? "scroll" : "auto";
  const isTabletZoomMode = deviceMode === "tablet";
  const lockAllScrollAt50 = isTabletZoomMode && frameZoom === 50;
  const lockVerticalAt75Landscape =
    isTabletZoomMode && frameZoom === 75 && tabletOrientation === "landscape";
  const lockHorizontalAt75Portrait =
    isTabletZoomMode && frameZoom === 75 && tabletOrientation === "portrait";
  const shouldLockHorizontalScroll =
    lockAllScrollAt50 || lockHorizontalAt75Portrait;
  const shouldLockVerticalScroll =
    lockAllScrollAt50 || lockVerticalAt75Landscape;
  const frameScale = frameZoom / 100;
  const darkTabletReflectionOpacity =
    theme === "dark" && deviceMode === "tablet"
      ? Math.min(
        0.72,
        0.28 +
        (isLeftPanelOpen ? 0.12 : 0) +
        (isRightPanelOpen ? 0.12 : 0) +
        (isCodePanelOpen ? 0.12 : 0) +
        (showTerminal ? 0.14 : 0),
      )
      : 0;
  const codePanelStageOffset =
    isCodePanelOpen && deviceMode !== "mobile"
      ? (() => {
        const viewportWidth =
          typeof window !== "undefined" ? window.innerWidth : 1440;
        if (!isFloatingPanels) return CODE_PANEL_WIDTH;
        const floatingPanelWidth = Math.min(
          42 * 16,
          Math.max(320, viewportWidth - 96),
        );
        const floatingRightInset = 40; // `right-10`
        return floatingPanelWidth + floatingRightInset;
      })()
      : 0;
  const stageViewportWidth = Math.max(
    320,
    (typeof window !== "undefined" ? window.innerWidth : 1440) -
    codePanelStageOffset,
  );
  const estimatedFrameWidthPx =
    deviceMode === "mobile"
      ? 375 * frameScale
      : deviceMode === "tablet"
        ? tabletMetrics.frameWidth * frameScale
        : desktopResolution === "resizable"
          ? stageViewportWidth * 0.8 * frameScale
          : 921.6 * frameScale;
  const halfSpareSpace = (stageViewportWidth - estimatedFrameWidthPx) / 2;
  const maxShiftMagnitude = Math.max(0, Math.floor(halfSpareSpace - 16));
  const intendedCodeShiftX = 0;
  const clampedCodeShiftX = Math.max(
    -maxShiftMagnitude,
    Math.min(maxShiftMagnitude, intendedCodeShiftX),
  );
  const clampedTabletShiftX = Math.max(
    -maxShiftMagnitude,
    Math.min(maxShiftMagnitude, tabletPanelPushX + clampedCodeShiftX),
  );
  const pendingSwitchFromLabel =
    pendingPageSwitch?.fromPath &&
      normalizePath(pendingPageSwitch.fromPath).split("/").filter(Boolean)
        .length > 0
      ? normalizePath(pendingPageSwitch.fromPath)
        .split("/")
        .filter(Boolean)
        .slice(-1)[0]
      : pendingPageSwitch?.fromPath || "current page";
  const pendingSwitchNextLabel =
    pendingPageSwitch?.nextPath &&
      normalizePath(pendingPageSwitch.nextPath).split("/").filter(Boolean)
        .length > 0
      ? normalizePath(pendingPageSwitch.nextPath)
        .split("/")
        .filter(Boolean)
        .slice(-1)[0]
      : pendingPageSwitch?.nextPath || "next page";
  const isPendingRefresh = pendingPageSwitch?.mode === "refresh";
  const isPendingPreviewMode = pendingPageSwitch?.mode === "preview_mode";

  return (
    <div
      ref={appRootRef}
      className={`h-screen w-screen flex flex-col font-sans relative overflow-hidden ${theme === "light" ? "light-mode" : ""}`}
      style={{
        backgroundColor: "var(--bg-app)",
        color: "var(--text-main)",
        ["--left-panel-width" as any]: `${leftPanelWidth}px`,
        ...(theme !== "light"
          ? {
            boxShadow:
              "inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 0 rgba(255,255,255,0.12), inset 1px 0 0 0 rgba(255,255,255,0.06), inset -1px 0 0 0 rgba(255,255,255,0.06), inset 0 -1px 0 0 rgba(255,255,255,0.04)",
          }
          : {}),
      }}
    >
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onAction={handleCommandAction}
      />
      {isPageSwitchPromptOpen && pendingPageSwitch && (
        <div
          className="fixed inset-0 z-[1400] flex items-center justify-center px-4"
          style={{
            background:
              theme === "dark" ? "rgba(2,6,23,0.58)" : "rgba(15,23,42,0.25)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border shadow-2xl p-5"
            style={{
              background:
                theme === "dark"
                  ? "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(30,41,59,0.94) 100%)"
                  : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%)",
              borderColor:
                theme === "dark"
                  ? "rgba(148,163,184,0.32)"
                  : "rgba(15,23,42,0.12)",
              color: "var(--text-main)",
            }}
          >
            <div
              className="text-[11px] uppercase tracking-[0.18em] font-semibold mb-2"
              style={{ color: "var(--text-muted)" }}
            >
              Unsaved Changes
            </div>
            <h3 className="text-base font-semibold leading-tight">
              {isPendingRefresh
                ? "Save changes before refresh?"
                : isPendingPreviewMode
                  ? "Save changes before switching mode?"
                  : "Save changes before switching page?"}
            </h3>
            <p
              className="text-xs mt-2 leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              You have unsaved edits in{" "}
              <span
                className="font-semibold"
                style={{ color: "var(--text-main)" }}
              >
                {pendingSwitchFromLabel}
              </span>
              .
              {isPendingRefresh ? (
                <> Refresh can overwrite your in-memory edits.</>
              ) : isPendingPreviewMode ? (
                <>
                  {" "}
                  Switching to Preview mode can overwrite your in-memory edits.
                </>
              ) : (
                <>
                  {" "}
                  Switching to{" "}
                  <span
                    className="font-semibold"
                    style={{ color: "var(--text-main)" }}
                  >
                    {pendingSwitchNextLabel}
                  </span>{" "}
                  can overwrite your in-memory edits.
                </>
              )}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-black/5"
                style={{
                  borderColor: "var(--border-color)",
                  color: "var(--text-main)",
                  opacity: isPageSwitchPromptBusy ? 0.65 : 1,
                }}
                onClick={closePendingPageSwitchPrompt}
                disabled={isPageSwitchPromptBusy}
              >
                Keep Editing
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-rose-500/10"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(251,113,133,0.45)"
                      : "rgba(225,29,72,0.35)",
                  color: theme === "dark" ? "#fecdd3" : "#be123c",
                  opacity: isPageSwitchPromptBusy ? 0.65 : 1,
                }}
                onClick={() => {
                  void resolvePendingPageSwitchWithDiscard();
                }}
                disabled={isPageSwitchPromptBusy}
              >
                {isPendingRefresh ? "Discard & Refresh" : "Discard & Switch"}
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-cyan-500/15"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(34,211,238,0.45)"
                      : "rgba(8,145,178,0.35)",
                  color: theme === "dark" ? "#a5f3fc" : "#0e7490",
                  opacity: isPageSwitchPromptBusy ? 0.65 : 1,
                }}
                onClick={() => {
                  void resolvePendingPageSwitchWithSave();
                }}
                disabled={isPageSwitchPromptBusy}
              >
                {isPageSwitchPromptBusy
                  ? "Working..."
                  : isPendingRefresh
                    ? "Save & Refresh"
                    : "Save & Switch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Floating Toolbar --- */}
      <div
        className={`absolute top-6 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-4 glass-toolbar rounded-full px-6 py-2 transition-all animate-slideDown ${isZenMode ? "opacity-65 hover:opacity-90" : "hover:scale-[1.02]"}`}
      >
        <div className="flex items-center gap-2 pr-4 border-r border-gray-500/20">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/80 shadow-red-500/50 shadow-sm"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 shadow-yellow-500/50 shadow-sm"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/80 shadow-green-500/50 shadow-sm"></div>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="glass-icon-btn group"
            onClick={() => setIsCommandPaletteOpen(true)}
            title="Command Palette (Ctrl+K)"
          >
            <Command
              size={16}
              className="group-hover:text-indigo-400 transition-colors"
            />
          </button>
          <button
            className="glass-icon-btn group"
            onClick={handleOpenFolder}
            title="Open Project Folder"
          >
            <FolderOpen
              size={16}
              className="group-hover:text-indigo-400 transition-colors"
            />
          </button>
          <button
            className={`glass-icon-btn group ${isCodePanelOpen ? "text-cyan-400" : ""}`}
            onClick={openCodePanel}
            title="Open Code Panel"
          >
            <Code2
              size={16}
              className="group-hover:text-cyan-400 transition-colors"
            />
          </button>

          <div className="h-4 w-px bg-gray-500/20"></div>

          {SHOW_AI_FEATURES ? (
            <>
              <button
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 ${isVibeAssistantOpen
                  ? theme === "light"
                    ? "bg-indigo-500/20 text-indigo-700 border border-indigo-500/35"
                    : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/35"
                  : theme === "light"
                    ? "bg-indigo-500/10 text-indigo-600 border border-indigo-500/25 hover:bg-indigo-500/20"
                    : "bg-indigo-500/10 text-indigo-200 border border-indigo-500/20 hover:bg-indigo-500/20"
                  }`}
                onClick={() => setIsVibeAssistantOpen((prev) => !prev)}
                title="AI Vibe Assistant"
              >
                <Sparkles size={12} className={isVibeAssistantOpen ? "text-indigo-400" : ""} />
                Vibe
              </button>
              <div className="h-4 w-px bg-gray-500/20"></div>
            </>
          ) : null}
          <button
            className={`glass-icon-btn ${deviceMode === "tablet" ? "active" : ""}`}
            onClick={() => {
              setDeviceMode("tablet");
              setTabletOrientation((prev) =>
                prev === "landscape" ? "portrait" : "landscape",
              );
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setDeviceMode("tablet");
              setDeviceCtxMenu({ type: "tablet", x: e.clientX, y: e.clientY });
            }}
            title={`iPad (${tabletOrientation === "landscape" ? "Landscape" : "Portrait"}) - click to rotate, right-click for model`}
          >
            <Tablet
              size={16}
              className="transition-transform duration-300 ease-out"
              style={{
                transform: `rotate(${tabletOrientation === "landscape" ? 90 : 0}deg)`,
              }}
            />
          </button>
          <button
            className="glass-icon-btn"
            onClick={handlePreviewRefresh}
            title="Refresh iPad content (Ctrl+T)"
          >
            <RotateCw size={16} />
          </button>
          <div className="flex items-center gap-1 rounded-full px-1 py-1 border border-gray-500/20">
            {[50, 75, 100].map((zoom) => (
              <button
                key={zoom}
                onClick={() => setFrameZoom(zoom as 50 | 75 | 100)}
                className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-all ${frameZoom === zoom
                  ? theme === "light"
                    ? "bg-cyan-500/20 text-cyan-700 border border-cyan-500/35"
                    : "bg-indigo-500/25 text-indigo-300"
                  : theme === "light"
                    ? "text-slate-500 hover:bg-slate-200/70"
                    : "text-gray-300 hover:bg-white/10"
                  }`}
                title={`Set frame zoom to ${zoom}%`}
              >
                {zoom}%
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-gray-500/20"></div>
          <button
            className="glass-icon-btn"
            onClick={toggleThemeWithTransition}
            title="Toggle Theme"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="h-4 w-px bg-gray-500/20"></div>
          <button
            className="glass-icon-btn"
            onClick={runUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="glass-icon-btn"
            onClick={runRedo}
            title="Redo (Ctrl+U)"
          >
            <Redo2 size={16} />
          </button>
          <div className="h-4 w-px bg-gray-500/20"></div>
          <div className="relative" ref={saveMenuRef}>
            <button
              className={`glass-icon-btn ${dirtyFiles.length > 0 ? "text-amber-400" : ""}`}
              onClick={() => setIsSaveMenuOpen((prev) => !prev)}
              title="Save settings"
            >
              <Settings2 size={16} />
            </button>
            {dirtyFiles.length > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500"
                aria-hidden="true"
              />
            )}
            {isSaveMenuOpen && (
              <div
                className="absolute top-10 right-0 w-56 rounded-xl border p-2 shadow-2xl z-[1200]"
                style={{
                  background:
                    theme === "dark"
                      ? "rgba(15,23,42,0.98)"
                      : "rgba(255,255,255,0.98)",
                  borderColor:
                    theme === "dark"
                      ? "rgba(148,163,184,0.35)"
                      : "rgba(15,23,42,0.15)",
                  color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                }}
              >
                <button
                  className="w-full text-left px-2 py-2 rounded-md text-xs font-semibold hover:bg-cyan-500/15 flex items-center justify-between"
                  onClick={() => {
                    void saveCodeDraftsRef.current?.();
                    void flushPendingPreviewSaves();
                    setIsSaveMenuOpen(false);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Save size={13} />
                    Save Now
                  </span>
                  <span className="opacity-70">Ctrl+S</span>
                </button>
                <label className="mt-1 w-full px-2 py-2 rounded-md text-xs flex items-center justify-between gap-2 cursor-pointer hover:bg-cyan-500/10">
                  <span>Auto Save</span>
                  <input
                    type="checkbox"
                    checked={autoSaveEnabled}
                    onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                  />
                </label>
                <div className="px-2 pt-1 text-[10px] opacity-70">
                  Smart debounce (about 1.2s idle), not every keystroke.
                </div>
                {dirtyFiles.length > 0 && (
                  <div className="px-2 pt-2 text-[10px] text-amber-400">
                    {dirtyFiles.length} unsaved file
                    {dirtyFiles.length > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="h-4 w-px bg-gray-500/20"></div>
          <button
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 ${interactionMode === "preview"
              ? theme === "light"
                ? "bg-cyan-500/20 text-cyan-700 border border-cyan-500/35"
                : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/35"
              : theme === "light"
                ? "bg-cyan-500/10 text-cyan-600 border border-cyan-500/25 hover:bg-cyan-500/20"
                : "bg-cyan-500/10 text-cyan-200 border border-cyan-500/20 hover:bg-cyan-500/20"
              }`}
            onClick={() => {
              if (interactionMode === "preview") {
                setSidebarToolMode("edit");
                setPreviewModeWithSync("edit");
                return;
              }
              requestSwitchToPreviewMode();
            }}
            title="Run Project on Device"
          >
            <Play
              size={10}
              fill={interactionMode === "preview" ? "currentColor" : "none"}
            />
            {interactionMode === "preview" ? "LIVE" : "Run"}
          </button>
          {interactionMode === "preview" && (
            <div className="flex items-center gap-1 rounded-full px-1 py-1 border border-gray-500/20">
              <button
                onClick={() => setPreviewModeWithSync("edit")}
                className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-all ${previewMode === "edit"
                  ? theme === "light"
                    ? "bg-amber-500/20 text-amber-700 border border-amber-500/35"
                    : "bg-amber-500/25 text-amber-200 border border-amber-500/35"
                  : theme === "light"
                    ? "text-slate-500 hover:bg-slate-200/70"
                    : "text-gray-300 hover:bg-white/10"
                  }`}
                title="LIVE Edit mode: select and edit elements"
              >
                Edit
              </button>
              <button
                onClick={() => setPreviewModeWithSync("preview")}
                className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-all ${previewMode === "preview"
                  ? theme === "light"
                    ? "bg-emerald-500/20 text-emerald-700 border border-emerald-500/35"
                    : "bg-emerald-500/25 text-emerald-200 border border-emerald-500/35"
                  : theme === "light"
                    ? "text-slate-500 hover:bg-slate-200/70"
                    : "text-gray-300 hover:bg-white/10"
                  }`}
                title="LIVE Preview mode: navigate and interact"
              >
                Preview
              </button>
            </div>
          )}
        </div>
      </div>
      {isZenMode && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[999] px-3 py-1 rounded-full text-[10px] font-semibold tracking-wider border backdrop-blur-md bg-black/20 text-white/90 border-white/20">
          Zen Mode Active • Press Esc to exit
        </div>
      )}

      {/* Device Context Menu */}
      {deviceCtxMenu && (
        <DeviceContextMenu
          type={deviceCtxMenu.type}
          position={{ x: deviceCtxMenu.x, y: deviceCtxMenu.y }}
          mobileFrameStyle={mobileFrameStyle}
          setMobileFrameStyle={setMobileFrameStyle}
          desktopResolution={desktopResolution}
          setDesktopResolution={setDesktopResolution}
          tabletModel={tabletModel}
          tabletOrientation={tabletOrientation}
          setTabletModel={setTabletModel}
          onClose={() => setDeviceCtxMenu(null)}
        />
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar */}
        <div
          className={`absolute z-40 no-scrollbar ${isResizingLeftPanel ? "" : "transition-all duration-500"} ${isFloatingPanels ? "left-10 top-24" : "left-0 top-0 bottom-0"} ${isZenMode ? "opacity-0 pointer-events-none" : ""} ${isLeftPanelOpen ? "animate-panelInLeft" : ""}`}
          style={{
            transform: isLeftPanelOpen
              ? "translateX(0)"
              : isFloatingPanels
                ? "translateX(calc(-100% - 2.5rem))"
                : "translateX(-100%)",
            width: "var(--left-panel-width)",
            minHeight: isFloatingPanels ? "30vh" : undefined,
            maxHeight: isFloatingPanels
              ? "min(70vh, calc(100vh - 7.5rem))"
              : undefined,
            height: isFloatingPanels
              ? "min(70vh, calc(100vh - 7.5rem))"
              : undefined,
            borderRadius: isFloatingPanels ? "1rem" : undefined,
            border: isFloatingPanels
              ? theme === "light"
                ? "1px solid rgba(15, 23, 42, 0.18)"
                : "1px solid rgba(255, 255, 255, 0.25)"
              : undefined,
            background: theme === "dark" ? "rgba(10, 15, 30, 0.96)" : "#fff",
            overflowY: "hidden",
            overflowX: "hidden",
            transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
          }}
        >
          <div
            className={`h-full min-h-full relative flex flex-col overflow-hidden ${isFloatingPanels ? "rounded-2xl overflow-hidden" : ""
              }`}
            style={{
              background:
                theme === "dark"
                  ? "linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(17,24,39,0.95) 100%)"
                  : "linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(248,250,252,0.74) 100%)",
              backdropFilter: "blur(14px)",
            }}
          >
            <div
              className="h-11 shrink-0 px-3 flex items-center justify-between"
              style={{
                borderBottom:
                  theme === "dark"
                    ? "1px solid rgba(148,163,184,0.28)"
                    : "1px solid rgba(0,0,0,0.1)",
                background:
                  theme === "dark"
                    ? "linear-gradient(90deg, rgba(14,165,233,0.18), rgba(99,102,241,0.16), rgba(15,23,42,0.0))"
                    : "linear-gradient(90deg,rgba(14,165,233,0.12),rgba(99,102,241,0.1),transparent)",
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
                <span
                  className="text-[11px] uppercase tracking-[0.2em] font-semibold"
                  style={{ color: theme === "dark" ? "#cbd5e1" : "#475569" }}
                >
                  Explorer
                </span>
              </div>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  background:
                    theme === "dark"
                      ? "rgba(15,23,42,0.7)"
                      : "rgba(255,255,255,0.7)",
                  border:
                    theme === "dark"
                      ? "1px solid rgba(148,163,184,0.32)"
                      : "1px solid rgba(0,0,0,0.1)",
                  color: theme === "dark" ? "#94a3b8" : "#64748b",
                }}
              >
                {Object.keys(files).length} files
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <Sidebar
                files={files}
                projectPath={projectPath}
                activeFile={previewSyncedFile ?? activeFile}
                onSelectFile={handleSelectFile}
                onAddFontToPresentationCss={
                  handleSidebarAddFontToPresentationCss
                }
                onCreateFile={handleCreateFileAtPath}
                onCreateFolder={handleCreateFolderAtPath}
                onRenamePath={handleRenamePath}
                onDeletePath={handleDeletePath}
                onDuplicateFile={handleDuplicateFile}
                onRefreshFiles={refreshProjectFiles}
                onAddElement={handleSidebarAddElement}
                root={interactionMode === "preview" ? previewLayersRoot : root}
                selectedId={
                  interactionMode === "preview"
                    ? previewLayerSelectedId
                    : selectedId
                }
                onSelectElement={handleSidebarSelectElement}
                interactionMode={sidebarInteractionMode}
                setInteractionMode={handleSidebarInteractionModeChange}
                drawElementTag={drawElementTag}
                setDrawElementTag={setDrawElementTag}
                theme={theme}
                showConfigButton={isEdaProject(files)}
                onOpenConfig={handleOpenConfigModal}
                onLoadImage={handleSidebarLoadImage}
                isPanelOpen={isLeftPanelOpen}
                showMasterTools={SHOW_MASTER_TOOLS}
              />
            </div>
            <div
              className="pointer-events-none absolute inset-0 rounded-2xl"
              style={{
                boxShadow:
                  theme === "dark"
                    ? "inset 0 0 0 1px rgba(148,163,184,0.2)"
                    : "inset 0 0 0 1px rgba(255,255,255,0.45)",
              }}
            />
          </div>
          {isLeftPanelOpen && (
            <div
              onMouseDown={handleLeftPanelResizeStart}
              className="absolute top-0 right-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-cyan-400/30 transition-colors"
              title="Resize panel"
            />
          )}
        </div>

        {/* --- Main Canvas Area ("The Stage") --- */}
        {/* Non-mobile: 1 panel = push, both panels = overlay with scrollable content. Mobile: always overlay. */}
        <div
          className={`flex-1 flex flex-col relative ${isResizingLeftPanel ? "" : "transition-all duration-500"}`}
          style={{
            marginLeft:
              !isFloatingPanels &&
                deviceMode !== "mobile" &&
                isLeftPanelOpen &&
                !isRightPanelOpen
                ? "var(--left-panel-width)"
                : 0,
            marginRight: codePanelStageOffset
              ? `${codePanelStageOffset}px`
              : !isFloatingPanels &&
                deviceMode !== "mobile" &&
                !isLeftPanelOpen &&
                isRightPanelOpen
                ? "16.5rem"
                : 0,
            // When both panels open, no margins - content will scroll
          }}
        >
          {/* Background & Scroller */}
          <div
            ref={scrollerRef}
            className={`flex-1 relative no-scrollbar transition-all duration-300 ${showTerminal ? "pb-52" : "pb-10"}`}
            style={{
              overflowX: shouldLockHorizontalScroll ? "hidden" : baseOverflowX,
              overflowY: shouldLockVerticalScroll ? "hidden" : "auto",
            }}
            onClick={() => {
              setSelectedId(null);
              setPreviewSelectedPath(null);
              setPreviewSelectedElement(null);
              setPreviewSelectedComputedStyles(null);
            }}
          >
            {/* Dynamic Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
              <div className="absolute inset-0 bg-[linear-gradient(var(--border-color)_1px,transparent_1px),linear-gradient(90deg,var(--border-color)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)]"></div>
              <div className="absolute top-[-20%] left-[20%] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] mix-blend-screen animate-pulse duration-[10s]"></div>
              <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] mix-blend-screen animate-pulse duration-[7s]"></div>
            </div>

            {/* Content wrapper — adds padding when both panels overlay so scroll reveals content behind panels */}
            <div
              className="min-h-full relative flex flex-col p-10 outline-none bg-grid-pattern"
              style={{
                perspective: "1000px",
                paddingLeft: `${BASE_STAGE_PADDING}px`,
                paddingRight: `${BASE_STAGE_PADDING}px`,
                width: "100%",
                minWidth: bothPanelsOpen
                  ? `calc(100% + var(--left-panel-width) + ${rightOverlayInset}px)`
                  : floatingHorizontalInset > 0
                    ? `calc(100% + ${floatingHorizontalInset}px)`
                    : "100%",
              }}
            >
              {/* Safe Spacing for Toolbar */}
              <div className="w-full shrink-0 h-[3.5rem] pointer-events-none"></div>
              {/* --- Device Frame Container --- */}
              {/* --- Device Frame Wrapper (Layout Isolation) --- */}
              <div
                className="relative shrink-0 flex items-center justify-center transition-all duration-700 m-auto"
                style={{
                  width:
                    deviceMode === "mobile"
                      ? "375px"
                      : deviceMode === "tablet"
                        ? `${tabletMetrics.frameWidth}px`
                        : desktopResolution === "resizable"
                          ? "80%"
                          : "921.6px",
                  height:
                    deviceMode === "mobile"
                      ? "812px"
                      : deviceMode === "tablet"
                        ? `${tabletMetrics.frameHeight}px`
                        : desktopResolution === "resizable"
                          ? "75vh"
                          : "518.4px",
                  transform:
                    deviceMode === "tablet"
                      ? `translateX(${clampedTabletShiftX}px) scale(${frameScale})`
                      : `translateX(${clampedCodeShiftX}px) scale(${frameScale})`,
                  transformOrigin: "top center",
                }}
              >
                {/* Actual Device Frame */}
                <div
                  className={`
                              relative z-10 shrink-0 transition-all duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)]
                              ${deviceMode === "desktop"
                      ? "rounded-xl border-4"
                      : deviceMode === "tablet"
                        ? "w-full h-full rounded-[42px] border-[10px]"
                        : "w-full h-full rounded-[50px] border-[12px]"
                    }
                          `}
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    borderColor:
                      deviceMode === "desktop"
                        ? "#1e293b"
                        : deviceMode === "tablet"
                          ? theme === "dark"
                            ? "#c7d0dc"
                            : "#0f172a"
                          : "#000000",
                    background:
                      deviceMode === "tablet" && theme === "dark"
                        ? [
                          "linear-gradient(145deg, #eef3fa 0%, #cfd8e5 16%, #9aa7b8 34%, #748396 50%, #9fadbe 68%, #dce4ee 84%, #f3f7fb 100%)",
                          "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.06) 24%, rgba(0,0,0,0.12) 100%)",
                          "radial-gradient(130% 70% at 50% -5%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.0) 62%)",
                        ].join(", ")
                        : "#000000",
                    boxShadow:
                      deviceMode === "tablet" && theme === "dark"
                        ? "0 28px 62px -16px rgba(0,0,0,0.62), 0 0 0 1px rgba(203,213,225,0.22), 0 0 28px rgba(148,163,184,0.2), inset 0 1px 0 rgba(255,255,255,0.62), inset 0 -1px 0 rgba(255,255,255,0.22), inset 1px 0 0 rgba(255,255,255,0.2), inset -1px 0 0 rgba(0,0,0,0.26)"
                        : "0 20px 50px -10px rgba(0,0,0,0.5)",
                    // No transform on the frame itself - it stays fixed visual size
                  }}
                >
                  {deviceMode === "tablet" && theme === "dark" && (
                    <>
                      <div
                        className="pointer-events-none absolute inset-[2px] rounded-[34px]"
                        style={{
                          background:
                            "linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.13) 18%, rgba(255,255,255,0.03) 36%, rgba(0,0,0,0.06) 100%)",
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-[1px] rounded-[36px]"
                        style={{
                          background: [
                            "linear-gradient(120deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.0) 28%, rgba(255,255,255,0.0) 72%, rgba(255,255,255,0.22) 100%)",
                            "repeating-linear-gradient(90deg, rgba(255,255,255,0.055) 0px, rgba(255,255,255,0.055) 1px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 3px)",
                          ].join(", "),
                          opacity: 0.3,
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-[0px] rounded-[36px]"
                        style={{
                          opacity: darkTabletReflectionOpacity,
                          mixBlendMode: "screen",
                          background: [
                            "radial-gradient(60% 26% at 50% -4%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.0) 78%)",
                            "radial-gradient(40% 34% at 6% 18%, rgba(147,197,253,0.42) 0%, rgba(147,197,253,0.0) 72%)",
                            "radial-gradient(40% 34% at 94% 18%, rgba(167,243,208,0.4) 0%, rgba(167,243,208,0.0) 72%)",
                          ].join(", "),
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-[0px] rounded-[36px]"
                        style={{
                          opacity: Math.min(
                            0.56,
                            darkTabletReflectionOpacity * 0.9,
                          ),
                          background:
                            "linear-gradient(112deg, rgba(255,255,255,0.0) 18%, rgba(255,255,255,0.42) 31%, rgba(255,255,255,0.0) 46%, rgba(255,255,255,0.0) 60%, rgba(255,255,255,0.28) 71%, rgba(255,255,255,0.0) 85%)",
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-[3px] rounded-[33px]"
                        style={{
                          boxShadow:
                            "inset 0 0 0 1px rgba(255,255,255,0.22), inset 0 0 26px rgba(255,255,255,0.08)",
                        }}
                      />
                    </>
                  )}
                  {/* Morphing Header (Window Bar <-> Notch) */}
                  <div
                    className={`
                            absolute top-0 left-1/2 -translate-x-1/2 z-20 ${deviceMode === "desktop" ? "bg-[#1e293b]" : deviceMode === "tablet" ? (theme === "dark" ? "bg-[#5f6f82]" : "bg-[#0f172a]") : "bg-black"}
                            transition-all duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)] flex items-center justify-center overflow-hidden
                            ${deviceMode === "desktop"
                        ? "w-full h-9 rounded-t-lg rounded-b-none px-4"
                        : deviceMode === "tablet"
                          ? "w-[120px] h-[9px] rounded-full top-[12px] px-0"
                          : mobileFrameStyle === "dynamic-island"
                            ? "w-[120px] h-[35px] rounded-full top-[11px] px-0"
                            : mobileFrameStyle === "notch"
                              ? "w-[160px] h-[30px] rounded-b-[20px] rounded-t-none px-0"
                              : "w-[10px] h-[10px] rounded-full top-[12px] left-1/2 -translate-x-1/2"
                      }
                        `}
                  >
                    {/* Desktop Elements: Traffic Lights & URL */}
                    <div
                      className={`absolute left-4 flex gap-1.5 transition-opacity duration-500 ${deviceMode === "desktop" ? "opacity-100 delay-200" : "opacity-0"}`}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]"></div>
                    </div>

                    <div
                      className={`transition-opacity duration-300 ${deviceMode === "desktop" ? "opacity-100 delay-200" : "opacity-0"}`}
                    >
                      <div className="bg-black/30 h-5 w-64 rounded-md flex items-center justify-center gap-2 text-[10px] text-slate-500 font-mono">
                        <Globe size={10} />
                        <span>nocode-x-preview.app</span>
                      </div>
                    </div>

                    {/* Mobile Elements: Notch Speaker/Cam */}
                    {mobileFrameStyle === "dynamic-island" && (
                      <div
                        className={`absolute top-2 w-12 h-1 bg-[#1a1a1a] rounded-full transition-opacity duration-300 ${deviceMode === "mobile" ? "opacity-100 delay-300" : "opacity-0"}`}
                      ></div>
                    )}
                  </div>

                  {/* Mobile Status Bar Indicators (Fade In) */}
                  <div
                    className={`absolute top-0 left-0 right-0 h-[30px] z-30 pointer-events-none transition-opacity duration-500 ${deviceMode === "mobile" ? "opacity-100 delay-200" : "opacity-0"}`}
                  >
                    <div className="absolute top-4 left-7 text-[10px] text-white font-medium tracking-wide">
                      9:41
                    </div>
                    <div className="absolute top-4 right-7 flex gap-1.5 text-white">
                      <Wifi size={12} />
                      <div className="w-4 h-2.5 border border-white/30 rounded-[2px] relative">
                        <div className="absolute left-[1px] top-[1px] bottom-[1px] right-1 bg-white rounded-[1px]"></div>
                      </div>
                    </div>
                  </div>

                  {/* Screen Content Wrapper */}
                  <div
                    className={`w-full h-full bg-white overflow-hidden relative transition-all duration-700 ${deviceMode === "desktop" ? "rounded-lg pt-9" : deviceMode === "tablet" ? "rounded-[32px]" : "rounded-[38px]"}`}
                  >
                    {/* Inner Content Scaler - Handles High Res Scaling independent of Frame */}
                    <div
                      className="origin-top-left transition-transform duration-500"
                      style={{
                        width:
                          deviceMode === "mobile"
                            ? "100%"
                            : deviceMode === "tablet"
                              ? `${tabletMetrics.contentWidth}px`
                              : desktopResolution === "resizable"
                                ? "100%"
                                : desktopResolution === "4k"
                                  ? "3840px"
                                  : desktopResolution === "2k"
                                    ? "2560px"
                                    : desktopResolution === "1.5k"
                                      ? "1600px"
                                      : "1920px",
                        height:
                          deviceMode === "mobile"
                            ? "100%"
                            : deviceMode === "tablet"
                              ? `${tabletMetrics.contentHeight}px`
                              : desktopResolution === "resizable"
                                ? "100%"
                                : desktopResolution === "4k"
                                  ? "2160px"
                                  : desktopResolution === "2k"
                                    ? "1440px"
                                    : desktopResolution === "1.5k"
                                      ? "900px"
                                      : "1080px",
                        transform:
                          deviceMode === "tablet"
                            ? `translateX(-50%) scale(${tabletViewportScale})`
                            : `scale(${deviceMode === "mobile"
                              ? 1
                              : desktopResolution === "resizable"
                                ? 1
                                : desktopResolution === "4k"
                                  ? 0.24
                                  : desktopResolution === "2k"
                                    ? 0.36
                                    : desktopResolution === "1.5k"
                                      ? 0.576
                                      : 0.48
                            })`,
                        transformOrigin:
                          deviceMode === "tablet" ? "top center" : "top left",
                        position:
                          deviceMode === "tablet" ? "absolute" : "relative",
                        left: deviceMode === "tablet" ? "50%" : undefined,
                        top: deviceMode === "tablet" ? 0 : undefined,
                      }}
                    >
                      <div
                        ref={previewStageRef}
                        className="w-full h-full relative"
                        onDragOver={handlePreviewStageDragOver}
                        onDrop={handlePreviewStageDrop}
                      >
                        {hasPreviewContent && (
                          <iframe
                            key={
                              selectedPreviewSrc
                                ? `preview-src:${selectedPreviewSrc}:${previewRefreshNonce}`
                                : `preview-doc:${selectedPreviewHtml || "none"}:${previewRefreshNonce}`
                            }
                            ref={previewFrameRef}
                            title="project-preview"
                            src={selectedPreviewSrc || undefined}
                            srcDoc={
                              selectedPreviewSrc
                                ? undefined
                                : selectedPreviewDoc
                            }
                            loading="eager"
                            onLoad={handlePreviewFrameLoad}
                            onDragOver={handlePreviewStageDragOver}
                            onDrop={handlePreviewStageDrop}
                            className={`absolute inset-0 w-full h-full border-0 bg-white transition-opacity duration-150 ${interactionMode === "preview"
                              ? isToolboxDragging
                                ? "opacity-100 pointer-events-none"
                                : "opacity-100 pointer-events-auto"
                              : "opacity-0 pointer-events-none"
                              }`}
                          />
                        )}
                        <div
                          className={`w-full h-full transition-opacity duration-200 ${interactionMode === "preview"
                            ? "opacity-0 pointer-events-none"
                            : "opacity-100 pointer-events-auto"
                            }`}
                        >
                          <EditorContent
                            root={root}
                            selectedId={selectedId}
                            selectedPathIds={selectedPathIds}
                            handleSelect={handleSelect}
                            handleMoveElement={handleMoveElement}
                            handleMoveElementByPosition={
                              handleMoveElementByPosition
                            }
                            handleResize={handleResize}
                            interactionMode={interactionMode}
                            INJECTED_STYLES={INJECTED_STYLES}
                            vibeUpdateKey={lastVibeUpdateRef.current}
                            onVibeError={() => { }}
                          />
                        </div>
                        {interactionMode === "preview" &&
                          previewMode === "edit" &&
                          Array.isArray(previewSelectedPath) &&
                          previewSelectedPath.length > 0 &&
                          previewSelectionBox && (
                            <div
                              className="absolute z-30 pointer-events-none"
                              style={{
                                left: `${previewSelectionBox.left}px`,
                                top: `${previewSelectionBox.top}px`,
                                width: `${previewSelectionBox.width}px`,
                                height: `${previewSelectionBox.height}px`,
                                border: "2px solid rgba(34,211,238,0.95)",
                                boxShadow:
                                  "0 0 0 1px rgba(6,182,212,0.85), 0 0 0 6px rgba(34,211,238,0.12)",
                                borderRadius: "4px",
                              }}
                            >
                              <button
                                type="button"
                                className="pointer-events-auto absolute right-1 bottom-1 w-7 h-7 rounded-md border-2 border-white/90 bg-amber-500 shadow-[0_0_0_2px_rgba(2,6,23,0.7),0_8px_20px_rgba(245,158,11,0.45)] text-slate-950 font-black text-xs leading-none flex items-center justify-center"
                                style={{
                                  cursor: isPreviewResizing
                                    ? "nwse-resize"
                                    : "nwse-resize",
                                }}
                                title="Drag to resize"
                                onMouseDown={handlePreviewResizeHandleMouseDown}
                              >
                                <>
                                  {"↘"}
                                </>
                              </button>
                            </div>
                          )}
                        {false && interactionMode === "preview" &&
                          previewMode === "edit" &&
                          Array.isArray(previewSelectedPath) &&
                          previewSelectedPath.length > 0 &&
                          previewSelectedElement && (
                            <div
                              className="absolute right-4 top-4 z-40 rounded-2xl border shadow-2xl backdrop-blur-md p-3 flex flex-col gap-2 min-w-[230px]"
                              style={{
                                borderColor:
                                  theme === "dark"
                                    ? "rgba(148,163,184,0.35)"
                                    : "rgba(15,23,42,0.18)",
                                background:
                                  theme === "dark"
                                    ? "rgba(2,6,23,0.86)"
                                    : "rgba(255,255,255,0.96)",
                                color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              <div className="text-xs font-bold tracking-wide opacity-90">
                                Quick Controls
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-cyan-500/35 hover:bg-cyan-500/20 flex items-center gap-1"
                                  title="Duplicate"
                                  onClick={() => {
                                    void handlePreviewDuplicateSelected();
                                  }}
                                >
                                  <Copy size={12} />
                                  Dup
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-slate-500/35 hover:bg-slate-500/20"
                                  title="Send backward"
                                  onClick={() => handlePreviewNudgeZIndex(-1)}
                                >
                                  <MoveDown size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-slate-500/35 hover:bg-slate-500/20"
                                  title="Bring forward"
                                  onClick={() => handlePreviewNudgeZIndex(1)}
                                >
                                  <MoveUp size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-red-500/40 hover:bg-red-500/20 flex items-center gap-1"
                                  title="Delete"
                                  onClick={handlePreviewDeleteStable}
                                >
                                  <Trash2 size={12} />
                                  Del
                                </button>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-emerald-500/35 hover:bg-emerald-500/20 flex items-center gap-1"
                                  title="Narrower"
                                  onClick={() => handlePreviewResizeNudge("width", -12)}
                                >
                                  <Shrink size={12} />
                                  W-
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-emerald-500/35 hover:bg-emerald-500/20 flex items-center gap-1"
                                  title="Wider"
                                  onClick={() => handlePreviewResizeNudge("width", 12)}
                                >
                                  <Expand size={12} />
                                  W+
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-violet-500/35 hover:bg-violet-500/20"
                                  title="Shorter"
                                  onClick={() => handlePreviewResizeNudge("height", -12)}
                                >
                                  H-
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-violet-500/35 hover:bg-violet-500/20"
                                  title="Taller"
                                  onClick={() => handlePreviewResizeNudge("height", 12)}
                                >
                                  H+
                                </button>
                              </div>
                              <div className="text-[11px] opacity-80">
                                {`${Math.round(
                                  parseNumericCssValue(
                                    previewSelectedElement.styles?.width ??
                                    previewSelectedComputedStyles?.width ??
                                    0,
                                  ) || 0,
                                )} x ${Math.round(
                                  parseNumericCssValue(
                                    previewSelectedElement.styles?.height ??
                                    previewSelectedComputedStyles?.height ??
                                    0,
                                  ) || 0,
                                )} px`}
                              </div>
                            </div>
                          )}
                      </div>
                    </div>
                  </div>

                  {/* iPhone Home Indicator */}
                  <div
                    className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-[120px] h-[4px] bg-white/20 rounded-full z-30 pointer-events-none transition-opacity duration-500 ${deviceMode === "mobile" ? "opacity-100 delay-200" : "opacity-0"}`}
                  ></div>
                </div>
              </div>{" "}
              {/* End of Device Frame Visual Wrapper */}
            </div>
            {/* end content wrapper */}
          </div>
          {/* end scroller */}
        </div>
        {/* end stage */}

        {/* Right Sidebar */}
        <div
          className={`absolute z-40 no-scrollbar transition-all duration-500 cubic-bezier(0.2, 0.8, 0.2, 1) ${isFloatingPanels ? "right-10 top-24" : "right-0 top-0 bottom-0"} ${isZenMode ? "opacity-0 pointer-events-none" : ""} ${isRightPanelOpen ? "animate-panelInRight" : ""}`}
          style={{
            transform: isRightPanelOpen
              ? "translateX(0)"
              : isFloatingPanels
                ? "translateX(calc(100% + 2.5rem))"
                : "translateX(100%)",
            width: isFloatingPanels ? "var(--left-panel-width)" : "16.5rem",
            minHeight: isFloatingPanels ? "30vh" : undefined,
            maxHeight: isFloatingPanels
              ? "min(70vh, calc(100vh - 7.5rem))"
              : undefined,
            height: isFloatingPanels ? "fit-content" : undefined,
            borderRadius: isFloatingPanels ? "1rem" : undefined,
            border: isFloatingPanels
              ? theme === "light"
                ? "1px solid rgba(15, 23, 42, 0.18)"
                : "1px solid rgba(255, 255, 255, 0.25)"
              : undefined,
            background: theme === "dark" ? "rgba(10, 15, 30, 0.96)" : "#fff",
            overflowY: isFloatingPanels ? "auto" : undefined,
            overflowX: isFloatingPanels ? "hidden" : undefined,
          }}
        >
          <div
            className={`h-full min-h-full relative flex flex-col overflow-hidden ${isFloatingPanels ? "rounded-2xl overflow-hidden" : ""
              }`}
            style={{
              background:
                theme === "dark"
                  ? "linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(17,24,39,0.95) 100%)"
                  : "linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(248,250,252,0.76) 100%)",
              backdropFilter: "blur(14px)",
            }}
          >
            <div
              className="h-11 shrink-0 px-3 flex items-center justify-between"
              style={{
                borderBottom:
                  theme === "dark"
                    ? "1px solid rgba(148,163,184,0.28)"
                    : "1px solid rgba(0,0,0,0.1)",
                background:
                  theme === "dark"
                    ? "linear-gradient(90deg, rgba(99,102,241,0.2), rgba(16,185,129,0.16), rgba(15,23,42,0.0))"
                    : "linear-gradient(90deg,rgba(99,102,241,0.12),rgba(16,185,129,0.1),transparent)",
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: theme === "dark" ? "#ffffff" : "#8b5cf6",
                    boxShadow:
                      theme === "dark"
                        ? "0 0 10px rgba(255,255,255,0.8)"
                        : "0 0 10px rgba(139,92,246,0.8)",
                  }}
                />
                <span
                  className="text-[11px] uppercase tracking-[0.2em] font-semibold"
                  style={{ color: theme === "dark" ? "#cbd5e1" : "#475569" }}
                >
                  Inspector
                </span>
              </div>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  background:
                    theme === "dark"
                      ? "rgba(15,23,42,0.7)"
                      : "rgba(255,255,255,0.7)",
                  border:
                    theme === "dark"
                      ? "1px solid rgba(148,163,184,0.32)"
                      : "1px solid rgba(0,0,0,0.1)",
                  color: theme === "dark" ? "#94a3b8" : "#64748b",
                }}
              >
                {selectedId || previewSelectedElement ? "Element" : "Project"}
              </span>
            </div>
            <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
              {interactionMode === "preview" && (
                <div
                  className="shrink-0 px-2.5 py-2 border-b"
                  style={{
                    borderColor:
                      theme === "dark"
                        ? "rgba(148,163,184,0.28)"
                        : "rgba(0,0,0,0.1)",
                    background:
                      theme === "dark"
                        ? "rgba(15,23,42,0.42)"
                        : "rgba(255,255,255,0.72)",
                  }}
                >
                  <div
                    className="text-[9px] font-semibold uppercase tracking-[0.16em] px-1"
                    style={{ color: theme === "dark" ? "#94a3b8" : "#64748b" }}
                  ></div>
                  <div className="mt-1 grid grid-cols-4 gap-1">
                    {PREVIEW_SELECTION_MODE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setPreviewSelectionMode(option.value)}
                        className="px-1.5 py-1 rounded-md text-[9px] font-semibold uppercase tracking-wide transition-all"
                        style={{
                          color:
                            previewSelectionMode === option.value
                              ? theme === "dark"
                                ? "#ecfeff"
                                : "#155e75"
                              : theme === "dark"
                                ? "#cbd5e1"
                                : "#475569",
                          background:
                            previewSelectionMode === option.value
                              ? theme === "dark"
                                ? "rgba(34,211,238,0.2)"
                                : "rgba(14,165,233,0.16)"
                              : theme === "dark"
                                ? "rgba(15,23,42,0.68)"
                                : "rgba(241,245,249,0.9)",
                          border:
                            previewSelectionMode === option.value
                              ? "1px solid rgba(34,211,238,0.55)"
                              : theme === "dark"
                                ? "1px solid rgba(148,163,184,0.28)"
                                : "1px solid rgba(148,163,184,0.26)",
                        }}
                        title={option.label}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-hidden">
                {interactionMode === "inspect" && selectedId ? (
                  <StyleInspectorPanel
                    element={inspectorElement}
                    onUpdateStyle={handleUpdateStyle}
                    computedStyles={null}
                  />
                ) : (
                  <PropertiesPanel
                    element={
                      interactionMode === "preview" && previewSelectedElement
                        ? previewSelectedElement
                        : selectedElement
                    }
                    onUpdateStyle={
                      interactionMode === "preview" && previewSelectedElement
                        ? handlePreviewStyleUpdateStable
                        : handleUpdateStyle
                    }
                    onUpdateContent={
                      interactionMode === "preview" && previewSelectedElement
                        ? handlePreviewContentUpdateStable
                        : handleUpdateContent
                    }
                    onUpdateAttributes={
                      interactionMode === "preview" && previewSelectedElement
                        ? handlePreviewAttributesUpdateStable
                        : handleUpdateAttributes
                    }
                    onUpdateAnimation={
                      interactionMode === "preview" && previewSelectedElement
                        ? handlePreviewAnimationUpdateStable
                        : handleUpdateAnimation
                    }
                    onDelete={
                      interactionMode === "preview" && previewSelectedElement
                        ? handlePreviewDeleteStable
                        : handleDeleteElement
                    }
                    onAddElement={
                      interactionMode === "preview" && previewSelectedElement
                        ? noopPropertiesAction
                        : handleAddElement
                    }
                    onMoveOrder={noopMoveOrder}
                    resolveImage={resolvePreviewImagePath}
                    availableFonts={availableFonts}
                  />
                )}
              </div>
            </div>
            <div
              className="pointer-events-none absolute inset-0 rounded-2xl"
              style={{
                boxShadow:
                  theme === "dark"
                    ? "inset 0 0 0 1px rgba(148,163,184,0.2)"
                    : "inset 0 0 0 1px rgba(255,255,255,0.45)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Code Panel */}
      <div
        className={`absolute z-50 no-scrollbar transition-all duration-500 cubic-bezier(0.2, 0.8, 0.2, 1) ${isFloatingPanels ? "right-10 top-24 bottom-3" : "right-0 top-0 bottom-0"} ${isZenMode ? "opacity-0 pointer-events-none" : ""} ${isCodePanelOpen ? "animate-panelInRight" : ""}`}
        style={{
          transform: isCodePanelOpen
            ? "translateX(0)"
            : isFloatingPanels
              ? "translateX(calc(100% + 2.5rem))"
              : "translateX(100%)",
          width: isFloatingPanels
            ? "min(42rem, calc(100vw - 6rem))"
            : `${CODE_PANEL_WIDTH}px`,
          borderRadius: isFloatingPanels ? "1rem" : undefined,
          border: isFloatingPanels
            ? theme === "light"
              ? "1px solid rgba(15, 23, 42, 0.18)"
              : "1px solid rgba(255, 255, 255, 0.24)"
            : undefined,
          background: theme === "dark" ? "rgba(10, 15, 30, 0.96)" : "#fff",
          overflow: "hidden",
        }}
      >
        <div
          className={`h-full min-h-full relative flex flex-col overflow-hidden ${isFloatingPanels ? "rounded-2xl overflow-hidden" : ""
            }`}
          style={{
            background:
              theme === "dark"
                ? "linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(17,24,39,0.95) 100%)"
                : "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(248,250,252,0.82) 100%)",
            backdropFilter: "blur(14px)",
          }}
        >
          <div
            className="h-11 shrink-0 px-3 flex items-center justify-between"
            style={{
              borderBottom:
                theme === "dark"
                  ? "1px solid rgba(148,163,184,0.28)"
                  : "1px solid rgba(0,0,0,0.1)",
              background:
                theme === "dark"
                  ? "linear-gradient(90deg, rgba(139,92,246,0.2), rgba(99,102,241,0.16), rgba(15,23,42,0.0))"
                  : "linear-gradient(90deg,rgba(139,92,246,0.12),rgba(99,102,241,0.1),transparent)",
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: theme === "dark" ? "#c4b5fd" : "#7c3aed",
                  boxShadow:
                    theme === "dark"
                      ? "0 0 10px rgba(196,181,253,0.85)"
                      : "0 0 10px rgba(124,58,237,0.55)",
                }}
              />
              <span
                className="text-[11px] uppercase tracking-[0.2em] font-semibold"
                style={{ color: theme === "dark" ? "#e9d5ff" : "#5b21b6" }}
              >
                Code Studio
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="text-[10px] px-2 py-1 rounded-md border transition-colors hover:bg-violet-500/15"
                style={{
                  borderColor: "var(--border-color)",
                  color: "var(--text-main)",
                }}
                onClick={() => {
                  if (!activeCodeFilePath) return;
                  void saveCodeDraftAtPath(activeCodeFilePath);
                }}
              >
                Save File
              </button>
              <button
                type="button"
                className="text-[10px] px-2 py-1 rounded-md border transition-colors hover:bg-violet-500/15"
                style={{
                  borderColor: "var(--border-color)",
                  color: "var(--text-main)",
                }}
                onClick={() => {
                  void saveCodeDraftsRef.current?.();
                }}
              >
                Save All
              </button>
              <button
                type="button"
                className="h-7 w-7 rounded-md border flex items-center justify-center transition-colors hover:bg-violet-500/15"
                style={{
                  borderColor: "var(--border-color)",
                  color: "var(--text-main)",
                }}
                onClick={() => setIsCodePanelOpen(false)}
                title="Close code panel"
              >
                <PanelRightClose size={14} />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <CodeWorkspace
              filePath={activeCodeFilePath}
              fileType={activeCodeFileType}
              content={activeCodeContent}
              isDirty={activeCodeIsDirty}
              theme={theme}
              availableFiles={codeEditorFiles}
              onSelectFile={handleCodeSelectFile}
              onChange={handleCodeDraftChange}
              onSave={() => {
                if (!activeCodeFilePath) return;
                void saveCodeDraftAtPath(activeCodeFilePath);
              }}
              onReload={handleCodeReload}
            />
          </div>
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              boxShadow:
                theme === "dark"
                  ? "inset 0 0 0 1px rgba(196,181,253,0.2)"
                  : "inset 0 0 0 1px rgba(139,92,246,0.2)",
            }}
          />
        </div>
      </div>

      {/* Terminal Panel — Glass effect with smooth transition */}
      <div
        className={`fixed bottom-3 left-10 right-10 flex flex-col z-[100] transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-visible rounded-2xl ${isZenMode || isCodePanelOpen ? "translate-y-full opacity-0 pointer-events-none" : ""}`}
      >
        {!showTerminal && (
          <>
            <div
              className="pointer-events-none absolute -inset-3 rounded-[24px] blur-2xl"
              style={{
                background:
                  theme === "dark"
                    ? "conic-gradient(from 180deg at 50% 50%, rgba(56,189,248,0.42), rgba(16,185,129,0.36), rgba(167,139,250,0.4), rgba(56,189,248,0.42))"
                    : "conic-gradient(from 180deg at 50% 50%, rgba(56,189,248,0.22), rgba(16,185,129,0.2), rgba(167,139,250,0.2), rgba(56,189,248,0.22))",
              }}
            />
            <div
              className="pointer-events-none absolute -inset-5 rounded-[28px] blur-3xl"
              style={{
                opacity: theme === "dark" ? 0.92 : 0.45,
                background:
                  theme === "dark"
                    ? "radial-gradient(120% 90% at 50% 50%, rgba(99,102,241,0.28) 0%, rgba(14,165,233,0.24) 35%, rgba(16,185,129,0.2) 65%, rgba(0,0,0,0) 100%)"
                    : "radial-gradient(120% 90% at 50% 50%, rgba(99,102,241,0.16) 0%, rgba(14,165,233,0.14) 35%, rgba(16,185,129,0.1) 65%, rgba(0,0,0,0) 100%)",
              }}
            />
          </>
        )}
        <div
          className={`relative z-10 flex flex-col backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden rounded-2xl ${showTerminal ? "h-56" : "h-11"}`}
          style={{
            background:
              theme === "light"
                ? "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.94) 100%)"
                : "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(15,23,42,0.9) 100%)",
            border: "1px solid var(--border-color)",
            boxShadow: showTerminal
              ? "0 20px 45px rgba(15,23,42,0.28)"
              : "0 8px 20px rgba(15,23,42,0.2)",
          }}
        >
          <div
            className={`px-4 py-2 flex justify-between items-center text-xs cursor-pointer select-none transition-colors duration-200 shrink-0 ${theme === "dark" ? "hover:bg-white/5" : "hover:bg-black/5"
              }`}
            style={{
              borderBottom: "1px solid var(--border-color)",
              color: "var(--text-muted)",
            }}
            onClick={() => setShowTerminal(!showTerminal)}
          >
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setBottomPanelTab("terminal");
                  if (!showTerminal) setShowTerminal(true);
                }}
                className={`font-bold font-mono text-[10px] tracking-[0.2em] uppercase px-3 py-1.5 rounded-lg border transition-all duration-200 ${bottomPanelTab === "terminal"
                  ? theme === "dark"
                    ? "bg-indigo-500/30 text-indigo-100 border-indigo-300/70 shadow-[0_0_0_1px_rgba(129,140,248,0.35)_inset]"
                    : "bg-indigo-500/15 text-indigo-600 border-indigo-400/40"
                  : theme === "dark"
                    ? "hover:bg-white/5 text-slate-200"
                    : "hover:bg-black/5"
                  }`}
                style={{ borderColor: "var(--border-color)" }}
              >
                Terminal
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setBottomPanelTab("console");
                  if (!showTerminal) setShowTerminal(true);
                }}
                className={`font-bold font-mono text-[10px] tracking-[0.2em] uppercase px-3 py-1.5 rounded-lg border transition-all duration-200 flex items-center gap-2 ${bottomPanelTab === "console"
                  ? theme === "dark"
                    ? "bg-cyan-500/30 text-cyan-100 border-cyan-300/70 shadow-[0_0_0_1px_rgba(103,232,249,0.35)_inset]"
                    : "bg-cyan-500/15 text-cyan-700 border-cyan-400/40"
                  : theme === "dark"
                    ? "hover:bg-white/5 text-slate-200"
                    : "hover:bg-black/5"
                  }`}
                style={{ borderColor: "var(--border-color)" }}
              >
                Console
                {previewConsoleErrorCount > 0 && (
                  <span className="inline-flex min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] leading-4 justify-center">
                    {previewConsoleErrorCount}
                  </span>
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowTerminal((prev) => !prev);
              }}
              className={`h-7 w-7 rounded-lg border transition-all duration-300 flex items-center justify-center ${showTerminal
                ? theme === "dark"
                  ? "rotate-180 bg-white/10"
                  : "rotate-180 bg-black/5"
                : ""
                }`}
              style={{ borderColor: "var(--border-color)" }}
            >
              {showTerminal ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          </div>
          {/* Always mounted, visibility controlled by parent height */}
          <div
            className={`flex-1 overflow-hidden transition-opacity duration-300 ${showTerminal ? "opacity-100" : "opacity-0"}`}
            key={`bottom-panel-${bottomPanelTab}-${theme}`}
          >
            {bottomPanelTab === "terminal" ? (
              <Terminal />
            ) : (
              <div
                className="h-full flex flex-col"
                style={{
                  background:
                    theme === "dark"
                      ? "linear-gradient(180deg, rgba(2,6,23,0.58) 0%, rgba(2,6,23,0.42) 100%)"
                      : "linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(248,250,252,0.9) 100%)",
                }}
              >
                <div
                  className="px-3 py-2 text-[11px] font-mono flex items-center justify-between"
                  style={{
                    borderBottom: "1px solid var(--border-color)",
                    background:
                      theme === "dark"
                        ? "linear-gradient(90deg, rgba(59,130,246,0.2) 0%, rgba(16,185,129,0.14) 100%)"
                        : "linear-gradient(90deg, rgba(59,130,246,0.06) 0%, rgba(16,185,129,0.03) 100%)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border"
                      style={{
                        borderColor:
                          theme === "dark"
                            ? "rgba(148,163,184,0.35)"
                            : "rgba(148,163,184,0.2)",
                        backgroundColor:
                          theme === "dark"
                            ? "rgba(148,163,184,0.16)"
                            : "rgba(100,116,139,0.1)",
                        color: theme === "dark" ? "#e2e8f0" : "#334155",
                      }}
                    >
                      Logs {previewConsoleEntries.length}
                    </span>
                    {previewConsoleWarnCount > 0 && (
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${theme === "dark" ? "border-amber-300/50 bg-amber-400/15 text-amber-200" : "border-amber-400/30 bg-amber-500/15 text-amber-700"}`}>
                        Warn {previewConsoleWarnCount}
                      </span>
                    )}
                    {previewConsoleErrorCount > 0 && (
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${theme === "dark" ? "border-red-300/50 bg-red-400/15 text-red-200" : "border-red-400/30 bg-red-500/15 text-red-700"}`}>
                        Error {previewConsoleErrorCount}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`px-2.5 py-1 rounded-md border text-[10px] uppercase tracking-wider transition-colors ${theme === "dark"
                      ? "hover:bg-white/10"
                      : "hover:bg-black/5"
                      }`}
                    style={{
                      borderColor: "var(--border-color)",
                      color: "var(--text-muted)",
                      backgroundColor:
                        theme === "dark"
                          ? "rgba(15,23,42,0.5)"
                          : "rgba(255,255,255,0.35)",
                    }}
                    onClick={() => {
                      previewConsoleSeqRef.current = 0;
                      previewConsoleBufferRef.current = [];
                      if (previewConsoleFlushTimerRef.current !== null) {
                        window.clearTimeout(
                          previewConsoleFlushTimerRef.current,
                        );
                        previewConsoleFlushTimerRef.current = null;
                      }
                      setPreviewConsoleEntries([]);
                    }}
                  >
                    Clear
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2.5 font-mono text-[11px] space-y-1.5 custom-scrollbar">
                  {previewConsoleEntries.length === 0 ? (
                    <div
                      className="h-full min-h-[110px] flex items-center justify-center rounded-xl border border-dashed"
                      style={{
                        borderColor:
                          theme === "dark"
                            ? "rgba(148,163,184,0.35)"
                            : "rgba(148,163,184,0.25)",
                        backgroundColor:
                          theme === "dark"
                            ? "rgba(15,23,42,0.55)"
                            : "rgba(255,255,255,0.3)",
                      }}
                    >
                      <div className="text-center">
                        <div
                          className="text-[12px] font-semibold"
                          style={{
                            color: theme === "dark" ? "#e2e8f0" : "#475569",
                          }}
                        >
                          No project logs yet
                        </div>
                        <div
                          className="text-[10px] mt-1"
                          style={{
                            color: theme === "dark" ? "#94a3b8" : "#64748b",
                          }}
                        >
                          Interact with the preview to stream console output
                          here
                        </div>
                      </div>
                    </div>
                  ) : (
                    previewConsoleEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="whitespace-pre-wrap break-words px-2.5 py-2 rounded-lg border shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]"
                        style={{
                          backgroundColor:
                            entry.level === "error"
                              ? "rgba(239, 68, 68, 0.10)"
                              : entry.level === "warn"
                                ? "rgba(245, 158, 11, 0.10)"
                                : entry.level === "info"
                                  ? "rgba(14, 165, 233, 0.10)"
                                  : theme === "dark"
                                    ? "rgba(15, 23, 42, 0.35)"
                                    : "rgba(255, 255, 255, 0.85)",
                          borderColor:
                            entry.level === "error"
                              ? "rgba(239, 68, 68, 0.35)"
                              : entry.level === "warn"
                                ? "rgba(245, 158, 11, 0.35)"
                                : entry.level === "info"
                                  ? "rgba(14, 165, 233, 0.35)"
                                  : theme === "dark"
                                    ? "rgba(100, 116, 139, 0.35)"
                                    : "rgba(148, 163, 184, 0.35)",
                          color:
                            entry.level === "error"
                              ? theme === "dark"
                                ? "#fca5a5"
                                : "#dc2626"
                              : entry.level === "warn"
                                ? theme === "dark"
                                  ? "#fcd34d"
                                  : "#d97706"
                                : entry.level === "info"
                                  ? theme === "dark"
                                    ? "#7dd3fc"
                                    : "#0369a1"
                                  : theme === "dark"
                                    ? "#e2e8f0"
                                    : "var(--text-main)",
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border"
                            style={{
                              borderColor:
                                entry.level === "error"
                                  ? "rgba(239, 68, 68, 0.5)"
                                  : entry.level === "warn"
                                    ? "rgba(245, 158, 11, 0.5)"
                                    : entry.level === "info"
                                      ? "rgba(14, 165, 233, 0.5)"
                                      : "rgba(100, 116, 139, 0.35)",
                              backgroundColor:
                                entry.level === "error"
                                  ? "rgba(239,68,68,0.12)"
                                  : entry.level === "warn"
                                    ? "rgba(245,158,11,0.12)"
                                    : entry.level === "info"
                                      ? "rgba(14,165,233,0.12)"
                                      : "rgba(100,116,139,0.10)",
                            }}
                          >
                            {entry.level}
                          </span>
                          <span className="text-[10px] opacity-70">
                            {new Date(entry.time).toLocaleTimeString()}
                          </span>
                          <span className="text-[10px] opacity-60">
                            {entry.source}
                          </span>
                        </div>
                        <div className="leading-5">{entry.message}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfigEditorModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        configContent={(files[configPathForModal]?.content as string) || null}
        portfolioContent={
          (files[portfolioPathForModal]?.content as string) || null
        }
        onSave={handleSaveConfig}
        theme={theme}
        aiBackend={aiBackend}
        onAiBackendChange={(val) => {
          setAiBackend(val);
          localStorage.setItem(AI_BACKEND_STORAGE_KEY, val);
        }}
        colabUrl={colabUrl}
        onColabUrlChange={(val) => {
          setColabUrl(val);
          localStorage.setItem(COLAB_URL_STORAGE_KEY, val);
        }}
        showAiOptions={SHOW_AI_FEATURES}
        files={files}
      />

      {SHOW_AI_FEATURES ? (
        <VibeAssistant
          isOpen={isVibeAssistantOpen}
          onClose={() => setIsVibeAssistantOpen(false)}
          currentRoot={interactionMode === "preview" ? previewLayersRoot : root}
          selectedElement={previewSelectedElement}
          fileMap={files}
          aiBackend={aiBackend}
          colabUrl={colabUrl}
          onVibeUpdate={async (result) => {
            const { updatedRoot: newRoot, intent, searchText, replaceText } = result;

            // ── Helper: propagate GLOBAL_REPLACE to shared/ files ─────────────
            // When text is dynamically injected by shared/presentation.js (or
            // other shared files), translating ONLY the current slide's HTML
            // causes the JS to re-inject the original text on every load → overlap.
            // This function updates ALL matching shared files so they stay in sync.
            const propagateReplaceToSharedFiles = async (forms: string[], replacement: string) => {
              const allFiles = filesRef.current;
              for (const [filePath, fileEntry] of Object.entries(allFiles)) {
                // Only process shared/ text files (JS, CSS, HTML, JSON)
                if (!filePath.startsWith('shared/')) continue;
                if (typeof fileEntry.content !== 'string' || fileEntry.content.trim().length === 0) continue;
                const ext = filePath.split('.').pop()?.toLowerCase() || '';
                if (!['js', 'css', 'html', 'htm', 'json'].includes(ext)) continue;

                const original = fileEntry.content as string;
                // Find which search form exists in this file
                const matchForm = forms.find(f => original.includes(f));
                if (!matchForm) continue;

                // Replace ALL occurrences
                const updated = original.split(matchForm).join(replacement);
                if (updated === original) continue;

                console.log(`[Vibe] Propagating replace to shared file: ${filePath}`);
                // Update files state so preview runtime picks up the new content
                setFiles(prev => {
                  const cur = prev[filePath];
                  if (!cur) return prev;
                  return { ...prev, [filePath]: { ...cur, content: updated } };
                });
                // Update ref immediately for same-tick reads
                filesRef.current = {
                  ...filesRef.current,
                  [filePath]: { ...fileEntry, content: updated },
                };
                // Queue for disk save
                pendingPreviewWritesRef.current[filePath] = updated;
                setDirtyFiles(prev => prev.includes(filePath) ? prev : [...prev, filePath]);
              }
              // Flush all pending writes to disk (including the shared files just queued)
              schedulePreviewAutoSave();
            };
            // ──────────────────────────────────────────────────────────────────
            console.log(`Vibe Assistant: Applying update with intent: ${intent}`);
            lastVibeUpdateRef.current = Date.now();

            if (interactionMode === "preview") {
              const currentPath = selectedPreviewHtmlRef.current;
              if (!currentPath) return;

              const sourceHtml = typeof filesRef.current[currentPath]?.content === 'string'
                ? filesRef.current[currentPath].content as string
                : "";

              if (!sourceHtml || sourceHtml.trim().length === 0) {
                console.warn(`[Vibe Assistant] Aborting update: sourceHtml for ${currentPath} is empty.`);
                return;
              }

              if (intent === "GLOBAL_REPLACE" && searchText) {
                const safeReplace = replaceText || "";

                const htmlEncode = (t: string) =>
                  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

                // All search forms for text matching (handles entity encoding + Unicode normalization)
                const searchForms = [
                  searchText,
                  htmlEncode(searchText),
                  searchText.normalize('NFC'),
                  searchText.normalize('NFD'),
                  htmlEncode(searchText.normalize('NFC')),
                  htmlEncode(searchText.normalize('NFD')),
                ];

                // ── INTELLIGENT SOURCE DETECTION ─────────────────────────────────
                // Don't just search for raw text — use the element's CLASS context as
                // a fingerprint. If a shared/ file contains BOTH the element's specific
                // class AND the text, it's the authoritative source for this element.
                //
                // Generic utility classes are excluded from fingerprinting because
                // they appear everywhere and don't uniquely identify an element.
                const GENERIC_CLASSES = new Set([
                  'hb-absolute', 'gotoSlide', 'gotoFlow', 'needsclick', 'display', 'logged',
                  'logEmbedded', 'hidden', 'activeColor', 'active', 'activeNav', 'noSwipe',
                  'openDialog', 'ui-dialog', 'ui-widget', 'contentFrame', 'mainContent',
                ]);
                // Get the most specific class from the selected element (via previewSelectedElement closure)
                const elClasses = (previewSelectedElement?.className || newRoot.className || '')
                  .split(/\s+/).filter(Boolean);
                const specificClass = elClasses.find(c => c.length > 2 && !GENERIC_CLASSES.has(c)) || '';

                // ── STEP 1: Search shared/ files using class+text fingerprint ────
                let sourceFileFound: string | null = null;
                let sourceMatchForm: string | null = null;
                let sourceContent: string | null = null;

                for (const [filePath, fileEntry] of Object.entries(filesRef.current)) {
                  if (!filePath.startsWith('shared/')) continue;
                  if (typeof fileEntry.content !== 'string' || fileEntry.content.trim().length === 0) continue;
                  const ext = filePath.split('.').pop()?.toLowerCase() || '';
                  if (!['js', 'css', 'html', 'htm', 'json'].includes(ext)) continue;

                  const fc = fileEntry.content as string;
                  const textMatch = searchForms.find(f => fc.includes(f));
                  if (!textMatch) continue;

                  // TEXT found — now confirm via class context fingerprint
                  const classMatch = !specificClass || fc.includes(specificClass);
                  if (!classMatch) continue;

                  // Both class AND text are in this shared file → it's the source
                  console.log(`[Vibe] Source identified via class+text fingerprint → ${filePath} (class: "${specificClass}")`);
                  sourceFileFound = filePath;
                  sourceMatchForm = textMatch;
                  sourceContent = fc;
                  break; // first matching shared file wins
                }

                if (sourceFileFound && sourceMatchForm && sourceContent !== null) {
                  // Shared file is the source — update ONLY there
                  const updatedShared = (sourceContent as string).split(sourceMatchForm).join(safeReplace);
                  const fEntry = filesRef.current[sourceFileFound];
                  if (fEntry && updatedShared !== sourceContent) {
                    setFiles(prev => {
                      const cur = prev[sourceFileFound!];
                      if (!cur) return prev;
                      return { ...prev, [sourceFileFound!]: { ...cur, content: updatedShared } };
                    });
                    filesRef.current = {
                      ...filesRef.current,
                      [sourceFileFound]: { ...fEntry, content: updatedShared },
                    };
                    pendingPreviewWritesRef.current[sourceFileFound] = updatedShared;
                    setDirtyFiles(prev => prev.includes(sourceFileFound!) ? prev : [...prev, sourceFileFound!]);
                  }
                  // We don't need postMessage here because the source file updated. Ensure iframe reloads.
                  schedulePreviewAutoSave();
                  // If it's the current file, we should refresh it instantly:
                  if (sourceFileFound === selectedPreviewHtmlRef.current) {
                    await persistPreviewHtmlContent(currentPath, sourceContent, { refreshPreviewDoc: true, saveNow: true });
                  } else {
                    setPreviewRefreshNonce(prev => prev + 1); // trigger refresh of everything
                  }
                  return;
                }

                // ── STEP 2: Not from shared — text is page-specific ───────────
                // Update ONLY the current page HTML.
                const normalizedHtml = sourceHtml.normalize('NFC');
                let effectiveSearch = searchForms.find(f => sourceHtml.includes(f))
                  ?? searchForms.find(f => normalizedHtml.includes(f.normalize('NFC')))
                  ?? null;

                let usedHtml = sourceHtml;
                if (!effectiveSearch) {
                  const lowerHtml = sourceHtml.toLowerCase();
                  effectiveSearch = searchForms.find(f => lowerHtml.includes(f.toLowerCase())) ?? null;
                }

                if (effectiveSearch) {
                  // Exact (or case-insensitive) text match found — replace
                  if (!sourceHtml.includes(effectiveSearch) && normalizedHtml.includes(effectiveSearch.normalize('NFC'))) {
                    usedHtml = normalizedHtml;
                  }
                  let serialized: string;
                  if (usedHtml.includes(effectiveSearch)) {
                    serialized = usedHtml.split(effectiveSearch).join(safeReplace);
                  } else {
                    const regex = new RegExp(effectiveSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "gi");
                    serialized = usedHtml.replace(regex, safeReplace);
                  }
                  // Directly refresh the document and SAVE IMMEDIATELY so the local server picks it up
                  await persistPreviewHtmlContent(currentPath, serialized, { refreshPreviewDoc: true, saveNow: true });
                  return;
                }

                // ── FALLBACK: element has nested <span> markup so text can't be found
                // as a raw substring. Find the element by its specific class and replace
                // its ENTIRE inner content (includes nested spans) with the translation.
                if (specificClass) {
                  // Find: <tag class="...specificClass...">ANYTHING</tag>
                  const classEsc = specificClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const elemRegex = new RegExp(
                    `(<(\\w+)(?=[^>]*\\b${classEsc}\\b)[^>]*>)[\\s\\S]*?(<\\/\\2>)`,
                    'i'
                  );
                  const replaced = sourceHtml.replace(elemRegex, `$1${safeReplace}$3`);
                  if (replaced !== sourceHtml) {
                    console.log(`[Vibe] Class-based fallback replace for class "${specificClass}"`);
                    await persistPreviewHtmlContent(currentPath, replaced, { refreshPreviewDoc: true, saveNow: true });
                    return;
                  }
                }

                console.warn(`[Vibe] GLOBAL_REPLACE: Text not found in current page or any shared/ file.`);
                return;
              }

              // For UI_CHANGE, we sync the patches to the live DOM
              if (newRoot.id === "preview-live-root") {
                setPreviewSelectedElement(newRoot);

                if (newRoot.html) {
                  // LIVE UPDATE: Send message to frame for immediate sync
                  postPreviewPatchToFrame({
                    type: 'PREVIEW_APPLY_HTML',
                    html: newRoot.html
                  });

                  const parser = new DOMParser();
                  const parsed = parser.parseFromString(sourceHtml, "text/html");
                  if (parsed.body) {
                    parsed.body.innerHTML = newRoot.html;
                    const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;

                    if (!serialized || serialized.trim().length < 50) {
                      console.warn("[Vibe Assistant] Aborting UI_CHANGE: Resulting serialized HTML is suspiciously small.");
                      return;
                    }

                    await persistPreviewHtmlContent(currentPath, serialized, {
                      refreshPreviewDoc: false // Don't refresh the whole iframe, we did it live!
                    });
                  }
                }
              }
            } else {
              // Edit mode (EDA/root-based)
              pushHistory(newRoot);

              const currentPath = selectedPreviewHtmlRef.current;
              if (currentPath) {
                const sourceHtml = typeof filesRef.current[currentPath]?.content === 'string'
                  ? filesRef.current[currentPath].content as string : "";
                if (sourceHtml && sourceHtml.length > 0) {
                  const safeReplace = replaceText || "";
                  if (intent === "GLOBAL_REPLACE" && searchText) {
                    // Same robust multi-form search (HTML entities + Unicode normalization)
                    const htmlEncode2 = (t: string) =>
                      t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    const searchForms2 = [
                      searchText,
                      htmlEncode2(searchText),
                      searchText.normalize('NFC'),
                      searchText.normalize('NFD'),
                      htmlEncode2(searchText.normalize('NFC')),
                      htmlEncode2(searchText.normalize('NFD')),
                    ];
                    // Split by tags to avoid replacing inside attributes
                    const parts = sourceHtml.split(/((?:[^"'>]|"[^"]*"|'[^']*')+>)|(<!--[\s\S]*?-->)|(<[^>]+>)/g).filter(p => p !== undefined);
                    // Simpler: just try each form and do a full split-join
                    const workingForm = searchForms2.find(f => sourceHtml.includes(f));
                    if (workingForm) {
                      const serialized = sourceHtml.split(workingForm).join(safeReplace);
                      if (serialized) {
                        postPreviewPatchToFrame({ type: 'PREVIEW_GLOBAL_REPLACE', search: searchText, replace: safeReplace });
                        await persistPreviewHtmlContent(currentPath, serialized, { refreshPreviewDoc: false });
                      }
                    } else {
                      // Fallback case-insensitive regex across text nodes only
                      const lowerHtml = sourceHtml.toLowerCase();
                      const partsFallback = sourceHtml.split(/(<(?:[^"'>]|"[^"]*"|'[^']*')+>)/g);
                      const workingFormCI = searchForms2.find(f => lowerHtml.includes(f.toLowerCase()));
                      if (workingFormCI) {
                        const regex2 = new RegExp(workingFormCI.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "gi");
                        for (let i = 0; i < partsFallback.length; i++) {
                          if (i % 2 === 0 && partsFallback[i]) partsFallback[i] = partsFallback[i].replace(regex2, safeReplace);
                        }
                        const serialized = partsFallback.join('');
                        if (serialized) {
                          postPreviewPatchToFrame({ type: 'PREVIEW_GLOBAL_REPLACE', search: searchText, replace: safeReplace });
                          await persistPreviewHtmlContent(currentPath, serialized, { refreshPreviewDoc: false });
                        }
                      }
                    }
                  } else if (newRoot.html) {
                    postPreviewPatchToFrame({ type: 'PREVIEW_APPLY_HTML', html: newRoot.html });
                    const parser = new DOMParser();
                    const parsed = parser.parseFromString(sourceHtml, "text/html");
                    if (parsed.body) {
                      parsed.body.innerHTML = newRoot.html;
                      const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
                      await persistPreviewHtmlContent(currentPath, serialized, { refreshPreviewDoc: false });
                    }
                  }
                }
                if (autoSaveEnabled) {
                  schedulePreviewAutoSave();
                }
              }
            }
          }}
          lastErrorContext={vibeErrorContext}
        />
      ) : null}
    </div >
  );
};

type EditorContentProps = {
  root: VirtualElement;
  selectedId: string | null;
  selectedPathIds: Set<string> | null;
  handleSelect: (id: string) => void;
  handleMoveElement: (draggedId: string, targetId: string) => void;
  handleMoveElementByPosition: (
    id: string,
    styles: Partial<React.CSSProperties>,
  ) => void;
  handleResize: (id: string, width: string, height: string) => void;
  interactionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  INJECTED_STYLES: string;
  vibeUpdateKey: number;
  onVibeError: (msg: string) => void;
};

const resolvePreviewImagePath = (path: string) => path;

// --- Sub-Component for Content (Dry) ---
const EditorContent = React.memo<EditorContentProps>(
  ({
    root,
    selectedId,
    selectedPathIds,
    handleSelect,
    handleMoveElement,
    handleMoveElementByPosition,
    handleResize,
    interactionMode,
    INJECTED_STYLES,
    vibeUpdateKey,
    onVibeError,
  }) => (
    <>
      <style dangerouslySetInnerHTML={{ __html: INJECTED_STYLES }} />
      <style
        dangerouslySetInnerHTML={{
          __html: `* { outline: none; } ${selectedId ? `[data-id="${selectedId}"] { outline: 2px solid #6366f1 !important; z-index: 10; cursor: default; }` : ""}`,
        }}
      />
      <VibeErrorBoundary
        key={String(vibeUpdateKey)} // Reset error boundary when a new Vibe update happens
        onErrorCatched={(error) => {
          onVibeError(error.message);
        }}
      >
        <div className="w-full h-full overflow-auto custom-scrollbar bg-white">
          <EditorCanvas
            element={root}
            selectedId={selectedId}
            selectedPathIds={selectedPathIds}
            onSelect={handleSelect}
            resolveImage={resolvePreviewImagePath}
            onMoveElement={handleMoveElement}
            onMoveByPosition={handleMoveElementByPosition}
            onResize={handleResize}
            interactionMode={interactionMode}
          />
        </div>
      </VibeErrorBoundary>
    </>
  ),
);
EditorContent.displayName = "EditorContent";

export default App;
