import JSZip from 'jszip';
import { FileMap, ProjectFile } from '../types';

export const loadProjectFromZip = async (file: File): Promise<FileMap> => {
  const zip = new JSZip();
  const contents = await zip.loadAsync(file);
  const files: FileMap = {};

  for (const [relativePath, zipEntry] of Object.entries(contents.files)) {
    // Explicitly cast to any to avoid type errors since JSZip types might be missing or inferred as unknown
    const entry = zipEntry as any;
    if (entry.dir || relativePath.includes('__MACOSX')) continue;

    const name = relativePath.split('/').pop() || relativePath;
    let type: ProjectFile['type'] = 'unknown';

    if (name.endsWith('.html') || name.endsWith('.htm')) type = 'html';
    else if (name.endsWith('.css')) type = 'css';
    else if (name.endsWith('.js')) type = 'js';
    else if (name.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) type = 'image';
    else if (name.match(/\.(woff|woff2|ttf|otf|eot)$/i)) type = 'font';

    let content: string | Blob;
    if (type === 'image' || type === 'font') {
      const blob = await entry.async('blob');
      content = URL.createObjectURL(blob);
    } else {
      content = await entry.async('string');
    }

    files[relativePath] = {
      path: relativePath,
      name,
      type,
      content
    };
  }

  return files;
};

export const createProjectZip = async (files: FileMap): Promise<Blob> => {
  const zip = new JSZip();

  for (const file of Object.values(files)) {
    if (file.type === 'image' || file.type === 'font') {
      if (typeof file.content === 'string' && file.content.startsWith('blob:')) {
        try {
          const res = await fetch(file.content);
          const blob = await res.blob();
          zip.file(file.path, blob);
        } catch (e) { console.warn("Failed to fetch blob for zip:", file.path); }
      } else if (file.content instanceof Blob) {
        zip.file(file.path, file.content);
      }
    } else {
      // Text files
      if (typeof file.content === 'string') {
        zip.file(file.path, file.content);
      }
    }
  }

  return await zip.generateAsync({ type: 'blob' });
};

export const resolveImageUrl = (path: string, files: FileMap): string => {
  if (!path) return '';
  if (path.startsWith('data:') || path.startsWith('http')) return path;

  // Normalize path: robustly remove leading './', '../', or '/' codes
  let cleanPath = path;
  while (cleanPath.startsWith('./') || cleanPath.startsWith('../') || cleanPath.startsWith('/')) {
    if (cleanPath.startsWith('./')) cleanPath = cleanPath.slice(2);
    else if (cleanPath.startsWith('../')) cleanPath = cleanPath.slice(3);
    else if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);
  }

  console.log(`[resolveImageUrl] Resolving: "${path}" -> Clean: "${cleanPath}"`);

  // Try exact match
  if (files[cleanPath] && (files[cleanPath].type === 'image' || files[cleanPath].type === 'font')) {
    const content = files[cleanPath].content;
    if (typeof content === 'string') return content;
    if (content instanceof Blob) return URL.createObjectURL(content); // Fallback
    return '';
  }

  // Try finding case-insensitive match or fallback
  const foundKey = Object.keys(files).find(key => key.toLowerCase() === cleanPath.toLowerCase());
  if (foundKey && (files[foundKey].type === 'image' || files[foundKey].type === 'font')) {
    const content = files[foundKey].content;
    if (typeof content === 'string') return content;
    if (content instanceof Blob) return URL.createObjectURL(content); // Fallback
    return '';
  }

  console.warn(`[resolveImageUrl] No match found for "${cleanPath}". Available assets:`, Object.keys(files).filter(k => files[k].type === 'image' || files[k].type === 'font'));
  return path; // Return original if not found (external URL)
};

export const processCss = (cssContent: string, files: FileMap): string => {
  return cssContent.replace(/url\(['"]?([^'"()]+)['"]?\)/g, (match, url) => {
    if (url.startsWith('data:') || url.startsWith('http')) return match;
    const resolved = resolveImageUrl(url, files);
    return `url('${resolved}')`;
  });
};