/**
 * Bookmark Manager
 * Manages bookmarks with mode separation
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BookmarkEntry, BrowserMode } from '../shared/types';

export class BookmarkManager {
  private bookmarks: BookmarkEntry[] = [];
  private dataPath: string;

  constructor() {
    this.dataPath = path.join(app.getPath('userData'), 'bookmarks.json');
    this.load();
  }

  async load(): Promise<void> {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = fs.readFileSync(this.dataPath, 'utf-8');
        this.bookmarks = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
      this.bookmarks = [];
    }
  }

  async save(): Promise<void> {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dataPath, JSON.stringify(this.bookmarks, null, 2));
    } catch (error) {
      console.error('Failed to save bookmarks:', error);
    }
  }

  addBookmark(
    url: string,
    title: string,
    mode: BrowserMode,
    folder?: string,
    favicon?: string
  ): BookmarkEntry {
    // Check if already bookmarked
    const existing = this.bookmarks.find(
      (b) => b.url === url && b.mode === mode
    );
    if (existing) {
      return existing;
    }

    const bookmark: BookmarkEntry = {
      id: uuidv4(),
      url,
      title: title || url,
      createdAt: Date.now(),
      mode,
      folder,
      favicon,
    };

    this.bookmarks.push(bookmark);
    this.save();

    return bookmark;
  }

  removeBookmark(id: string): boolean {
    const index = this.bookmarks.findIndex((b) => b.id === id);
    if (index > -1) {
      this.bookmarks.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  removeBookmarkByUrl(url: string, mode: BrowserMode): boolean {
    const index = this.bookmarks.findIndex(
      (b) => b.url === url && b.mode === mode
    );
    if (index > -1) {
      this.bookmarks.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  getBookmarks(mode?: BrowserMode, folder?: string): BookmarkEntry[] {
    return this.bookmarks.filter((b) => {
      if (mode && b.mode !== mode) return false;
      if (folder !== undefined && b.folder !== folder) return false;
      return true;
    });
  }

  getBookmark(id: string): BookmarkEntry | undefined {
    return this.bookmarks.find((b) => b.id === id);
  }

  isBookmarked(url: string, mode: BrowserMode): boolean {
    return this.bookmarks.some((b) => b.url === url && b.mode === mode);
  }

  updateBookmark(
    id: string,
    updates: Partial<Pick<BookmarkEntry, 'title' | 'folder'>>
  ): boolean {
    const bookmark = this.bookmarks.find((b) => b.id === id);
    if (bookmark) {
      Object.assign(bookmark, updates);
      this.save();
      return true;
    }
    return false;
  }

  getFolders(mode?: BrowserMode): string[] {
    const folders = new Set<string>();
    this.bookmarks.forEach((b) => {
      if (b.folder && (!mode || b.mode === mode)) {
        folders.add(b.folder);
      }
    });
    return Array.from(folders).sort();
  }

  searchBookmarks(query: string, mode?: BrowserMode): BookmarkEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.bookmarks.filter((b) => {
      if (mode && b.mode !== mode) return false;
      return (
        b.url.toLowerCase().includes(lowerQuery) ||
        b.title.toLowerCase().includes(lowerQuery)
      );
    });
  }
}
