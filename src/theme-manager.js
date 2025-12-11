// Theme Manager - Handles theme switching and Serenity dynamic theme

import { THEME_NAMES, SERENITY_PALETTES } from './constants.js';

export class ThemeManager {
  constructor() {
    this.currentTheme = 'fern';
    this.serenityWeatherCache = null;
    this.serenityRefreshTimer = null;
    this.serenityApplying = false;
  }

  /**
   * Apply a theme to the document
   * @param {string} theme - Theme name to apply
   */
  applyTheme(theme) {
    const selectedTheme = theme || 'fern';
    const themeClass = `theme-${selectedTheme}`;

    // Remove all theme classes
    THEME_NAMES.forEach(t => document.body.classList.remove(t));

    // Clear dynamic serenity overrides when leaving the mode
    if (selectedTheme !== 'serenity') {
      this.clearSerenityOverrides();
    }

    // Enable a short transition class
    document.body.classList.add('theme-animating');
    setTimeout(() => document.body.classList.remove('theme-animating'), 400);

    if (!THEME_NAMES.includes(themeClass)) {
      document.body.classList.add('theme-fern');
      this.currentTheme = 'fern';
    } else if (themeClass === 'theme-serenity') {
      document.body.classList.add('theme-serenity');
      this.currentTheme = 'serenity';
      this.applySerenityTheme();
    } else {
      document.body.classList.add(themeClass);
      this.currentTheme = selectedTheme;
    }

    return this.currentTheme;
  }

  /**
   * Apply the Serenity dynamic theme based on time and weather
   * @param {boolean} forceWeatherRefresh - Force weather data refresh
   */
  async applySerenityTheme(forceWeatherRefresh = false) {
    if (this.serenityApplying || this.currentTheme !== 'serenity') return;
    this.serenityApplying = true;
    try {
      const now = new Date();
      const phase = this.getSerenityPhase(now);
      const weather = await this.getSerenityWeather(forceWeatherRefresh);
      const palette = this.buildSerenityPalette(phase, weather);
      this.setSerenityVariables(palette);
      this.scheduleSerenityRefresh(now);
    } catch (err) {
      console.warn('Serenity theme failed; falling back to static palette.', err);
    } finally {
      this.serenityApplying = false;
    }
  }

  /**
   * Get the time-of-day phase for Serenity theme
   * @param {Date} date - Current date/time
   * @returns {string} Phase name
   */
  getSerenityPhase(date = new Date()) {
    const hour = date.getHours();
    if (hour >= 5 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 16) return 'day';
    if (hour >= 16 && hour < 19) return 'golden';
    if (hour >= 19 && hour < 22) return 'evening';
    return 'night';
  }

