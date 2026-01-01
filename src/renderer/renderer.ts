/**
 * JubileeBrowser Renderer
 * Main UI logic for the browser interface
 */

// Types defined inline to avoid CommonJS module issues in browser context
type BrowserMode = 'internet' | 'jubileebibles';

interface TabState {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  mode: BrowserMode;
  isSecure?: boolean;
}

interface ExtendedTabState extends TabState {
  isPinned: boolean;
  isMuted: boolean;
  isAudible: boolean;
  groupId?: string;
}

interface TabGroup {
  id: string;
  name: string;
  color: TabGroupColor;
  tabIds: string[];
  collapsed: boolean;
}

type TabGroupColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';

interface NavigationEntry {
  id: string;
  url: string;
  title: string;
  timestamp: number;
  mode: BrowserMode;
  favicon?: string;
}

interface BookmarkEntry {
  id: string;
  url: string;
  title: string;
  createdAt: number;
  mode: BrowserMode;
  folder?: string;
  favicon?: string;
}

// Identity types
type AuthenticationState = 'signed_out' | 'signing_in' | 'signed_in' | 'token_expired' | 'error';
type AccountStatus = 'active' | 'pending' | 'suspended' | 'deactivated';
type ParticipationFeature = 'round_table' | 'chat' | 'video' | 'prayer_rooms' | 'domain_management' | 'saved_notes' | 'cross_device_sync' | 'community_moderation';

interface JubileeUserProfile {
  userId: string;
  email: string;
  displayName: string;
  accountStatus: AccountStatus;
  createdAt: number;
  lastLoginAt: number;
  avatarUrl?: string;
}

interface AuthSession {
  state: AuthenticationState;
  profile: JubileeUserProfile | null;
  isAuthenticated: boolean;
  canAccessParticipation: boolean;
}

// Webview element interface for Electron's webview tag
interface WebviewElement extends HTMLElement {
  src: string;
  partition: string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  reloadIgnoringCache(): void;
  stop(): void;
  getWebContentsId(): number;
}

class JubileeBrowserUI {
  private currentMode: BrowserMode = 'internet';
  private tabs: (ExtendedTabState & { isActive?: boolean })[] = [];
  private activeTabId: string | null = null;
  private webviews: Map<string, WebviewElement> = new Map();
  private sidePanelOpen: boolean = false;
  private sidePanelType: 'history' | 'bookmarks' = 'history';
  private menuOpen: boolean = false;
  private menuFocusedIndex: number = -1;
  // Overflow menu dismiss handlers (stored for cleanup)
  private overflowMenuOutsideClickHandler: ((e: MouseEvent) => void) | null = null;
  private overflowMenuEscapeHandler: ((e: KeyboardEvent) => void) | null = null;
  private isJubileeWindow: boolean = false;
  private currentZoom: number = 100;
  // Tab context menu state
  private tabContextMenuOpen: boolean = false;
  private contextMenuTabId: string | null = null;
  private tabGroups: TabGroup[] = [];
  private groupSubmenuOpen: boolean = false;
  private newGroupPickerOpen: boolean = false;
  // Identity state
  private authSession: AuthSession = {
    state: 'signed_out',
    profile: null,
    isAuthenticated: false,
    canAccessParticipation: false,
  };
  private signInModalOpen: boolean = false;
  private profilePanelOpen: boolean = false;
  private pendingFeature: ParticipationFeature | null = null;

  // DOM Elements
  private elements!: {
    appIcon: HTMLImageElement;
    appLogo: HTMLImageElement;
    tabsContainer: HTMLElement;
    newTabBtn: HTMLButtonElement;
    navBar: HTMLElement;
    backBtn: HTMLButtonElement;
    forwardBtn: HTMLButtonElement;
    reloadBtn: HTMLButtonElement;
    homeBtn: HTMLButtonElement;
    addressBar: HTMLInputElement;
    modeToggle: HTMLInputElement;
    modeIndicator: HTMLElement;
    modeLabel: HTMLElement;
    contentArea: HTMLElement;
    welcomeMessage: HTMLElement;
    sidePanel: HTMLElement;
    sidePanelTitle: HTMLElement;
    sidePanelContent: HTMLElement;
    bookmarkBtn: HTMLButtonElement;
    historyBtn: HTMLButtonElement;
    bookmarksBtn: HTMLButtonElement;
    minimizeBtn: HTMLButtonElement;
    maximizeBtn: HTMLButtonElement;
    closeBtn: HTMLButtonElement;
    closePanelBtn: HTMLButtonElement;
    settingsBtn: HTMLButtonElement;
    // About modal elements
    aboutModal: HTMLElement;
    closeAboutBtn: HTMLButtonElement;
    aboutVersion: HTMLElement;
    updateStatusText: HTMLElement;
    checkUpdateBtn: HTMLButtonElement;
    installUpdateBtn: HTMLButtonElement;
    updateChannel: HTMLElement;
    lastCheckTime: HTMLElement;
    // Update notification elements
    updateNotification: HTMLElement;
    updateNotificationBtn: HTMLButtonElement;
    updateNotificationDismiss: HTMLButtonElement;
    // Overflow menu elements
    overflowMenu: HTMLElement;
    menuNewTab: HTMLButtonElement;
    menuNewWindow: HTMLButtonElement;
    menuNewJubileeWindow: HTMLButtonElement;
    menuHistory: HTMLButtonElement;
    menuDownloads: HTMLButtonElement;
    menuBookmarks: HTMLButtonElement;
    menuZoom: HTMLElement;
    zoomIn: HTMLButtonElement;
    zoomOut: HTMLButtonElement;
    zoomLevel: HTMLElement;
    menuPrint: HTMLButtonElement;
    menuSettings: HTMLButtonElement;
    menuHelp: HTMLButtonElement;
    menuAbout: HTMLButtonElement;
    menuExit: HTMLButtonElement;
    jubileeWindowBadge: HTMLElement;
    // Tab context menu elements
    tabContextMenu: HTMLElement;
    ctxNewTab: HTMLButtonElement;
    ctxReload: HTMLButtonElement;
    ctxDuplicate: HTMLButtonElement;
    ctxPin: HTMLButtonElement;
    ctxPinLabel: HTMLElement;
    ctxMute: HTMLButtonElement;
    ctxMuteLabel: HTMLElement;
    ctxAddToGroup: HTMLButtonElement;
    ctxRemoveFromGroup: HTMLButtonElement;
    ctxMoveToNewWindow: HTMLButtonElement;
    ctxCloseTab: HTMLButtonElement;
    ctxCloseOthers: HTMLButtonElement;
    ctxCloseToRight: HTMLButtonElement;
    ctxReopenClosed: HTMLButtonElement;
    tabGroupSubmenu: HTMLElement;
    groupNewGroup: HTMLButtonElement;
    groupDivider: HTMLElement;
    existingGroups: HTMLElement;
    newGroupPicker: HTMLElement;
    groupNameInput: HTMLInputElement;
    // Identity/Sign-in elements
    signInModal: HTMLElement;
    closeSignInBtn: HTMLButtonElement;
    signInForm: HTMLFormElement;
    signInEmail: HTMLInputElement;
    signInPassword: HTMLInputElement;
    signInError: HTMLElement;
    signInErrorText: HTMLElement;
    signInSubmitBtn: HTMLButtonElement;
    magicLinkBtn: HTMLButtonElement;
    magicLinkSent: HTMLElement;
    magicLinkEmail: HTMLElement;
    backToSignInBtn: HTMLButtonElement;
    signInSubtitle: HTMLElement;
    // Profile panel elements
    profilePanel: HTMLElement;
    closeProfileBtn: HTMLButtonElement;
    profilePanelAvatar: HTMLElement;
    profilePanelInitial: HTMLElement;
    profilePanelName: HTMLElement;
    profilePanelEmail: HTMLElement;
    signOutBtn: HTMLButtonElement;
  };

  async initialize(): Promise<void> {
    this.cacheElements();
    this.bindEvents();
    this.checkJubileeWindowMode();
    await this.loadInitialState();
    this.subscribeToUpdates();
  }

