import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import * as Neutralino from '@neutralinojs/lib';
import './index.css';

try {
  Neutralino.init();
  console.log("Neutralino initialized successfully");
} catch (e) {
  console.warn("Neutralino init failed (running in browser?):", e);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);