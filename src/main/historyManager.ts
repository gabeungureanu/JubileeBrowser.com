/**
 * History Manager
 * Manages browsing history with mode separation
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { NavigationEntry, BrowserMode } from '../shared/types';

export class HistoryManager {
  private history: NavigationEntry[] = [];
  private dataPath: string;
  private maxEntries = 10000;

  constructor() {
    this.dataPath = path.join(app.getPath('userData'), 'history.json');
    this.load();
  }

  async load(): Promise<void> {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = fs.readFileSync(this.dataPath, 'utf-8');
        this.history = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load history:', error);
      this.history = [];
    }
  }

  async save(): Promise<void> {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dataPath, JSON.stringify(this.history, null, 2));
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  }

  addEntry(url: string, title: string, mode: BrowserMode, favicon?: string): NavigationEntry {
    const entry: NavigationEntry = {
      id: uuidv4(),
      url,
      title: title || url,
      timestamp: Date.now(),
      mode,
      favicon,
    };

    // Add to beginning
    this.history.unshift(entry);

    // Trim if over max
    if (this.history.length > this.maxEntries) {
      this.history = this.history.slice(0, this.maxEntries);
    }

    // Auto-save periodically (debounced in production)
    this.save();

    return entry;
  }

  getHistory(mode?: BrowserMode, limit = 100, offset = 0): NavigationEntry[] {
    let filtered = this.history;

    if (mode) {
      filtered = this.history.filter((entry) => entry.mode === mode);
    }

    return filtered.slice(offset, offset + limit);
  }

  searchHistory(query: string, mode?: BrowserMode, limit = 50): NavigationEntry[] {
    const lowerQuery = query.toLowerCase();

    return this.history
      .filter((entry) => {
        if (mode && entry.mode !== mode) return false;
        return (
          entry.url.toLowerCase().includes(lowerQuery) ||
          entry.title.toLowerCase().includes(lowerQuery)
        );
      })
      .slice(0, limit);
  }

  clearHistory(mode?: BrowserMode): void {
    if (mode) {
      this.history = this.history.filter((entry) => entry.mode !== mode);
    } else {
      this.history = [];
    }
    this.save();
  }

  removeEntry(id: string): boolean {
    const index = this.history.findIndex((entry) => entry.id === id);
    if (index > -1) {
      this.history.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  getRecentForMode(mode: BrowserMode, limit = 10): NavigationEntry[] {
    return this.history.filter((entry) => entry.mode === mode).slice(0, limit);
  }
}
