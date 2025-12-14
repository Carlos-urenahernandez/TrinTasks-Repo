// UI Controller - Main orchestrator that ties all modules together

import { ICalParser } from './ical-parser.js';
import { ThemeManager } from './theme-manager.js';
import { EventRenderer } from './event-renderer.js';
import { WeekView, getEventsForDate } from './week-view.js';
import { Sidebar } from './sidebar.js';
import { DEFAULT_SUBJECT_COLORS } from './constants.js';
import {
  saveToStorage,
  loadSavedData,
  mergeCompletionStatus,
  togglePinAssignment,
  toggleAssignmentComplete,
  toggleAssignmentInProgress,
  listenForStorageChanges,
  refreshLocally,
  clearAllReminderAlarms,
  clearAllData,
  loadSettings,
  saveSettings,
  saveSubjectTags,
  unlockWeather,
  saveWeather
} from './storage-manager.js';

export class UIController {
  constructor() {
    console.log('UIController constructor called');

    // DOM element references
    this.parseBtn = document.getElementById('parseBtn');
    this.icalLinkInput = document.getElementById('icalLink');
    this.loadingSpinner = document.getElementById('loadingSpinner');
    this.errorMessage = document.getElementById('errorMessage');
    this.mainContent = document.getElementById('mainContent');
    this.eventsList = document.getElementById('eventsList');
    this.eventsContainer = document.getElementById('eventsContainer');
    this.filterSelect = document.getElementById('filterSelect');
    this.filterCurrent = document.getElementById('filterCurrent');
    this.filterOptions = document.getElementById('filterOptions');

    // Week view elements
    this.weekView = document.getElementById('weekView');
    this.weekTitle = document.getElementById('weekTitle');
    this.weekDays = document.getElementById('weekDays');
    this.prevWeekBtn = document.getElementById('prevWeek');
    this.nextWeekBtn = document.getElementById('nextWeek');
    this.selectedDayTitle = document.getElementById('selectedDayTitle');

    // Header elements
    this.headerTitle = document.getElementById('headerTitle');
    this.settingsBtn = document.getElementById('settingsBtn');

    // View elements
    this.mainView = document.getElementById('mainView');
    this.settingsView = document.getElementById('settingsView');

    // Settings elements
    this.settingsIcalLink = document.getElementById('settingsIcalLink');
    this.refreshCalendarBtn = document.getElementById('refreshCalendarBtn');
    this.clearDataBtn = document.getElementById('clearDataBtn');
    this.autoRefreshCheckbox = document.getElementById('autoRefresh');
    this.enableRemindersCheckbox = document.getElementById('enableReminders');
    this.reminderHoursSelect = document.getElementById('reminderHours');
    this.themeOptions = document.getElementById('themeOptions');

    // Subject tags elements
    this.subjectTagsDiv = document.getElementById('subjectTags');

    // Setup view elements
    this.setupView = document.getElementById('setupView');
    this.setupThemes = document.getElementById('setupThemes');
    this.setupUIStyles = document.getElementById('setupUIStyles');
    this.setupStyleLabel = document.getElementById('setupStyleLabel');
    this.settingsUIStyles = document.getElementById('settingsUIStyles');

    // Major assignments sidebar elements
    this.majorAssignmentsBar = document.getElementById('majorAssignmentsBar');
    this.majorListDiv = document.getElementById('majorList');
    this.showMajorAssignmentsCheckbox = document.getElementById('showMajorAssignments');

    // Easter egg elements
    this.logoEgg = document.getElementById('logoEgg');
    this.easterEggModal = document.getElementById('easterEggModal');
    this.easterEggClose = document.getElementById('easterEggClose');
    this.easterEggConfetti = document.getElementById('easterEggConfetti');

    // Weather selector elements
    this.weatherSelector = document.getElementById('weatherSelector');
    this.weatherBtn = document.getElementById('weatherBtn');
    this.weatherIcon = document.getElementById('weatherIcon');
    this.weatherOptions = document.getElementById('weatherOptions');

    // State
    this.events = [];
    this.subjectTags = {};
    this.pinnedAssignments = {};
    this.isSettingsView = false;
    this.filterMode = 'active'; // Default to showing uncompleted
    this.autoRefreshInterval = null;
    this.isAnimating = false; // Prevent re-render during animations
    this.weatherUnlocked = false;
    this.easterEggBuffer = '';

    // Initialize modules
    this.themeManager = new ThemeManager();

    this.eventRenderer = new EventRenderer({
      onToggleComplete: (event, element) => this.handleToggleComplete(event, element),
      onToggleInProgress: (event, element) => this.handleToggleInProgress(event, element),
      onTogglePin: (event, pinBtn) => this.handleTogglePin(event, pinBtn),
      getSubjectFromTitle: (title) => this.getSubjectFromTitle(title),
      themeManager: this.themeManager
    });

    this.weekViewController = new WeekView({
      weekTitle: this.weekTitle,
      weekDays: this.weekDays,
      selectedDayTitle: this.selectedDayTitle,
      eventsContainer: this.eventsContainer,
      onDaySelect: () => this.showEventsForSelectedDay(),
      getEventsForDate: (date) => getEventsForDate(this.events, date)
    });

    this.sidebar = new Sidebar({
      majorAssignmentsBar: this.majorAssignmentsBar,
      majorListDiv: this.majorListDiv,
      showMajorAssignmentsCheckbox: this.showMajorAssignmentsCheckbox,
      onUnpin: (eventId) => this.handleUnpin(eventId),
      onNavigateToDate: (date) => this.navigateToDate(date),
      onToggleComplete: (event, element) => this.handleSidebarToggleComplete(event, element),
      onToggleInProgress: (event, element) => this.handleSidebarToggleInProgress(event, element)
    });

    this.setupEventListeners();
    this.initialize();
  }

