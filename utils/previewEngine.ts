import { FileMap } from '../types';

export const generatePreviewScript = (files: FileMap): string => {
  const vfs: Record<string, { content: string, type: string }> = {};

  Object.values(files).forEach(file => {
    // Skip binary content that can't be properly serialized as JSON strings
    // Images and fonts are handled via resolveImageUrl with blob URLs
    if (file.content instanceof Blob) {
      // Skip blobs - they are handled by resolveImageUrl
      return;
    }

    // Only include text-based files (html, css, js)
    if (file.type === 'html' || file.type === 'css' || file.type === 'js') {
      vfs[file.path] = { content: file.content as string, type: file.type };
    }
  });

  // Safely escape JSON for embedding in script tag
  // This prevents </script> and similar from breaking out
  const vfsJson = JSON.stringify(vfs)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  return `
    (function() {
      var VFS = ${vfsJson};
      
      var normalizePath = function(p) {
        // Remove ./ and / from start
        return p.replace(/^\\.\\//g, '').replace(/^\\//g, '');
      };
      
      var getFile = function(url) {
        // Handle fully qualified URLs (e.g. about:srcdoc/foo) by checking if it ends with a known path
        // Exact match first (for simple strings)
        if (VFS[url]) return VFS[url];
        
        var clean = normalizePath(url);
        if (VFS[clean]) return VFS[clean];

        // Search by suffix (e.g. url is 'about:srcdoc/nav/home.html', key is 'nav/home.html')
        var keys = Object.keys(VFS);
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (url.endsWith(k) || url.endsWith('/' + k)) {
            return VFS[k];
          }
        }
        
        // Case insensitive fallback
        var lowerUrl = url.toLowerCase();
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          if (lowerUrl.endsWith(key.toLowerCase()) || lowerUrl.endsWith('/' + key.toLowerCase())) {
            return VFS[key];
          }
        }
        return null;
      };

      // --- Shim Fetch ---
      var originalFetch = window.fetch;
      window.fetch = function(input, init) {
        var url = typeof input === 'string' ? input : input.url;
        console.log('[Preview] Fetch:', url);
        
        var file = getFile(url);
        if (file) {
            console.log('[Preview] Serving VFS:', url);
            return Promise.resolve(new Response(file.content, {
                status: 200, 
                headers: { 'Content-Type': file.type === 'html' ? 'text/html' : (file.type === 'css' ? 'text/css' : 'application/javascript') }
            }));
        }
        return originalFetch(input, init);
      };

      // --- Shim Navigation (Links) ---
      document.addEventListener('click', function(e) {
        var link = e.target.closest ? e.target.closest('a') : null;
        if (link) {
           var href = link.getAttribute('href');
           if (href && href.indexOf('http') !== 0 && href.indexOf('#') !== 0 && href.indexOf('mailto:') !== 0) {
             e.preventDefault();
             console.log('[Preview] Navigating to:', href);
             window.parent.postMessage({ type: 'NAVIGATE', path: href }, '*');
           }
        }
      });

      // --- Track Hash Changes for SPA navigation ---
      window.addEventListener('hashchange', function() {
        console.log('[Preview] Hash changed:', window.location.hash);
        window.parent.postMessage({ type: 'PAGE_LOADED', hash: window.location.hash }, '*');
      });

      // Notify parent of initial page load
      window.parent.postMessage({ type: 'PAGE_LOADED', hash: window.location.hash || '' }, '*');
      
      console.log('[Preview] Environment ready.');
    })();
  `;
};

