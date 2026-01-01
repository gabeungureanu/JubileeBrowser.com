/**
 * Internal Page Handler
 * Handles jubilee:// protocol URLs for internal browser pages (settings, etc.)
 */

import { BrowserSettings, DEFAULT_SETTINGS } from '../shared/types';

export class InternalPageHandler {
  private settingsManager: any; // Will be injected

  setSettingsManager(settingsManager: any): void {
    this.settingsManager = settingsManager;
  }

  /**
   * Handle a jubilee:// URL and return HTML content
   */
  handle(url: string): string {
    const path = url.replace('jubilee://', '').toLowerCase();

    // Strip trailing slashes and query strings for matching
    const cleanPath = path.split('?')[0].replace(/\/+$/, '');

    switch (cleanPath) {
      case 'settings':
      case 'settings/general':
        return this.getSettingsPage('general');
      case 'settings/profile':
        return this.getSettingsPage('profile');
      case 'settings/autofill':
        return this.getSettingsPage('autofill');
      case 'settings/privacy':
        return this.getSettingsPage('privacy');
      case 'settings/permissions':
        return this.getSettingsPage('permissions');
      case 'settings/appearance':
        return this.getSettingsPage('appearance');
      case 'settings/search':
        return this.getSettingsPage('search');
      case 'settings/startup':
        return this.getSettingsPage('startup');
      case 'settings/advanced':
        return this.getSettingsPage('advanced');
      case 'settings/safe-browsing':
        return this.getSettingsPage('safe-browsing');
      case 'settings/reset':
        return this.getSettingsPage('reset');
      case 'about':
        return this.getAboutPage();
      default:
        return this.get404Page(url);
    }
  }

  /**
   * Get the settings page HTML with active section
   */
  private getSettingsPage(activeSection: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Settings - Jubilee Browser</title>
  <style>
    :root {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --bg-tertiary: #0f3460;
      --bg-card: rgba(255, 255, 255, 0.05);
      --border-color: rgba(255, 255, 255, 0.1);
      --text-primary: #e8e8e8;
      --text-secondary: #a0a0a0;
      --accent-primary: #E6AC00;
      --accent-secondary: #7dd3fc;
      --danger: #ff6b6b;
      --success: #4ecdc4;
      --transition-fast: 0.15s ease;
      --transition-normal: 0.25s ease;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 50%, var(--bg-tertiary) 100%);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
    }

    /* Sidebar Navigation */
    .sidebar {
      width: 280px;
      background: var(--bg-card);
      border-right: 1px solid var(--border-color);
      padding: 24px 0;
      flex-shrink: 0;
      height: 100vh;
      position: sticky;
      top: 0;
      overflow-y: auto;
    }

    .sidebar-header {
      padding: 0 24px 24px;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 16px;
    }

    .sidebar-header h1 {
      font-size: 1.5rem;
      font-weight: 600;
      background: linear-gradient(135deg, var(--accent-primary), #ff8c00);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .nav-section {
      margin-bottom: 8px;
    }

    .nav-section-title {
      padding: 8px 24px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-secondary);
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 24px;
      color: var(--text-primary);
      text-decoration: none;
      transition: all var(--transition-fast);
      border-left: 3px solid transparent;
    }

    .nav-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .nav-item.active {
      background: rgba(230, 172, 0, 0.1);
      border-left-color: var(--accent-primary);
      color: var(--accent-primary);
    }

    .nav-item svg {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    /* Main Content */
    .main-content {
      flex: 1;
      padding: 32px 48px;
      max-width: 900px;
      overflow-y: auto;
    }

    .section-header {
      margin-bottom: 32px;
    }

    .section-header h2 {
      font-size: 1.75rem;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .section-header p {
      color: var(--text-secondary);
      font-size: 0.95rem;
    }

    /* Settings Cards */
    .settings-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }

    .settings-card h3 {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 16px;
      color: var(--accent-secondary);
    }

    .setting-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 0;
      border-bottom: 1px solid var(--border-color);
    }

    .setting-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .setting-row:first-child {
      padding-top: 0;
    }

    .setting-info {
      flex: 1;
      margin-right: 24px;
    }

    .setting-label {
      font-weight: 500;
      margin-bottom: 4px;
    }

