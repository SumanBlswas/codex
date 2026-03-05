const fs = require("fs");
let content = fs.readFileSync("App.tsx", "utf8").toString();

// 1. Add import
if (!content.includes("ConfigEditorModal")) {
  content = content.replace(
    'import { INITIAL_ROOT, INJECTED_STYLES } from "./constants";',
    'import ConfigEditorModal from "./components/ConfigEditorModal";\nimport { INITIAL_ROOT, INJECTED_STYLES } from "./constants";',
  );
}

// 2. Add Constants
if (!content.includes("CONFIG_JSON_PATH")) {
  content = content.replace(
    "const FONT_CACHE_VERSION = 1;",
    'const FONT_CACHE_VERSION = 1;\nconst CONFIG_JSON_PATH = "shared/js/config.json";\nconst PORTFOLIO_CONFIG_PATH = "shared/js/portfolioconfig.json";',
  );
}

// 3. Add state
if (!content.includes("isConfigModalOpen")) {
  content = content.replace(
    /const \[hoveredFilePreview, setHoveredFilePreview\] = useState<\s*\{/g,
    "const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);\n  const [hoveredFilePreview, setHoveredFilePreview] = useState<{",
  );
}

// 4. Add handlers
if (!content.includes("handleOpenConfigModal")) {
  const handlerCode = `  const handleOpenConfigModal = useCallback(() => {
    setIsConfigModalOpen(true);
  }, []);

  const handleSaveConfig = useCallback(async (newConfig: string, newPortfolio: string) => {
    try {
      if (filesRef.current[CONFIG_JSON_PATH]) {
        filesRef.current = {
          ...filesRef.current,
          [CONFIG_JSON_PATH]: {
            ...filesRef.current[CONFIG_JSON_PATH],
            content: newConfig
          }
        };
        setFiles(filesRef.current);
        markFileDirty(CONFIG_JSON_PATH);
        if (filePathIndexRef.current[CONFIG_JSON_PATH]) {
           await (Neutralino as any).filesystem.writeFile(
             filePathIndexRef.current[CONFIG_JSON_PATH],
             newConfig
           );
           markFileClean(CONFIG_JSON_PATH);
        }
      }
      
      if (newPortfolio && filesRef.current[PORTFOLIO_CONFIG_PATH]) {
        filesRef.current = {
          ...filesRef.current,
          [PORTFOLIO_CONFIG_PATH]: {
            ...filesRef.current[PORTFOLIO_CONFIG_PATH],
            content: newPortfolio
          }
        };
        setFiles(filesRef.current);
        markFileDirty(PORTFOLIO_CONFIG_PATH);
        if (filePathIndexRef.current[PORTFOLIO_CONFIG_PATH]) {
           await (Neutralino as any).filesystem.writeFile(
             filePathIndexRef.current[PORTFOLIO_CONFIG_PATH],
             newPortfolio
           );
           markFileClean(PORTFOLIO_CONFIG_PATH);
        }
      }
      
      requestPreviewRefreshWithUnsavedGuard();
    } catch (err) {
      console.error("Failed to save config:", err);
      alert("Failed to save configuration files.");
    }
  }, [markFileDirty, markFileClean, requestPreviewRefreshWithUnsavedGuard]);
`;
  content = content.replace(
    "const requestSwitchToPreviewMode = useCallback(() => {",
    handlerCode + "\n  const requestSwitchToPreviewMode = useCallback(() => {",
  );
}

// 5. Add prop to Toolbar
if (!content.includes("onOpenSettings=")) {
  content = content.replace(
    /setDesktopResolution={setDesktopResolution}\s*\/>\s*<\/div>/g,
    "setDesktopResolution={setDesktopResolution}\n            onOpenSettings={files[CONFIG_JSON_PATH] ? handleOpenConfigModal : undefined}\n          />\n        </div>",
  );
}

// 6. Add ConfigEditorModal
if (!content.includes("<ConfigEditorModal")) {
  const modalJSX = `      <ConfigEditorModal 
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        configContent={files[CONFIG_JSON_PATH]?.content as string || null}
        portfolioContent={files[PORTFOLIO_CONFIG_PATH]?.content as string || null}
        onSave={handleSaveConfig}
        theme={theme}
      />
`;
  content = content.replace(
    /<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*\);\s*};\s*type EditorContentProps =/g,
    "</div>\n        </div>\n      </div>\n\n" +
      modalJSX +
      "    </div>\n  );\n};\n\ntype EditorContentProps =",
  );
}

fs.writeFileSync("App.tsx", content);
console.log("App.tsx patched successfully");