// Generate edit mode script for element selection within iframe
export const generateEditModeScript = (): string => {
  return `
    (function() {
      var currentMode = 'edit'; // 'edit', 'preview', 'inspect'
      var selectedElement = null;
      var highlightOverlay = null;
      var tagBadge = null;
      var inspectTooltip = null;
      var drawState = { active: false, startX: 0, startY: 0, box: null };

      // Listen for mode toggle & live updates from parent
      window.addEventListener('message', function(e) {
        if (!e.data) return;

        if (e.data.type === 'SET_INTERACTION_MODE') {
          currentMode = e.data.mode;
          
          // Hide overlays when switching to preview
          if (currentMode === 'preview') {
            if (highlightOverlay) highlightOverlay.style.display = 'none';
            if (tagBadge) tagBadge.style.display = 'none';
            if (inspectTooltip) inspectTooltip.style.display = 'none';
          }
        }
        else if (e.data.type === 'SET_EDIT_MODE') {
          // Legacy support
          currentMode = e.data.enabled ? 'edit' : 'preview';
          if (currentMode === 'preview' && highlightOverlay) {
             highlightOverlay.style.display = 'none';
          }
        }
        else if (e.data.type === 'UPDATE_STYLE') {
            const el = document.querySelector('[data-v-id="' + e.data.id + '"]');
            if (el && e.data.styles) {
                Object.assign(el.style, e.data.styles);
            }
        }
        else if (e.data.type === 'UPDATE_CONTENT') {
            const el = document.querySelector('[data-v-id="' + e.data.id + '"]');
            if (el && e.data.content !== undefined) {
                el.innerHTML = e.data.content;
            }
            if (el && e.data.href !== undefined) {
                el.setAttribute('href', e.data.href);
            }
        }
        else if (e.data.type === 'UPDATE_ATTRIBUTES') {
            const el = document.querySelector('[data-v-id="' + e.data.id + '"]');
            if (el && e.data.attributes) {
                // Apply all attributes
                Object.keys(e.data.attributes).forEach(key => {
                    el.setAttribute(key, e.data.attributes[key]);
                });
                // Note: Deletion is tricky with partial updates, but App.tsx sends full set now?
                // Actually App.tsx sends 'attributes' which currently is the FULL set.
                // So strictly we should remove missing ones?
                // But for now, additive/replace is fine for 'data-navigate-to'.
            }
        }
        else if (e.data.type === 'RESTORE_PAGE') {
            // Restore navigation to a specific page after iframe reload
            const page = e.data.page;
            if (page) {
              console.log('[Preview] Restoring page:', page);
              // If it looks like a hash, navigate via hash
              if (page.startsWith('#')) {
                window.location.hash = page;
              } else {
                // It's a file path, notify parent to reload it
                window.parent.postMessage({ type: 'NAVIGATE', path: page }, '*');
              }
            }
        }
      });

      // --- Interaction / Navigation Listener ---
      document.addEventListener('click', function(e) {
          // Allow navigation in Edit and Preview modes
          // Check for data-navigate-to OR data-id (fallback)
          var target = e.target.closest ? e.target.closest('[data-navigate-to], [data-id]') : null;
          
          if (target) {
              var pageId = target.getAttribute('data-navigate-to');
              
              // Fallback: If no explicit navigate instruction, check if this element 
              // acts as a "link" by having a data-id that matches a page?
              // The user requested: "if one component has data-id='page3', show in interaction section".
              // This implies the element ITSELF holds the target ID.
              // Fallback: If no explicit navigate instruction, check if this element 
              // acts as a "link" by having a data-id that matches a page?
              // The user requested: "if one component has data-id='page3', show in interaction section".
              // This implies the element ITSELF holds the target ID.
              if (!pageId) {
                 var potentialId = target.getAttribute('data-id');
                 // User confirmed 'data-id' matches the target ID.
                 // We will try to navigate to ANY data-id if it resolves to an element.
                 if (potentialId) {
                     pageId = potentialId;
                 }
              }

              if (pageId) {
                  console.log('[Preview] Navigating to ID:', pageId);
                  
                  // Try finding by ID or data-v-id or default ID
                  var dest = document.getElementById(pageId) || document.querySelector('[data-v-id="' + pageId + '"]');
                  
                  if (dest) {
                      dest.scrollIntoView({ behavior: 'smooth' });
                  } else {
                      // Maybe it's a class?
                      var byClass = document.querySelector('.' + pageId);
                      if (byClass) {
                          byClass.scrollIntoView({ behavior: 'smooth' });
                      } else {
                          console.warn('Target ID not found:', pageId);
                      }
                  }
              }
          }
      }, true); // Capture phase to preempt other handlers if needed

      // Create highlight overlay
      highlightOverlay = document.createElement('div');
      highlightOverlay.id = '__edit-highlight__';
      highlightOverlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);z-index:999999;display:none;transition:all 0.1s;';
      document.body.appendChild(highlightOverlay);

      // Create tag badge for sup/sub elements
      tagBadge = document.createElement('div');
      tagBadge.id = '__tag-badge__';
      tagBadge.style.cssText = 'position:fixed;pointer-events:none;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;font-family:system-ui,sans-serif;color:white;z-index:9999999;display:none;box-shadow:0 2px 6px rgba(0,0,0,0.3);';
      document.body.appendChild(tagBadge);

      // Create Inspect Tooltip
      inspectTooltip = document.createElement('div');
      inspectTooltip.id = '__inspect-tooltip__';
      inspectTooltip.style.cssText = 'position:fixed;pointer-events:none;background:#1e293b;color:white;padding:8px 12px;border-radius:6px;font-family:monospace;font-size:12px;z-index:9999999;display:none;box-shadow:0 10px 15px -3px rgba(0,0,0,0.2);max-width:300px;';
      document.body.appendChild(inspectTooltip);

      // Function to update tag badge for sup/sub
      function updateTagBadge(el) {
        if (!el || !tagBadge || currentMode !== 'edit') {
           if (tagBadge) tagBadge.style.display = 'none';
           return;
        }
        
        var tagName = el.tagName ? el.tagName.toLowerCase() : '';
        
        if (tagName === 'sup' || tagName === 'sub') {
          var rect = el.getBoundingClientRect();
          
          if (tagName === 'sup') {
            tagBadge.textContent = 'SUP';
            tagBadge.style.backgroundColor = '#8b5cf6';
          } else {
            tagBadge.textContent = 'SUB';
            tagBadge.style.backgroundColor = '#f59e0b';
          }
          
          var badgeTop = rect.top - 24;
          var badgeLeft = rect.left + (rect.width / 2) - 20;
          
          if (badgeTop < 5) badgeTop = rect.bottom + 5;
          if (badgeLeft < 5) badgeLeft = 5;
          
          tagBadge.style.top = badgeTop + 'px';
          tagBadge.style.left = badgeLeft + 'px';
          tagBadge.style.display = 'block';
        } else {
          tagBadge.style.display = 'none';
        }
      }

      // Handle element hovering
      document.addEventListener('mouseover', function(e) {
        if (currentMode === 'preview' || currentMode === 'draw') return;

        var el = e.target;
        if (el === highlightOverlay || el === tagBadge || el === inspectTooltip || el === document.body || el === document.documentElement) return;
        
        var rect = el.getBoundingClientRect();

        // 1. EDIT MODE HIGHLIGHT
        if (currentMode === 'edit') {
            highlightOverlay.style.border = '2px solid #3b82f6'; // Blue
            highlightOverlay.style.background = 'rgba(59,130,246,0.1)';
            highlightOverlay.style.top = rect.top + 'px';
            highlightOverlay.style.left = rect.left + 'px';
            highlightOverlay.style.width = rect.width + 'px';
            highlightOverlay.style.height = rect.height + 'px';
            highlightOverlay.style.display = 'block';
            
            updateTagBadge(el);
            if (inspectTooltip) inspectTooltip.style.display = 'none';
        }
        
        // 2. INSPECT MODE HIGHLIGHT + TOOLTIP
        else if (currentMode === 'inspect') {
            highlightOverlay.style.border = '2px solid #8b5cf6'; // Violet for Inspect
            highlightOverlay.style.background = 'rgba(139, 92, 246, 0.2)';
            highlightOverlay.style.top = rect.top + 'px';
            highlightOverlay.style.left = rect.left + 'px';
            highlightOverlay.style.width = rect.width + 'px';
            highlightOverlay.style.height = rect.height + 'px';
            highlightOverlay.style.display = 'block';

            if (tagBadge) tagBadge.style.display = 'none';

            // Show Tooltip Info
            var tagName = el.tagName.toLowerCase();
            var idStr = el.id ? '#' + el.id : '';
            var classStr = el.className ? '.' + el.className.split(' ').join('.') : '';
            // Only show first 20 chars of classes if too long
            if (classStr.length > 30) classStr = classStr.substring(0, 30) + '...';

            var dims = Math.round(rect.width) + ' × ' + Math.round(rect.height);
            
            inspectTooltip.innerHTML = '<span style="color:#a78bfa;font-weight:bold">' + tagName + '</span>' + 
                                       '<span style="color:#fbbf24">' + idStr + '</span>' +
                                       '<span style="color:#60a5fa">' + classStr + '</span><br/>' +
                                       '<span style="color:#94a3b8">' + dims + '</span>';
            
            // Position tooltip
            var tipTop = rect.top - 40;
            var tipLeft = rect.left;
            
            if (tipTop < 10) tipTop = rect.bottom + 10;
            if (tipLeft + 200 > window.innerWidth) tipLeft = window.innerWidth - 220;
            
            inspectTooltip.style.top = tipTop + 'px';
            inspectTooltip.style.left = tipLeft + 'px';
            inspectTooltip.style.display = 'block';
        }
      });

      document.addEventListener('mouseout', function(e) {
        if (currentMode === 'preview') return;
        
        var el = e.target;
        var related = e.relatedTarget;
        
        // Only hide if we left the element and didn't enter a child or parent in the same structure
        // Actually, basic mouseout is fine because mouseover on new element will update it immediately.
        // We just need to handle leaving the window or body.
        
        // Hide tag badge
        if (tagBadge && currentMode === 'edit') {
             var tagName = el.tagName ? el.tagName.toLowerCase() : '';
             if ((tagName === 'sup' || tagName === 'sub')) {
                 // Logic to keep it if moving to another badge? Simplest is just hide on mouseout
                 // But we have hover logic above that shows it.
             }
        }
      });

      document.addEventListener('click', function(e) {
        if (currentMode === 'preview' || currentMode === 'draw') return;
        
        var el = e.target;
        if (el === highlightOverlay || el === tagBadge || el === inspectTooltip) return;
        
        // If text node
        if (el.nodeType === 3) {
            el = el.parentElement;
        }

        var target = el && el.closest ? el.closest('[data-v-id]') : null;
        if (!target && el.id) target = el;

        if (!target) return;

        e.preventDefault();
        e.stopPropagation();
        
        var elementId = target.getAttribute('data-v-id') || target.id;
        // In inspect mode, we also select it
        window.parent.postMessage({ type: 'ELEMENT_SELECTED', elementId: elementId, tagName: target.tagName }, '*');
      }, true);

      // --- Position Dragging (Alt + Drag to move) ---
      var dragState = { active: false, elementId: null, startX: 0, startY: 0, initialLeft: 0, initialTop: 0, targetEl: null };
      
      document.addEventListener('mousedown', function(e) {
        if (currentMode !== 'edit') return;
        if (!e.altKey) return; // Only drag with Alt key held
        
        var el = e.target;
        if (el === highlightOverlay || el === tagBadge || el === inspectTooltip) return;
        
        var target = el && el.closest ? el.closest('[data-v-id]') : null;
        if (!target || target.getAttribute('data-v-id') === 'root') return;
        
        e.preventDefault();
        e.stopPropagation();
        
        dragState.active = true;
        dragState.elementId = target.getAttribute('data-v-id') || target.id;
        dragState.startX = e.clientX;
        dragState.startY = e.clientY;
        dragState.targetEl = target;
        
        var computed = window.getComputedStyle(target);
        dragState.initialLeft = parseInt(computed.left) || 0;
        dragState.initialTop = parseInt(computed.top) || 0;
        
        target.style.cursor = 'move';
        target.style.opacity = '0.8';
      });
      
      document.addEventListener('mousemove', function(e) {
        if (!dragState.active || currentMode !== 'edit') return;
        
        var deltaX = e.clientX - dragState.startX;
        var deltaY = e.clientY - dragState.startY;
        
        if (dragState.targetEl) {
          dragState.targetEl.style.position = 'absolute';
          dragState.targetEl.style.left = (dragState.initialLeft + deltaX) + 'px';
          dragState.targetEl.style.top = (dragState.initialTop + deltaY) + 'px';
        }
      });
      
      document.addEventListener('mouseup', function(e) {
        if (!dragState.active || currentMode !== 'edit') return;
        
        var deltaX = e.clientX - dragState.startX;
        var deltaY = e.clientY - dragState.startY;
        
        // Reset visual feedback
        if (dragState.targetEl) {
          dragState.targetEl.style.cursor = '';
          dragState.targetEl.style.opacity = '';
        }
        
        // Send position change
        if (dragState.elementId && (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)) {
          window.parent.postMessage({ 
            type: 'POSITION_DRAG', 
            elementId: dragState.elementId, 
            deltaX: deltaX, 
            deltaY: deltaY 
          }, '*');
        }
        
        // Reset drag state
        dragState.active = false;
        dragState.elementId = null;
        dragState.targetEl = null;
      });

      // --- Keyboard Arrow Movement (inside iframe) ---
      document.addEventListener('keydown', function(e) {
        if (currentMode === 'preview') return;
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        
        // Skip if user is in an input or textarea
        var target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        
        e.preventDefault();
        
        var step = 1;
        if (e.shiftKey) step = 10;
        if (e.ctrlKey || e.metaKey) step = 100;
        
        var deltaX = 0, deltaY = 0;
        if (e.key === 'ArrowUp') deltaY = -step;
        if (e.key === 'ArrowDown') deltaY = step;
        if (e.key === 'ArrowLeft') deltaX = -step;
        if (e.key === 'ArrowRight') deltaX = step;
        
        // Send to parent to handle the move
        window.parent.postMessage({ 
          type: 'ARROW_MOVE', 
          deltaX: deltaX, 
          deltaY: deltaY 
        }, '*');
      });

      // --- Drawing Logic ---
      document.addEventListener('mousedown', function(e) {
        if (currentMode !== 'draw') return;
        
        // Start Drawing
        e.preventDefault();
        e.stopPropagation();

        drawState.active = true;
        drawState.startX = e.pageX;
        drawState.startY = e.pageY;
        
        // Calculate Scale Factor (if body is transformed)
        var bodyRect = document.body.getBoundingClientRect();
        drawState.scaleX = 1;
        drawState.scaleY = 1;
        if (document.body.offsetWidth > 0) {
            drawState.scaleX = bodyRect.width / document.body.offsetWidth;
            drawState.scaleY = bodyRect.height / document.body.offsetHeight;
        }
        
        // Find drop target (parent)
        var el = e.target;
        // Ignore overlay UI
        if (el === highlightOverlay || el === tagBadge || el === inspectTooltip) {
             drawState.parentEl = document.body;
             drawState.parentId = 'root' ;
        } else {
             // Find nearest data-v-id
             var target = el.closest ? el.closest('[data-v-id]') : null;
             if (target) {
                 drawState.parentEl = target;
                 drawState.parentId = target.getAttribute('data-v-id');
             } else {
                 drawState.parentEl = document.body;
                 drawState.parentId = 'root';
             }
        }

        // Visual Box
        var box = document.createElement('div');
        box.style.cssText = 'position: absolute; border: 2px dashed #000; background: rgba(0,0,0,0.1); pointer-events: none; z-index: 999999;';
        // Initial pos corrected for scale
        box.style.left = (e.pageX / drawState.scaleX) + 'px';
        box.style.top = (e.pageY / drawState.scaleY) + 'px';
        box.style.width = '0px';
        box.style.height = '0px';
        document.body.appendChild(box);
        drawState.box = box;
      });

      document.addEventListener('mousemove', function(e) {
        if (currentMode !== 'draw' || !drawState.active || !drawState.box) return;

        var currentX = e.pageX;
        var currentY = e.pageY;

        var width = Math.abs(currentX - drawState.startX);
        var height = Math.abs(currentY - drawState.startY);
        var left = Math.min(currentX, drawState.startX);
        var top = Math.min(currentY, drawState.startY);
        
        // Apply Scale correction
        var scaleX = drawState.scaleX || 1;
        var scaleY = drawState.scaleY || 1;

        drawState.box.style.width = (width / scaleX) + 'px';
        drawState.box.style.height = (height / scaleY) + 'px';
        drawState.box.style.left = (left / scaleX) + 'px';
        drawState.box.style.top = (top / scaleY) + 'px';
      });

      // --- Live Element Insertion (avoid reload) ---
      window.addEventListener('message', function(e) {
         if (e.data.type === 'INSERT_ELEMENT') {
             var data = e.data;
             var parent = data.parentId === 'root' ? document.body : document.querySelector('[data-v-id="' + data.parentId + '"]');
             
             if (parent) {
                 var newEl = document.createElement(data.tagName);
                 newEl.setAttribute('data-v-id', data.element.id);
                 newEl.id = data.element.id;
                 
                 // Apply styles
                 Object.assign(newEl.style, data.element.styles);
                 
                 // Apply content
                 if (data.element.content) {
                     newEl.innerHTML = data.element.content;
                 }
                 
                 parent.appendChild(newEl);
             }
         }
      });

      document.addEventListener('mouseup', function(e) {
        if (currentMode !== 'draw' || !drawState.active) return;
        
        drawState.active = false;
        
        if (drawState.box) {
          // Body scale used for the rubber band (visual aid)
          var bodyScaleX = drawState.scaleX || 1;
          var bodyScaleY = drawState.scaleY || 1;

          var rect = {
             width: parseInt(drawState.box.style.width),
             height: parseInt(drawState.box.style.height),
             // Absolute page coordinates (already scaled by mousemove logic to be CSS pixels relative to Body)
             left: parseInt(drawState.box.style.left),
             top: parseInt(drawState.box.style.top)
          };
          
          // However, for the final insertion, we need coordinates relative to the PARENT's internal coordinate space.
          // The inputs 'rect.left/top' are CSS pixels relative to document body (assuming body is the offset parent for the box).
          // We need to convert this to Screen Coordinates first, then mapping to Parent.

          var forceRelative = false;

          // Calculate relative coordinates if parent is not root/body
          if (drawState.parentEl && drawState.parentId !== 'root' && drawState.parentEl !== document.body) {
              var parentRect = drawState.parentEl.getBoundingClientRect();
              var scrollLeft = drawState.parentEl.scrollLeft;
              var scrollTop = drawState.parentEl.scrollTop;
              var clientLeft = drawState.parentEl.clientLeft || 0;
              var clientTop = drawState.parentEl.clientTop || 0;
              
              // Calculate Parent's specific scale factor
              // (This handles cases where .page is scaled but body is not, etc.)
              var parentScaleX = 1;
              var parentScaleY = 1;
              if (drawState.parentEl.offsetWidth > 0) {
                  parentScaleX = parentRect.width / drawState.parentEl.offsetWidth;
                  parentScaleY = parentRect.height / drawState.parentEl.offsetHeight;
              }
              
              // Check if parent is static
              var computed = window.getComputedStyle(drawState.parentEl);
              if (computed.position === 'static') {
                  forceRelative = true;
              }

              // Algorithm:
              // 1. Get Mouse/Box position in Screen Coordinates (Viewport Pixels).
              //    The 'rect.left' we have is relative to Body CSS.
              //    Body CSS -> Screen: (rect.left * bodyScaleX) - window.scrollX?
              //    Wait. e.pageX IS (mostly) Viewport + WindowScroll.
              //    Let's just use the final event coordinates? NO, box might be slightly different.
              //    Let's reconstruct Screen Position from the Box values.
              //    Box Left (body css) = L.
              //    Body Rect Left (screen) = bodyRect.left.
              //    Screen X = (L * bodyScaleX) + bodyRect.left. (Assuming box is child of body).
              
              //    Actually, simpler: e.pageX is reliable source? 
              //    No, drag creates a rect.
              //    Let's calculate Screen Rect of the Box.
              //    Since box is in DOM, just ask it!
              var boxRect = drawState.box.getBoundingClientRect();
              // boxRect is in Viewport Coordinates (Screen pixels).
              
              // 2. Relative Visual Position (Screen pixels relative to Parent Screen pos)
              var relativeVisualX = boxRect.left - parentRect.left;
              var relativeVisualY = boxRect.top - parentRect.top;
              
              // 3. Convert to Parent Internal CSS Pixels
              var relativeCssX = relativeVisualX / parentScaleX;
              var relativeCssY = relativeVisualY / parentScaleY;
              
              // 4. Add Scroll and subtract Border
              rect.left = relativeCssX + scrollLeft - clientLeft;
              rect.top = relativeCssY + scrollTop - clientTop;
              
              // 5. Also scale width/height to match parent's space
              // Box visual width / parent scale
              rect.width = boxRect.width / parentScaleX;
              rect.height = boxRect.height / parentScaleY;
          }

          // Remove visual aid
          if (drawState.box.parentNode) {
            drawState.box.parentNode.removeChild(drawState.box);
          }
          drawState.box = null;

          // Only create if size is significant (> 5px)
          if (rect.width > 5 && rect.height > 5) {
             window.parent.postMessage({ 
                 type: 'DRAW_COMPLETE', 
                 rect: rect,
                 parentId: drawState.parentId,
                 forceRelative: forceRelative
             }, '*');
          }
        }
      });

      console.log('[Preview] Edit mode script ready.');
    })();
  `;
};