    .setting-description {
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    /* Toggle Switch */
    .toggle-switch {
      position: relative;
      width: 48px;
      height: 26px;
      flex-shrink: 0;
    }

    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 26px;
      transition: var(--transition-fast);
    }

    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 20px;
      width: 20px;
      left: 3px;
      bottom: 3px;
      background: white;
      border-radius: 50%;
      transition: var(--transition-fast);
    }

    .toggle-switch input:checked + .toggle-slider {
      background: var(--accent-primary);
    }

    .toggle-switch input:checked + .toggle-slider:before {
      transform: translateX(22px);
    }

    /* Select Dropdown */
    .select-wrapper {
      position: relative;
    }

    .select-input {
      appearance: none;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px 36px 10px 14px;
      color: var(--text-primary);
      font-size: 0.95rem;
      min-width: 180px;
      cursor: pointer;
      transition: var(--transition-fast);
    }

    .select-input:hover {
      border-color: var(--accent-primary);
    }

    .select-input:focus {
      outline: none;
      border-color: var(--accent-primary);
      box-shadow: 0 0 0 2px rgba(230, 172, 0, 0.2);
    }

    .select-wrapper::after {
      content: "";
      position: absolute;
      right: 14px;
      top: 50%;
      transform: translateY(-50%);
      border: 5px solid transparent;
      border-top-color: var(--text-secondary);
      pointer-events: none;
    }

    /* Text Input */
    .text-input {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px 14px;
      color: var(--text-primary);
      font-size: 0.95rem;
      min-width: 280px;
      transition: var(--transition-fast);
    }

    .text-input:hover {
      border-color: var(--accent-primary);
    }

    .text-input:focus {
      outline: none;
      border-color: var(--accent-primary);
      box-shadow: 0 0 0 2px rgba(230, 172, 0, 0.2);
    }

    .text-input::placeholder {
      color: var(--text-secondary);
    }

    /* Startup Section - Mode Cards */
    .startup-card-internet {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }

    .startup-card-internet h3 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 16px;
    }

    .startup-card-internet .setting-label {
      font-size: 1.05rem;
      font-weight: 700;
      color: #ffffff;
    }

    .startup-card-internet .setting-description {
      font-size: 0.9rem;
      color: var(--text-secondary);
    }

    .startup-card-jubilee {
      background: linear-gradient(135deg, #E6AC00 0%, #D4A000 100%);
      border: 1px solid #B8860B;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }

    .startup-card-jubilee h3 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #000000;
      margin-bottom: 16px;
    }

    .startup-card-jubilee .setting-label {
      font-size: 1.05rem;
      font-weight: 700;
      color: #000000;
    }

    .startup-card-jubilee .setting-description {
      font-size: 0.9rem;
      color: #333333;
    }

    .startup-card-jubilee .setting-row {
      border-bottom-color: rgba(0, 0, 0, 0.15);
    }

    .startup-card-jubilee .select-input {
      background: rgba(0, 0, 0, 0.1);
      border: 1px solid #000000;
      color: #000000;
    }

    .startup-card-jubilee .select-input:hover,
    .startup-card-jubilee .select-input:focus {
      border-color: #000000;
      box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.2);
    }

    .startup-card-jubilee .select-wrapper::after {
      border-top-color: #000000;
    }

    /* Jubilee mode homepage input - true black background with gold/yellow text */
    .jubilee-homepage-input {
      background: #000000 !important;
      border: 2px solid #E6AC00 !important;
      color: #E6AC00 !important;
      font-weight: 600;
    }

    .jubilee-homepage-input::placeholder {
      color: #B8860B !important;
      opacity: 0.8;
    }

    .jubilee-homepage-input:hover {
      border-color: #FFD700 !important;
      box-shadow: 0 0 0 2px rgba(230, 172, 0, 0.3) !important;
    }

    .jubilee-homepage-input:focus {
      border-color: #FFD700 !important;
      box-shadow: 0 0 0 2px rgba(230, 172, 0, 0.4) !important;
      outline: none;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition-fast);
      border: none;
    }

    .btn-primary {
      background: var(--accent-primary);
      color: var(--bg-primary);
    }

    .btn-primary:hover {
      background: #f5b800;
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.15);
      border-color: var(--accent-primary);
    }

    .btn-danger {
      background: rgba(255, 107, 107, 0.2);
      color: var(--danger);
      border: 1px solid rgba(255, 107, 107, 0.3);
    }

    .btn-danger:hover {
      background: rgba(255, 107, 107, 0.3);
    }

    /* Profile Card */
    .profile-card {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 20px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 12px;
      margin-bottom: 16px;
    }

    .profile-avatar {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--accent-primary), #ff8c00);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--bg-primary);
      flex-shrink: 0;
    }

    .profile-info {
      flex: 1;
    }

    .profile-name {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .profile-email {
      color: var(--text-secondary);
      font-size: 0.9rem;
    }

    /* Hidden sections (all sections defined, only active one shown via JS) */
    .settings-section {
      display: none;
    }

    .settings-section.active {
      display: block;
    }

    /* Notification banner */
    .notification {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 16px 24px;
      background: var(--success);
      color: var(--bg-primary);
      border-radius: 8px;
      font-weight: 500;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      transform: translateY(100px);
      opacity: 0;
      transition: all var(--transition-normal);
      z-index: 1000;
    }

    .notification.show {
      transform: translateY(0);
      opacity: 1;
    }

    /* Scrollbar styling */
    ::-webkit-scrollbar {
      width: 8px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    /* Safe Browsing Section Styles */
    .safe-browsing-section {
      color: #ffffff;
    }

    .safe-browsing-section .section-header h2 {
      color: #ffffff;
    }

    .safe-browsing-section .section-header p {
      color: #ffffff;
      opacity: 0.9;
    }

    .safe-browsing-intro {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }

    .safe-browsing-intro .intro-note {
      font-size: 0.9rem;
      color: #ffffff;
      opacity: 0.85;
      margin-top: 0;
      padding: 12px 16px;
      background: rgba(230, 172, 0, 0.1);
      border-left: 3px solid var(--accent-primary);
      border-radius: 4px;
    }

    .safe-browsing-section .settings-card {
      color: #ffffff;
    }

    .safe-browsing-section .settings-card h3 {
      color: #E6AC00;
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 20px;
    }

    .protection-category {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 18px 0;
      border-bottom: 1px solid var(--border-color);
    }

    .protection-category:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .protection-category:first-child {
      padding-top: 0;
    }

    .category-info {
      flex: 1;
      margin-right: 24px;
    }

    .category-title {
      font-weight: 600;
      font-size: 1rem;
      margin-bottom: 6px;
      color: #ffffff;
    }

    .category-description {
      font-size: 0.85rem;
      color: #ffffff;
      opacity: 0.75;
      margin-bottom: 6px;
      line-height: 1.5;
    }

    .category-agreement {
      font-size: 0.8rem;
      color: #ffffff;
      opacity: 0.7;
      font-weight: 400;
    }

    .blocked-badge {
      display: inline-flex;
      align-items: center;
      padding: 6px 14px;
      background: rgba(230, 172, 0, 0.15);
      border: 1px solid rgba(230, 172, 0, 0.3);
      border-radius: 16px;
      color: #E6AC00;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: default;
      user-select: none;
      flex-shrink: 0;
    }

    .learn-more-section {
      margin-top: 24px;
    }

    .learn-more-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      background: none;
      border: none;
      color: var(--accent-primary);
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      padding: 8px 0;
    }

    .learn-more-toggle:hover {
      text-decoration: underline;
    }

    .learn-more-toggle svg {
      width: 16px;
      height: 16px;
      transition: transform 0.2s ease;
    }

    .learn-more-toggle.expanded svg {
      transform: rotate(180deg);
    }

    .learn-more-content {
      display: none;
      padding: 16px;
      margin-top: 8px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      font-size: 0.9rem;
      color: #ffffff;
      opacity: 0.8;
      line-height: 1.6;
    }

    .learn-more-content.visible {
      display: block;
    }
  </style>
</head>
<body>
  <!-- Sidebar Navigation -->
  <nav class="sidebar">
    <div class="sidebar-header">
      <h1>Settings</h1>
    </div>

    <div class="nav-section">
      <div class="nav-section-title">You</div>
      <a href="jubilee://settings/profile" class="nav-item ${activeSection === 'profile' ? 'active' : ''}" data-section="profile">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        Profile
      </a>
      <a href="jubilee://settings/autofill" class="nav-item ${activeSection === 'autofill' ? 'active' : ''}" data-section="autofill">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        Autofill & Passwords
      </a>
    </div>

    <div class="nav-section">
      <div class="nav-section-title">Browser</div>
      <a href="jubilee://settings/general" class="nav-item ${activeSection === 'general' ? 'active' : ''}" data-section="general">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        General
      </a>
      <a href="jubilee://settings/appearance" class="nav-item ${activeSection === 'appearance' ? 'active' : ''}" data-section="appearance">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="13.5" cy="6.5" r=".5"/>
          <circle cx="17.5" cy="10.5" r=".5"/>
          <circle cx="8.5" cy="7.5" r=".5"/>
          <circle cx="6.5" cy="12.5" r=".5"/>
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/>
        </svg>
        Appearance
      </a>
      <a href="jubilee://settings/startup" class="nav-item ${activeSection === 'startup' ? 'active' : ''}" data-section="startup">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        Startup & Home
      </a>
      <a href="jubilee://settings/search" class="nav-item ${activeSection === 'search' ? 'active' : ''}" data-section="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        Search
      </a>
    </div>

    <div class="nav-section">
      <div class="nav-section-title">Privacy & Security</div>
      <a href="jubilee://settings/privacy" class="nav-item ${activeSection === 'privacy' ? 'active' : ''}" data-section="privacy">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Privacy & Security
      </a>
      <a href="jubilee://settings/permissions" class="nav-item ${activeSection === 'permissions' ? 'active' : ''}" data-section="permissions">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
          <circle cx="12" cy="13" r="3"/>
        </svg>
        Site Permissions
      </a>
      <a href="jubilee://settings/safe-browsing" class="nav-item ${activeSection === 'safe-browsing' ? 'active' : ''}" data-section="safe-browsing">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
        Safe Browsing
      </a>
    </div>

    <div class="nav-section">
      <div class="nav-section-title">System</div>
      <a href="jubilee://settings/advanced" class="nav-item ${activeSection === 'advanced' ? 'active' : ''}" data-section="advanced">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
        Advanced
      </a>
      <a href="jubilee://settings/reset" class="nav-item ${activeSection === 'reset' ? 'active' : ''}" data-section="reset">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
        Reset & Recovery
      </a>
    </div>
  </nav>

  <!-- Main Content Area -->
  <main class="main-content">
    ${this.getGeneralSection(activeSection)}
    ${this.getProfileSection(activeSection)}
    ${this.getAutofillSection(activeSection)}
    ${this.getPrivacySection(activeSection)}
    ${this.getPermissionsSection(activeSection)}
    ${this.getAppearanceSection(activeSection)}
    ${this.getSearchSection(activeSection)}
    ${this.getStartupSection(activeSection)}
    ${this.getAdvancedSection(activeSection)}
    ${this.getSafeBrowsingSection(activeSection)}
    ${this.getResetSection(activeSection)}
  </main>

  <!-- Notification element -->
  <div class="notification" id="notification">Settings saved</div>

  <script>
    // Settings page JavaScript
    (function() {
      const notification = document.getElementById('notification');

      // Show notification
      function showNotification(message) {
        notification.textContent = message;
        notification.classList.add('show');
        setTimeout(() => {
          notification.classList.remove('show');
        }, 3000);
      }

      // Helper to convert dot notation key to nested object
      // e.g., "homepage.internet" with value "url" becomes { homepage: { internet: "url" } }
      function setNestedValue(path, value) {
        const keys = path.split('.');
        const result = {};
        let current = result;
        for (let i = 0; i < keys.length - 1; i++) {
          current[keys[i]] = {};
          current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        return result;
      }

      // Handle toggle switches
      document.querySelectorAll('.toggle-switch input').forEach(toggle => {
        toggle.addEventListener('change', async function() {
          const settingKey = this.dataset.setting;
          const value = this.checked;

          try {
            const nestedSettings = setNestedValue(settingKey, value);
            await window.jubilee.settings.set(nestedSettings);
            showNotification('Setting updated');
          } catch (err) {
            console.error('Failed to save setting:', err);
            this.checked = !value; // Revert on error
          }
        });
      });

      // Handle select dropdowns
      document.querySelectorAll('.select-input').forEach(select => {
        select.addEventListener('change', async function() {
          const settingKey = this.dataset.setting;
          const value = this.value;

          try {
            const nestedSettings = setNestedValue(settingKey, value);
            await window.jubilee.settings.set(nestedSettings);
            showNotification('Setting updated');
          } catch (err) {
            console.error('Failed to save setting:', err);
          }
        });
      });

      // Handle text inputs (on blur and enter key)
      document.querySelectorAll('.text-input').forEach(input => {
        const saveInput = async function() {
          const settingKey = this.dataset.setting;
          const value = this.value;

          try {
            const nestedSettings = setNestedValue(settingKey, value);
            await window.jubilee.settings.set(nestedSettings);
            showNotification('Setting saved');
          } catch (err) {
            console.error('Failed to save setting:', err);
          }
        };

        input.addEventListener('blur', saveInput);
        input.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.blur(); // Trigger blur which will save
          }
        });
      });

      // Handle clear browsing data button
      const clearDataBtn = document.getElementById('clearDataBtn');
      if (clearDataBtn) {
        clearDataBtn.addEventListener('click', async function() {
          if (confirm('Are you sure you want to clear browsing data? This cannot be undone.')) {
            try {
              await window.jubilee.privacy.clearBrowsingData();
              showNotification('Browsing data cleared');
            } catch (err) {
              console.error('Failed to clear data:', err);
            }
          }
        });
      }

      // Handle reset settings button
      const resetBtn = document.getElementById('resetSettingsBtn');
      if (resetBtn) {
        resetBtn.addEventListener('click', async function() {
          if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
            try {
              await window.jubilee.settings.reset();
              showNotification('Settings reset to defaults');
              setTimeout(() => location.reload(), 1000);
            } catch (err) {
              console.error('Failed to reset settings:', err);
            }
          }
        });
      }

      // Load initial settings
      async function loadSettings() {
        try {
          const settings = await window.jubilee.settings.get();

          // Apply settings to form elements
          document.querySelectorAll('[data-setting]').forEach(el => {
            const key = el.dataset.setting;
            const value = getNestedValue(settings, key);

            if (value !== undefined) {
              if (el.type === 'checkbox') {
                el.checked = value;
              } else {
                el.value = value;
              }
            }
          });
        } catch (err) {
          console.error('Failed to load settings:', err);
        }
      }

      // Helper to get nested object value by dot notation
      function getNestedValue(obj, path) {
        return path.split('.').reduce((o, k) => o && o[k], obj);
      }

      // Handle Learn More toggle for Safe Browsing section
      const learnMoreToggle = document.getElementById('learnMoreToggle');
      const learnMoreContent = document.getElementById('learnMoreContent');
      if (learnMoreToggle && learnMoreContent) {
        learnMoreToggle.addEventListener('click', function() {
          const isExpanded = learnMoreContent.classList.toggle('visible');
          learnMoreToggle.classList.toggle('expanded', isExpanded);
        });
      }

      // Initialize
      loadSettings();
    })();
  </script>
