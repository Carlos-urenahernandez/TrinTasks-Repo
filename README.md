# TrinTasks

TrinTasks is a simple iCal-based assignment viewer designed to help students keep track of upcoming tasks at a glance.
Paste in an iCal URL (such as from your school's LMS or calendar), and TrinTasks will parse the events into a clean weekly view with per-day assignment lists, reminders, and customizable themes.

---

## Features

- **iCal parsing** - Supports `webcal://` and `https://` iCal links
- **Weekly calendar view** - Navigate weeks, click days to see assignments
- **Daily assignment list** - Filter by All, Uncompleted, or Completed
- **Pin assignments** - Pin important tasks to the sidebar for quick access
- **Clickable links** - URLs in assignment descriptions are automatically clickable
- **Major assignments sidebar** - Shows upcoming tests, quizzes, essays, and projects
- **Customizable themes** - Fern, Ocean, Sunset, Slate, Orchid, Midnight, Serenity (auto)
- **Subject colors** - Auto-detected subjects with customizable colors
- **Notifications** - Optional assignment reminders with configurable lead time

---

## Project Structure

```
TrinTasks-Repo/
├── src/                      # ES modules (main application logic)
│   ├── constants.js          # App constants, color palettes, theme config
│   ├── utils.js              # Helper functions (escapeHtml, linkifyText, etc.)
│   ├── ical-parser.js        # iCal/ICS file parsing
│   ├── storage-manager.js    # Chrome storage operations
│   ├── theme-manager.js      # Theme switching & Serenity dynamic theme
│   ├── event-renderer.js     # Event card creation & animations
│   ├── week-view.js          # Week calendar view & navigation
│   ├── sidebar.js            # Major assignments sidebar
│   └── ui-controller.js      # Main UI orchestrator (ties everything together)
├── popup.js                  # Entry point - imports and initializes UIController
├── popup.html                # Main HTML structure
├── styles.css                # All styles (neo-brutalism design)
├── background.js             # Service worker for notifications & background refresh
├── manifest.json             # Chrome extension manifest (v3)
└── icon-128.png              # Extension icon
```

---

## Module Overview

| File | Purpose | Key Exports |
|------|---------|-------------|
| `constants.js` | Day/month names, theme names, color palettes, keywords | `DAY_NAMES`, `MONTH_NAMES`, `THEME_NAMES`, `DEFAULT_SUBJECT_COLORS`, `SERENITY_PALETTES` |
| `utils.js` | Text processing, date helpers | `escapeHtml()`, `linkifyText()`, `getCleanTitle()`, `getTimeAgo()`, `getWeekStart()` |
| `ical-parser.js` | Parse iCal content from URLs | `ICalParser` class with static methods |
| `storage-manager.js` | Chrome local storage CRUD | `saveToStorage()`, `loadSavedData()`, `togglePinAssignment()`, `loadSettings()` |
| `theme-manager.js` | Apply themes, Serenity weather integration | `ThemeManager` class |
| `event-renderer.js` | Create event card DOM elements | `EventRenderer` class |
| `week-view.js` | Week navigation and day selection | `WeekView` class, `getEventsForDate()` |
| `sidebar.js` | Major assignments & pinned items | `Sidebar` class |
| `ui-controller.js` | Main controller, event listeners, coordination | `UIController` class |

---

## Development Guide

### Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/Software-Engineering-Fall-2025/TrinTasks-Repo.git
   cd TrinTasks-Repo
   ```

2. **Load as Chrome extension**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked" and select the `TrinTasks-Repo` folder
   - The extension icon should appear in your toolbar

3. **Test changes**
   - Make your code changes
   - Go to `chrome://extensions/` and click the refresh icon on TrinTasks
   - Click the extension icon to test

### Working with Modules

The codebase uses **ES modules** (`import`/`export`). Each file in `src/` is a self-contained module:

```javascript
// Importing in your module
import { ICalParser } from './ical-parser.js';
import { escapeHtml, linkifyText } from './utils.js';
import { DEFAULT_SUBJECT_COLORS } from './constants.js';

// Exporting from your module
export function myFunction() { ... }
export class MyClass { ... }
```

### Adding a New Feature

1. **Identify which module(s) to modify** based on the table above
2. **For new functionality**, consider if it belongs in an existing module or needs a new one
3. **Import what you need** from other modules
4. **Export your additions** so other modules can use them
5. **Update `ui-controller.js`** if your feature needs to be wired into the UI

### Common Tasks

| Task | File(s) to Edit |
|------|-----------------|
| Add a new theme | `constants.js` (add to `THEME_NAMES`), `styles.css` (add theme class) |
| Change how events display | `event-renderer.js` |
| Modify week/day navigation | `week-view.js` |
| Add new storage data | `storage-manager.js` |
| Change sidebar behavior | `sidebar.js` |
| Add new UI elements | `popup.html`, `ui-controller.js`, `styles.css` |
| Add utility function | `utils.js` |

### Code Style

- **No build step required** - Just edit and refresh the extension
- **Use CSS variables** for colors (defined in `:root` in `styles.css`)
- **Neo-brutalism design** - Bold borders, hard shadows, pastel colors
- **Keep modules focused** - Each file should have a single responsibility

---

## File Responsibilities

### `popup.js` (Entry Point)
- Imports `UIController` from `src/ui-controller.js`
- Initializes the app when DOM is ready
- Triggers the `popup-ready` CSS transition

### `ui-controller.js` (Main Orchestrator)
- Holds references to all DOM elements
- Sets up all event listeners
- Coordinates between modules
- Handles settings, filtering, and refresh logic

### `background.js` (Service Worker)
- Runs independently of the popup
- Handles periodic calendar refresh
- Manages notification alarms
- Responds to messages from the popup

---

## Tips for Developers

1. **Use browser DevTools** - Right-click the extension popup → Inspect
2. **Check the console** - Errors and logs appear in the popup's DevTools console
3. **Background script logs** - Go to `chrome://extensions/` → TrinTasks → "Service worker" link
4. **Storage inspection** - In DevTools → Application → Local Storage
5. **Hot reload** - After changes, refresh the extension at `chrome://extensions/`

---

## License

MIT