  private cacheElements(): void {
    this.elements = {
      appIcon: document.getElementById('appIcon') as HTMLImageElement,
      appLogo: document.getElementById('appLogo') as HTMLImageElement,
      tabsContainer: document.getElementById('tabsContainer')!,
      newTabBtn: document.getElementById('newTabBtn') as HTMLButtonElement,
      navBar: document.getElementById('navBar')!,
      backBtn: document.getElementById('backBtn') as HTMLButtonElement,
      forwardBtn: document.getElementById('forwardBtn') as HTMLButtonElement,
      reloadBtn: document.getElementById('reloadBtn') as HTMLButtonElement,
      homeBtn: document.getElementById('homeBtn') as HTMLButtonElement,
      addressBar: document.getElementById('addressBar') as HTMLInputElement,
      modeToggle: document.getElementById('modeToggle') as HTMLInputElement,
      modeIndicator: document.getElementById('modeIndicator')!,
      modeLabel: document.getElementById('modeLabel')!,
      contentArea: document.getElementById('contentArea')!,
      welcomeMessage: document.getElementById('welcomeMessage')!,
      sidePanel: document.getElementById('sidePanel')!,
      sidePanelTitle: document.getElementById('sidePanelTitle')!,
      sidePanelContent: document.getElementById('sidePanelContent')!,
      bookmarkBtn: document.getElementById('bookmarkBtn') as HTMLButtonElement,
      historyBtn: document.getElementById('historyBtn') as HTMLButtonElement,
      bookmarksBtn: document.getElementById('bookmarksBtn') as HTMLButtonElement,
      minimizeBtn: document.getElementById('minimizeBtn') as HTMLButtonElement,
      maximizeBtn: document.getElementById('maximizeBtn') as HTMLButtonElement,
      closeBtn: document.getElementById('closeBtn') as HTMLButtonElement,
      closePanelBtn: document.getElementById('closePanelBtn') as HTMLButtonElement,
      settingsBtn: document.getElementById('settingsBtn') as HTMLButtonElement,
      // About modal elements
      aboutModal: document.getElementById('aboutModal')!,
      closeAboutBtn: document.getElementById('closeAboutBtn') as HTMLButtonElement,
      aboutVersion: document.getElementById('aboutVersion')!,
      updateStatusText: document.getElementById('updateStatusText')!,
      checkUpdateBtn: document.getElementById('checkUpdateBtn') as HTMLButtonElement,
      installUpdateBtn: document.getElementById('installUpdateBtn') as HTMLButtonElement,
      updateChannel: document.getElementById('updateChannel')!,
      lastCheckTime: document.getElementById('lastCheckTime')!,
      // Update notification elements
      updateNotification: document.getElementById('updateNotification')!,
      updateNotificationBtn: document.getElementById('updateNotificationBtn') as HTMLButtonElement,
      updateNotificationDismiss: document.getElementById('updateNotificationDismiss') as HTMLButtonElement,
      // Overflow menu elements
      overflowMenu: document.getElementById('overflowMenu')!,
      menuNewTab: document.getElementById('menuNewTab') as HTMLButtonElement,
      menuNewWindow: document.getElementById('menuNewWindow') as HTMLButtonElement,
      menuNewJubileeWindow: document.getElementById('menuNewJubileeWindow') as HTMLButtonElement,
      menuHistory: document.getElementById('menuHistory') as HTMLButtonElement,
      menuDownloads: document.getElementById('menuDownloads') as HTMLButtonElement,
      menuBookmarks: document.getElementById('menuBookmarks') as HTMLButtonElement,
      menuZoom: document.getElementById('menuZoom')!,
      zoomIn: document.getElementById('zoomIn') as HTMLButtonElement,
      zoomOut: document.getElementById('zoomOut') as HTMLButtonElement,
      zoomLevel: document.getElementById('zoomLevel')!,
      menuPrint: document.getElementById('menuPrint') as HTMLButtonElement,
      menuSettings: document.getElementById('menuSettings') as HTMLButtonElement,
      menuHelp: document.getElementById('menuHelp') as HTMLButtonElement,
      menuAbout: document.getElementById('menuAbout') as HTMLButtonElement,
      menuExit: document.getElementById('menuExit') as HTMLButtonElement,
      jubileeWindowBadge: document.getElementById('jubileeWindowBadge')!,
      // Tab context menu elements
      tabContextMenu: document.getElementById('tabContextMenu')!,
      ctxNewTab: document.getElementById('ctxNewTab') as HTMLButtonElement,
      ctxReload: document.getElementById('ctxReload') as HTMLButtonElement,
      ctxDuplicate: document.getElementById('ctxDuplicate') as HTMLButtonElement,
      ctxPin: document.getElementById('ctxPin') as HTMLButtonElement,
      ctxPinLabel: document.getElementById('ctxPinLabel')!,
      ctxMute: document.getElementById('ctxMute') as HTMLButtonElement,
      ctxMuteLabel: document.getElementById('ctxMuteLabel')!,
      ctxAddToGroup: document.getElementById('ctxAddToGroup') as HTMLButtonElement,
      ctxRemoveFromGroup: document.getElementById('ctxRemoveFromGroup') as HTMLButtonElement,
      ctxMoveToNewWindow: document.getElementById('ctxMoveToNewWindow') as HTMLButtonElement,
      ctxCloseTab: document.getElementById('ctxCloseTab') as HTMLButtonElement,
      ctxCloseOthers: document.getElementById('ctxCloseOthers') as HTMLButtonElement,
      ctxCloseToRight: document.getElementById('ctxCloseToRight') as HTMLButtonElement,
      ctxReopenClosed: document.getElementById('ctxReopenClosed') as HTMLButtonElement,
      tabGroupSubmenu: document.getElementById('tabGroupSubmenu')!,
      groupNewGroup: document.getElementById('groupNewGroup') as HTMLButtonElement,
      groupDivider: document.getElementById('groupDivider')!,
      existingGroups: document.getElementById('existingGroups')!,
      newGroupPicker: document.getElementById('newGroupPicker')!,
      groupNameInput: document.getElementById('groupNameInput') as HTMLInputElement,
      // Identity/Sign-in elements
      signInModal: document.getElementById('signInModal')!,
      closeSignInBtn: document.getElementById('closeSignInBtn') as HTMLButtonElement,
      signInForm: document.getElementById('signInForm') as HTMLFormElement,
      signInEmail: document.getElementById('signInEmail') as HTMLInputElement,
      signInPassword: document.getElementById('signInPassword') as HTMLInputElement,
      signInError: document.getElementById('signInError')!,
      signInErrorText: document.getElementById('signInErrorText')!,
      signInSubmitBtn: document.getElementById('signInSubmitBtn') as HTMLButtonElement,
      magicLinkBtn: document.getElementById('magicLinkBtn') as HTMLButtonElement,
      magicLinkSent: document.getElementById('magicLinkSent')!,
      magicLinkEmail: document.getElementById('magicLinkEmail')!,
      backToSignInBtn: document.getElementById('backToSignInBtn') as HTMLButtonElement,
      signInSubtitle: document.getElementById('signInSubtitle')!,
      // Profile panel elements
      profilePanel: document.getElementById('profilePanel')!,
      closeProfileBtn: document.getElementById('closeProfileBtn') as HTMLButtonElement,
      profilePanelAvatar: document.getElementById('profilePanelAvatar')!,
      profilePanelInitial: document.getElementById('profilePanelInitial')!,
      profilePanelName: document.getElementById('profilePanelName')!,
      profilePanelEmail: document.getElementById('profilePanelEmail')!,
      signOutBtn: document.getElementById('signOutBtn') as HTMLButtonElement,
    };
  }