</body>
</html>`;
  }

  private getGeneralSection(activeSection: string): string {
    return `
    <section class="settings-section ${activeSection === 'general' ? 'active' : ''}" id="section-general">
      <div class="section-header">
        <h2>General Settings</h2>
        <p>Configure general browser behavior and preferences.</p>
      </div>

      <div class="settings-card">
        <h3>Default Mode</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Startup Mode</div>
            <div class="setting-description">Choose which mode the browser starts in when launched.</div>
          </div>
          <div class="select-wrapper">
            <select class="select-input" data-setting="defaultMode">
              <option value="internet">Internet Mode</option>
              <option value="jubileebibles">Jubilee Bible Mode</option>
            </select>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <h3>Downloads</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Download Location</div>
            <div class="setting-description">Choose where downloads are saved.</div>
          </div>
          <button class="btn btn-secondary" id="chooseDownloadBtn">Choose Folder</button>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Ask where to save each file before downloading</div>
            <div class="setting-description">When enabled, you'll be prompted to choose a location for each download.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="advanced.askDownloadLocation">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </section>`;
  }

  private getProfileSection(activeSection: string): string {
    return `
    <section class="settings-section ${activeSection === 'profile' ? 'active' : ''}" id="section-profile">
      <div class="section-header">
        <h2>Profile</h2>
        <p>Manage your browser profiles for isolated browsing experiences.</p>
      </div>

      <div class="settings-card">
        <h3>Current Profile</h3>
        <div class="profile-card">
          <div class="profile-avatar">D</div>
          <div class="profile-info">
            <div class="profile-name">Default Profile</div>
            <div class="profile-email">Primary browser profile</div>
          </div>
          <button class="btn btn-secondary">Edit</button>
        </div>
      </div>

      <div class="settings-card">
        <h3>Manage Profiles</h3>
        <p style="color: var(--text-secondary); margin-bottom: 16px;">
          Each profile has its own bookmarks, history, passwords, and settings.
        </p>
        <button class="btn btn-primary" id="createProfileBtn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Create New Profile
        </button>
      </div>
    </section>`;
  }

  private getAutofillSection(activeSection: string): string {
    return `
    <section class="settings-section ${activeSection === 'autofill' ? 'active' : ''}" id="section-autofill">
      <div class="section-header">
        <h2>Autofill & Passwords</h2>
        <p>Manage saved passwords, addresses, and payment methods.</p>
      </div>

      <div class="settings-card">
        <h3>Passwords</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Offer to save passwords</div>
            <div class="setting-description">Jubilee can save passwords when you sign in to websites.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="autofill.passwords.enabled" checked>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Auto sign-in</div>
            <div class="setting-description">Automatically sign in to websites using stored credentials.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="autofill.passwords.autoSignIn" checked>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Saved Passwords</div>
            <div class="setting-description">View and manage your saved passwords.</div>
          </div>
          <button class="btn btn-secondary" id="viewPasswordsBtn">View Passwords</button>
        </div>
      </div>

      <div class="settings-card">
        <h3>Addresses</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Save and fill addresses</div>
            <div class="setting-description">Save addresses for faster form filling.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="autofill.addresses.enabled" checked>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-card">
        <h3>Payment Methods</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Save and fill payment methods</div>
            <div class="setting-description">Save payment methods for faster checkout.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="autofill.paymentMethods.enabled">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </section>`;
  }

  private getPrivacySection(activeSection: string): string {
    return `
    <section class="settings-section ${activeSection === 'privacy' ? 'active' : ''}" id="section-privacy">
      <div class="section-header">
        <h2>Privacy & Security</h2>
        <p>Control your privacy settings and browsing security.</p>
      </div>

      <div class="settings-card">
        <h3>Browsing Data</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Clear browsing data on exit</div>
            <div class="setting-description">Automatically clear history, cookies, and cache when you close the browser.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="privacy.clearOnExit">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Clear browsing data</div>
            <div class="setting-description">Clear history, cookies, cached images and files.</div>
          </div>
          <button class="btn btn-secondary" id="clearDataBtn">Clear Data</button>
        </div>
      </div>

      <div class="settings-card">
        <h3>Tracking Protection</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Send "Do Not Track" request</div>
            <div class="setting-description">Ask websites not to track your browsing activity.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="privacy.doNotTrack" checked>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Tracking protection level</div>
            <div class="setting-description">Choose how aggressively to block trackers.</div>
          </div>
          <div class="select-wrapper">
            <select class="select-input" data-setting="privacy.trackingProtection">
              <option value="standard">Standard</option>
              <option value="strict">Strict</option>
              <option value="off">Off</option>
            </select>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <h3>Cookies</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Cookie behavior</div>
            <div class="setting-description">Control how cookies are handled.</div>
          </div>
          <div class="select-wrapper">
            <select class="select-input" data-setting="privacy.cookieBehavior">
              <option value="allow">Allow all cookies</option>
              <option value="block-third-party">Block third-party cookies</option>
              <option value="block-all">Block all cookies</option>
            </select>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <h3>Security</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Safe Browsing</div>
            <div class="setting-description">Protect against dangerous sites and downloads.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="privacy.safeBrowsing" checked>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </section>`;
  }

  private getPermissionsSection(activeSection: string): string {
    return `
    <section class="settings-section ${activeSection === 'permissions' ? 'active' : ''}" id="section-permissions">
      <div class="section-header">
        <h2>Site Permissions</h2>
        <p>Control what websites can access on your device.</p>
      </div>

      <div class="settings-card">
        <h3>Default Permissions</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Camera</div>
            <div class="setting-description">Allow websites to use your camera.</div>
          </div>
          <div class="select-wrapper">
            <select class="select-input" data-setting="permissions.camera">
              <option value="ask">Ask (recommended)</option>
              <option value="allow">Allow</option>
              <option value="block">Block</option>
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Microphone</div>
            <div class="setting-description">Allow websites to use your microphone.</div>
          </div>
          <div class="select-wrapper">
            <select class="select-input" data-setting="permissions.microphone">
              <option value="ask">Ask (recommended)</option>
              <option value="allow">Allow</option>
              <option value="block">Block</option>
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Location</div>
            <div class="setting-description">Allow websites to access your location.</div>
          </div>
          <div class="select-wrapper">
            <select class="select-input" data-setting="permissions.location">
              <option value="ask">Ask (recommended)</option>
              <option value="allow">Allow</option>
              <option value="block">Block</option>
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Notifications</div>
            <div class="setting-description">Allow websites to send you notifications.</div>
          </div>
          <div class="select-wrapper">
            <select class="select-input" data-setting="permissions.notifications">
              <option value="ask">Ask (recommended)</option>
              <option value="allow">Allow</option>
              <option value="block">Block</option>
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Pop-ups</div>
            <div class="setting-description">Allow websites to open pop-up windows.</div>
          </div>
          <div class="select-wrapper">
            <select class="select-input" data-setting="permissions.popups">
              <option value="block">Block (recommended)</option>
              <option value="allow">Allow</option>
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">JavaScript</div>
            <div class="setting-description">Allow websites to run JavaScript.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="permissions.javascript" checked>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-card">
        <h3>Site-Specific Permissions</h3>
        <p style="color: var(--text-secondary); margin-bottom: 16px;">
          Manage permissions for individual websites.
        </p>
        <button class="btn btn-secondary" id="manageSitePermissionsBtn">Manage Site Permissions</button>
      </div>
    </section>`;
  }

  private getAppearanceSection(activeSection: string): string {
    return `
    <section class="settings-section ${activeSection === 'appearance' ? 'active' : ''}" id="section-appearance">
      <div class="section-header">
        <h2>Appearance</h2>
        <p>Customize how Jubilee Browser looks.</p>
      </div>

      <div class="settings-card">
        <h3>Theme</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Color theme</div>
            <div class="setting-description">Choose between light, dark, or system theme.</div>
          </div>
          <div class="select-wrapper">
            <select class="select-input" data-setting="appearance.theme">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <h3>Font Size</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Page font size</div>
            <div class="setting-description">Adjust the default font size for web pages.</div>
          </div>
          <div class="select-wrapper">
            <select class="select-input" data-setting="appearance.fontSize">
              <option value="small">Small</option>
              <option value="medium">Medium (recommended)</option>
              <option value="large">Large</option>
            </select>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <h3>Zoom</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Default zoom level</div>
            <div class="setting-description">Set the default zoom level for web pages.</div>
          </div>
          <div class="select-wrapper">
            <select class="select-input" data-setting="appearance.zoomLevel">
              <option value="0.75">75%</option>
              <option value="0.9">90%</option>
              <option value="1">100%</option>
              <option value="1.1">110%</option>
              <option value="1.25">125%</option>
              <option value="1.5">150%</option>
            </select>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <h3>Toolbar</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Show bookmarks bar</div>
            <div class="setting-description">Display the bookmarks bar below the address bar.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="appearance.showBookmarksBar">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </section>`;
  }

  private getSearchSection(activeSection: string): string {
    return `
    <section class="settings-section ${activeSection === 'search' ? 'active' : ''}" id="section-search">
      <div class="section-header">
        <h2>Search</h2>
        <p>Configure search engine and address bar behavior.</p>
      </div>

      <div class="settings-card">
        <h3>Search Engine</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Default search engine</div>
            <div class="setting-description">Choose the search engine used when typing in the address bar.</div>
          </div>
          <div class="select-wrapper">
            <select class="select-input" data-setting="search.defaultEngine">
              <option value="google">Google</option>
              <option value="bing">Bing</option>
              <option value="duckduckgo">DuckDuckGo</option>
              <option value="yahoo">Yahoo</option>
            </select>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <h3>Address Bar</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Show search suggestions</div>
            <div class="setting-description">Show suggestions as you type in the address bar.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="search.suggestionsEnabled" checked>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </section>`;
  }

  private getStartupSection(activeSection: string): string {
    return `
    <section class="settings-section ${activeSection === 'startup' ? 'active' : ''}" id="section-startup">
      <div class="section-header">
        <h2>Startup & Home</h2>
        <p>Configure what happens when Jubilee Browser starts.</p>
      </div>

      <div class="startup-card-internet">
        <h3>Internet Mode</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">On startup</div>
            <div class="setting-description">Choose what opens when you start in Internet mode.</div>
          </div>
          <div class="select-wrapper">
            <select class="select-input" data-setting="startup.internet.behavior">
              <option value="homepage" selected>Open homepage</option>
              <option value="restore">Continue where you left off</option>
              <option value="specific">Open specific pages</option>
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Homepage URL</div>
            <div class="setting-description">The page that opens when you click the home button.</div>
          </div>
          <input type="text" class="text-input" data-setting="homepage.internet" value="https://www.jubileeverse.com" placeholder="https://www.jubileeverse.com">
        </div>
      </div>

      <div class="startup-card-jubilee">
        <h3>Jubilee Bible Mode</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">On startup</div>
            <div class="setting-description">Choose what opens when you start in Jubilee Bible mode.</div>
          </div>
          <div class="select-wrapper">
            <select class="select-input" data-setting="startup.jubileebibles.behavior">
              <option value="homepage" selected>Open homepage</option>
              <option value="restore">Continue where you left off</option>
              <option value="specific">Open specific pages</option>
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Homepage URL</div>
            <div class="setting-description">The page that opens when you click the home button.</div>
          </div>
          <input type="text" class="text-input jubilee-homepage-input" data-setting="homepage.jubileebibles" value="https://www.jubileeverse.com" placeholder="https://www.jubileeverse.com">
        </div>
      </div>
    </section>`;
  }

  private getAdvancedSection(activeSection: string): string {
    return `
    <section class="settings-section ${activeSection === 'advanced' ? 'active' : ''}" id="section-advanced">
      <div class="section-header">
        <h2>Advanced</h2>
        <p>Advanced browser settings for power users.</p>
      </div>

      <div class="settings-card">
        <h3>System</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Hardware acceleration</div>
            <div class="setting-description">Use hardware acceleration when available for better performance.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="advanced.hardwareAcceleration" checked>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Continue running in the background</div>
            <div class="setting-description">Keep the browser running when all windows are closed.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="advanced.backgroundApps">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-card">
        <h3>Language & Spelling</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Browser language</div>
            <div class="setting-description">Language for the browser interface.</div>
          </div>
          <div class="select-wrapper">
            <select class="select-input" data-setting="advanced.language">
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Spell check</div>
            <div class="setting-description">Check spelling as you type in text fields.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-setting="advanced.spellcheck" checked>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </section>`;
  }

  private getSafeBrowsingSection(activeSection: string): string {
    // Configuration object for blocked categories - data-driven for easy updates
    // Categories are sorted by agreementPercent in descending order (highest first)
    const blockedCategories = [
      {
        categoryKey: 'csam',
        title: 'Sexual Exploitation & Child Sexual Abuse Material',
        agreementPercent: 99,
        description: 'Block content involving sexual exploitation, abuse, or illegal sexual material of any kind.'
      },
      {
        categoryKey: 'pornography',
        title: 'Pornography & Explicit Sexual Content',
        agreementPercent: 98,
        description: 'Block adult sites and explicit sexual content intended to arouse or sexualize the viewer.'
      },
      {
        categoryKey: 'escort',
        title: 'Escort / Prostitution / "Adult Services" Marketplaces',
        agreementPercent: 92,
        description: 'Block services that facilitate paid sexual encounters or explicit adult classifieds.'
      },
      {
        categoryKey: 'gambling',
        title: 'Gambling & Sports Betting',
        agreementPercent: 90,
        description: 'Block casinos, online betting, sports wagering, and real-money gambling platforms.'
      },
      {
        categoryKey: 'drugs',
        title: 'Illegal Drugs & Drug Marketplaces',
        agreementPercent: 88,
        description: 'Block illegal drug sales, "how-to" drug production guides, and drug-market directories.'
      },
      {
        categoryKey: 'hate',
        title: 'Hate / Extremist Propaganda',
        agreementPercent: 87,
        description: 'Block content that promotes hatred, extremist recruitment, or dehumanizing ideology.'
      },
      {
        categoryKey: 'occult',
        title: 'Occult / Witchcraft / Spellcasting Services',
        agreementPercent: 85,
        description: 'Block spell services, divination/medium sites, and occult instruction content.'
      },
      {
        categoryKey: 'gore',
        title: 'Graphic Violence / Gore / Shock Content',
        agreementPercent: 83,
        description: 'Block shock sites that specialize in gore, real-death footage, or graphic violence.'
      },
      {
        categoryKey: 'hookup',
        title: 'Hookup-First Adult Dating & Casual-Sex Marketplaces',
        agreementPercent: 78,
        description: 'Block dating platforms explicitly oriented toward casual sexual encounters.'
      },
      {
        categoryKey: 'antichristian',
        title: 'Targeted Anti-Christian Harassment / Blasphemy Hubs',
        agreementPercent: 75,
        description: 'Block communities dedicated to harassing believers or targeting churches for abuse.'
      },
      {
        categoryKey: 'piracy',
        title: 'Piracy / Illegal Downloads / Warez & Cracks',
        agreementPercent: 72,
        description: 'Block piracy and cracking sites commonly tied to theft and malware distribution.'
      },
      {
        categoryKey: 'scams',
        title: 'Scams / Fraud / Predatory Schemes',
        agreementPercent: 70,
        description: 'Block phishing pages, fraud networks, and predatory "get rich quick" schemes.'
      },
      {
        categoryKey: 'malware',
        title: 'Malware / Hacking Tool Distribution',
        agreementPercent: 70,
        description: 'Block sites that distribute malicious code, exploit tools, or credential theft utilities.'
      },
      {
        categoryKey: 'disinfo',
        title: 'Disinformation Farms (High-risk deception hubs)',
        agreementPercent: 60,
        description: 'Block sources primarily designed to mislead through fabricated or deceptive content.'
      },
      {
        categoryKey: 'alcohol',
        title: 'Alcohol / Tobacco / Vaping Shops',
        agreementPercent: 55,
        description: 'Block online stores dedicated to alcohol, tobacco, vaping, or nicotine products.'
      }
    ];

    // Sort categories by agreement percentage in descending order (highest first)
    const sortedCategories = [...blockedCategories].sort((a, b) => b.agreementPercent - a.agreementPercent);

    // Generate category rows from the sorted configuration
    const categoryRows = sortedCategories.map(cat => `
        <div class="protection-category" data-category="${cat.categoryKey}">
          <div class="category-info">
            <div class="category-title">${cat.title}</div>
            <div class="category-description">${cat.description}</div>
            <div class="category-agreement">Estimated agreement: ${cat.agreementPercent}%</div>
          </div>
          <span class="blocked-badge">Blocked</span>
        </div>`).join('');

    return `
    <section class="settings-section safe-browsing-section ${activeSection === 'safe-browsing' ? 'active' : ''}" id="section-safe-browsing">
      <div class="section-header">
        <h2>Safe Browsing</h2>
        <p>These protections help keep Jubilee Browser aligned with a faith-centered and family-safe browsing experience.</p>
      </div>

      <div class="safe-browsing-intro">
        <div class="intro-note">
          These categories are blocked by design. Agreement percentages reflect broad, common preferences among Christians and faith-based families.
        </div>
      </div>

      <div class="settings-card">
        <h3>Blocked Categories</h3>
        ${categoryRows}

        <div class="learn-more-section">
          <button class="learn-more-toggle" id="learnMoreToggle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            Learn more about these protections
          </button>
          <div class="learn-more-content" id="learnMoreContent">
            These categories are blocked to support a faith-centered and family-safe browsing experience.
            Jubilee Browser is designed to reduce accidental exposure to harmful content and protect households,
            churches, and youth environments. These protections reflect widely shared values and cannot be
            disabled through the settings interface.
          </div>
        </div>
      </div>
    </section>`;
  }

  private getResetSection(activeSection: string): string {
    return `
    <section class="settings-section ${activeSection === 'reset' ? 'active' : ''}" id="section-reset">
      <div class="section-header">
        <h2>Reset & Recovery</h2>
        <p>Reset browser settings or recover from issues.</p>
      </div>

      <div class="settings-card">
        <h3>Reset Settings</h3>
        <p style="color: var(--text-secondary); margin-bottom: 16px;">
          Reset settings to their original defaults. This won't affect your bookmarks, history, or saved passwords.
        </p>
        <button class="btn btn-danger" id="resetSettingsBtn">Reset Settings to Defaults</button>
      </div>

      <div class="settings-card">
        <h3>Clean Up Browser</h3>
        <p style="color: var(--text-secondary); margin-bottom: 16px;">
          Find and remove harmful software that may be affecting browser performance.
        </p>
        <button class="btn btn-secondary" id="cleanupBtn">Find harmful software</button>
      </div>

      <div class="settings-card">
        <h3>Restore Original Defaults</h3>
        <p style="color: var(--text-secondary); margin-bottom: 16px;">
          Restore all browser data to a fresh install state. This will delete all your data including bookmarks, history, and passwords.
        </p>
        <button class="btn btn-danger" id="factoryResetBtn">Factory Reset</button>
      </div>
    </section>`;
  }

  /**
   * Get the about page HTML
   */
  private getAboutPage(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>About - Jubilee Browser</title>
  <style>
    :root {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --text-primary: #e8e8e8;
      --text-secondary: #a0a0a0;
      --accent-primary: #E6AC00;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      text-align: center;
      padding: 3rem;
      max-width: 500px;
    }
    .logo {
      font-size: 3rem;
      margin-bottom: 1rem;
      background: linear-gradient(135deg, var(--accent-primary), #ff8c00);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .version {
      color: var(--text-secondary);
      font-size: 1.1rem;
      margin-bottom: 2rem;
    }
    p {
      color: var(--text-secondary);
      line-height: 1.6;
      margin-bottom: 1rem;
    }
    a {
      color: var(--accent-primary);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1 class="logo">Jubilee Browser</h1>
    <p class="version">Version 8.0.4</p>
    <p>A safe, Scripture-centered browser for families, churches, and schools.</p>
    <p>Built with Electron and designed for intentional digital experiences.</p>
    <p style="margin-top: 2rem;">
      <a href="https://jubileebrowser.com">jubileebrowser.com</a>
    </p>
    <p style="margin-top: 2rem; font-size: 0.85rem;">
      &copy; 2024 Jubilee Software, Inc. All rights reserved.
    </p>
  </div>
</body>
</html>`;
  }

  /**
   * Get 404 page for unknown internal URLs
   */
  private get404Page(url: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Not Found - Jubilee Browser</title>
  <style>
    :root {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --text-primary: #e8e8e8;
      --text-secondary: #a0a0a0;
      --accent-primary: #E6AC00;
      --danger: #ff6b6b;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      text-align: center;
      padding: 3rem;
      max-width: 500px;
    }
    h1 {
      font-size: 2rem;
      margin-bottom: 1rem;
      color: var(--accent-primary);
    }
    p {
      color: var(--text-secondary);
      line-height: 1.6;
      margin-bottom: 1rem;
    }
    .error-url {
      background: rgba(255, 107, 107, 0.1);
      border: 1px solid rgba(255, 107, 107, 0.3);
      border-radius: 8px;
      padding: 1rem;
      color: var(--danger);
      font-family: monospace;
      margin: 1.5rem 0;
      word-break: break-all;
    }
    a {
      color: var(--accent-primary);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Page Not Found</h1>
    <p>The internal page you're looking for doesn't exist.</p>
    <div class="error-url">${this.escapeHtml(url)}</div>
    <p><a href="jubilee://settings">Go to Settings</a></p>
  </div>
</body>
</html>`;
  }

  /**
   * Escape HTML special characters to prevent XSS
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
