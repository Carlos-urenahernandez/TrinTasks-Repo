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
  listenForStorageChanges,
  refreshLocally,
  clearAllReminderAlarms,
  clearAllData,
  loadSettings,
  saveSettings,
  saveSubjectTags
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
    this.todayBtn = document.getElementById('todayBtn');
    this.selectedDayTitle = document.getElementById('selectedDayTitle');

    // Custom assignment elements
    this.addCustomBtn = document.getElementById('addCustomBtn');
    this.customAssignmentModal = document.getElementById('customAssignmentModal');
    this.customTitleInput = document.getElementById('customTitle');
    this.customDueDateInput = document.getElementById('customDueDate');
    this.customDueTimeInput = document.getElementById('customDueTime');
    this.customCourseSelect = document.getElementById('customCourse');
    this.addNewCourseBtn = document.getElementById('addNewCourseBtn');
    this.customNewCourseInput = document.getElementById('customNewCourse');
    this.customDescriptionInput = document.getElementById('customDescription');
    this.customSaveBtn = document.getElementById('customSaveBtn');
    this.customCancelBtn = document.getElementById('customCancelBtn');

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

    // UI Style elements
    this.uiStyleOptions = document.getElementById('uiStyleOptions');

    // Setup view elements
    this.setupView = document.getElementById('setupView');
    this.setupThemes = document.getElementById('setupThemes');

    // Major assignments sidebar elements
    this.majorAssignmentsBar = document.getElementById('majorAssignmentsBar');
    this.majorListDiv = document.getElementById('majorList');
    this.showMajorAssignmentsCheckbox = document.getElementById('showMajorAssignments');

    // State
    this.events = [];
    this.subjectTags = {};
    this.pinnedAssignments = {};
    this.isSettingsView = false;
    this.filterMode = 'all';
    this.autoRefreshInterval = null;
    this.isAnimating = false; // Prevent re-render during animations
    this.uiStyle = 'simple'; // Default UI style

    // Initialize modules
    this.themeManager = new ThemeManager();

    this.eventRenderer = new EventRenderer({
      onToggleComplete: (event, element) => this.handleToggleComplete(event, element),
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
      onNavigateToDate: (date) => this.navigateToDate(date)
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
    
    // Today button
    if (this.todayBtn) {
      this.todayBtn.addEventListener('click', () => this.jumpToToday());
    }

    // Custom assignment handlers
    if (this.addCustomBtn) {
      this.addCustomBtn.addEventListener('click', () => this.openCustomAssignmentModal());
    }
    if (this.addNewCourseBtn) {
      this.addNewCourseBtn.addEventListener('click', () => this.toggleNewCourseInput());
    }
    if (this.customCancelBtn) {
      this.customCancelBtn.addEventListener('click', () => this.closeCustomAssignmentModal());
    }
    if (this.customSaveBtn) {
      this.customSaveBtn.addEventListener('click', () => this.handleSaveCustomAssignment());
    }
    if (this.customAssignmentModal) {
      this.customAssignmentModal.addEventListener('click', (e) => {
        if (e.target.classList.contains('custom-assignment-overlay')) {
          this.closeCustomAssignmentModal();
        }
      });
    }

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
            this.handleSaveSettings();
          }
        });
      });
    }

    // UI Style selection (settings view)
    if (this.uiStyleOptions) {
      this.uiStyleOptions.querySelectorAll('.ui-style-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          const uiStyle = btn.getAttribute('data-ui-style');
          if (uiStyle) {
            this.applyUIStyle(uiStyle);
            this.updateUIStylePillSelection();
            this.handleSaveSettings();
          }
        });
      });
    }

    // Setup theme selection (initial setup view)
    if (this.setupThemes) {
      this.setupThemes.querySelectorAll('.setup-theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const theme = btn.getAttribute('data-theme');
          if (theme) {
            // Update selection visually
            this.setupThemes.querySelectorAll('.setup-theme-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            // Apply theme immediately for preview
            this.themeManager.applyTheme(theme);
          }
        });
      });
    }
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

  jumpToToday() {
    const today = new Date();
    this.navigateToDate(today);
  }

  openCustomAssignmentModal() {
    if (this.customAssignmentModal) {
      this.customAssignmentModal.classList.remove('hidden');
      // Set default date to today
      const today = new Date().toISOString().split('T')[0];
      this.customDueDateInput.value = today;
      // Populate course dropdown
      this.populateCourseDropdown();
      // Focus on title input
      this.customTitleInput.focus();
    }
  }

  populateCourseDropdown() {
    // Clear existing options (except first)
    while (this.customCourseSelect.options.length > 1) {
      this.customCourseSelect.remove(1);
    }
    
    // Add courses from subjectTags
    const courses = Object.keys(this.subjectTags).sort();
    courses.forEach(course => {
      const option = document.createElement('option');
      option.value = course;
      option.textContent = course;
      this.customCourseSelect.appendChild(option);
    });
  }

  toggleNewCourseInput() {
    if (this.customNewCourseInput.classList.contains('hidden')) {
      // Show new course input
      this.customNewCourseInput.classList.remove('hidden');
      this.customCourseSelect.value = '';
      this.customNewCourseInput.focus();
    } else {
      // Hide new course input
      this.customNewCourseInput.classList.add('hidden');
      this.customNewCourseInput.value = '';
      this.customCourseSelect.focus();
    }
  }

  closeCustomAssignmentModal() {
    if (this.customAssignmentModal) {
      this.customAssignmentModal.classList.add('hidden');
      // Clear form
      this.customTitleInput.value = '';
      this.customDueDateInput.value = '';
      this.customDueTimeInput.value = '';
      this.customCourseSelect.value = '';
      this.customNewCourseInput.value = '';
      this.customNewCourseInput.classList.add('hidden');
      this.customDescriptionInput.value = '';
    }
  }

  async handleSaveCustomAssignment() {
    const title = this.customTitleInput.value.trim();
    const dueDate = this.customDueDateInput.value;
    const dueTime = this.customDueTimeInput.value;
    let course = this.customCourseSelect.value.trim();
    const newCourse = this.customNewCourseInput.value.trim();
    const description = this.customDescriptionInput.value.trim();

    // Use custom course if new one is being added
    if (newCourse) {
      course = newCourse;
    }

    if (!title || !dueDate) {
      alert('Please enter an assignment title and due date');
      return;
    }

    if (!course) {
      alert('Please select or create a course');
      return;
    }

    // Create a custom event object
    const customEvent = {
      uid: `custom_${Date.now()}`,
      title: title,
      dueRaw: dueDate,
      dueTime: dueTime || null,
      description: description,
      isCustom: true,
      isCompleted: false,
      completedDate: null
    };

    // Add course as summary tag
    customEvent.summary = course;
    // Ensure course is in tags
    if (!this.subjectTags[course]) {
      this.subjectTags[course] = '#9333ea'; // Default purple color
    }

    // Add to events array
    this.events.push(customEvent);

    // Save to storage
    await chrome.storage.local.set({ 
      events: this.events,
      subjectTags: this.subjectTags
    });

    // Update display
    this.weekViewController.renderWeekView();
    this.showEventsForSelectedDay();
    this.closeCustomAssignmentModal();

    // Show success message
    this.eventRenderer.showRefreshToast({ added: 1, updated: 0, removed: 0, timestamp: Date.now() });
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

      const eventsChanged = changes.events || changes.completedAssignments || changes.icalUrl;
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
    });
  }

  async updateEventsFromStorage() {
    try {
      const data = await chrome.storage.local.get(['events', 'completedAssignments', 'icalUrl', 'pinnedAssignments']);
      if (data.icalUrl) {
        this.icalLinkInput.value = data.icalUrl;
        this.settingsIcalLink.value = data.icalUrl;
      }
      this.pinnedAssignments = data.pinnedAssignments || {};
      const merged = mergeCompletionStatus(data.events || [], data.completedAssignments);
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

    this.mainView.classList.add('hidden');
    this.settingsView.classList.remove('hidden');
    this.headerTitle.textContent = '← Settings';
    this.headerTitle.style.cursor = 'pointer';
    this.settingsBtn.style.display = 'none';
    this.isSettingsView = true;
  }

  closeSettings() {
    const newUrl = this.settingsIcalLink.value.trim();
    if (newUrl && newUrl !== this.icalLinkInput.value) {
      this.icalLinkInput.value = newUrl;
      this.handleParse();
    }

    this.settingsView.classList.add('hidden');
    this.mainView.classList.remove('hidden');
    this.headerTitle.textContent = 'TrinTasks';
    this.headerTitle.style.cursor = 'default';
    this.settingsBtn.style.display = 'block';
    this.isSettingsView = false;
  }

  async loadSettingsFromStorage() {
    const settings = await loadSettings();

    this.enableRemindersCheckbox.checked = settings.enableReminders;
    this.reminderHoursSelect.value = String(settings.reminderHours);

    this.themeManager.applyTheme(settings.theme);
    this.updateThemePillSelection();

    this.uiStyle = settings.uiStyle || 'simple';
    this.applyUIStyle(this.uiStyle);
    this.updateUIStylePillSelection();

    if (this.showMajorAssignmentsCheckbox) {
      this.showMajorAssignmentsCheckbox.checked = settings.showMajorAssignmentsBar;
    }
    this.sidebar.toggleVisibility(settings.showMajorAssignmentsBar);

    this.subjectTags = settings.subjectTags;
  }

  async handleSaveSettings() {
    const settings = {
      autoRefresh: this.autoRefreshCheckbox ? this.autoRefreshCheckbox.checked : false,
      enableReminders: this.enableRemindersCheckbox.checked,
      reminderHours: parseInt(this.reminderHoursSelect.value, 10) || 24,
      theme: this.themeManager.currentTheme,
      showMajorAssignmentsBar: this.showMajorAssignmentsCheckbox ? this.showMajorAssignmentsCheckbox.checked : false,
      uiStyle: this.uiStyle
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
      this.themeManager.applyTheme('fern');
      this.updateThemePillSelection();
      this.uiStyle = 'simple';
      this.applyUIStyle('simple');
      this.updateUIStylePillSelection();
      // Reset setup theme selection
      if (this.setupThemes) {
        this.setupThemes.querySelectorAll('.setup-theme-btn').forEach(btn => {
          btn.classList.toggle('selected', btn.getAttribute('data-theme') === 'fern');
        });
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

  applyUIStyle(uiStyle) {
    this.uiStyle = uiStyle || 'simple';
    document.body.classList.remove('ui-simple', 'ui-neo-brutalist');
    if (uiStyle === 'neo-brutalist') {
      document.body.classList.add('ui-neo-brutalist');
    } else {
      document.body.classList.add('ui-simple');
    }
  }

  updateUIStylePillSelection() {
    if (this.uiStyleOptions) {
      this.uiStyleOptions.querySelectorAll('.ui-style-pill').forEach(btn => {
        const val = btn.getAttribute('data-ui-style');
        btn.classList.toggle('selected', val === this.uiStyle);
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
}
