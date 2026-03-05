import React from 'react';

// Support ALL HTML elements, not just a limited set
export type ElementType = string;

export interface VirtualElement {
  id: string;
  type: ElementType;
  name: string;
  content?: string;
  html?: string;
  src?: string;
  href?: string;
  styles: React.CSSProperties;
  children: VirtualElement[];
  animation?: string;
  className?: string; // To track CSS classes
  attributes?: Record<string, string>; // Custom attributes like data-id, aria-*, etc.
}

export interface ProjectFile {
  path: string;
  name: string;
  type: 'html' | 'css' | 'js' | 'image' | 'font' | 'unknown';
  content: string | Blob; // String for text files, Blob for images
  isDirectory?: boolean;
}

export type FileMap = Record<string, ProjectFile>;

export interface EditorState {
  root: VirtualElement;
  selectedId: string | null;
}

export type ActionType =
  | { type: 'SELECT_ELEMENT'; payload: string | null }
  | { type: 'UPDATE_STYLE'; payload: { id: string; styles: Partial<React.CSSProperties> } }
  | { type: 'UPDATE_CONTENT'; payload: { id: string; content?: string; html?: string; src?: string; href?: string } }
  | { type: 'ADD_ELEMENT'; payload: { parentId: string; element: VirtualElement } }
  | { type: 'DELETE_ELEMENT'; payload: string }
  | { type: 'SET_ROOT'; payload: VirtualElement }
  | { type: 'UPDATE_ANIMATION'; payload: { id: string; animation: string } };

export interface HistoryState {
  past: VirtualElement[];
  present: VirtualElement;
  future: VirtualElement[];
}
