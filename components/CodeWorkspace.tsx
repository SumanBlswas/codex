import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  FileCode2,
  FileJson2,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Save,
  Type,
  WrapText,
} from "lucide-react";
import ColorCodeEditor from "./ColorCodeEditor";

type CodeFileKind = "html" | "css" | "js" | "svg";

interface CodeWorkspaceProps {
  filePath: string | null;
  fileType: string | null;
  content: string;
  isDirty: boolean;
  theme: "light" | "dark";
  availableFiles: string[];
  onSelectFile: (path: string) => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onReload: () => void;
}

interface ScopeGroup {
  key: string;
  label: string;
  filesByKind: Record<CodeFileKind, string[]>;
}

interface GroupedFilesResult {
  scopes: ScopeGroup[];
  pathToScopeKey: Map<string, string>;
  pathToKind: Map<string, CodeFileKind>;
}

interface RawFileEntry {
  original: string;
  normalized: string;
  segments: string[];
  kind: CodeFileKind | null;
}

interface FileEntry {
  original: string;
  normalized: string;
  segments: string[];
  kind: CodeFileKind;
}

const KINDS: readonly CodeFileKind[] = ["html", "css", "js", "svg"];

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

const normalizePath = (value: string): string =>
  String(value || "").replace(/\\/g, "/");

const splitPath = (value: string): string[] =>
  normalizePath(value).split("/").filter(Boolean);

const fileNameFromPath = (value: string): string => {
  const parts = splitPath(value);
  return parts.length ? parts[parts.length - 1] : value;
};

const folderNameFromPath = (value: string): string => {
  const parts = splitPath(value);
  if (parts.length <= 1) return "";
  return parts[parts.length - 2] || "";
};

const detectKind = (path: string): CodeFileKind | null => {
  const lower = normalizePath(path).toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".js")) return "js";
  if (lower.endsWith(".svg")) return "svg";
  return null;
};

const commonPrefixLength = (allSegments: string[][]): number => {
  if (!allSegments.length) return 0;
  const first = allSegments[0];
  let idx = 0;
  while (idx < first.length) {
    const value = first[idx].toLowerCase();
    const match = allSegments.every(
      (segments) =>
        idx < segments.length && segments[idx].toLowerCase() === value,
    );
    if (!match) break;
    idx += 1;
  }
  return idx;
};

const inferScope = (segments: string[]): { key: string; label: string } => {
  const sharedIdx = segments.findIndex(
    (segment) => segment.toLowerCase() === "shared",
  );
  if (sharedIdx >= 0) {
    return { key: "shared", label: "Shared" };
  }
  const head = segments[0] || "root";
  return { key: `slide:${head}`, label: head };
};

const kindLabel = (kind: CodeFileKind): string => {
  if (kind === "html") return "HTML";
  if (kind === "css") return "CSS";
  if (kind === "js") return "JS";
  return "SVG";
};

const kindIcon = (kind: CodeFileKind) => {
  if (kind === "html") return <FileText size={13} />;
  if (kind === "css") return <Type size={13} />;
  if (kind === "js") return <FileJson2 size={13} />;
  return <ImageIcon size={13} />;
};