  private bindEvents(): void {
    // App icon - navigate to home page (only if icon exists)
    if (this.elements.appIcon) {
      this.elements.appIcon.addEventListener('click', () => {
        this.navigateToHome();
      });
    }

    // App logo - navigate to home page
    if (this.elements.appLogo) {
      this.elements.appLogo.addEventListener('click', () => {
        this.navigateToHome();
      });
    }

    // Window controls
    this.elements.minimizeBtn.addEventListener('click', async () => {
      await window.jubilee.window.minimize();
    });
    this.elements.maximizeBtn.addEventListener('click', async () => {
      await window.jubilee.window.maximize();
    });
    this.elements.closeBtn.addEventListener('click', () => {
      console.log('Close button clicked');
      window.jubilee.window.close();
    });

    // Tab management
    this.elements.newTabBtn.addEventListener('click', () => this.createTab());

    // Navigation
    this.elements.backBtn.addEventListener('click', () => this.goBack());
    this.elements.forwardBtn.addEventListener('click', () => this.goForward());
    this.elements.reloadBtn.addEventListener('click', () => this.reload());
    this.elements.homeBtn.addEventListener('click', () => this.navigateToHome());

    // Address bar
    this.elements.addressBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.navigate(this.elements.addressBar.value);
      }
    });

    this.elements.addressBar.addEventListener('focus', () => {
      this.elements.addressBar.select();
    });

    // Mode toggle
    this.elements.modeToggle.addEventListener('change', () => {
      const newMode: BrowserMode = this.elements.modeToggle.checked ? 'jubileebibles' : 'internet';
      this.switchMode(newMode);
    });

    // Bookmarks
    this.elements.bookmarkBtn.addEventListener('click', () => this.toggleBookmark());
    this.elements.bookmarksBtn.addEventListener('click', () => this.openSidePanel('bookmarks'));
    this.elements.historyBtn.addEventListener('click', () => this.openSidePanel('history'));
    this.elements.closePanelBtn.addEventListener('click', () => this.closeSidePanel());

    // Three-dot button opens overflow menu (not About modal directly)
    this.elements.settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleOverflowMenu();
    });

    // About modal controls
    this.elements.closeAboutBtn.addEventListener('click', () => this.closeAboutModal());
    this.elements.aboutModal.addEventListener('click', (e) => {
      if (e.target === this.elements.aboutModal) {
        this.closeAboutModal();
      }
    });

    // Overflow menu event bindings
    this.bindMenuEvents();

    // Tab context menu event bindings
    this.bindTabContextMenuEvents();

    // Identity event bindings
    this.bindIdentityEvents();

    // Update controls
    this.elements.checkUpdateBtn.addEventListener('click', () => this.checkForUpdates());
    this.elements.installUpdateBtn.addEventListener('click', () => this.installUpdate());
    this.elements.updateNotificationBtn.addEventListener('click', () => this.installUpdate());
    this.elements.updateNotificationDismiss.addEventListener('click', () => this.dismissUpdateNotification());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl+T - New tab
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        this.createTab();
      }
      // Ctrl+W - Close tab
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if (this.activeTabId) {
          this.closeTab(this.activeTabId);
        }
      }
      // Ctrl+L - Focus address bar
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        this.elements.addressBar.focus();
      }
      // Ctrl+Shift+R or Ctrl+F5 - Hard reload (ignore cache)
      if ((e.ctrlKey && e.shiftKey && e.key === 'R') || (e.ctrlKey && e.key === 'F5')) {
        e.preventDefault();
        this.hardReload();
      }
      // Ctrl+R or F5 - Reload
      else if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
        e.preventDefault();
        this.reload();
      }
      // Alt+Left - Back
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        this.goBack();
      }
      // Alt+Right - Forward
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        this.goForward();
      }
      // Ctrl+Shift+M - Toggle mode
      if (e.ctrlKey && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        this.elements.modeToggle.checked = !this.elements.modeToggle.checked;
        this.elements.modeToggle.dispatchEvent(new Event('change'));
      }
      // Ctrl+N - New window
      if (e.ctrlKey && !e.shiftKey && e.key === 'n') {
        e.preventDefault();
        this.createNewWindow();
      }
      // Ctrl+Shift+J - New Jubilee Bible window
      if (e.ctrlKey && e.shiftKey && e.key === 'J') {
        e.preventDefault();
        this.createNewJubileeWindow();
      }
      // Ctrl+P - Print
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        this.printPage();
      }
      // Ctrl+H - History
      if (e.ctrlKey && e.key === 'h') {
        e.preventDefault();
        this.openSidePanel('history');
      }
      // Ctrl+B - Bookmarks
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        this.openSidePanel('bookmarks');
      }
      // Escape - Close modals, menus, or side panels
      if (e.key === 'Escape') {
        if (this.signInModalOpen) {
          this.closeSignInModal();
        } else if (this.profilePanelOpen) {
          this.closeProfilePanel();
        } else if (this.menuOpen) {
          this.closeOverflowMenu();
        } else if (this.sidePanelOpen) {
          this.closeSidePanel();
        }
      }
      // Ctrl++ - Zoom in
      if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        this.zoomIn();
      }
      // Ctrl+- - Zoom out
      if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        this.zoomOut();
      }
      // Ctrl+0 - Reset zoom
      if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        this.resetZoom();
      }
      // Ctrl+Shift+T - Reopen closed tab
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        this.reopenClosedTab();
      }
    });
  }

  /**
   * Binds all overflow menu event handlers
   */
  private bindMenuEvents(): void {
    // Get all menu items for keyboard navigation
    const menuItems = this.elements.overflowMenu.querySelectorAll('.menu-item:not(.menu-zoom-controls)');

    // Menu item click handlers
    this.elements.menuNewTab.addEventListener('click', () => {
      this.closeOverflowMenu();
      this.createTab();
    });

    this.elements.menuNewWindow.addEventListener('click', () => {
      this.closeOverflowMenu();
      this.createNewWindow();
    });

    this.elements.menuNewJubileeWindow.addEventListener('click', () => {
      this.closeOverflowMenu();
      this.createNewJubileeWindow();
    });

    this.elements.menuHistory.addEventListener('click', () => {
      this.closeOverflowMenu();
      this.openSidePanel('history');
    });

    this.elements.menuDownloads.addEventListener('click', () => {
      this.closeOverflowMenu();
      // Downloads functionality (placeholder - could open downloads folder)
      console.log('Downloads clicked');
    });

    this.elements.menuBookmarks.addEventListener('click', () => {
      this.closeOverflowMenu();
      this.openSidePanel('bookmarks');
    });

    this.elements.menuPrint.addEventListener('click', () => {
      this.closeOverflowMenu();
      this.printPage();
    });

    this.elements.menuSettings.addEventListener('click', () => {
      this.closeOverflowMenu();
      // Navigate to internal settings page
      this.navigateToSettings();
    });

    this.elements.menuHelp.addEventListener('click', () => {
      this.closeOverflowMenu();
      // Help functionality - could open help page
      console.log('Help clicked');
    });

    this.elements.menuAbout.addEventListener('click', () => {
      this.closeOverflowMenu();
      this.openAboutModal();
    });

    this.elements.menuExit.addEventListener('click', () => {
      this.closeOverflowMenu();
      window.jubilee.window.close();
    });

    // Zoom controls
    this.elements.zoomIn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.zoomIn();
    });

    this.elements.zoomOut.addEventListener('click', (e) => {
      e.stopPropagation();
      this.zoomOut();
    });

    // Keyboard navigation within the menu
    this.elements.overflowMenu.addEventListener('keydown', (e) => {
      if (!this.menuOpen) return;

      const focusableItems = Array.from(
        this.elements.overflowMenu.querySelectorAll('.menu-item:not(.menu-zoom-controls), .zoom-btn')
      ) as HTMLElement[];

      const currentIndex = focusableItems.findIndex(item => item === document.activeElement);

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          const nextIndex = currentIndex < focusableItems.length - 1 ? currentIndex + 1 : 0;
          focusableItems[nextIndex].focus();
          break;
        case 'ArrowUp':
          e.preventDefault();
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : focusableItems.length - 1;
          focusableItems[prevIndex].focus();
          break;
        case 'Enter':
        case ' ':
          if (document.activeElement instanceof HTMLElement) {
            e.preventDefault();
            document.activeElement.click();
          }
          break;
        case 'Escape':
          e.preventDefault();
          this.closeOverflowMenu();
          this.elements.settingsBtn.focus();
          break;
        case 'Tab':
          // Allow tab to cycle through items
          if (e.shiftKey && currentIndex === 0) {
            e.preventDefault();
            focusableItems[focusableItems.length - 1].focus();
          } else if (!e.shiftKey && currentIndex === focusableItems.length - 1) {
            e.preventDefault();
            focusableItems[0].focus();
          }
          break;
      }
    });
  }

  private async loadInitialState(): Promise<void> {
    // Get current mode
    const { mode } = await window.jubilee.mode.get();
    this.currentMode = mode;
    this.updateModeUI();

    // Load authentication session
    await this.loadAuthSession();

    // Always create an initial tab on startup
    await this.createTab();
  }

  private subscribeToUpdates(): void {
    // Subscribe to tab updates
    window.jubilee.tabs.onUpdate((tabs) => {
      this.tabs = tabs;
      this.activeTabId = tabs.find((t) => (t as any).isActive)?.id || null;
      this.renderTabs();
      this.updateNavigationState();
    });

    // Subscribe to mode changes
    window.jubilee.mode.onChange(({ mode }) => {
      this.currentMode = mode;
      this.updateModeUI();
    });

    // Subscribe to navigation events from main process
    window.jubilee.navigation.onNavigate(({ tabId, url }) => {
      const webview = this.webviews.get(tabId);
      if (webview) {
        webview.src = url;
      }
    });

    window.jubilee.navigation.onBack(({ tabId }) => {
      const webview = this.webviews.get(tabId);
      if (webview && webview.canGoBack()) {
        webview.goBack();
      }
    });

    window.jubilee.navigation.onForward(({ tabId }) => {
      const webview = this.webviews.get(tabId);
      if (webview && webview.canGoForward()) {
        webview.goForward();
      }
    });

    window.jubilee.navigation.onReload(({ tabId }) => {
      const webview = this.webviews.get(tabId);
      if (webview) {
        webview.reload();
      }
    });

    window.jubilee.navigation.onStop(({ tabId }) => {
      const webview = this.webviews.get(tabId);
      if (webview) {
        webview.stop();
      }
    });

    window.jubilee.navigation.onHardReload(({ tabId }) => {
      const webview = this.webviews.get(tabId);
      if (webview) {
        this.performDeepRefresh(webview, tabId);
      }
    });

    // Subscribe to URL blocked events
    window.jubilee.blacklist.onUrlBlocked(({ url, content }) => {
      console.log(`URL blocked: ${url}`);
      // Show the blocked page in the active webview
      if (this.activeTabId) {
        const webview = this.webviews.get(this.activeTabId);
        if (webview) {
          webview.src = `data:text/html;charset=utf-8,${encodeURIComponent(content)}`;
        }
      }
    });

    // Subscribe to update state changes
    window.jubilee.update.onStateChanged((state) => {
      this.handleUpdateStateChange(state);
    });

    // Subscribe to authentication session changes
    window.jubilee.identity.onSessionChanged((session: AuthSession) => {
      this.handleSessionChanged(session);
    });

    // Subscribe to sign-in required events (from participation features)
    window.jubilee.identity.onSignInRequired((data: { feature?: ParticipationFeature }) => {
      this.pendingFeature = data.feature || null;
      this.showSignInModal(data.feature);
    });
  }

  private async createTab(url?: string): Promise<void> {
    const { tabId, tabs } = await window.jubilee.tabs.create(url);
    this.tabs = tabs;
    this.activeTabId = tabId;
    this.renderTabs();
    const defaultUrl = url || await this.getDefaultUrl();
    this.createWebview(tabId, defaultUrl);
    this.elements.welcomeMessage.classList.remove('visible');
  }

  private async closeTab(tabId: string): Promise<void> {
    const webview = this.webviews.get(tabId);
    if (webview) {
      webview.remove();
      this.webviews.delete(tabId);
    }

    const { tabs } = await window.jubilee.tabs.close(tabId);
    this.tabs = tabs;

    if (tabs.length === 0) {
      this.elements.welcomeMessage.classList.add('visible');
      this.activeTabId = null;
    } else {
      // Switch to the first available tab
      const newActiveTab = tabs.find((t: any) => t.isActive) || tabs[0];
      if (newActiveTab) {
        await this.switchTab(newActiveTab.id);
      }
    }
  }

  private async switchTab(tabId: string): Promise<void> {
    await window.jubilee.tabs.switch(tabId);
    this.activeTabId = tabId;

    // Show/hide webviews
    this.webviews.forEach((wv, id) => {
      const container = wv.parentElement;
      if (container) {
        container.classList.toggle('active', id === tabId);
      }
    });

    // Update address bar
    const tab = this.tabs.find((t) => t.id === tabId);
    if (tab) {
      this.elements.addressBar.value = this.formatAddressBarDisplay(tab.url, tab.isSecure);
      this.updateNavigationState();
    }
  }

  private createWebview(tabId: string, url: string): void {
    // Create container
    const container = document.createElement('div');
    container.className = 'webview-container active';
    container.dataset.tabId = tabId;

    // Create webview
    const webview = document.createElement('webview') as unknown as WebviewElement;
    webview.setAttribute('partition', `persist:${this.currentMode}`);
    webview.setAttribute('allowpopups', 'false');
    webview.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no, sandbox=yes');

    // Handle JubileeBibles inspire:// URLs
    if (url.startsWith('inspire://') || url.endsWith('.inspire')) {
      // Resolve and load inspire content
      this.loadInspireContent(webview, url);
    } else {
      // For regular URLs (http/https), load directly
      webview.src = url;
    }

    // Bind webview events
    this.bindWebviewEvents(webview, tabId);

    container.appendChild(webview);
    this.elements.contentArea.appendChild(container);
    this.webviews.set(tabId, webview);

    // Hide other webviews
    this.webviews.forEach((wv, id) => {
      if (id !== tabId && wv.parentElement) {
        wv.parentElement.classList.remove('active');
      }
    });
  }

  private async loadInspireContent(webview: WebviewElement, url: string): Promise<void> {
    try {
      const resolution = await window.jubilee.inspire.resolve(url);
      if (resolution.success && resolution.content) {
        // Load HTML content directly
        webview.src = `data:text/html;charset=utf-8,${encodeURIComponent(resolution.content)}`;
      } else {
        // Load error page
        const errorContent = this.getInspireErrorPage(resolution.errorMessage || 'Unknown error');
        webview.src = `data:text/html;charset=utf-8,${encodeURIComponent(errorContent)}`;
      }
    } catch (error) {
      const errorContent = this.getInspireErrorPage(error instanceof Error ? error.message : 'Failed to resolve location');
      webview.src = `data:text/html;charset=utf-8,${encodeURIComponent(errorContent)}`;
    }
  }

  private getInspireErrorPage(message: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: 'Segoe UI', sans-serif;
      background: #1a1a2e;
      color: #e8e8e8;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #ffd700; margin-bottom: 1rem; }
    .error { color: #ff9999; background: rgba(255,0,0,0.1); padding: 1rem; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Location Not Found</h1>
    <div class="error">${this.escapeHtml(message)}</div>
  </div>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private bindWebviewEvents(webview: WebviewElement, tabId: string): void {
    webview.addEventListener('did-start-loading', () => {
      window.jubilee.tabs.updateState(tabId, { isLoading: true });
    });

    webview.addEventListener('did-stop-loading', () => {
      window.jubilee.tabs.updateState(tabId, { isLoading: false });
    });

    webview.addEventListener('did-navigate', (e: any) => {
      const url = e.url || webview.src;
      const isSecure = url.startsWith('https://');

      window.jubilee.tabs.updateState(tabId, {
        url,
        canGoBack: webview.canGoBack(),
        canGoForward: webview.canGoForward(),
        isSecure,
      });

      if (tabId === this.activeTabId) {
        this.elements.addressBar.value = this.formatAddressBarDisplay(url, isSecure);
        this.updateNavigationState();
      }
    });

    webview.addEventListener('did-navigate-in-page', (e: any) => {
      const url = e.url || webview.src;
      const isSecure = url.startsWith('https://');

      if (tabId === this.activeTabId) {
        this.elements.addressBar.value = this.formatAddressBarDisplay(url, isSecure);
      }
    });

    webview.addEventListener('page-title-updated', (e: any) => {
      window.jubilee.tabs.updateState(tabId, { title: e.title });
    });

    webview.addEventListener('page-favicon-updated', (e: any) => {
      if (e.favicons && e.favicons.length > 0) {
        window.jubilee.tabs.updateState(tabId, { favicon: e.favicons[0] });
      }
    });

    webview.addEventListener('new-window', (e: any) => {
      e.preventDefault();
      // Open in new tab instead
      this.createTab(e.url);
    });

    webview.addEventListener('dom-ready', () => {
      // Notify main process that webview is ready
      try {
        const webContentsId = (webview as any).getWebContentsId();
        window.jubilee.webview.ready(tabId, webContentsId);
      } catch (err) {
        // getWebContentsId may not be available in all contexts
      }
    });
  }

  private renderTabs(): void {
    // Save the new tab button before clearing
    const newTabBtn = this.elements.newTabBtn;

    // Clear all children except we'll re-add the button
    this.elements.tabsContainer.innerHTML = '';

    this.tabs.forEach((tab) => {
      const tabEl = document.createElement('div');
      // Build class list
      let tabClass = 'tab';
      if ((tab as any).isActive) tabClass += ' active';
      if (tab.mode === 'jubileebibles') tabClass += ' jubileebibles-tab';
      if (tab.isPinned) tabClass += ' pinned';
      if (tab.groupId) {
        const group = this.tabGroups.find(g => g.id === tab.groupId);
        if (group) tabClass += ` group-${group.color}`;
      }
      tabEl.className = tabClass;
      tabEl.dataset.tabId = tab.id;

      // Globe icon SVG for jubileebibles tabs without favicon
      const globeFavicon = `<svg class="tab-favicon tab-favicon-globe" width="14" height="14" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <ellipse cx="8" cy="8" rx="3" ry="6.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M1.5 8H14.5" stroke="currentColor" stroke-width="1.5"/>
      </svg>`;

      // Muted icon
      const mutedIcon = tab.isMuted ? `<svg class="tab-muted-icon" width="12" height="12" viewBox="0 0 16 16">
        <path d="M8 2L4 6H1v4h3l4 4V2z" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M12 6l4 4M16 6l-4 4" stroke="currentColor" stroke-width="1.5"/>
      </svg>` : '';

      // Audio icon (for tabs playing audio)
      const audioIcon = tab.isAudible && !tab.isMuted ? `<svg class="tab-audio-icon" width="12" height="12" viewBox="0 0 16 16">
        <path d="M8 2L4 6H1v4h3l4 4V2z" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M11 5c1 1 1 5 0 6M13 3c2 2 2 8 0 10" stroke="currentColor" stroke-width="1.5" fill="none"/>
      </svg>` : '';

      tabEl.innerHTML = `
        ${tab.isLoading
          ? '<div class="tab-loading"></div>'
          : tab.favicon
            ? `<img class="tab-favicon" src="${this.escapeHtml(tab.favicon)}" alt="">`
            : tab.mode === 'jubileebibles'
              ? globeFavicon
              : '<div class="tab-favicon"></div>'
        }
        <span class="tab-title">${this.escapeHtml(tab.title)}</span>
        ${mutedIcon}
        ${audioIcon}
        <button class="tab-close" title="Close tab">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 1L9 9M1 9L9 1" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
      `;

      // Tab click - switch
      tabEl.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).closest('.tab-close')) {
          this.switchTab(tab.id);
        }
      });

      // Right-click - context menu
      tabEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showTabContextMenu(tab.id, e.clientX, e.clientY);
      });

      // Close button click
      const closeBtn = tabEl.querySelector('.tab-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeTab(tab.id);
        });
      }

      this.elements.tabsContainer.appendChild(tabEl);

      // Update active tab tracking
      if ((tab as any).isActive) {
        this.activeTabId = tab.id;
        this.elements.addressBar.value = this.formatAddressBarDisplay(tab.url, tab.isSecure);
      }
    });

    // Re-append the new tab button at the end
    this.elements.tabsContainer.appendChild(newTabBtn);

    // Update nav bar styling based on active tab's mode
    this.updateNavBarStyle();
  }

  private updateNavBarStyle(): void {
    const activeTab = this.tabs.find((t) => t.id === this.activeTabId);
    // Use active tab's mode, or fall back to current mode
    const isJubileeBibles = activeTab ? activeTab.mode === 'jubileebibles' : this.currentMode === 'jubileebibles';
    if (isJubileeBibles) {
      this.elements.navBar.classList.add('jubileebibles-active');
    } else {
      this.elements.navBar.classList.remove('jubileebibles-active');
    }
  }

  private updateNavigationState(): void {
    const activeTab = this.tabs.find((t) => t.id === this.activeTabId);
    if (activeTab) {
      this.elements.backBtn.disabled = !activeTab.canGoBack;
      this.elements.forwardBtn.disabled = !activeTab.canGoForward;
    }
  }

  private async navigate(input: string): Promise<void> {
    if (!input.trim()) return;

    let url = input.trim();

    // Handle based on mode
    if (this.currentMode === 'jubileebibles') {
      // In JubileeBibles mode, treat input as inspire address
      if (!url.startsWith('inspire://') && !url.includes('://')) {
        if (!url.endsWith('.inspire')) {
          url = `${url}.inspire`;
        }
        url = `inspire://${url}`;
      }
    } else {
      // Internet mode - standard URL handling
      if (!url.includes('://')) {
        if (url.includes('.') && !url.includes(' ')) {
          url = `https://${url}`;
        } else {
          // Search query
          url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        }
      }
    }

    // Navigate active webview
    const webview = this.activeTabId ? this.webviews.get(this.activeTabId) : null;
    if (webview) {
      if (this.currentMode === 'jubileebibles' && url.startsWith('inspire://')) {
        await this.loadInspireContent(webview, url);
      } else {
        webview.src = url;
      }
      const isSecure = url.startsWith('https://');
      this.elements.addressBar.value = this.formatAddressBarDisplay(url, isSecure);
    }

    await window.jubilee.navigation.go(url);
  }

  private goBack(): void {
    const webview = this.activeTabId ? this.webviews.get(this.activeTabId) : null;
    if (webview && webview.canGoBack()) {
      webview.goBack();
    }
  }

  private goForward(): void {
    const webview = this.activeTabId ? this.webviews.get(this.activeTabId) : null;
    if (webview && webview.canGoForward()) {
      webview.goForward();
    }
  }

  private reload(): void {
    const webview = this.activeTabId ? this.webviews.get(this.activeTabId) : null;
    if (webview) {
      webview.reload();
    }
  }

  private hardReload(): void {
    const webview = this.activeTabId ? this.webviews.get(this.activeTabId) : null;
    if (webview && this.activeTabId) {
      this.performDeepRefresh(webview, this.activeTabId);
      this.triggerShineAnimation();
    }
  }

  /**
   * Performs a comprehensive deep refresh that bypasses all cache layers:
   * - HTTP cache (via cache-bypass headers)
   * - Memory cache (via reloadIgnoringCache)
   * - Service worker cache (via cache-busting URL parameter)
   * - Disk cache (via Chromium's reload ignoring cache)
   */
  private performDeepRefresh(webview: WebviewElement, tabId: string): void {
    console.log(`[DeepRefresh] Initiating deep refresh for tab: ${tabId}`);

    // Get the current URL
    const currentUrl = webview.src;

    // Skip data URLs and about:blank
    if (currentUrl.startsWith('data:') || currentUrl === 'about:blank') {
      console.log('[DeepRefresh] Skipping data URL or about:blank');
      webview.reload();
      return;
    }

    try {
      // Add cache-busting parameter to bypass service worker cache
      const url = new URL(currentUrl);
      const cacheBuster = `_cb=${Date.now()}`;

      // Only add cache buster for HTTP/HTTPS URLs
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        // Remove any existing cache buster
        url.searchParams.delete('_cb');
        // Add new cache buster
        url.searchParams.set('_cb', Date.now().toString());

        console.log(`[DeepRefresh] Navigating to cache-busted URL: ${url.toString()}`);

        // Use reloadIgnoringCache for comprehensive cache bypass
        // This tells Chromium to bypass HTTP cache, memory cache, and disk cache
        webview.reloadIgnoringCache();

        // For extra thoroughness, also execute JavaScript to clear service worker caches
        // This is done after the reload starts
        this.clearServiceWorkerCaches(webview);
      } else {
        // For non-HTTP URLs (file://, inspire://, etc.), just reload ignoring cache
        console.log(`[DeepRefresh] Non-HTTP URL, using reloadIgnoringCache: ${currentUrl}`);
        webview.reloadIgnoringCache();
      }
    } catch (err) {
      // If URL parsing fails, fall back to basic reload ignoring cache
      console.log(`[DeepRefresh] URL parsing failed, falling back to basic cache-bypass reload`);
      webview.reloadIgnoringCache();
    }

    // Update tab state to show loading
    window.jubilee.tabs.updateState(tabId, { isLoading: true });
  }

  /**
   * Attempts to clear service worker caches via JavaScript injection
   * This handles cases where service workers might cache responses
   */
  private clearServiceWorkerCaches(webview: WebviewElement): void {
    // Execute JavaScript in the webview to clear caches
    // Note: This runs after the page starts loading, so it affects future requests
    const clearCacheScript = `
      (async function() {
        try {
          // Clear all Cache Storage entries
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
            console.log('[Jubilee DeepRefresh] Cleared', cacheNames.length, 'service worker caches');
          }

          // Unregister service workers for this origin
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(reg => reg.unregister()));
            console.log('[Jubilee DeepRefresh] Unregistered', registrations.length, 'service workers');
          }
        } catch (err) {
          console.log('[Jubilee DeepRefresh] Cache clearing skipped:', err.message);
        }
      })();
    `;

    // Execute after a brief delay to let the page start loading
    setTimeout(() => {
      try {
        (webview as any).executeJavaScript(clearCacheScript).catch(() => {
          // Silently ignore errors - script may fail on certain pages
        });
      } catch {
        // Silently ignore if executeJavaScript is not available
      }
    }, 100);
  }

  private triggerShineAnimation(): void {
    if (!this.activeTabId) return;

    // Find the active tab element
    const tabEl = document.querySelector(`.tab[data-tab-id="${this.activeTabId}"]`);
    if (tabEl) {
      // Remove class first in case animation is already running
      tabEl.classList.remove('hard-refresh-shine');
      // Force reflow to restart animation
      void (tabEl as HTMLElement).offsetWidth;
      // Add the class to trigger animation
      tabEl.classList.add('hard-refresh-shine');

      // Remove the class after animation completes
      setTimeout(() => {
        tabEl.classList.remove('hard-refresh-shine');
      }, 600);
    }
  }

  private async switchMode(mode: BrowserMode): Promise<void> {
    await window.jubilee.mode.switch(mode);
    this.currentMode = mode;
    this.updateModeUI();

    // Check if there's already a tab in the new mode
    const existingTab = this.tabs.find((tab) => tab.mode === mode);
    if (existingTab) {
      // Switch to the existing tab
      await this.switchTab(existingTab.id);
    } else {
      // Create a new tab in the new mode
      await this.createTab();
    }
  }

  private updateModeUI(): void {
    const isJubileeBibles = this.currentMode === 'jubileebibles';

    // Update toggle
    this.elements.modeToggle.checked = isJubileeBibles;

    // Update body class
    document.body.classList.toggle('jubileebibles-mode', isJubileeBibles);

    // Update address bar placeholder
    this.elements.addressBar.placeholder = isJubileeBibles
      ? 'Enter .inspire address...'
      : 'Enter address or search...';

    // Update nav bar style immediately
    this.updateNavBarStyle();
  }

  private async getDefaultUrl(): Promise<string> {
    const settings = await window.jubilee.settings.get();
    if (this.currentMode === 'jubileebibles') {
      return settings.homepage.jubileebibles;
    }
    return settings.homepage.internet;
  }

  private formatAddressBarDisplay(url: string, isSecure?: boolean): string {
    // Don't modify special URLs
    if (url.startsWith('about:') || url.startsWith('jubilee:') || url.startsWith('file:') || url.startsWith('inspire:')) {
      return url;
    }

    // Remove protocol from display
    let displayUrl = url.replace(/^https?:\/\//, '');

    // Add security prefix
    if (url.startsWith('https://') || isSecure === true) {
      return 'https://' + displayUrl;
    } else if (url.startsWith('http://')) {
      return 'Not Secure ' + displayUrl;
    }

    return url;
  }

    private async navigateToHome(): Promise<void> {
    // Navigate to the homepage based on current mode (www.jubileeverse.com for both modes)
    const settings = await window.jubilee.settings.get();
    const homeUrl = this.currentMode === 'jubileebibles'
      ? settings.homepage.jubileebibles
      : settings.homepage.internet;

    const webview = this.activeTabId ? this.webviews.get(this.activeTabId) : null;
    if (webview) {
      webview.src = homeUrl;
      this.elements.addressBar.value = homeUrl;
    } else {
      // Create a new tab with the home page
      this.createTab().then(async () => {
        const newWebview = this.activeTabId ? this.webviews.get(this.activeTabId) : null;
        if (newWebview) {
          newWebview.src = homeUrl;
          this.elements.addressBar.value = homeUrl;
        }
      });
    }
  }

  private navigateToSettings(): void {
    // Navigate to internal settings page
    const settingsUrl = 'jubilee://settings';
    const webview = this.activeTabId ? this.webviews.get(this.activeTabId) : null;
    if (webview) {
      webview.src = settingsUrl;
      this.elements.addressBar.value = settingsUrl;
    } else {
      // Create a new tab with the settings page
      this.createTab().then(() => {
        const newWebview = this.activeTabId ? this.webviews.get(this.activeTabId) : null;
        if (newWebview) {
          newWebview.src = settingsUrl;
          this.elements.addressBar.value = settingsUrl;
        }
      });
    }
  }

  private async toggleBookmark(): Promise<void> {
    const activeTab = this.tabs.find((t) => t.id === this.activeTabId);
    if (!activeTab) return;

    const bookmarks = await window.jubilee.bookmarks.list(this.currentMode);
    const existing = bookmarks.find((b) => b.url === activeTab.url);

    if (existing) {
      await window.jubilee.bookmarks.remove(existing.id);
      this.elements.bookmarkBtn.classList.remove('bookmarked');
    } else {
      await window.jubilee.bookmarks.add({
        url: activeTab.url,
        title: activeTab.title,
        mode: this.currentMode,
      });
      this.elements.bookmarkBtn.classList.add('bookmarked');
    }
  }

  private openSidePanel(type: 'history' | 'bookmarks'): void {
    this.sidePanelType = type;
    this.sidePanelOpen = true;
    this.elements.sidePanel.classList.add('open');
    this.elements.sidePanelTitle.textContent = type === 'history' ? 'History' : 'Bookmarks';
    this.loadSidePanelContent();
  }

  private closeSidePanel(): void {
    this.sidePanelOpen = false;
    this.elements.sidePanel.classList.remove('open');
  }

  private async loadSidePanelContent(): Promise<void> {
    this.elements.sidePanelContent.innerHTML = '<div class="panel-empty">Loading...</div>';

    if (this.sidePanelType === 'history') {
      const history = await window.jubilee.history.get(this.currentMode, 50);
      this.renderHistoryPanel(history);
    } else {
      const bookmarks = await window.jubilee.bookmarks.list(this.currentMode);
      this.renderBookmarksPanel(bookmarks);
    }
  }

  private renderHistoryPanel(entries: NavigationEntry[]): void {
    if (entries.length === 0) {
      this.elements.sidePanelContent.innerHTML = '<div class="panel-empty">No history yet</div>';
      return;
    }

    this.elements.sidePanelContent.innerHTML = entries
      .map((entry) => `
        <div class="panel-item" data-url="${this.escapeHtml(entry.url)}">
          <div class="panel-item-content">
            <div class="panel-item-title">${this.escapeHtml(entry.title)}</div>
            <div class="panel-item-url">${this.escapeHtml(entry.url)}</div>
          </div>
          <span class="panel-item-time">${this.formatTime(entry.timestamp)}</span>
        </div>
      `)
      .join('');

    // Bind click events
    this.elements.sidePanelContent.querySelectorAll('.panel-item').forEach((item) => {
      item.addEventListener('click', () => {
        const url = (item as HTMLElement).dataset.url;
        if (url) {
          this.navigate(url);
          this.closeSidePanel();
        }
      });
    });
  }

  private renderBookmarksPanel(bookmarks: BookmarkEntry[]): void {
    if (bookmarks.length === 0) {
      this.elements.sidePanelContent.innerHTML = '<div class="panel-empty">No bookmarks yet</div>';
      return;
    }

    this.elements.sidePanelContent.innerHTML = bookmarks
      .map((bookmark) => `
        <div class="panel-item" data-url="${this.escapeHtml(bookmark.url)}">
          <div class="panel-item-content">
            <div class="panel-item-title">${this.escapeHtml(bookmark.title)}</div>
            <div class="panel-item-url">${this.escapeHtml(bookmark.url)}</div>
          </div>
        </div>
      `)
      .join('');

    // Bind click events
    this.elements.sidePanelContent.querySelectorAll('.panel-item').forEach((item) => {
      item.addEventListener('click', () => {
        const url = (item as HTMLElement).dataset.url;
        if (url) {
          this.navigate(url);
          this.closeSidePanel();
        }
      });
    });
  }

  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return date.toLocaleDateString();
  }

  // About Modal methods
  private async openAboutModal(): Promise<void> {
    this.elements.aboutModal.classList.add('visible');
    await this.refreshUpdateState();
  }

  private closeAboutModal(): void {
    this.elements.aboutModal.classList.remove('visible');
  }

  private async refreshUpdateState(): Promise<void> {
    const state = await window.jubilee.update.getState();
    if (state) {
      this.updateAboutPanel(state);
    }
  }

  private updateAboutPanel(state: any): void {
    // Update version
    this.elements.aboutVersion.textContent = `Version ${state.currentVersion}`;

    // Update channel
    this.elements.updateChannel.textContent = `Channel: ${state.channel.charAt(0).toUpperCase() + state.channel.slice(1)}`;

    // Update last check time
    if (state.lastCheckTime) {
      this.elements.lastCheckTime.textContent = `Last checked: ${this.formatTime(state.lastCheckTime)}`;
    } else {
      this.elements.lastCheckTime.textContent = 'Last checked: Never';
    }

    // Update status text and buttons based on state
    const statusText = this.elements.updateStatusText;
    const checkBtn = this.elements.checkUpdateBtn;
    const installBtn = this.elements.installUpdateBtn;

    statusText.classList.remove('success', 'error');

    switch (state.status) {
      case 'idle':
      case 'not-available':
        statusText.textContent = 'Jubilee is up to date.';
        statusText.classList.add('success');
        checkBtn.classList.remove('hidden');
        checkBtn.disabled = false;
        installBtn.classList.add('hidden');
        break;
      case 'checking':
        statusText.textContent = 'Checking for updates...';
        checkBtn.classList.remove('hidden');
        checkBtn.disabled = true;
        installBtn.classList.add('hidden');
        break;
      case 'available':
        statusText.textContent = `Update available: ${state.availableVersion}`;
        checkBtn.classList.add('hidden');
        installBtn.classList.add('hidden');
        break;
      case 'downloading':
        const progress = state.downloadProgress?.toFixed(0) || 0;
        statusText.textContent = `Downloading update: ${progress}%`;
        checkBtn.classList.add('hidden');
        installBtn.classList.add('hidden');
        break;
      case 'downloaded':
        statusText.textContent = `Update ${state.availableVersion} ready to install.`;
        statusText.classList.add('success');
        checkBtn.classList.add('hidden');
        installBtn.classList.remove('hidden');
        break;
      case 'error':
        statusText.textContent = state.lastError || 'Update check failed.';
        statusText.classList.add('error');
        checkBtn.classList.remove('hidden');
        checkBtn.disabled = false;
        installBtn.classList.add('hidden');
        break;
    }
  }

  private handleUpdateStateChange(state: any): void {
    // Update About panel if visible
    if (this.elements.aboutModal.classList.contains('visible')) {
      this.updateAboutPanel(state);
    }

    // Show/hide update notification
    if (state.status === 'downloaded') {
      this.showUpdateNotification();
    }
  }

  private showUpdateNotification(): void {
    this.elements.updateNotification.classList.remove('hidden');
  }

  private dismissUpdateNotification(): void {
    this.elements.updateNotification.classList.add('hidden');
  }

  private async checkForUpdates(): Promise<void> {
    this.elements.checkUpdateBtn.disabled = true;
    this.elements.updateStatusText.textContent = 'Checking for updates...';
    await window.jubilee.update.checkForUpdates();
  }

  private async installUpdate(): Promise<void> {
    this.elements.updateStatusText.textContent = 'Preparing to install...';
    this.elements.installUpdateBtn.disabled = true;
    await window.jubilee.update.installUpdate();
  }

  // ====================================================
  // Overflow Menu Methods
  // ====================================================

  private toggleOverflowMenu(): void {
    if (this.menuOpen) {
      this.closeOverflowMenu();
    } else {
      this.openOverflowMenu();
    }
  }

  private openOverflowMenu(): void {
    this.menuOpen = true;
    this.elements.overflowMenu.classList.add('open');
    this.updateZoomDisplay();

    // Focus the first menu item for keyboard navigation
    requestAnimationFrame(() => {
      const firstItem = this.elements.overflowMenu.querySelector('.menu-item') as HTMLElement;
      if (firstItem) {
        firstItem.focus();
      }
    });

    // Add document-level outside click handler (using mousedown for responsiveness)
    this.overflowMenuOutsideClickHandler = (e: MouseEvent) => {
      const target = e.target as Node;
      // Check if click is outside menu and outside settings button
      if (!this.elements.overflowMenu.contains(target) &&
          !this.elements.settingsBtn.contains(target)) {
        this.closeOverflowMenu();
        this.elements.settingsBtn.focus();
      }
    };
    // Use setTimeout to avoid capturing the opening click
    setTimeout(() => {
      if (this.menuOpen) {
        document.addEventListener('mousedown', this.overflowMenuOutsideClickHandler!);
      }
    }, 0);

    // Add document-level Escape key handler
    this.overflowMenuEscapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.closeOverflowMenu();
        this.elements.settingsBtn.focus();
      }
    };
    document.addEventListener('keydown', this.overflowMenuEscapeHandler);
  }

  private closeOverflowMenu(): void {
    this.menuOpen = false;
    this.elements.overflowMenu.classList.remove('open');
    this.menuFocusedIndex = -1;

    // Remove document-level handlers to prevent leaks
    if (this.overflowMenuOutsideClickHandler) {
      document.removeEventListener('mousedown', this.overflowMenuOutsideClickHandler);
      this.overflowMenuOutsideClickHandler = null;
    }
    if (this.overflowMenuEscapeHandler) {
      document.removeEventListener('keydown', this.overflowMenuEscapeHandler);
      this.overflowMenuEscapeHandler = null;
    }
  }

  // ====================================================
  // Window Creation Methods
  // ====================================================

  private async createNewWindow(): Promise<void> {
    console.log('[Menu] Creating new window');
    try {
      await window.jubilee.window.newWindow();
    } catch (error) {
      console.error('Failed to create new window:', error);
    }
  }

  private async createNewJubileeWindow(): Promise<void> {
    console.log('[Menu] Creating new Jubilee Bible window');
    try {
      await window.jubilee.window.newJubileeWindow();
    } catch (error) {
      console.error('Failed to create new Jubilee Bible window:', error);
    }
  }

  // ====================================================
  // Zoom Methods
  // ====================================================

  private updateZoomDisplay(): void {
    this.elements.zoomLevel.textContent = `${this.currentZoom}%`;
  }

  private async zoomIn(): Promise<void> {
    this.currentZoom = Math.min(500, this.currentZoom + 10);
    this.updateZoomDisplay();
    await window.jubilee.window.setZoom(this.currentZoom / 100);
  }

  private async zoomOut(): Promise<void> {
    this.currentZoom = Math.max(25, this.currentZoom - 10);
    this.updateZoomDisplay();
    await window.jubilee.window.setZoom(this.currentZoom / 100);
  }

  private async resetZoom(): Promise<void> {
    this.currentZoom = 100;
    this.updateZoomDisplay();
    await window.jubilee.window.setZoom(1);
  }

  // ====================================================
  // Print Method
  // ====================================================

  private async printPage(): Promise<void> {
    const webview = this.activeTabId ? this.webviews.get(this.activeTabId) : null;
    if (webview) {
      try {
        // Execute print in the webview context
        (webview as any).executeJavaScript('window.print()').catch((err: Error) => {
          console.error('Print failed:', err);
        });
      } catch (error) {
        console.error('Print execution failed:', error);
      }
    }
  }

  // ====================================================
  // Jubilee Window Mode Detection
  // ====================================================

  private checkJubileeWindowMode(): void {
    // Check URL parameters for jubilee window mode
    const urlParams = new URLSearchParams(window.location.search);
    this.isJubileeWindow = urlParams.get('isJubileeWindow') === 'true';

    if (this.isJubileeWindow) {
      document.body.classList.add('jubilee-window-mode');
      this.elements.jubileeWindowBadge.classList.remove('hidden');

      // Force jubileebibles mode in jubilee windows
      this.currentMode = 'jubileebibles';
      this.updateModeUI();

      // Disable mode toggle in jubilee windows
      this.elements.modeToggle.disabled = true;
      this.elements.modeToggle.parentElement?.classList.add('disabled');
    }
  }

  // ====================================================
  // Tab Context Menu Methods
  // ====================================================

  /**
   * Binds all tab context menu event handlers
   */
  private bindTabContextMenuEvents(): void {
    // Context menu item click handlers
    this.elements.ctxNewTab.addEventListener('click', () => {
      this.closeTabContextMenu();
      this.createTab();
    });

    this.elements.ctxReload.addEventListener('click', () => {
      if (this.contextMenuTabId) {
        this.closeTabContextMenu();
        this.reloadTab(this.contextMenuTabId);
      }
    });

    this.elements.ctxDuplicate.addEventListener('click', () => {
      if (this.contextMenuTabId) {
        this.closeTabContextMenu();
        this.duplicateTab(this.contextMenuTabId);
      }
    });

    this.elements.ctxPin.addEventListener('click', () => {
      if (this.contextMenuTabId) {
        this.closeTabContextMenu();
        this.togglePinTab(this.contextMenuTabId);
      }
    });

    this.elements.ctxMute.addEventListener('click', () => {
      if (this.contextMenuTabId) {
        this.closeTabContextMenu();
        this.toggleMuteTab(this.contextMenuTabId);
      }
    });

    this.elements.ctxAddToGroup.addEventListener('click', () => {
      this.openGroupSubmenu();
    });

    this.elements.ctxAddToGroup.addEventListener('mouseenter', () => {
      this.openGroupSubmenu();
    });

    this.elements.ctxRemoveFromGroup.addEventListener('click', () => {
      if (this.contextMenuTabId) {
        this.closeTabContextMenu();
        this.removeTabFromGroup(this.contextMenuTabId);
      }
    });

    this.elements.ctxMoveToNewWindow.addEventListener('click', () => {
      if (this.contextMenuTabId) {
        this.closeTabContextMenu();
        this.moveTabToNewWindow(this.contextMenuTabId);
      }
    });

    this.elements.ctxCloseTab.addEventListener('click', () => {
      if (this.contextMenuTabId) {
        this.closeTabContextMenu();
        this.closeTab(this.contextMenuTabId);
      }
    });

    this.elements.ctxCloseOthers.addEventListener('click', () => {
      if (this.contextMenuTabId) {
        this.closeTabContextMenu();
        this.closeOtherTabs(this.contextMenuTabId);
      }
    });

    this.elements.ctxCloseToRight.addEventListener('click', () => {
      if (this.contextMenuTabId) {
        this.closeTabContextMenu();
        this.closeTabsToRight(this.contextMenuTabId);
      }
    });

    this.elements.ctxReopenClosed.addEventListener('click', () => {
      this.closeTabContextMenu();
      this.reopenClosedTab();
    });

    // Group submenu handlers
    this.elements.groupNewGroup.addEventListener('click', () => {
      this.openNewGroupPicker();
    });

    // New group color picker
    const colorButtons = this.elements.newGroupPicker.querySelectorAll('.group-color-btn');
    colorButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const color = (btn as HTMLElement).dataset.color as TabGroupColor;
        if (color && this.contextMenuTabId) {
          this.createGroupAndAddTab(this.contextMenuTabId, color);
        }
      });
    });

    // Click outside to close menus
    document.addEventListener('click', (e) => {
      if (this.tabContextMenuOpen) {
        const target = e.target as Node;
        if (!this.elements.tabContextMenu.contains(target) &&
            !this.elements.tabGroupSubmenu.contains(target) &&
            !this.elements.newGroupPicker.contains(target)) {
          this.closeTabContextMenu();
        }
      }
    });

    // Keyboard navigation within context menu
    this.elements.tabContextMenu.addEventListener('keydown', (e) => {
      if (!this.tabContextMenuOpen) return;

      const focusableItems = Array.from(
        this.elements.tabContextMenu.querySelectorAll('.context-menu-item:not(.hidden)')
      ) as HTMLElement[];

      const currentIndex = focusableItems.findIndex(item => item === document.activeElement);

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          const nextIndex = currentIndex < focusableItems.length - 1 ? currentIndex + 1 : 0;
          focusableItems[nextIndex].focus();
          break;
        case 'ArrowUp':
          e.preventDefault();
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : focusableItems.length - 1;
          focusableItems[prevIndex].focus();
          break;
        case 'Enter':
        case ' ':
          if (document.activeElement instanceof HTMLElement) {
            e.preventDefault();
            document.activeElement.click();
          }
          break;
        case 'Escape':
          e.preventDefault();
          this.closeTabContextMenu();
          break;
        case 'ArrowRight':
          // Open submenu if on "Add to group"
          if (document.activeElement === this.elements.ctxAddToGroup) {
            e.preventDefault();
            this.openGroupSubmenu();
            const firstGroupItem = this.elements.tabGroupSubmenu.querySelector('.context-menu-item') as HTMLElement;
            firstGroupItem?.focus();
          }
          break;
      }
    });
  }

  /**
   * Shows the tab context menu at the cursor position
   */
  private showTabContextMenu(tabId: string, x: number, y: number): void {
    this.contextMenuTabId = tabId;
    this.tabContextMenuOpen = true;

    // Get tab state to update menu items
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Update Pin label
    this.elements.ctxPinLabel.textContent = tab.isPinned ? 'Unpin' : 'Pin';

    // Update Mute label
    this.elements.ctxMuteLabel.textContent = tab.isMuted ? 'Unmute site' : 'Mute site';

    // Show/hide "Remove from group" based on whether tab is in a group
    if (tab.groupId) {
      this.elements.ctxRemoveFromGroup.classList.remove('hidden');
    } else {
      this.elements.ctxRemoveFromGroup.classList.add('hidden');
    }

    // Hide "Add to group" if tab is pinned (pinned tabs can't be grouped)
    if (tab.isPinned) {
      this.elements.ctxAddToGroup.classList.add('hidden');
    } else {
      this.elements.ctxAddToGroup.classList.remove('hidden');
    }

    // Check if reopen closed is available
    this.updateReopenClosedState();

    // Position menu within window bounds
    const menu = this.elements.tabContextMenu;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.add('open');

    // Adjust position if menu goes off screen
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 8}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 8}px`;
      }
    });

    // Focus first item for keyboard navigation
    requestAnimationFrame(() => {
      const firstItem = menu.querySelector('.context-menu-item') as HTMLElement;
      firstItem?.focus();
    });
  }

  /**
   * Closes the tab context menu and submenus
   */
  private closeTabContextMenu(): void {
    this.tabContextMenuOpen = false;
    this.contextMenuTabId = null;
    this.elements.tabContextMenu.classList.remove('open');
    this.closeGroupSubmenu();
    this.closeNewGroupPicker();
  }

  /**
   * Opens the group submenu
   */
  private openGroupSubmenu(): void {
    this.groupSubmenuOpen = true;
    this.renderExistingGroups();

    // Position relative to parent menu
    const parentRect = this.elements.ctxAddToGroup.getBoundingClientRect();
    this.elements.tabGroupSubmenu.style.left = `${parentRect.right + 4}px`;
    this.elements.tabGroupSubmenu.style.top = `${parentRect.top}px`;
    this.elements.tabGroupSubmenu.classList.add('open');

    // Adjust if goes off screen
    requestAnimationFrame(() => {
      const rect = this.elements.tabGroupSubmenu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        this.elements.tabGroupSubmenu.style.left = `${parentRect.left - rect.width - 4}px`;
      }
      if (rect.bottom > window.innerHeight) {
        this.elements.tabGroupSubmenu.style.top = `${window.innerHeight - rect.height - 8}px`;
      }
    });
  }

  /**
   * Closes the group submenu
   */
  private closeGroupSubmenu(): void {
    this.groupSubmenuOpen = false;
    this.elements.tabGroupSubmenu.classList.remove('open');
  }

  /**
   * Opens the new group color picker
   */
  private openNewGroupPicker(): void {
    this.closeGroupSubmenu();
    this.newGroupPickerOpen = true;

    const parentRect = this.elements.tabContextMenu.getBoundingClientRect();
    this.elements.newGroupPicker.style.left = `${parentRect.right + 4}px`;
    this.elements.newGroupPicker.style.top = `${parentRect.top}px`;
    this.elements.newGroupPicker.classList.add('open');

    // Focus the name input
    this.elements.groupNameInput.value = '';
    this.elements.groupNameInput.focus();
  }

  /**
   * Closes the new group picker
   */
  private closeNewGroupPicker(): void {
    this.newGroupPickerOpen = false;
    this.elements.newGroupPicker.classList.remove('open');
  }

  /**
   * Renders existing groups in the submenu
   */
  private renderExistingGroups(): void {
    this.elements.existingGroups.innerHTML = '';

    if (this.tabGroups.length === 0) {
      this.elements.groupDivider.classList.add('hidden');
      return;
    }

    this.elements.groupDivider.classList.remove('hidden');

    this.tabGroups.forEach(group => {
      const btn = document.createElement('button');
      btn.className = 'context-menu-item';
      btn.role = 'menuitem';
      btn.tabIndex = 0;
      btn.innerHTML = `
        <span class="group-color-indicator group-color-${group.color}"></span>
        <span class="context-menu-label">${this.escapeHtml(group.name || `${group.color} group`)}</span>
      `;
      btn.addEventListener('click', () => {
        if (this.contextMenuTabId) {
          this.addTabToGroup(this.contextMenuTabId, group.id);
          this.closeTabContextMenu();
        }
      });
      this.elements.existingGroups.appendChild(btn);
    });
  }

  /**
   * Updates the reopen closed tab menu item state
   */
  private async updateReopenClosedState(): Promise<void> {
    const { hasClosedTabs } = await window.jubilee.tabs.getClosedTabs();
    if (hasClosedTabs) {
      this.elements.ctxReopenClosed.classList.remove('disabled');
    } else {
      this.elements.ctxReopenClosed.classList.add('disabled');
    }
  }

  // ====================================================
  // Tab Context Menu Actions
  // ====================================================

  /**
   * Reload a specific tab
   */
  private reloadTab(tabId: string): void {
    const webview = this.webviews.get(tabId);
    if (webview) {
      webview.reload();
    }
  }

  /**
   * Duplicate a tab
   */
  private async duplicateTab(tabId: string): Promise<void> {
    await window.jubilee.tabs.duplicate(tabId);
  }

  /**
   * Toggle pin state of a tab
   */
  private async togglePinTab(tabId: string): Promise<void> {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    if (tab.isPinned) {
      await window.jubilee.tabs.unpin(tabId);
    } else {
      await window.jubilee.tabs.pin(tabId);
    }
  }

  /**
   * Toggle mute state of a tab
   */
  private async toggleMuteTab(tabId: string): Promise<void> {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    if (tab.isMuted) {
      await window.jubilee.tabs.unmute(tabId);
    } else {
      await window.jubilee.tabs.mute(tabId);
    }

    // Apply mute to webview
    const webview = this.webviews.get(tabId);
    if (webview) {
      try {
        (webview as any).setAudioMuted(!tab.isMuted);
      } catch {
        // setAudioMuted may not be available
      }
    }
  }

  /**
   * Close all other tabs
   */
  private async closeOtherTabs(tabId: string): Promise<void> {
    await window.jubilee.tabs.closeOthers(tabId);
    // Clean up webviews for closed tabs
    this.tabs.forEach(tab => {
      if (tab.id !== tabId) {
        const webview = this.webviews.get(tab.id);
        if (webview) {
          webview.remove();
          this.webviews.delete(tab.id);
        }
      }
    });
  }

  /**
   * Close tabs to the right
   */
  private async closeTabsToRight(tabId: string): Promise<void> {
    const tabIndex = this.tabs.findIndex(t => t.id === tabId);
    const tabsToClose = this.tabs.slice(tabIndex + 1).filter(t => !t.isPinned);

    await window.jubilee.tabs.closeToRight(tabId);

    // Clean up webviews for closed tabs
    tabsToClose.forEach(tab => {
      const webview = this.webviews.get(tab.id);
      if (webview) {
        webview.remove();
        this.webviews.delete(tab.id);
      }
    });
  }

  /**
   * Reopen the most recently closed tab
   */
  private async reopenClosedTab(): Promise<void> {
    await window.jubilee.tabs.reopenClosed();
  }

  /**
   * Move tab to a new window
   */
  private async moveTabToNewWindow(tabId: string): Promise<void> {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Only allow move if there's more than one tab
    if (this.tabs.length <= 1) {
      console.log('Cannot move last tab to new window');
      return;
    }

    await window.jubilee.tabs.moveToNewWindow(tabId);

    // Clean up webview
    const webview = this.webviews.get(tabId);
    if (webview) {
      webview.remove();
      this.webviews.delete(tabId);
    }
  }

  /**
   * Add tab to existing group
   */
  private async addTabToGroup(tabId: string, groupId: string): Promise<void> {
    const result = await window.jubilee.tabs.addToGroup(tabId, groupId);
    this.tabGroups = result.groups;
  }

  /**
   * Remove tab from its group
   */
  private async removeTabFromGroup(tabId: string): Promise<void> {
    const result = await window.jubilee.tabs.removeFromGroup(tabId);
    this.tabGroups = result.groups;
  }

  /**
   * Create a new group and add tab to it
   */
  private async createGroupAndAddTab(tabId: string, color: TabGroupColor): Promise<void> {
    const name = this.elements.groupNameInput.value.trim() || '';
    const result = await window.jubilee.tabs.createGroup(name, color);
    this.tabGroups = result.groups;

    // Add tab to the new group
    await this.addTabToGroup(tabId, result.groupId);
    this.closeTabContextMenu();
  }

  // ====================================================
  // Identity / Authentication Methods
  // ====================================================

  /**
   * Binds all identity-related event handlers
   */
  private bindIdentityEvents(): void {
    // Check if identity elements exist (may not exist in older HTML)
    if (!this.elements.signInModal) return;

    // Sign-in modal controls
    this.elements.closeSignInBtn?.addEventListener('click', () => this.closeSignInModal());
    this.elements.signInModal?.addEventListener('click', (e) => {
      if (e.target === this.elements.signInModal) {
        this.closeSignInModal();
      }
    });

    // Sign-in form submission
    this.elements.signInForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSignIn();
    });

    // Magic link button
    this.elements.magicLinkBtn?.addEventListener('click', () => this.handleMagicLinkRequest());

    // Back to sign-in from magic link confirmation
    this.elements.backToSignInBtn?.addEventListener('click', () => this.showSignInFormView());

    // Profile panel controls
    this.elements.closeProfileBtn?.addEventListener('click', () => this.closeProfilePanel());
    this.elements.profilePanel?.addEventListener('click', (e) => {
      if (e.target === this.elements.profilePanel) {
        this.closeProfilePanel();
      }
    });

    // Sign out button
    this.elements.signOutBtn?.addEventListener('click', () => this.handleSignOut());

    // Add profile button to nav bar (create if not exists)
    this.createProfileButton();
  }

  /**
   * Creates the profile/sign-in button in the navigation bar
   */
  private createProfileButton(): void {
    // Check if button already exists
    if (document.getElementById('profileBtn')) return;

    const navRight = document.querySelector('.nav-right');
    if (!navRight) return;

    // Create profile button
    const profileBtn = document.createElement('button');
    profileBtn.id = 'profileBtn';
    profileBtn.className = 'nav-btn profile-btn';
    profileBtn.setAttribute('aria-label', 'Profile');
    profileBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="6" r="3" stroke="currentColor" stroke-width="1.5"/>
        <path d="M3 16C3 13.2386 5.23858 11 8 11H10C12.7614 11 15 13.2386 15 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    `;

    // Insert before the settings button
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      navRight.insertBefore(profileBtn, settingsBtn);
    } else {
      navRight.appendChild(profileBtn);
    }

    // Bind click handler
    profileBtn.addEventListener('click', () => this.handleProfileButtonClick());
  }

  /**
   * Loads the current authentication session
   */
  private async loadAuthSession(): Promise<void> {
    try {
      const session = await window.jubilee.identity.getSession();
      this.authSession = session;
      this.updateAuthUI();
    } catch (error) {
      console.error('Failed to load auth session:', error);
      // Default to signed out state
      this.authSession = {
        state: 'signed_out',
        profile: null,
        isAuthenticated: false,
        canAccessParticipation: false,
      };
      this.updateAuthUI();
    }
  }

  /**
   * Handles session changes from the main process
   */
  private handleSessionChanged(session: AuthSession): void {
    this.authSession = session;
    this.updateAuthUI();

    // If sign-in was successful and modal is open, close it
    if (session.isAuthenticated && this.signInModalOpen) {
      this.closeSignInModal();
    }
  }

  /**
   * Updates the UI based on current authentication state
   */
  private updateAuthUI(): void {
    const profileBtn = document.getElementById('profileBtn');
    if (!profileBtn) return;

    if (this.authSession.isAuthenticated && this.authSession.profile) {
      // Show authenticated state
      profileBtn.classList.add('authenticated');
      profileBtn.classList.remove('sign-in-prompt-btn');

      // Update button to show avatar or initial
      const initial = this.authSession.profile.displayName?.charAt(0).toUpperCase() ||
                     this.authSession.profile.email?.charAt(0).toUpperCase() || '?';

      if (this.authSession.profile.avatarUrl) {
        profileBtn.innerHTML = `<img src="${this.escapeHtml(this.authSession.profile.avatarUrl)}" alt="" class="profile-avatar-small">`;
      } else {
        profileBtn.innerHTML = `<span class="profile-initial-small">${initial}</span>`;
      }
      profileBtn.setAttribute('aria-label', `Profile: ${this.authSession.profile.displayName || this.authSession.profile.email}`);
    } else {
      // Show signed out state
      profileBtn.classList.remove('authenticated');
      profileBtn.classList.add('sign-in-prompt-btn');
      profileBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="6" r="3" stroke="currentColor" stroke-width="1.5"/>
          <path d="M3 16C3 13.2386 5.23858 11 8 11H10C12.7614 11 15 13.2386 15 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      `;
      profileBtn.setAttribute('aria-label', 'Sign in');
    }

    // Update body class for mode-aware styling
    document.body.classList.toggle('authenticated', this.authSession.isAuthenticated);
  }

  /**
   * Handles clicks on the profile button
   */
  private handleProfileButtonClick(): void {
    if (this.authSession.isAuthenticated) {
      this.openProfilePanel();
    } else {
      this.showSignInModal();
    }
  }

  /**
   * Shows the sign-in modal
   */
  private showSignInModal(feature?: ParticipationFeature): void {
    if (!this.elements.signInModal) return;

    this.signInModalOpen = true;
    this.pendingFeature = feature || null;

    // Update subtitle based on feature requirement
    if (feature && this.elements.signInSubtitle) {
      const featureNames: Record<ParticipationFeature, string> = {
        'round_table': 'Round Table discussions',
        'chat': 'chat features',
        'video': 'video calls',
        'prayer_rooms': 'prayer rooms',
        'domain_management': 'domain management',
        'saved_notes': 'saved notes',
        'cross_device_sync': 'cross-device sync',
        'community_moderation': 'community moderation',
      };
      this.elements.signInSubtitle.textContent = `Sign in to access ${featureNames[feature] || 'this feature'}`;
    } else if (this.elements.signInSubtitle) {
      this.elements.signInSubtitle.textContent = 'Sign in to your Jubilee account';
    }

    // Reset form state
    this.showSignInFormView();
    this.elements.signInEmail.value = '';
    this.elements.signInPassword.value = '';
    this.hideSignInError();

    // Show modal
    this.elements.signInModal.classList.add('visible');

    // Focus email input
    requestAnimationFrame(() => {
      this.elements.signInEmail?.focus();
    });
  }

  /**
   * Closes the sign-in modal
   */
  private closeSignInModal(): void {
    if (!this.elements.signInModal) return;

    this.signInModalOpen = false;
    this.pendingFeature = null;
    this.elements.signInModal.classList.remove('visible');
  }

  /**
   * Shows the sign-in form view (hides magic link sent view)
   */
  private showSignInFormView(): void {
    if (this.elements.signInForm) {
      this.elements.signInForm.classList.remove('hidden');
    }
    if (this.elements.magicLinkSent) {
      this.elements.magicLinkSent.classList.add('hidden');
    }
  }

  /**
   * Shows the magic link sent view
   */
  private showMagicLinkSentView(email: string): void {
    if (this.elements.signInForm) {
      this.elements.signInForm.classList.add('hidden');
    }
    if (this.elements.magicLinkSent) {
      this.elements.magicLinkSent.classList.remove('hidden');
    }
    if (this.elements.magicLinkEmail) {
      this.elements.magicLinkEmail.textContent = email;
    }
  }

  /**
   * Shows a sign-in error message
   */
  private showSignInError(message: string): void {
    if (this.elements.signInError) {
      this.elements.signInError.classList.remove('hidden');
    }
    if (this.elements.signInErrorText) {
      this.elements.signInErrorText.textContent = message;
    }
  }

  /**
   * Hides the sign-in error message
   */
  private hideSignInError(): void {
    if (this.elements.signInError) {
      this.elements.signInError.classList.add('hidden');
    }
  }

  /**
   * Handles the sign-in form submission
   */
  private async handleSignIn(): Promise<void> {
    const email = this.elements.signInEmail?.value.trim();
    const password = this.elements.signInPassword?.value;

    if (!email || !password) {
      this.showSignInError('Please enter your email and password');
      return;
    }

    // Disable form while signing in
    this.setSignInFormLoading(true);
    this.hideSignInError();

    try {
      const response = await window.jubilee.identity.signIn({
        email,
        password,
      });

      if (response.success) {
        // Session will be updated via onSessionChanged callback
        this.closeSignInModal();
      } else {
        const errorMessage = response.error?.message || 'Sign-in failed. Please try again.';
        this.showSignInError(errorMessage);
      }
    } catch (error) {
      console.error('Sign-in error:', error);
      this.showSignInError('An unexpected error occurred. Please try again.');
    } finally {
      this.setSignInFormLoading(false);
    }
  }

  /**
   * Handles magic link request
   */
  private async handleMagicLinkRequest(): Promise<void> {
    const email = this.elements.signInEmail?.value.trim();

    if (!email) {
      this.showSignInError('Please enter your email address');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      this.showSignInError('Please enter a valid email address');
      return;
    }

    this.setSignInFormLoading(true);
    this.hideSignInError();

    try {
      const response = await window.jubilee.identity.signIn({
        email,
        useMagicLink: true,
      });

      if (response.success || response.magicLinkSent) {
        this.showMagicLinkSentView(email);
      } else {
        const errorMessage = response.error?.message || 'Failed to send magic link. Please try again.';
        this.showSignInError(errorMessage);
      }
    } catch (error) {
      console.error('Magic link request error:', error);
      this.showSignInError('An unexpected error occurred. Please try again.');
    } finally {
      this.setSignInFormLoading(false);
    }
  }

  /**
   * Sets the loading state of the sign-in form
   */
  private setSignInFormLoading(loading: boolean): void {
    if (this.elements.signInSubmitBtn) {
      this.elements.signInSubmitBtn.disabled = loading;
      this.elements.signInSubmitBtn.textContent = loading ? 'Signing in...' : 'Sign In';
    }
    if (this.elements.magicLinkBtn) {
      this.elements.magicLinkBtn.disabled = loading;
    }
    if (this.elements.signInEmail) {
      this.elements.signInEmail.disabled = loading;
    }
    if (this.elements.signInPassword) {
      this.elements.signInPassword.disabled = loading;
    }
  }

  /**
   * Opens the profile panel
   */
  private openProfilePanel(): void {
    if (!this.elements.profilePanel) return;

    this.profilePanelOpen = true;
    this.updateProfilePanelContent();
    this.elements.profilePanel.classList.add('open');
  }

  /**
   * Closes the profile panel
   */
  private closeProfilePanel(): void {
    if (!this.elements.profilePanel) return;

    this.profilePanelOpen = false;
    this.elements.profilePanel.classList.remove('open');
  }

  /**
   * Updates the profile panel content with current user info
   */
  private updateProfilePanelContent(): void {
    if (!this.authSession.profile) return;

    const profile = this.authSession.profile;
    const initial = profile.displayName?.charAt(0).toUpperCase() ||
                   profile.email?.charAt(0).toUpperCase() || '?';

    // Update avatar
    if (this.elements.profilePanelAvatar) {
      if (profile.avatarUrl) {
        this.elements.profilePanelAvatar.innerHTML = `<img src="${this.escapeHtml(profile.avatarUrl)}" alt="">`;
      } else {
        this.elements.profilePanelAvatar.innerHTML = '';
      }
    }

    // Update initial (shown when no avatar)
    if (this.elements.profilePanelInitial) {
      this.elements.profilePanelInitial.textContent = initial;
      this.elements.profilePanelInitial.style.display = profile.avatarUrl ? 'none' : 'flex';
    }

    // Update name and email
    if (this.elements.profilePanelName) {
      this.elements.profilePanelName.textContent = profile.displayName || 'Jubilee User';
    }
    if (this.elements.profilePanelEmail) {
      this.elements.profilePanelEmail.textContent = profile.email;
    }
  }

  /**
   * Handles sign-out
   */
  private async handleSignOut(): Promise<void> {
    this.closeProfilePanel();

    try {
      await window.jubilee.identity.signOut();
      // Session will be updated via onSessionChanged callback
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  }

  /**
   * Checks if the user has permission for a participation feature
   * Returns true if permitted, false if not (and may trigger sign-in)
   */
  private async checkParticipationPermission(feature: ParticipationFeature): Promise<boolean> {
    try {
      const result = await window.jubilee.identity.checkPermission(feature);

      if (!result.allowed) {
        if (result.requiresAuth) {
          // Trigger sign-in with feature context
          this.showSignInModal(feature);
        }
        return false;
      }

      return true;
    } catch (error) {
      console.error('Permission check error:', error);
      return false;
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const ui = new JubileeBrowserUI();
  ui.initialize().catch(console.error);
});