  /**
   * Get weather data for Serenity theme
   * @param {boolean} forceRefresh - Force refresh of weather data
   * @returns {Promise<Object>} Weather data
   */
  async getSerenityWeather(forceRefresh = false) {
    if (!forceRefresh && this.serenityWeatherCache && Date.now() - this.serenityWeatherCache.timestamp < 30 * 60 * 1000) {
      return this.serenityWeatherCache;
    }

    if (!navigator.geolocation) {
      const fallback = { condition: 'clear', source: 'time-only', timestamp: Date.now() };
      this.serenityWeatherCache = fallback;
      return fallback;
    }

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 7000, maximumAge: 20 * 60 * 1000 });
      });
      const { latitude, longitude } = position.coords;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code,temperature_2m&timezone=auto`;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Weather fetch failed: ${resp.status}`);
      }
      const data = await resp.json();
      const code = data?.current?.weather_code;
      const condition = this.mapWeatherCodeToCondition(code);
      const snapshot = { condition, code, timestamp: Date.now(), source: 'open-meteo' };
      this.serenityWeatherCache = snapshot;
      return snapshot;
    } catch (err) {
      console.warn('Serenity weather lookup failed; using clear fallback.', err);
      const fallback = { condition: 'clear', source: 'fallback', timestamp: Date.now() };
      this.serenityWeatherCache = fallback;
      return fallback;
    }
  }

  /**
   * Map weather code to condition string
   * @param {number} code - Weather code from API
   * @returns {string} Weather condition
   */
  mapWeatherCodeToCondition(code) {
    if (code === 0) return 'clear';
    if ([1, 2, 3].includes(code)) return 'clouds';
    if ([45, 48].includes(code)) return 'fog';
    if ([51, 53, 55, 56, 57, 61, 63, 65, 80, 81, 82].includes(code)) return 'rain';
    if ([66, 67, 77].includes(code)) return 'sleet';
    if ([71, 73, 75, 85, 86].includes(code)) return 'snow';
    if ([95, 96, 99].includes(code)) return 'storm';
    return 'clear';
  }

  /**
   * Build the Serenity color palette based on phase and weather
   * @param {string} phase - Time-of-day phase
   * @param {Object} weather - Weather data
   * @returns {Object} Color palette
   */
  buildSerenityPalette(phase, weather = {}) {
    const palette = { ...(SERENITY_PALETTES[phase] || SERENITY_PALETTES.day) };
    const condition = weather.condition || 'clear';

    const blend = (hex1, hex2, t = 0.5) => {
      const toRGB = (hex) => {
        const clean = hex.replace('#', '');
        const full = clean.length === 3 ? clean.split('').map(ch => ch + ch).join('') : clean;
        const val = parseInt(full || '000000', 16);
        return {
          r: (val >> 16) & 255,
          g: (val >> 8) & 255,
          b: val & 255
        };
      };
      const a = toRGB(hex1);
      const b = toRGB(hex2);
      const r = Math.round(a.r + (b.r - a.r) * t);
      const g = Math.round(a.g + (b.g - a.g) * t);
      const bCh = Math.round(a.b + (b.b - a.b) * t);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bCh.toString(16).padStart(2, '0')}`;
    };

    const applyDarkness = (factor) => {
      if (factor <= 0) return;
      const clamp = Math.min(Math.max(factor, 0), 0.7);
      palette.pageBg = blend(palette.pageBg, '#0b1222', clamp);
      palette.surface = blend(palette.surface, '#0f1628', clamp * 0.9);
      palette.cardBg = blend(palette.cardBg, '#0f182a', clamp * 0.8);
      palette.cardBorder = blend(palette.cardBorder, '#1f2a3c', clamp * 0.7);
      palette.headerBg = blend(palette.headerBg, '#0b162a', clamp * 0.9);
      palette.toastBg = palette.headerBg;
      palette.textMain = blend(palette.textMain, '#f6f8fb', clamp * 0.6);
      palette.textMuted = blend(palette.textMuted, '#c7d2e2', clamp * 0.6);
    };

    if (condition === 'rain' || condition === 'sleet') {
      palette.accent = blend(palette.accent, '#4ba3f5', 0.55);
      palette.accentStrong = blend(palette.accentStrong, '#2563eb', 0.6);
      palette.pageBg = blend(palette.pageBg, '#e6f1fb', 0.5);
      palette.cardBg = blend(palette.cardBg, '#e9f2fc', 0.5);
    } else if (condition === 'storm') {
      palette.accent = blend(palette.accent, '#6366f1', 0.6);
      palette.accentStrong = blend(palette.accentStrong, '#4338ca', 0.65);
      palette.headerBg = blend(palette.headerBg, '#111827', 0.6);
      palette.toastBg = palette.headerBg;
    } else if (condition === 'snow') {
      palette.pageBg = blend(palette.pageBg, '#f7fbff', 0.7);
      palette.surface = blend(palette.surface, '#ffffff', 0.6);
      palette.cardBg = blend(palette.cardBg, '#f8fbff', 0.65);
      palette.accent = blend(palette.accent, '#9ccff7', 0.4);
      palette.textMuted = blend(palette.textMuted, '#5f7186', 0.6);
    } else if (condition === 'clouds' || condition === 'fog') {
      palette.accent = blend(palette.accent, '#7da0c9', 0.45);
      palette.accentStrong = blend(palette.accentStrong, '#4d6b9f', 0.45);
      palette.cardBg = blend(palette.cardBg, '#eef2f7', 0.5);
      palette.textMuted = blend(palette.textMuted, '#5b6675', 0.5);
    }

    // Darken in naturally darker or gloomy situations
    let darkness = 0;
    if (phase === 'night') darkness = 0.6;
    else if (phase === 'evening') darkness = 0.35;
    else if (phase === 'golden') darkness = 0.2;
    else if (phase === 'dawn') darkness = 0.15;

    if (['storm', 'rain', 'sleet', 'snow', 'clouds', 'fog'].includes(condition)) {
      darkness = Math.min(0.65, darkness + 0.15);
    }

    applyDarkness(darkness);

    return palette;
  }

  /**
   * Set CSS variables for Serenity theme
   * @param {Object} palette - Color palette
   */
  setSerenityVariables(palette) {
    const root = document.documentElement;
    const vars = {
      '--page-bg': palette.pageBg,
      '--surface': palette.surface,
      '--text-main': palette.textMain,
      '--text-muted': palette.textMuted,
      '--header-bg': palette.headerBg,
      '--header-text': palette.headerText,
      '--accent': palette.accent,
      '--accent-strong': palette.accentStrong,
      '--accent-contrast': palette.accentContrast,
      '--card-bg': palette.cardBg,
      '--card-border': palette.cardBorder,
      '--toast-bg': palette.toastBg
    };
    Object.entries(vars).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });
  }

  /**
   * Schedule next Serenity theme refresh
   * @param {Date} now - Current date/time
   */
  scheduleSerenityRefresh(now = new Date()) {
    if (this.serenityRefreshTimer) {
      clearTimeout(this.serenityRefreshTimer);
    }
    const msToNextHour = Math.max(
      ((60 - now.getMinutes()) * 60 - now.getSeconds()) * 1000 - now.getMilliseconds(),
      5 * 60 * 1000
    );
    const msUntilWeatherRefresh = 25 * 60 * 1000;
    const delay = Math.min(msToNextHour, msUntilWeatherRefresh);
    this.serenityRefreshTimer = setTimeout(() => {
      if (this.currentTheme === 'serenity') {
        this.applySerenityTheme();
      }
    }, delay);
  }

  /**
   * Clear Serenity theme overrides
   */
  clearSerenityOverrides() {
    if (this.serenityRefreshTimer) {
      clearTimeout(this.serenityRefreshTimer);
      this.serenityRefreshTimer = null;
    }
    this.serenityWeatherCache = null;
    const root = document.documentElement;
    [
      '--page-bg',
      '--surface',
      '--text-main',
      '--text-muted',
      '--header-bg',
      '--header-text',
      '--accent',
      '--accent-strong',
      '--accent-contrast',
      '--card-bg',
      '--card-border',
      '--toast-bg'
    ].forEach(v => root.style.removeProperty(v));
  }

  /**
   * Get theme palette colors for UI elements
   * @returns {Array} Array of color hex values
   */
  getThemePaletteColors() {
    const style = getComputedStyle(document.body);
    const accent = style.getPropertyValue('--accent').trim() || '#3b82f6';
    const accentStrong = style.getPropertyValue('--accent-strong').trim() || accent;
    const header = style.getPropertyValue('--header-bg').trim() || accent;
    const surface = style.getPropertyValue('--surface').trim() || '#ffffff';
    const mix = (a, bColor, t = 0.5) => {
      const toRGB = (hex) => {
        let clean = (hex || '').replace('#', '');
        if (/^[0-9a-fA-F]{3}$/.test(clean)) {
          clean = clean.split('').map(ch => ch + ch).join('');
        }
        if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [0, 0, 0];
        return [
          parseInt(clean.substring(0, 2), 16),
          parseInt(clean.substring(2, 4), 16),
          parseInt(clean.substring(4, 6), 16)
        ];
      };
      const [r1, g1, b1] = toRGB(a);
      const [r2, g2, b2] = toRGB(bColor);
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    };

    return [
      accent,
      accentStrong,
      header,
      mix(accent, surface, 0.25),
      mix(accentStrong, surface, 0.5),
      mix(header, surface, 0.35)
    ];
  }

  /**
   * Get theme-aware confetti colors
   * @returns {Array} Array of color hex values
   */
  getThemeConfettiColors() {
    try {
      const style = getComputedStyle(document.body);
      const accent = style.getPropertyValue('--accent').trim() || '#3b82f6';
      const accentStrong = style.getPropertyValue('--accent-strong').trim() || accent;
      const header = style.getPropertyValue('--header-bg').trim() || accent;
      const contrast = style.getPropertyValue('--accent-contrast').trim() || '#ffffff';
      const lighten = (hex, amt) => {
        const clean = hex.replace('#', '');
        if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;
        const num = parseInt(clean, 16);
        const r = Math.min(255, Math.max(0, (num >> 16) + amt));
        const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
        const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
        return `#${(b | (g << 8) | (r << 16)).toString(16).padStart(6, '0')}`;
      };
      return [
        accent,
        accentStrong,
        header,
        contrast,
        lighten(accent.replace('#', ''), 30),
        lighten(accentStrong.replace('#', ''), 45)
      ];
    } catch (e) {
      return [];
    }
  }
}