const buildGroupedFiles = (availableFiles: string[]): GroupedFilesResult => {
  const rawEntries: RawFileEntry[] = availableFiles.map((original) => ({
    original,
    normalized: normalizePath(original),
    segments: splitPath(original),
    kind: detectKind(original),
  }));
  const entries: FileEntry[] = rawEntries.filter(
    (entry): entry is FileEntry => entry.kind !== null,
  );

  const prefixLen = commonPrefixLength(entries.map((entry) => entry.segments));
  const scopeMap = new Map<string, ScopeGroup>();
  const pathToScopeKey = new Map<string, string>();
  const pathToKind = new Map<string, CodeFileKind>();

  for (const entry of entries) {
    const relativeSegments = entry.segments.slice(prefixLen);
    const scope = inferScope(relativeSegments);
    if (!scopeMap.has(scope.key)) {
      scopeMap.set(scope.key, {
        key: scope.key,
        label: scope.label,
        filesByKind: { html: [], css: [], js: [], svg: [] },
      });
    }
    const group = scopeMap.get(scope.key);
    if (!group) continue;
    group.filesByKind[entry.kind].push(entry.original);
    pathToScopeKey.set(entry.normalized, scope.key);
    pathToKind.set(entry.normalized, entry.kind);
  }

  const scopes = Array.from(scopeMap.values())
    .map((scope) => ({
      ...scope,
      filesByKind: {
        html: [...scope.filesByKind.html].sort((a, b) =>
          collator.compare(a, b),
        ),
        css: [...scope.filesByKind.css].sort((a, b) => collator.compare(a, b)),
        js: [...scope.filesByKind.js].sort((a, b) => collator.compare(a, b)),
        svg: [...scope.filesByKind.svg].sort((a, b) => collator.compare(a, b)),
      },
    }))
    .sort((a, b) => {
      if (a.key === "shared" && b.key !== "shared") return -1;
      if (b.key === "shared" && a.key !== "shared") return 1;
      return collator.compare(a.label, b.label);
    });

  return { scopes, pathToScopeKey, pathToKind };
};

const lineCountFromText = (value: string): number =>
  Math.max(1, value.split(/\r\n|\r|\n/).length);

