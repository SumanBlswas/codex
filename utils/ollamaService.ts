import { VirtualElement, FileMap } from "../types";

const LOCAL_OLLAMA_HOST = "http://localhost:11434";
const DEFAULT_MODEL = "qwen2.5:3b";

const getHost = (aiBackend: "local" | "colab", colabUrl?: string) => {
  if (aiBackend === "colab" && colabUrl) {
    return colabUrl.replace(/\/$/, "");
  }
  return LOCAL_OLLAMA_HOST;
};

const getUrl = (host: string, path: string) => {
  const url = `${host}${path}`;
  if (url.includes("ngrok-free.app") || url.includes("ngrok-free.dev")) {
    const separator = url.includes("?") ? "&" : "?";
    // Using a more standard value '1' or 'any' which is sometimes preferred by Ngrok for POST requests
    return `${url}${separator}ngrok-skip-browser-warning=1`;
  }
  return url;
};

export interface VibeResponse {
  updatedRoot: VirtualElement;
  message?: string;
  error?: string;
  intent?: "CHAT" | "GLOBAL_REPLACE" | "UI_CHANGE";
  searchText?: string;
  replaceText?: string;
}

/**
 * Applies a list of changes to the virtual tree.
 * This is much faster than regenerating the entire tree in the LLM.
 */
function applyPatches(root: VirtualElement, patches: any[]): VirtualElement {
  let newRoot = { ...root };

  const updateNode = (node: VirtualElement, patch: any): VirtualElement => {
    const updated = { ...node };
    // Handle both flat structure (preferred) and nested props structure
    const data = patch.props || patch;

    if (data.styles) {
      updated.styles = { ...updated.styles, ...data.styles };
    }
    if (data.content !== undefined) updated.content = data.content;
    if (data.html !== undefined) updated.html = data.html;
    if (data.src !== undefined) updated.src = data.src;
    if (data.href !== undefined) updated.href = data.href;
    if (data.className !== undefined) updated.className = data.className;
    if (data.name !== undefined) updated.name = data.name;
    if (data.attributes) {
      updated.attributes = { ...updated.attributes, ...data.attributes };
    }

    return updated;
  };

  const traverseAndApply = (
    node: VirtualElement,
    id: string,
    patch: any,
  ): VirtualElement => {
    if (node.id === id) {
      return updateNode(node, patch);
    }
    if (node.children && node.children.length > 0) {
      const nextChildren = node.children.map((child) =>
        traverseAndApply(child, id, patch),
      );
      const changed = nextChildren.some(
        (child, i) => child !== node.children[i],
      );
      if (changed) return { ...node, children: nextChildren };
    }
    return node;
  };

  for (const patch of patches) {
    if (!patch.id) continue;
    newRoot = traverseAndApply(newRoot, patch.id, patch);
  }

  return newRoot;
}

/**
 * Aggressively minimizes the tree to fit in the LLM context window.
 */
function minifyTree(node: VirtualElement): any {
  const minified: any = {
    id: node.id,
    type: node.type,
  };
  if (node.content) minified.content = node.content;
  if (node.children && node.children.length > 0) {
    minified.children = node.children.map(minifyTree);
  }
  if (node.src) minified.src = node.src;
  return minified;
}

/**
 * Performs a global text replacement across the entire VirtualElement tree.
 * Designed to be safe by only touching visible text and strictly curated attributes.
 */
