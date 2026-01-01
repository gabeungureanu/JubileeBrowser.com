/**
 * Type definitions for Electron webview element
 */

interface WebviewElement extends HTMLElement {
  src: string;
  partition: string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  getWebContentsId(): number;
}

declare global {
  interface HTMLElementTagNameMap {
    'webview': WebviewElement;
  }
}

export {};