const CodeWorkspace: React.FC<CodeWorkspaceProps> = ({
  filePath,
  fileType,
  content,
  isDirty,
  theme,
  availableFiles,
  onSelectFile,
  onChange,
  onSave,
  onReload,
}) => {
  const grouped = useMemo(() => buildGroupedFiles(availableFiles), [availableFiles]);
  const normalizedActivePath = filePath ? normalizePath(filePath) : "";
  const activeScopeKey = normalizedActivePath
    ? grouped.pathToScopeKey.get(normalizedActivePath) ?? null
    : null;
  const activeKind = normalizedActivePath
    ? grouped.pathToKind.get(normalizedActivePath) ?? null
    : null;

  const [selectedScopeKey, setSelectedScopeKey] = useState<string>("");
  const [selectedKind, setSelectedKind] = useState<CodeFileKind>("html");
  const [showSvgGrid, setShowSvgGrid] = useState<boolean>(true);
  const [wrapLines, setWrapLines] = useState<boolean>(true);
  const [showLineNumbers, setShowLineNumbers] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<number>(13);
  const [tabSize, setTabSize] = useState<number>(2);
  const gutterRef = useRef<HTMLPreElement | null>(null);
  const editorScrollRef = useRef<{ top: number; left: number }>({ top: 0, left: 0 });

  const selectedScope = useMemo(
    () =>
      grouped.scopes.find((scope) => scope.key === selectedScopeKey) ??
      grouped.scopes[0] ??
      null,
    [grouped.scopes, selectedScopeKey],
  );

  const visibleKinds = useMemo(() => {
    if (!selectedScope) return [] as CodeFileKind[];
    return KINDS.filter((kind) => selectedScope.filesByKind[kind].length > 0);
  }, [selectedScope]);

  const filesForKind = useMemo(() => {
    if (!selectedScope) return [] as string[];
    return selectedScope.filesByKind[selectedKind];
  }, [selectedKind, selectedScope]);

  const activePathForKind = useMemo(() => {
    if (!normalizedActivePath) return null;
    const exists = filesForKind.some(
      (path) => normalizePath(path) === normalizedActivePath,
    );
    if (!exists) return null;
    return filesForKind.find((path) => normalizePath(path) === normalizedActivePath) ?? null;
  }, [filesForKind, normalizedActivePath]);

  useEffect(() => {
    if (!grouped.scopes.length) {
      if (selectedScopeKey) setSelectedScopeKey("");
      return;
    }
    const hasCurrent = grouped.scopes.some(
      (scope) => scope.key === selectedScopeKey,
    );
    if (hasCurrent) return;
    if (
      activeScopeKey &&
      grouped.scopes.some((scope) => scope.key === activeScopeKey)
    ) {
      setSelectedScopeKey(activeScopeKey);
      return;
    }
    setSelectedScopeKey(grouped.scopes[0].key);
  }, [activeScopeKey, grouped.scopes, selectedScopeKey]);

  useEffect(() => {
    if (!visibleKinds.length) return;
    const preferred =
      activeScopeKey === selectedScope?.key &&
      activeKind &&
      visibleKinds.includes(activeKind)
        ? activeKind
        : null;
    if (!visibleKinds.includes(selectedKind)) {
      setSelectedKind(preferred ?? visibleKinds[0]);
      return;
    }
    if (preferred && selectedKind !== preferred && activeKind === "svg" && !showSvgGrid) {
      setSelectedKind(preferred);
    }
  }, [
    activeKind,
    activeScopeKey,
    selectedKind,
    selectedScope?.key,
    showSvgGrid,
    visibleKinds,
  ]);

  useEffect(() => {
    if (!selectedScope || !visibleKinds.length) return;
    if (selectedKind === "svg") {
      const isActiveSvg =
        activeScopeKey === selectedScope.key &&
        activeKind === "svg" &&
        !showSvgGrid;
      if (!isActiveSvg) setShowSvgGrid(true);
      return;
    }
    if (!filesForKind.length) return;
    setShowSvgGrid(false);
    if (!activePathForKind) {
      onSelectFile(filesForKind[0]);
    }
  }, [
    activeKind,
    activePathForKind,
    activeScopeKey,
    filesForKind,
    onSelectFile,
    selectedKind,
    selectedScope,
    showSvgGrid,
    visibleKinds.length,
  ]);

  const lineCount = useMemo(() => lineCountFromText(content), [content]);
  const gutterText = useMemo(
    () =>
      Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n"),
    [lineCount],
  );

  const scopeHasSvg = selectedScope ? selectedScope.filesByKind.svg.length > 0 : false;

  const handleScopeChange = (nextScopeKey: string) => {
    setSelectedScopeKey(nextScopeKey);
    const nextScope = grouped.scopes.find((scope) => scope.key === nextScopeKey);
    if (!nextScope) return;
    const nextKinds = KINDS.filter((kind) => nextScope.filesByKind[kind].length > 0);
    const nextKind = nextKinds.includes(selectedKind) ? selectedKind : nextKinds[0] ?? "html";
    setSelectedKind(nextKind);
    if (nextKind === "svg") {
      setShowSvgGrid(true);
      return;
    }
    setShowSvgGrid(false);
    const first = nextScope.filesByKind[nextKind][0];
    if (first) onSelectFile(first);
  };

  const handleKindClick = (kind: CodeFileKind) => {
    setSelectedKind(kind);
    if (kind === "svg") {
      setShowSvgGrid(true);
      return;
    }
    setShowSvgGrid(false);
    const first = selectedScope?.filesByKind[kind][0];
    if (first) onSelectFile(first);
  };

  const handleFileSelect = (path: string) => {
    if (!path) return;
    onSelectFile(path);
  };

  const handleSvgSelect = (path: string) => {
    onSelectFile(path);
    setShowSvgGrid(false);
  };

  const handleEditorScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    if (!gutterRef.current) return;
    gutterRef.current.scrollTop = event.currentTarget.scrollTop;
    editorScrollRef.current = {
      top: event.currentTarget.scrollTop,
      left: event.currentTarget.scrollLeft,
    };
  };

  if (!grouped.scopes.length) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm" style={{ color: "var(--text-muted)" }}>
        No code files available.
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col" style={{ background: "transparent", color: "var(--text-main)" }}>
      <div className="px-3 py-2 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: "var(--border-color)" }}>
        <span className="text-[11px] tracking-[0.18em] uppercase font-semibold" style={{ color: "var(--text-muted)" }}>
          Scope
        </span>
        <select
          value={selectedScope?.key ?? ""}
          onChange={(event) => handleScopeChange(event.target.value)}
          className="h-8 min-w-[280px] rounded-md border px-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          style={{
            borderColor: "var(--border-color)",
            background: theme === "dark" ? "rgba(15,23,42,0.45)" : "rgba(255,255,255,0.85)",
            color: "var(--text-main)",
          }}
        >
          {grouped.scopes.map((scope) => (
            <option key={scope.key} value={scope.key}>
              {scope.label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1">
          {visibleKinds.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => handleKindClick(kind)}
              className="h-8 px-2 rounded-md border text-[11px] font-semibold flex items-center gap-1 transition-colors"
              style={{
                borderColor:
                  selectedKind === kind ? "rgba(139,92,246,0.65)" : "var(--border-color)",
                background:
                  selectedKind === kind
                    ? theme === "dark"
                      ? "rgba(139,92,246,0.24)"
                      : "rgba(139,92,246,0.16)"
                    : theme === "dark"
                      ? "rgba(15,23,42,0.3)"
                      : "rgba(255,255,255,0.75)",
                color: "var(--text-main)",
              }}
            >
              {kindIcon(kind)}
              <span>{kindLabel(kind)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 py-2 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: "var(--border-color)" }}>
        {selectedKind === "svg" && scopeHasSvg && !showSvgGrid ? (
          <button
            type="button"
            onClick={() => setShowSvgGrid(true)}
            className="h-8 px-2 rounded-md border text-xs flex items-center gap-1 transition-colors hover:bg-violet-500/10"
            style={{
              borderColor: "var(--border-color)",
              color: "var(--text-main)",
              background: theme === "dark" ? "rgba(15,23,42,0.3)" : "rgba(255,255,255,0.78)",
            }}
            title="Back to SVG list"
          >
            <ArrowLeft size={13} />
            <span>Back to SVG Grid</span>
          </button>
        ) : selectedKind !== "svg" ? (
          <>
            <span className="text-[11px] tracking-[0.18em] uppercase font-semibold" style={{ color: "var(--text-muted)" }}>
              File
            </span>
            <select
              value={activePathForKind ?? filesForKind[0] ?? ""}
              onChange={(event) => handleFileSelect(event.target.value)}
              className="h-8 min-w-[320px] max-w-full rounded-md border px-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              style={{
                borderColor: "var(--border-color)",
                background: theme === "dark" ? "rgba(15,23,42,0.45)" : "rgba(255,255,255,0.85)",
                color: "var(--text-main)",
              }}
            >
              {filesForKind.map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className="text-[11px] tracking-[0.18em] uppercase font-semibold" style={{ color: "var(--text-muted)" }}>
            Select an SVG from grid to edit
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span>{fileType ? String(fileType).toUpperCase() : "TXT"}</span>
          <span>{lineCount} lines</span>
          {isDirty ? (
            <span className="font-semibold" style={{ color: theme === "dark" ? "#f5d0fe" : "#7e22ce" }}>
              Unsaved
            </span>
          ) : null}
        </div>
      </div>

      {selectedKind === "svg" && showSvgGrid ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filesForKind.map((svgPath) => (
              <button
                key={svgPath}
                type="button"
                onClick={() => handleSvgSelect(svgPath)}
                className="rounded-xl border p-3 text-left transition-all hover:-translate-y-[1px] hover:border-violet-400/60"
                style={{
                  borderColor: "var(--border-color)",
                  background:
                    theme === "dark"
                      ? "linear-gradient(180deg, rgba(30,41,59,0.58), rgba(15,23,42,0.52))"
                      : "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.9))",
                }}
                title={svgPath}
              >
                <div className="h-8 w-8 rounded-lg flex items-center justify-center mb-2" style={{ background: "rgba(139,92,246,0.15)", color: theme === "dark" ? "#ddd6fe" : "#6d28d9" }}>
                  <ImageIcon size={16} />
                </div>
                <div className="text-xs font-semibold truncate">{fileNameFromPath(svgPath)}</div>
                <div className="text-[11px] mt-1 truncate" style={{ color: "var(--text-muted)" }}>
                  {folderNameFromPath(svgPath) || "SVG asset"}
                </div>
              </button>
            ))}
          </div>
          {!filesForKind.length ? (
            <div className="h-full flex items-center justify-center text-sm" style={{ color: "var(--text-muted)" }}>
              No SVG files in this scope.
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: "var(--border-color)" }}>
            <button
              type="button"
              onClick={() => setWrapLines((prev) => !prev)}
              className="h-7 px-2 rounded-md border text-xs flex items-center gap-1 transition-colors hover:bg-violet-500/10"
              style={{ borderColor: "var(--border-color)", color: "var(--text-main)" }}
            >
              <WrapText size={12} />
              <span>{wrapLines ? "Wrap" : "No Wrap"}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowLineNumbers((prev) => !prev)}
              className="h-7 px-2 rounded-md border text-xs flex items-center gap-1 transition-colors hover:bg-violet-500/10"
              style={{ borderColor: "var(--border-color)", color: "var(--text-main)" }}
            >
              <FileCode2 size={12} />
              <span>{showLineNumbers ? "Lines" : "No Lines"}</span>
            </button>
            <label className="h-7 px-2 rounded-md border text-xs flex items-center gap-2" style={{ borderColor: "var(--border-color)", color: "var(--text-main)" }}>
              <span>Font</span>
              <input
                type="range"
                min={11}
                max={18}
                step={1}
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
              />
              <span>{fontSize}px</span>
            </label>
            <label className="h-7 px-2 rounded-md border text-xs flex items-center gap-1" style={{ borderColor: "var(--border-color)", color: "var(--text-main)" }}>
              <span>Tab</span>
              <select
                value={tabSize}
                onChange={(event) => setTabSize(Number(event.target.value))}
                className="h-5 bg-transparent outline-none"
                style={{ color: "var(--text-main)" }}
              >
                <option value={2}>2</option>
                <option value={4}>4</option>
              </select>
            </label>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={onReload}
                className="h-7 w-7 rounded-md border flex items-center justify-center transition-colors hover:bg-violet-500/10"
                style={{ borderColor: "var(--border-color)", color: "var(--text-main)" }}
                title="Reload file"
              >
                <RefreshCw size={12} />
              </button>
              <button
                type="button"
                onClick={onSave}
                className="h-7 w-7 rounded-md border flex items-center justify-center transition-colors hover:bg-violet-500/10"
                style={{ borderColor: "var(--border-color)", color: "var(--text-main)" }}
                title="Save file"
              >
                <Save size={12} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 flex overflow-hidden">
            {showLineNumbers ? (
              <pre
                ref={gutterRef}
                className="m-0 px-3 py-3 text-right text-[11px] leading-6 select-none overflow-hidden border-r"
                style={{
                  borderColor: "var(--border-color)",
                  color: theme === "dark" ? "rgba(203,213,225,0.58)" : "rgba(71,85,105,0.75)",
                  background: theme === "dark" ? "rgba(15,23,42,0.35)" : "rgba(248,250,252,0.9)",
                  width: `${Math.max(44, String(lineCount).length * 10 + 24)}px`,
                }}
                aria-hidden="true"
              >
                {gutterText}
              </pre>
            ) : null}
            <ColorCodeEditor
              value={content}
              onChange={onChange}
              language={selectedKind}
              theme={theme}
              onScroll={handleEditorScroll}
              className="min-h-0 flex-1"
              style={{
                background:
                  theme === "dark"
                    ? "rgba(2,6,23,0.42)"
                    : "rgba(255,255,255,0.95)",
              }}
              fontSize={`${fontSize}px`}
              lineHeight="1.5rem"
              tabSize={tabSize}
              whiteSpace={wrapLines ? "pre-wrap" : "pre"}
              wrap={wrapLines ? "soft" : "off"}
              spellCheck={false}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
                  event.preventDefault();
                  onSave();
                  return;
                }
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") {
                  event.preventDefault();
                  onReload();
                  return;
                }
                if (event.key !== "Tab") return;
                event.preventDefault();
                const target = event.currentTarget;
                const start = target.selectionStart;
                const end = target.selectionEnd;
                const indent = " ".repeat(tabSize);
                const next = content.slice(0, start) + indent + content.slice(end);
                onChange(next);
                requestAnimationFrame(() => {
                  target.selectionStart = start + indent.length;
                  target.selectionEnd = start + indent.length;
                });
              }}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default CodeWorkspace;