function globalTextReplace(
  node: VirtualElement,
  search: string,
  replace: string,
): VirtualElement {
  let newNode = { ...node };
  let changed = false;

  const replaceInText = (text: string) => {
    const regex = new RegExp(
      search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "gi",
    );
    return text.replace(regex, replace);
  };

  const replaceInHtmlSafe = (html: string) => {
    // Robust split by tags: <...> handling potential > inside quotes
    const parts = html.split(/(<(?:[^"'>]|"[^"]*"|'[^']*')+>)/g);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0 && parts[i]) {
        parts[i] = replaceInText(parts[i]);
      }
    }
    return parts.join("");
  };

  // 1. Visible Content (Plain text)
  if (
    node.content &&
    node.content.toLowerCase().includes(search.toLowerCase())
  ) {
    newNode.content = replaceInText(node.content);
    changed = true;
  }

  // 2. HTML content (Safe replacement outside of tags)
  if (node.html && node.html.toLowerCase().includes(search.toLowerCase())) {
    newNode.html = replaceInHtmlSafe(node.html);
    changed = true;
  }

  // 3. Text-related attributes (title, alt, placeholder, etc.)
  if (node.attributes) {
    const nextAttrs = { ...node.attributes };
    let attrChanged = false;
    const safeTextAttrs = [
      "title",
      "placeholder",
      "alt",
      "aria-label",
      "value",
    ];

    for (const key of safeTextAttrs) {
      const val = nextAttrs[key];
      if (
        typeof val === "string" &&
        val.toLowerCase().includes(search.toLowerCase())
      ) {
        nextAttrs[key] = replaceInText(val);
        attrChanged = true;
      }
    }
    if (attrChanged) {
      newNode.attributes = nextAttrs;
      changed = true;
    }
  }

  // We explicitly skip className, styles, src, and href to avoid breaking CSS rules and asset paths.

  if (node.children && node.children.length > 0) {
    const nextChildren = node.children.map((child) =>
      globalTextReplace(child, search, replace),
    );
    const anyChildChanged = nextChildren.some(
      (child, i) => child !== node.children[i],
    );
    if (anyChildChanged) {
      newNode.children = nextChildren;
      changed = true;
    }
  }

  return changed ? newNode : node;
}

// ── LOCAL CONVERSATIONAL GUARD ───────────────────────────────────────────────
// Catches obvious greetings/smalltalk BEFORE any AI call is made.
// This prevents the small local model from misclassifying them as UI changes.

// Keywords that strongly indicate the user wants a UI/code change
const UI_INTENT_KEYWORDS =
  /\b(make|change|update|set|add|remove|delete|replace|edit|modify|move|resize|translate|convert|color|colour|font|size|background|opacity|border|shadow|padding|margin|width|height|style|bold|italic|underline|align|center|left|right|animate|show|hide|display|position|rotate|scale|flip|blur|gradient|image|icon|button|text|heading|title|link|href|src|class|id|layout|column|row|flex|grid|dark|light|white|black|red|green|blue|yellow|pink|purple|orange|grey|gray)\b/i;

const CONVERSATIONAL_PATTERNS = [
  /^\s*(hi|hello|hey|hola|howdy|yo|sup|greetings|namaste|salut|ciao|bonjour)[!.,?\s]*$/i,
  /^\s*how\s+(are\s+you|r\s+u|r\s+you|are\s+u|do\s+you\s+do)[?!.,\s]*$/i,
  /^\s*(good\s+)?(morning|afternoon|evening|night|day)[!.,?\s]*$/i,
  /^\s*what('s|\s+is)\s+(up|new|your\s+name)[?!.,\s]*$/i,
  /^\s*(who|what)\s+are\s+you[?!.,\s]*$/i,
  /^\s*what\s+can\s+you\s+do[?!.,\s]*$/i,
  /^\s*(help|help\s+me)[?!.,\s]*$/i,
  /^\s*(thanks|thank\s+you|ty|thx|great|nice|cool|awesome|perfect|ok|okay)[!.,?\s]*$/i,
  /^\s*(bye|goodbye|see\s+you|cya|later)[!.,?\s]*$/i,
  /^\s*lol[!.,?\s]*$/i,
];

// Playful replies pool for unexpected casual messages
const PLAYFUL_REPLIES = [
  "Meow to you too! 🐱 I'm ready when you are. What would you like to change on the page?",
  "Ha! 😄 I like you. Now, what can I change on the page for you?",
  "That's fun! 😊 I'm your Vibe Assistant — just tell me what to change on the page!",
  "Haha, nice one! 🎉 What would you like me to update on the presentation?",
  "I speak human AND code! 🤖 What should I change on the page?",
];

const CONVERSATIONAL_REPLIES: Record<string, string> = {
  greeting:
    "Hey there! 👋 I'm your Vibe Assistant. Tell me what you'd like to change on this page!",
  howAreYou:
    "I'm doing great, thanks for asking! 😊 Ready to help you build something amazing. What do you want to change on the page?",
  morning:
    "Good morning! ☀️ Let's make something great today. What can I change on the page for you?",
  afternoon: "Good afternoon! 🌤️ Ready to code. What would you like to update?",
  evening: "Good evening! 🌙 What shall we build tonight?",
  night: "Burning the midnight oil? 🦉 I'm with you. What do you need?",
  whoAreYou:
    "I'm Vibe Assistant — an AI that modifies your eCLM presentation in real-time. Just describe a change and I'll apply it!",
  whatCanYouDo:
    "I can change text, styles, colors, translate content, replace words — anything on the page! Just describe what you want.",
  help: 'Sure! Just type something like:\n• "Make the header blue"\n• "Translate this to Hindi"\n• "Change all \'Close\' to \'Cerrar\'"\nI\'ll handle the rest!',
  thanks: "You're welcome! 🎉 Let me know if you need anything else.",
  bye: "Goodbye! 👋 Come back anytime you need a change.",
  generic: "I'm here! 😊 What would you like to change on the page?",
};

/** Returns a sanitized friendly chat message, stripping robotic model errors. */
function sanitizeChatResponse(
  raw: string | undefined,
  fallback: string,
): string {
  if (!raw || raw.trim().length === 0) return fallback;
  const lc = raw.toLowerCase();
  // If the model returned something robotic/error-like, use the friendly fallback
  if (
    lc.includes("invalid input") ||
    lc.includes("please provide a valid") ||
    lc.includes("i cannot") ||
    lc.includes("i'm unable") ||
    lc.includes("i am unable") ||
    lc.includes("not a valid") ||
    lc.includes("cannot process")
  ) {
    return fallback;
  }
  return raw.trim();
}

function getConversationalReply(command: string): string | null {
  const c = command.trim().toLowerCase();

  // Named-pattern checks (fastest path)
  if (
    /^(hi|hello|hey|hola|howdy|yo|sup|greetings|namaste|salut|ciao|bonjour)[!.,?\s]*$/.test(
      c,
    )
  )
    return CONVERSATIONAL_REPLIES.greeting;
  if (/how\s+(are\s+you|r\s+u|r\s+you|are\s+u|do\s+you\s+do)/.test(c))
    return CONVERSATIONAL_REPLIES.howAreYou;
  if (/good\s*morning/.test(c)) return CONVERSATIONAL_REPLIES.morning;
  if (/good\s*afternoon/.test(c)) return CONVERSATIONAL_REPLIES.afternoon;
  if (/good\s*(evening|night)/.test(c)) return CONVERSATIONAL_REPLIES.evening;
  if (
    /who\s+(are\s+you|r\s+u|r\s+you|are\s+u)|what\s+(are\s+you|r\s+u|r\s+you|are\s+u)|^wru[?!.,\s]*$|^who\s+u[?!.,\s]*$/.test(
      c,
    )
  )
    return CONVERSATIONAL_REPLIES.whoAreYou;
  if (/what\s+can\s+you\s+do|what\s+u\s+can\s+do|wyd[?!.,\s]*$/i.test(c))
    return CONVERSATIONAL_REPLIES.whatCanYouDo;
  if (/^help[?!.,\s]*$/.test(c)) return CONVERSATIONAL_REPLIES.help;
  if (
    /^(thanks|thank\s+you|ty|thx|great|nice|cool|awesome|perfect|ok|okay)[!.,?\s]*$/.test(
      c,
    )
  )
    return CONVERSATIONAL_REPLIES.thanks;
  if (/^(bye|goodbye|see\s+you|cya|later)[!.,?\s]*$/.test(c))
    return CONVERSATIONAL_REPLIES.bye;
  if (/^lol[!.,?\s]*$/.test(c))
    return "😄 Haha! Anyway, what would you like to change on the page?";

  // Static pattern list fallback
  for (const pat of CONVERSATIONAL_PATTERNS) {
    if (pat.test(command)) return CONVERSATIONAL_REPLIES.generic;
  }

  // ── GENERAL KNOWLEDGE QUESTIONS → local redirect (NEVER send to LLM) ─────
  // "what is X?", "how does Y work?", "explain Z", etc. — the small local LLM
  // is NOT a general knowledge assistant. Worse, if a targeted element is
  // selected, it will literally set the element's text to the question itself!
  // Catch these locally and reply with a helpful redirect.
  const QUESTION_PREFIXES =
    /^(what\s+(is|are|does|do|was|were)\s|how\s+(does|do|is|are|can|should)\s|why\s+(is|are|do|does|did|can|should)\s|when\s+(is|are|do|does|did|was|were)\s|who\s+(is|are|was|were)\s|where\s+(is|are|was|were)\s|can\s+you\s+explain|tell\s+me\s+(about|what|how|why)|explain\s+|do\s+you\s+know|define\s+|what'?s\s+the\s+)/i;

  if (
    QUESTION_PREFIXES.test(command.trim()) &&
    !UI_INTENT_KEYWORDS.test(command)
  ) {
    return 'I\'m a UI editor, not a general knowledge assistant 😊 For that, try a search engine!\n\nI can help you modify your presentation — try something like:\n• "Make the header blue"\n• "Translate this to Hindi"\n• "Change all \'Close\' to \'Cerrar\'"';
  }

  // ── LANGUAGE NAME EARLY PASS-THROUGH ────────────────────────────────────
  // If the message contains a target language name, it's almost certainly a
  // translation command — even with typos like "trans;ate this to hindi".
  // Return null so it passes through to the LLM pipeline.
  const LANGUAGE_NAMES =
    /\b(hindi|bengali|tamil|telugu|kannada|urdu|french|spanish|german|japanese|chinese|arabic|marathi|gujarati|punjabi|malayalam|english|vietnamese|thai|korean|italian|portuguese|russian|turkish|dutch|swedish|norwegian|danish|greek|hebrew|indonesian|malay|persian|swahili|ukrainian|czech|hungarian)\b/i;
  if (LANGUAGE_NAMES.test(command)) return null;

  // ── HEURISTIC: Short message with NO UI intent keywords ──────────────────
  // If the message is ≤10 words and contains none of the action/style keywords,
  // it's almost certainly casual chat — reply playfully, never touch the page.
  const wordCount = command.trim().split(/\s+/).length;
  if (wordCount <= 10 && !UI_INTENT_KEYWORDS.test(command)) {
    // Pick a playful reply deterministically based on message content (not random)
    const idx = command.trim().length % PLAYFUL_REPLIES.length;
    return PLAYFUL_REPLIES[idx];
  }

  return null;
}
// ─────────────────────────────────────────────────────────────────────────────

export async function submitVibeCommand(
  command: string,
  currentRoot: VirtualElement,
  fileMap: FileMap,
  settings: { aiBackend: "local" | "colab"; colabUrl: string },
  selectedElement?: VirtualElement | null,
  model: string = DEFAULT_MODEL,
): Promise<VibeResponse> {
  // ── INSTANT CONVERSATIONAL SHORT-CIRCUIT ──────────────────────────────────
  // If the message is clearly smalltalk, reply immediately without any AI call
  // so we never risk triggering accidental page changes.
  const conversationalReply = getConversationalReply(command);
  if (conversationalReply) {
    return {
      updatedRoot: currentRoot,
      intent: "CHAT",
      message: conversationalReply,
    };
  }
  // ─────────────────────────────────────────────────────────────────────────
  const host = getHost(settings.aiBackend, settings.colabUrl);

  // Extract the most readable text from the selected element for the AI
  const getElementText = (el: VirtualElement): string => {
    if (el.content && el.content.trim()) return el.content.trim();
    if (el.html && el.html.trim()) {
      return el.html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    return "";
  };
  const targetedElementText = selectedElement
    ? getElementText(selectedElement)
    : "";

  // ── FAST-PATH: Translation shortcut ──────────────────────────────────────
  // When user says "translate" + there is a specific targeted element with real text,
  // we skip the general pipeline entirely and make ONE focused translation call.
  const isTranslateCommand =
    // Standard spellings
    /translat|translate\s+this|convert\s+to/.test(command) ||
    // Fuzzy: "trans" followed by any non-alpha char then "ate" (catches trans;ate, trans-ate, etc.)
    /\btrans[^a-z]?ate\b/i.test(command) ||
    // Language preposition: "to" OR "in" + language name
    /\b(to|in)\s+(bengali|hindi|tamil|telugu|kannada|urdu|french|spanish|german|japanese|chinese|arabic|marathi|gujarati|punjabi|malayalam|vietnamese|thai|korean|italian|portuguese|russian|turkish|dutch|swedish|norwegian|danish|greek|hebrew|indonesian|malay|persian|swahili|ukrainian|czech|hungarian|english)\b/i.test(
      command,
    );

  if (
    isTranslateCommand &&
    targetedElementText &&
    targetedElementText.length > 0
  ) {
    // Extract target language from command
    const langMatch = command.match(
      /\b(bengali|hindi|tamil|telugu|kannada|urdu|french|spanish|german|japanese|chinese|arabic|marathi|gujarati|punjabi|malayalam|english)\b/i,
    );
    const targetLang = langMatch ? langMatch[1] : "the requested language";

    const translatePrompt = `Translate the following text to ${targetLang}.
Source text: "${targetedElementText}"
RULES:
- Return ONLY the translated text, nothing else.
- Do not include quotation marks, explanations, or the original text.
- If the text is a person's name, transliterate it phonetically.
Output:`;

    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(
        () =>
          ctrl.abort(
            new DOMException("Translation timed out after 90s", "AbortError"),
          ),
        90000,
      );
      const trRes = await fetch(getUrl(host, "/api/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          model,
          prompt: translatePrompt,
          stream: false,
          options: { temperature: 0.1, num_ctx: 1024 },
        }),
      });
      clearTimeout(timeoutId); // Always clear to prevent spurious abort
      if (trRes.ok) {
        const trData = await trRes.json();
        const translatedText = (trData.response || "")
          .trim()
          .replace(/^["']+|["']+$/g, "") // strip wrapping quotes
          .replace(/^Translation:\s*/i, "") // strip "Translation:" prefix
          .trim();

        if (translatedText && translatedText.length > 0) {
          // Extra safety: if the translated text is longer than 3x the original,
          // the model probably added an explanation — take just the first line
          const cleanTranslated =
            translatedText.length > targetedElementText.length * 3
              ? translatedText.split("\n")[0].trim()
              : translatedText;

          console.log(
            `Vibe Translation: "${targetedElementText}" → "${cleanTranslated}"`,
          );
          const updatedRoot = globalTextReplace(
            currentRoot,
            targetedElementText,
            cleanTranslated,
          );
          return {
            updatedRoot,
            intent: "GLOBAL_REPLACE",
            searchText: targetedElementText,
            replaceText: cleanTranslated,
            message: `Translated "${targetedElementText}" → "${cleanTranslated}" (${targetLang})`,
          };
        } else {
          throw new Error("Model returned empty translation.");
        }
      } else {
        throw new Error("Translation API call failed.");
      }
    } catch (e: any) {
      // Surface a helpful error message (not the raw abort reason)
      const msg =
        e?.message?.includes("abort") || e?.name === "AbortError"
          ? "Translation timed out — Colab may be slow. Try again in a moment."
          : e?.message || "Unknown error";
      throw new Error(`Translation failed: ${msg}`);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Create a context string for the targeted element if it exists
  const targetContext = selectedElement
    ? `\nTARGETED ELEMENT: The user has selected the element with ID "${selectedElement.id}" (${selectedElement.type}). Any changes they ask for like "make this red" or "change the text" strictly refer to THIS specific element.`
    : "";

  // Step 1: Detect Intent (Is this a UI change or just chat?)
  const intentPrompt = `Analyze this user message: "${command}"${targetContext}
Determine if they want to:
1. "CHAT": The user is saying hello, asking a casual question, or chatting. NOT for any editing request.
   - For CHAT, write a warm, friendly chatResponse (1-2 sentences). NEVER write "Invalid input" or robotic errors.
   - Example chatResponses: "Hey! What would you like to change on the page?" / "Sure, I'm here to help! What should I update?"
2. "GLOBAL_REPLACE": Replace a SPECIFIC known word/phrase everywhere on the page (e.g. "change every 'apple' to 'orange'"). The searchText must be a real word that exists on the page.
3. "UI_CHANGE": Any visual change, style change, OR content/text transformation (e.g. "make the header red", "translate this", "change font size"). Use this when a specific element is targeted.

IMPORTANT: If the user says "translate" or "change the text" and there is a TARGETED ELEMENT, ALWAYS choose "UI_CHANGE" — do NOT use GLOBAL_REPLACE.

RESPONSE MUST BE ONLY JSON:
{
  "intent": "CHAT" | "GLOBAL_REPLACE" | "UI_CHANGE",
  "searchText": "exact word/phrase from page (only for GLOBAL_REPLACE, never use * or wildcards)",
  "replaceText": "replacement text (only for GLOBAL_REPLACE)",
  "chatResponse": "friendly 1-2 sentence reply if intent is CHAT"
}`;

  try {
    const intentResponse = await fetch(getUrl(host, "/api/generate"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        prompt: intentPrompt,
        stream: false,
        format: "json",
        options: { temperature: 0.0, num_predict: 100 },
      }),
    });

    if (!intentResponse.ok) throw new Error("Intent detection failed");
    const intentData = await intentResponse.json();
    const intentResult = JSON.parse(intentData.response);

    // Case: Chat — sanitize the AI response so robotic errors never reach the user
    if (intentResult.intent === "CHAT") {
      return {
        updatedRoot: currentRoot,
        intent: "CHAT",
        message: sanitizeChatResponse(
          intentResult.chatResponse,
          "I'm here! 😊 What would you like to change on the page?",
        ),
      };
    }

    // Case: Global Replace (No tree context needed!)
    if (intentResult.intent === "GLOBAL_REPLACE" && intentResult.searchText) {
      const updatedRoot = globalTextReplace(
        currentRoot,
        intentResult.searchText,
        intentResult.replaceText || "",
      );
      return {
        updatedRoot,
        intent: "GLOBAL_REPLACE",
        searchText: intentResult.searchText,
        replaceText: intentResult.replaceText || "",
        message: `I've replaced all instances of "${intentResult.searchText}" with "${intentResult.replaceText}".`,
      };
    }

    // Case: UI Change (Perform targeted update)
    // For now, we use the compressed patch mode for UI changes
    const assetNames = Object.entries(fileMap)
      .filter(([path]) => path.startsWith("shared/media/"))
      .map(([path]) => path);

    const systemPrompt = `You are a Nocode AI Expert. Your goal is to update a UI JSON tree based on user commands.
You respond with logical patches to existing elements. Use their 'id' to target them.
You can update visual styles (CSS), content (text), or structural properties.

If the user says "translate this" or "translate to [language]" and a TARGETED ELEMENT is provided:
- Read the targeted element's current 'content' or 'html' field.
- Translate that text to the requested language.
- Return a patch with the translated text in the 'content' or 'html' field for that specific element ID.
- The translated text must be the actual translated content, NOT an instruction.

CRITICAL SAFETY RULES:
1. NEVER modify 'className', 'id', or any technical attributes (data-*, target, role, etc.) unless the user explicitly mentions them by name.
2. For text changes, only update the 'content' or 'html' property.
3. If changing 'html', ensure you only touch the text parts and leave the tags/classes 100% untouched.
4. Preserving the existing structure and technical metadata is your TOP priority.

RESPONSE MUST BE ONLY JSON:
{
  "patches": [
    {
      "id": "target-element-id",
      "content": "new text content (optional)",
      "html": "new html content (optional)",
      "styles": { "color": "red" },
      "src": "image source url (optional)"
    }
  ],
  "message": "A friendly summary of what you changed."
}`;

    const userPrompt = `Assets: ${assetNames.join(", ")}
${
  selectedElement
    ? `TARGETED ELEMENT (the user is referring to THIS element):
- ID: "${selectedElement.id}"
- Type: <${selectedElement.type}>
- Class: "${selectedElement.className || ""}"
- CURRENT TEXT CONTENT: "${targetedElementText || "(no text content found)"}"
- HTML: ${selectedElement.html ? `"${selectedElement.html.slice(0, 500)}"` : "none"}
- Styles: ${JSON.stringify(selectedElement.styles)}

IMPORTANT: When the user says "this text", "translate this", "change this", they mean the text above: "${targetedElementText}". Apply changes to ID "${selectedElement.id}".`
    : "No targeted element selected."
}
Tree: ${JSON.stringify(minifyTree(currentRoot))}
Command: ${command}`;

    console.log("Vibe Assistant: Performing Targeted UI Update...");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    const response = await fetch(getUrl(host, "/api/generate"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: model,
        system: systemPrompt,
        prompt: userPrompt,
        stream: false,
        format: "json",
        options: { temperature: 0.1, num_ctx: 8192 },
      }),
    });

    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

    const data = await response.json();
    let result: any;
    try {
      result = JSON.parse(data.response);
    } catch (e) {
      console.warn("Vibe: Could not parse AI response JSON:", data.response);
      throw new Error("AI returned malformed JSON.");
    }

    console.log("Vibe raw response:", JSON.stringify(result).slice(0, 300));

    // Resilience: Model sometimes returns a single patch object instead of {patches:[...]}
    if (!result.patches || !Array.isArray(result.patches)) {
      // Case 1: wrapped in a different key
      const possiblePatches = result.changes || result.updates || result.edits;
      if (Array.isArray(possiblePatches)) {
        result.patches = possiblePatches;
      }
      // Case 2: Model returned a flat object with 'id' — treat it as a single patch
      else if (result.id) {
        result.patches = [result];
      }
      // Case 3: Model returned a TRANSLATION DICTIONARY like {en:"Close", bn:"বন্ধ করুন"}
      // Detect: all keys are 2-3 char language codes, all values are strings
      else if (
        Object.keys(result).length >= 2 &&
        Object.keys(result).every((k) => /^[a-z]{2,3}$/.test(k)) &&
        Object.values(result).every((v) => typeof v === "string")
      ) {
        const NON_SOURCE_LANGS = ["en", "original", "source"];
        const translatedValue = Object.entries(result)
          .filter(([k]) => !NON_SOURCE_LANGS.includes(k))
          .map(([, v]) => v as string)[0];

        if (translatedValue) {
          // If we have the original text from the targeted element, use GLOBAL_REPLACE
          // This is more precise than ID-patching which may fail in preview mode
          const originalText = selectedElement ? targetedElementText : null;
          if (originalText && originalText.trim().length > 0) {
            console.log(
              `Vibe: Translation detected. Replacing "${originalText}" → "${translatedValue}"`,
            );
            // Return as GLOBAL_REPLACE so it finds & replaces exact original text in HTML
            const updatedRoot = globalTextReplace(
              currentRoot,
              originalText,
              translatedValue,
            );
            return {
              updatedRoot,
              intent: "GLOBAL_REPLACE",
              searchText: originalText,
              replaceText: translatedValue,
              message: `Translated "${originalText}" to "${translatedValue}".`,
            };
          } else if (selectedElement?.id) {
            // Fallback: patch by ID if we have no text to replace
            result.patches = [
              { id: selectedElement.id, content: translatedValue },
            ];
          } else {
            throw new Error(
              "No target element or text to apply translation to.",
            );
          }
        } else {
          throw new Error("Could not determine translation. Please rephrase.");
        }
      }
      // Case 4: Model only returned a message (CHAT-like fallback from UI_CHANGE)
      else if (result.message || result.chatResponse || result.response) {
        return {
          updatedRoot: currentRoot,
          intent: "CHAT",
          message:
            result.message ||
            result.chatResponse ||
            result.response ||
            "Done, but no visual changes were made.",
        };
      }
      // Case 5: Truly nothing usable
      else {
        console.warn("Vibe: Unrecognized model response structure:", result);
        throw new Error(
          "AI response didn't contain any patches. Try rephrasing your command.",
        );
      }
    }

    const updatedRoot = applyPatches(currentRoot, result.patches);

    return {
      updatedRoot,
      intent: "UI_CHANGE",
      message: result.message || `Applied ${result.patches.length} updates.`,
    };
  } catch (error: any) {
    console.error("Vibe Error:", error);
    return { updatedRoot: currentRoot, error: error.message };
  }
}

export async function checkOllamaStatus(settings: {
  aiBackend: "local" | "colab";
  colabUrl: string;
}): Promise<boolean> {
  const host = getHost(settings.aiBackend, settings.colabUrl);
  try {
    const response = await fetch(getUrl(host, "/api/tags"));
    return response.ok;
  } catch {
    return false;
  }
}