  async initialize() {
    await this.loadSettingsFromStorage();
    await this.loadSubjectTags();
    this.listenForStorageChanges();

    const hasData = await this.loadSavedDataFromStorage();
    if (hasData) {
      this.requestBackgroundRefresh();
    }
  }

  setupEventListeners() {
    this.parseBtn.addEventListener('click', () => this.handleParse());
    this.icalLinkInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleParse();
      }
    });
    this.prevWeekBtn.addEventListener('click', () => this.weekViewController.navigateWeek(-1));
    this.nextWeekBtn.addEventListener('click', () => this.weekViewController.navigateWeek(1));

    // Settings event listeners
    this.settingsBtn.addEventListener('click', () => this.openSettings());
    this.headerTitle.addEventListener('click', () => {
      if (this.isSettingsView) {
        this.closeSettings();
      }
    });
    if (this.refreshCalendarBtn) {
      this.refreshCalendarBtn.addEventListener('click', () => this.handleManualRefresh());
    }
    this.clearDataBtn.addEventListener('click', () => this.handleClearAllData());

    // Auto-save on settings change
    if (this.autoRefreshCheckbox) {
      this.autoRefreshCheckbox.addEventListener('change', () => this.handleSaveSettings());
    }
    this.enableRemindersCheckbox.addEventListener('change', () => this.handleSaveSettings());
    this.reminderHoursSelect.addEventListener('change', () => this.handleSaveSettings());

    if (this.showMajorAssignmentsCheckbox) {
      this.showMajorAssignmentsCheckbox.addEventListener('change', () => {
        this.sidebar.toggleVisibility(this.showMajorAssignmentsCheckbox.checked);
        this.handleSaveSettings();
        // Re-render events to show/hide pin buttons
        this.showEventsForSelectedDay();
      });
    }

    // Filter selector click
    if (this.filterOptions) {
      this.filterOptions.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.getAttribute('data-mode');
          this.setFilterMode(mode);
        });
      });
    }

    // Theme selection (settings view)
    if (this.themeOptions) {
      this.themeOptions.querySelectorAll('.theme-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          const theme = btn.getAttribute('data-theme-option');
          if (theme) {
            this.themeManager.applyTheme(theme);
            this.updateThemePillSelection();
            this.updateWeatherSelectorVisibility();
            this.handleSaveSettings();
          }
        });
      });
    }

    // Setup UI style selection (initial setup view)
    if (this.setupUIStyles) {
      this.setupUIStyles.querySelectorAll('.ui-style-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const style = btn.getAttribute('data-style');
          if (style) {
            this.themeManager.applyUIStyle(style);
            // Hide style options and show color options
            this.setupUIStyles.classList.add('hidden');
            if (this.setupThemes) {
              this.setupThemes.classList.remove('hidden');
            }
            // Update label text
            if (this.setupStyleLabel) {
              this.setupStyleLabel.textContent = 'Choose a color';
            }
          }
        });
      });
    }

    // Setup color selection (theme buttons)
    if (this.setupThemes) {
      this.setupThemes.querySelectorAll('.setup-theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const theme = btn.getAttribute('data-theme');
          if (theme) {
            this.setupThemes.querySelectorAll('.setup-theme-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            this.themeManager.applyTheme(theme);
          }
        });
      });
    }

    // Settings UI style selection
    if (this.settingsUIStyles) {
      this.settingsUIStyles.querySelectorAll('.ui-style-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const style = btn.getAttribute('data-style');
          if (style) {
            this.settingsUIStyles.querySelectorAll('.ui-style-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            this.themeManager.applyUIStyle(style);
            this.handleSaveSettings();
          }
        });
      });
    }

    // Easter egg keyboard listener
    this.setupEasterEgg();

    // Easter egg modal close button
    if (this.easterEggClose) {
      this.easterEggClose.addEventListener('click', () => {
        this.closeEasterEggModal();
      });
    }

    // Close modal when clicking outside
    if (this.easterEggModal) {
      this.easterEggModal.addEventListener('click', (e) => {
        if (e.target === this.easterEggModal) {
          this.closeEasterEggModal();
        }
      });
    }

    // Weather selector event listeners
    this.setupWeatherSelector();

  }

  async handleParse() {
    const url = this.icalLinkInput.value.trim();

    if (!url) {
      this.showError('Please enter a valid URL');
      return;
    }

    // Validate URL format
    try {
      if (url.startsWith('webcal://') || url.startsWith('webcals://')) {
        if (url.length < 12) {
          throw new Error('Invalid webcal URL');
        }
      } else {
        new URL(url);
      }
    } catch {
      this.showError('Please enter a valid URL (webcal://, http://, or https://)');
      return;
    }

    this.showLoading(true);
    this.clearError();

    try {
      const events = await ICalParser.fetchAndParse(url);
      this.displayEvents(events);
      await saveToStorage(url, events);
      // Save the selected theme from setup
      await this.handleSaveSettings();
    } catch (error) {
      console.error('Parse error:', error);
      this.showError(error.message);
      this.hideEventsList();
    } finally {
      this.showLoading(false);
    }
  }

  displayEvents(events) {
    if (!events || events.length === 0) {
      this.showError('No events found in the iCal file');
      return;
    }

    this.events = events;
    this.ensureSubjectTags(events);

    // Update sidebar and renderer
    this.sidebar.updateData({ events, pinnedAssignments: this.pinnedAssignments });
    this.updateEventRendererOptions();

    // Hide setup view and show main content
    if (this.setupView) {
      this.setupView.classList.add('hidden');
    }
    this.mainContent.classList.remove('hidden');

    // Show week view and events for selected day
    this.weekViewController.renderWeekView();
    this.showEventsForSelectedDay();
    this.sidebar.update();
  }

  showEventsForSelectedDay() {
    this.updateEventRendererOptions();
    this.weekViewController.showEventsForSelectedDay(
      (event) => this.eventRenderer.createEventElement(event)
    );
  }

  updateEventRendererOptions() {
    const sidebarEnabled = this.showMajorAssignmentsCheckbox && this.showMajorAssignmentsCheckbox.checked;
    this.eventRenderer.updateOptions({
      pinnedAssignments: this.pinnedAssignments,
      sidebarEnabled
    });
  }

  async handleToggleComplete(event, eventElement) {
    // Check if we're marking as complete (not already completed)
    const willComplete = !event.isCompleted;

    // Set flag BEFORE async call to prevent storage listener from interrupting
    if (willComplete && eventElement) {
      this.isAnimating = true;
    }

    const result = await toggleAssignmentComplete(event);
    event.isCompleted = result.isCompleted;
    event.completedDate = result.completedDate;

    if (result.isCompleted && eventElement) {
      // Run the animation
      this.eventRenderer.animateCompletion(eventElement);
      setTimeout(() => {
        this.isAnimating = false;
        this.weekViewController.renderWeekView();
        this.showEventsForSelectedDay();
      }, 1200);
    } else {
      // Uncompleting - reset animation state and re-render immediately
      this.isAnimating = false;
      if (eventElement) {
        eventElement.classList.remove('completing');
        const cb = eventElement.querySelector('.event-checkbox');
        if (cb) cb.classList.remove('checked-anim');
      }
      this.weekViewController.renderWeekView();
      this.showEventsForSelectedDay();
    }
  }

  async handleSidebarToggleComplete(event, itemElement) {
    const result = await toggleAssignmentComplete(event);
    event.isCompleted = result.isCompleted;
    event.completedDate = result.completedDate;
    event.isInProgress = false;

    // Update the sidebar item visually
    if (itemElement) {
      const checkbox = itemElement.querySelector('.sidebar-checkbox');
      const inProgressBtn = itemElement.querySelector('.sidebar-in-progress');
      if (result.isCompleted) {
        itemElement.classList.add('completed');
        itemElement.classList.remove('in-progress');
        if (checkbox) {
          checkbox.classList.add('checked');
          checkbox.innerHTML = '✓';
          checkbox.title = 'Mark incomplete';
        }
        if (inProgressBtn) {
          inProgressBtn.classList.remove('active');
          inProgressBtn.title = 'Mark in-progress';
        }
      } else {
        itemElement.classList.remove('completed');
        if (checkbox) {
          checkbox.classList.remove('checked');
          checkbox.innerHTML = '';
          checkbox.title = 'Mark complete';
        }
      }
    }

    // Re-render main views to stay in sync
    this.weekViewController.renderWeekView();
    this.showEventsForSelectedDay();
  }

  async handleToggleInProgress(event, eventElement) {
    const result = await toggleAssignmentInProgress(event);
    event.isInProgress = result.isInProgress;
    event.inProgressDate = result.inProgressDate;
    event.isCompleted = false;
    event.completedDate = null;

    // Update the event element visually
    if (eventElement) {
      const inProgressBtn = eventElement.querySelector('.in-progress-btn');
      const checkbox = eventElement.querySelector('.event-checkbox');

      if (result.isInProgress) {
        eventElement.classList.add('in-progress');
        eventElement.classList.remove('completed');
        if (inProgressBtn) {
          inProgressBtn.classList.add('active');
          inProgressBtn.title = 'Remove in-progress';
        }
        if (checkbox) {
          checkbox.checked = false;
        }
      } else {
        eventElement.classList.remove('in-progress');
        if (inProgressBtn) {
          inProgressBtn.classList.remove('active');
          inProgressBtn.title = 'Mark in-progress';
        }
      }
    }

    // Re-render views to update counts and styling
    this.weekViewController.renderWeekView();
    this.showEventsForSelectedDay();
    this.sidebar.update();
  }

  async handleSidebarToggleInProgress(event, itemElement) {
    const result = await toggleAssignmentInProgress(event);
    event.isInProgress = result.isInProgress;
    event.inProgressDate = result.inProgressDate;
    event.isCompleted = false;
    event.completedDate = null;

    // Update the sidebar item visually
    if (itemElement) {
      const inProgressBtn = itemElement.querySelector('.sidebar-in-progress');
      const checkbox = itemElement.querySelector('.sidebar-checkbox');

      if (result.isInProgress) {
        itemElement.classList.add('in-progress');
        itemElement.classList.remove('completed');
        if (inProgressBtn) {
          inProgressBtn.classList.add('active');
          inProgressBtn.title = 'Remove in-progress';
        }
        if (checkbox) {
          checkbox.classList.remove('checked');
          checkbox.innerHTML = '';
          checkbox.title = 'Mark complete';
        }
      } else {
        itemElement.classList.remove('in-progress');
        if (inProgressBtn) {
          inProgressBtn.classList.remove('active');
          inProgressBtn.title = 'Mark in-progress';
        }
      }
    }

    // Re-render main views to stay in sync
    this.weekViewController.renderWeekView();
    this.showEventsForSelectedDay();
  }

  async handleTogglePin(event, pinBtn) {
    const result = await togglePinAssignment(event, this.pinnedAssignments);
    this.pinnedAssignments = result.pinnedAssignments;

    if (pinBtn) {
      pinBtn.classList.toggle('pinned', result.isPinned);
      pinBtn.title = result.isPinned ? 'Unpin from sidebar' : 'Pin to sidebar';
    }

    this.sidebar.updateData({ pinnedAssignments: this.pinnedAssignments });
    this.sidebar.update();
  }

  async handleUnpin(eventId) {
    delete this.pinnedAssignments[eventId];
    await chrome.storage.local.set({ pinnedAssignments: this.pinnedAssignments });
    this.sidebar.updateData({ pinnedAssignments: this.pinnedAssignments });
    this.sidebar.update();
    this.showEventsForSelectedDay();
  }

  navigateToDate(date) {
    this.weekViewController.selectDate(date);
    this.weekViewController.renderWeekView();
    this.showEventsForSelectedDay();
  }

  setFilterMode(mode) {
    if (!mode) return;
    this.filterMode = mode;
    this.weekViewController.setFilterMode(mode);
    const label = mode === 'active' ? 'Uncompleted' : mode === 'completed' ? 'Completed' : 'All';
    if (this.filterCurrent) this.filterCurrent.textContent = label;
    this.showEventsForSelectedDay();
  }

  // Storage methods
  async loadSavedDataFromStorage() {
    const data = await loadSavedData();
    if (data) {
      this.icalLinkInput.value = data.url;
      this.settingsIcalLink.value = data.url;
      this.pinnedAssignments = data.pinnedAssignments || {};
      this.displayEvents(data.events);

      if (data.lastRefreshSummary) {
        this.eventRenderer.showRefreshToast(data.lastRefreshSummary);
      }

      console.log('Loaded cached data from storage');
      return true;
    }
    return false;
  }

  listenForStorageChanges() {
    listenForStorageChanges(async (changes, areaName) => {
      if (areaName !== 'local') return;

      // Don't re-render during completion animation
      if (this.isAnimating) return;

      const eventsChanged = changes.events || changes.completedAssignments || changes.inProgressAssignments || changes.icalUrl;
      if (eventsChanged) {
        await this.updateEventsFromStorage();
      }

      if (changes.lastRefreshSummary && changes.lastRefreshSummary.newValue) {
        this.eventRenderer.showRefreshToast(changes.lastRefreshSummary.newValue);
      }

      if (changes.theme && changes.theme.newValue) {
        this.themeManager.applyTheme(changes.theme.newValue);
        this.updateThemePillSelection();
      }

      if (changes.uiStyle && changes.uiStyle.newValue) {
        this.themeManager.applyUIStyle(changes.uiStyle.newValue);
        this.updateUIStyleSelection();
      }
    });
  }

  async updateEventsFromStorage() {
    try {
      const data = await chrome.storage.local.get(['events', 'completedAssignments', 'inProgressAssignments', 'icalUrl', 'pinnedAssignments']);
      if (data.icalUrl) {
        this.icalLinkInput.value = data.icalUrl;
        this.settingsIcalLink.value = data.icalUrl;
      }
      this.pinnedAssignments = data.pinnedAssignments || {};
      const merged = mergeCompletionStatus(data.events || [], data.completedAssignments, data.inProgressAssignments);
      if (merged.length > 0) {
        this.displayEvents(merged);
      }
    } catch (error) {
      console.error('Failed to update events from storage:', error);
    }
  }

  async requestBackgroundRefresh() {
    const currentUrl = this.icalLinkInput.value.trim() || this.settingsIcalLink.value.trim();
    if (!currentUrl) {
      this.showError('Please add an iCal link first');
      return;
    }
    await chrome.storage.local.set({ icalUrl: currentUrl });

    const response = await new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ action: 'refreshCalendarNow', icalUrl: currentUrl }, (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(resp);
          }
        });
      } catch (err) {
        resolve({ success: false, error: err?.message || 'Unable to contact background' });
      }
    });

    if (!response || !response.success) {
      console.warn('Background refresh failed or no response', response && response.error);
      try {
        await refreshLocally(currentUrl);
        await this.updateEventsFromStorage();
      } catch (err) {
        this.showError(response && response.error ? response.error : 'Could not refresh calendar. Please try again.');
        return;
      }
    } else {
      await this.updateEventsFromStorage();
    }
  }

  async handleManualRefresh() {
    try {
      if (this.refreshCalendarBtn) {
        this.refreshCalendarBtn.disabled = true;
        this.refreshCalendarBtn.textContent = 'Refreshing...';
      }
      this.showLoading(true);
      await this.requestBackgroundRefresh();
    } finally {
      this.showLoading(false);
      if (this.refreshCalendarBtn) {
        this.refreshCalendarBtn.disabled = false;
        this.refreshCalendarBtn.textContent = 'Refresh Calendar';
      }
    }
  }

  // Settings methods
  openSettings() {
    this.settingsIcalLink.value = this.icalLinkInput.value;
    this.displaySubjectTags();

    // Clear easter egg text when entering settings
    if (this.logoEgg) {
      this.logoEgg.textContent = '';
      this.logoEgg.classList.remove('caret-active');
    }
    this.easterEggBuffer = '';
    this.easterEggActive = false;

    this.mainView.classList.add('hidden');
    this.settingsView.classList.remove('hidden');
    this.headerTitle.textContent = '← Settings';
    this.headerTitle.style.cursor = 'pointer';
    this.settingsBtn.style.display = 'none';
    this.isSettingsView = true;

    // Hide weather selector in settings view
    this.updateWeatherSelectorVisibility();
  }

  closeSettings() {
    const newUrl = this.settingsIcalLink.value.trim();
    if (newUrl && newUrl !== this.icalLinkInput.value) {
      this.icalLinkInput.value = newUrl;
      this.handleParse();
    }

    this.settingsView.classList.add('hidden');
    this.mainView.classList.remove('hidden');
    // Restore header with easter egg structure (no 'ity' visible after unlocking)
    this.headerTitle.innerHTML = `<span id="logoTrin">Trin</span><span id="logoEgg"></span><span id="logoTasks">Tasks</span>`;
    this.logoEgg = document.getElementById('logoEgg');
    this.headerTitle.style.cursor = 'default';
    this.settingsBtn.style.display = 'block';
    this.isSettingsView = false;

    // Show weather selector if unlocked
    this.updateWeatherSelectorVisibility();
  }

  async loadSettingsFromStorage() {
    const settings = await loadSettings();

    this.enableRemindersCheckbox.checked = settings.enableReminders;
    this.reminderHoursSelect.value = String(settings.reminderHours);

    this.themeManager.applyTheme(settings.theme);
    this.themeManager.applyUIStyle(settings.uiStyle);
    this.updateThemePillSelection();
    this.updateUIStyleSelection();

    if (this.showMajorAssignmentsCheckbox) {
      this.showMajorAssignmentsCheckbox.checked = settings.showMajorAssignmentsBar;
    }
    this.sidebar.toggleVisibility(settings.showMajorAssignmentsBar);

    this.subjectTags = settings.subjectTags;

    // Check if weather effects are unlocked (easter egg)
    this.weatherUnlocked = settings.weatherUnlocked;
    if (this.weatherUnlocked) {
      // Add body class to disable easter egg hover
      document.body.classList.add('weather-unlocked');
      // Enable weather effects
      this.themeManager.enableWeather();
      this.themeManager.setWeather(settings.weather);
      this.updateWeatherIcon(settings.weather);
      this.updateWeatherSelection(settings.weather);
    }

    // Update weather selector visibility
    this.updateWeatherSelectorVisibility();
  }

  async handleSaveSettings() {
    const settings = {
      autoRefresh: this.autoRefreshCheckbox ? this.autoRefreshCheckbox.checked : false,
      enableReminders: this.enableRemindersCheckbox.checked,
      reminderHours: parseInt(this.reminderHoursSelect.value, 10) || 24,
      theme: this.themeManager.currentTheme,
      uiStyle: this.themeManager.currentUIStyle,
      showMajorAssignmentsBar: this.showMajorAssignmentsCheckbox ? this.showMajorAssignmentsCheckbox.checked : false
    };

    await saveSettings(settings);

    if (!settings.enableReminders) {
      await clearAllReminderAlarms();
    }

    if (settings.autoRefresh) {
      this.setupAutoRefresh();
    } else if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }

    this.sidebar.update();
  }

  async handleClearAllData() {
    if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      await clearAllData();
      this.events = [];
      this.subjectTags = {};
      this.pinnedAssignments = {};
      this.icalLinkInput.value = '';
      this.settingsIcalLink.value = '';
      this.mainContent.classList.add('hidden');
      // Show setup view again
      if (this.setupView) {
        this.setupView.classList.remove('hidden');
      }
      if (this.autoRefreshCheckbox) this.autoRefreshCheckbox.checked = false;
      this.enableRemindersCheckbox.checked = true;
      this.reminderHoursSelect.value = '24';
      if (this.showMajorAssignmentsCheckbox) {
        this.showMajorAssignmentsCheckbox.checked = false;
      }
      this.sidebar.toggleVisibility(false);
      this.loadSubjectTags();
      this.themeManager.applyTheme('slate');
      this.themeManager.applyUIStyle('neobrutalism');
      this.updateThemePillSelection();
      this.updateUIStyleSelection();
      // Reset setup view to initial state
      if (this.setupUIStyles) {
        this.setupUIStyles.classList.remove('hidden');
        this.setupUIStyles.querySelectorAll('.ui-style-btn').forEach(btn => {
          btn.classList.remove('selected');
        });
      }
      if (this.setupThemes) {
        this.setupThemes.classList.add('hidden');
        this.setupThemes.querySelectorAll('.setup-theme-btn').forEach(btn => {
          btn.classList.toggle('selected', btn.getAttribute('data-theme') === 'slate');
        });
      }
      if (this.setupStyleLabel) {
        this.setupStyleLabel.textContent = 'Choose your style';
      }
      this.closeSettings();
    }
  }

  setupAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }

    this.autoRefreshInterval = setInterval(() => {
      if (this.icalLinkInput.value) {
        this.handleParse();
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  updateThemePillSelection() {
    if (this.themeOptions) {
      this.themeOptions.querySelectorAll('.theme-pill').forEach(btn => {
        const val = btn.getAttribute('data-theme-option');
        btn.classList.toggle('selected', val === this.themeManager.currentTheme);
      });
    }
  }

  updateUIStyleSelection() {
    const currentStyle = this.themeManager.currentUIStyle;

    // Update setup view UI style buttons
    if (this.setupUIStyles) {
      this.setupUIStyles.querySelectorAll('.ui-style-btn').forEach(btn => {
        const val = btn.getAttribute('data-style');
        btn.classList.toggle('selected', val === currentStyle);
      });
    }

    // Update settings view UI style buttons
    if (this.settingsUIStyles) {
      this.settingsUIStyles.querySelectorAll('.ui-style-btn').forEach(btn => {
        const val = btn.getAttribute('data-style');
        btn.classList.toggle('selected', val === currentStyle);
      });
    }
  }

  // Subject tag methods
  async loadSubjectTags() {
    const data = await chrome.storage.local.get(['subjectTags']);
    this.subjectTags = data.subjectTags || {};
    this.displaySubjectTags();
  }

  displaySubjectTags() {
    this.subjectTagsDiv.innerHTML = '';

    const tags = Object.entries(this.subjectTags);
    if (tags.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.style.cssText = 'color: #9ca3af; font-size: 12px; margin: 0;';
      emptyMsg.textContent = 'Subject colors will appear here after loading your calendar';
      this.subjectTagsDiv.appendChild(emptyMsg);
      return;
    }

    tags.forEach(([name, color]) => {
      const tagDiv = document.createElement('div');
      tagDiv.className = 'subject-tag-item';

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = color;
      colorInput.className = 'tag-color-input';
      colorInput.addEventListener('input', (e) => {
        this.updateSubjectTagColor(name, e.target.value);
        colorIndicator.style.backgroundColor = e.target.value;
      });

      const colorIndicator = document.createElement('div');
      colorIndicator.className = 'tag-color-indicator';
      colorIndicator.style.backgroundColor = color;
      colorIndicator.title = 'Click to change color';

      const popover = this.buildColorPopover(name, colorInput, colorIndicator);
      colorIndicator.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.color-popover').forEach(p => p.classList.add('hidden'));
        popover.classList.toggle('hidden');
      });
      document.addEventListener('click', () => popover.classList.add('hidden'));

      const tagName = document.createElement('span');
      tagName.className = 'tag-name';
      tagName.textContent = name;

      tagDiv.appendChild(colorInput);
      tagDiv.appendChild(colorIndicator);
      tagDiv.appendChild(popover);
      tagDiv.appendChild(tagName);
      this.subjectTagsDiv.appendChild(tagDiv);
    });
  }

  async updateSubjectTagColor(name, color) {
    this.subjectTags[name] = color;
    await saveSubjectTags(this.subjectTags);
  }

  getSubjectFromTitle(title) {
    const subjectMatch = title.match(/^(?:ADV\.\s+)?([A-Z][A-Z\s]*[A-Z])(?:[\s:\/]|[0-9]|$)/);
    if (subjectMatch) {
      let subject = subjectMatch[1].trim();
      subject = subject.replace(/\s+\d+$/, '');

      for (const tag in this.subjectTags) {
        if (subject.includes(tag) || tag.includes(subject)) {
          return { name: tag, color: this.subjectTags[tag] };
        }
      }

      const color = this.getDefaultColorForSubject(subject);
      this.subjectTags[subject] = color;
      saveSubjectTags(this.subjectTags);
      return { name: subject, color: color };
    }
    return null;
  }

  ensureSubjectTags(events) {
    if (!events) return;
    events.forEach(ev => this.getSubjectFromTitle(ev.title || ''));
    this.displaySubjectTags();
  }

  getDefaultColorForSubject(subject) {
    let hash = 0;
    for (let i = 0; i < subject.length; i++) {
      hash = subject.charCodeAt(i) + ((hash << 5) - hash);
    }
    return DEFAULT_SUBJECT_COLORS[Math.abs(hash) % DEFAULT_SUBJECT_COLORS.length];
  }

  buildColorPopover(subjectName, colorInput, indicator) {
    const popover = document.createElement('div');
    popover.className = 'color-popover hidden';
    const palette = this.themeManager.getThemePaletteColors();

    palette.forEach(hex => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'color-swatch-btn';
      sw.style.backgroundColor = hex;
      sw.addEventListener('click', async () => {
        indicator.style.backgroundColor = hex;
        colorInput.value = hex;
        await this.updateSubjectTagColor(subjectName, hex);
        popover.classList.add('hidden');
      });
      popover.appendChild(sw);
    });

    const customBtn = document.createElement('button');
    customBtn.type = 'button';
    customBtn.className = 'color-swatch-btn custom';
    customBtn.textContent = 'Custom';
    customBtn.addEventListener('click', () => {
      colorInput.click();
      popover.classList.add('hidden');
    });
    popover.appendChild(customBtn);

    return popover;
  }

  // UI helper methods
  showLoading(show) {
    if (show) {
      this.loadingSpinner.classList.remove('hidden');
    } else {
      this.loadingSpinner.classList.add('hidden');
    }
  }

  showError(message) {
    this.errorMessage.textContent = message;
    this.errorMessage.classList.remove('hidden');
  }

  clearError() {
    this.errorMessage.classList.add('hidden');
    this.errorMessage.textContent = '';
  }

  hideEventsList() {
    this.mainContent.classList.add('hidden');
  }

  // Easter egg methods
  setupEasterEgg() {
    // Track if easter egg input is active
    this.easterEggActive = false;

    // Click on logo to activate easter egg input
    if (this.headerTitle) {
      this.headerTitle.addEventListener('click', (e) => {
        if (this.weatherUnlocked || this.isSettingsView) return;

        // Activate easter egg input mode
        this.easterEggActive = true;
        if (this.logoEgg) {
          this.logoEgg.classList.add('caret-active');
        }
        e.stopPropagation();
      });
    }

    // Click elsewhere to deactivate
    document.addEventListener('click', (e) => {
      if (this.easterEggActive && !this.headerTitle.contains(e.target)) {
        this.deactivateEasterEggInput();
      }
    });

    // Keyboard input for easter egg
    document.addEventListener('keydown', (e) => {
      // Only listen when easter egg input is active and not already unlocked
      if (!this.easterEggActive || this.weatherUnlocked) {
        return;
      }

      // Only accept letter keys
      if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
        // Add character to buffer
        this.easterEggBuffer += e.key.toLowerCase();

        // Keep only last 3 characters
        if (this.easterEggBuffer.length > 3) {
          this.easterEggBuffer = this.easterEggBuffer.slice(-3);
        }

        // Update the logo display
        this.updateLogoDisplay();

        // Check for easter egg trigger
        if (this.easterEggBuffer === 'ity') {
          this.triggerEasterEgg();
        }
      } else if (e.key === 'Backspace') {
        // Allow backspace to delete
        this.easterEggBuffer = this.easterEggBuffer.slice(0, -1);
        this.updateLogoDisplay();
      } else if (e.key === 'Escape') {
        // Escape to deactivate
        this.deactivateEasterEggInput();
      }
    });
  }

  deactivateEasterEggInput() {
    this.easterEggActive = false;
    // Only clear if not the correct answer
    if (this.easterEggBuffer !== 'ity') {
      this.easterEggBuffer = '';
      if (this.logoEgg) {
        this.logoEgg.textContent = '';
        this.logoEgg.classList.remove('caret-active');
      }
    } else {
      // Keep 'ity' visible but remove caret
      if (this.logoEgg) {
        this.logoEgg.classList.remove('caret-active');
      }
    }
  }

  updateLogoDisplay() {
    if (!this.logoEgg) return;

    // Show typed characters in the logo
    const target = 'ity';
    const matches = target.startsWith(this.easterEggBuffer);
    if (matches || this.easterEggBuffer === '') {
      this.logoEgg.textContent = this.easterEggBuffer;
    }
    // If doesn't match, still show what they typed (they can backspace)
    else {
      this.logoEgg.textContent = this.easterEggBuffer;
    }
  }

  async triggerEasterEgg() {
    // Keep 'ity' in the logo
    if (this.logoEgg) {
      this.logoEgg.textContent = 'ity';
      this.logoEgg.classList.remove('caret-active');
    }
    this.easterEggActive = false;

    // Mark as unlocked
    this.weatherUnlocked = true;
    await unlockWeather();

    // Add body class to disable easter egg hover
    document.body.classList.add('weather-unlocked');

    // Enable weather effects
    this.themeManager.enableWeather();

    // Show weather selector
    this.updateWeatherSelectorVisibility();

    // Generate confetti
    this.generateConfetti();

    // Show the modal
    if (this.easterEggModal) {
      this.easterEggModal.classList.remove('hidden');
    }
  }

  generateConfetti() {
    if (!this.easterEggConfetti) return;

    // Clear any existing confetti
    this.easterEggConfetti.innerHTML = '';

    // Get theme colors for confetti
    const colors = this.themeManager.getThemeConfettiColors();
    const fallbackColors = ['#f97316', '#a855f7', '#0ea5e9', '#34d399', '#f472b6', '#fbbf24'];
    const confettiColors = colors.length > 0 ? colors : fallbackColors;

    // Generate confetti pieces
    for (let i = 0; i < 50; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.backgroundColor = confettiColors[Math.floor(Math.random() * confettiColors.length)];
      piece.style.animationDelay = `${Math.random() * 0.5}s`;
      piece.style.animationDuration = `${2 + Math.random() * 1.5}s`;
      this.easterEggConfetti.appendChild(piece);
    }
  }

  closeEasterEggModal() {
    if (this.easterEggModal) {
      this.easterEggModal.classList.add('hidden');
    }

    // Keep 'ity' visible - it only disappears when going to settings or closing extension

    // Clear confetti
    if (this.easterEggConfetti) {
      this.easterEggConfetti.innerHTML = '';
    }
  }

  // Weather selector methods
  setupWeatherSelector() {
    if (!this.weatherOptions) return;

    // Weather option selection (hover-based dropdown, click to select)
    this.weatherOptions.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const weather = btn.getAttribute('data-weather');
        if (weather) {
          // Update selected state
          this.weatherOptions.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');

          this.themeManager.setWeather(weather);
          this.updateWeatherIcon(weather);
          // Save preference
          await saveWeather(weather);
        }
      });
    });
  }

  updateWeatherIcon(weather) {
    if (!this.weatherIcon) return;
    const icons = {
      clear: '☀',
      rain: '🌧',
      snow: '❄',
      storm: '⛈',
      leaves: '🍂'
    };
    this.weatherIcon.innerHTML = icons[weather] || '☀';
  }

  updateWeatherSelection(weather) {
    if (!this.weatherOptions) return;
    this.weatherOptions.querySelectorAll('button').forEach(btn => {
      const btnWeather = btn.getAttribute('data-weather');
      btn.classList.toggle('selected', btnWeather === weather);
    });
  }

  updateWeatherSelectorVisibility() {
    if (!this.weatherSelector) return;

    // Show weather selector if unlocked and not in settings view
    if (this.weatherUnlocked && !this.isSettingsView) {
      this.weatherSelector.classList.remove('hidden');
    } else {
      this.weatherSelector.classList.add('hidden');
    }
  }
}
