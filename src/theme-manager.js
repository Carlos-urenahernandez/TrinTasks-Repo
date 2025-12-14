// Theme Manager - Handles theme switching and weather effects

import { THEME_NAMES } from './constants.js';

export class ThemeManager {
  constructor() {
    this.currentTheme = 'slate';
    this.currentUIStyle = 'neobrutalism';
    this.currentWeather = 'clear';
    this.weatherEnabled = false;
    this.particleContainer = null;
    this.particleInterval = null;
  }

  /**
   * Apply a UI style to the document
   * @param {string} style - UI style name ('neobrutalism' or 'glass')
   * @returns {string} The applied UI style
   */
  applyUIStyle(style) {
    const validStyles = ['neobrutalism', 'glass'];
    const selectedStyle = validStyles.includes(style) ? style : 'neobrutalism';

    // Remove existing UI style classes
    document.body.classList.remove('ui-neobrutalism', 'ui-glass');

    // Apply the selected style
    document.body.classList.add(`ui-${selectedStyle}`);
    this.currentUIStyle = selectedStyle;

    return this.currentUIStyle;
  }

  /**
   * Get current UI style
   * @returns {string} Current UI style
   */
  getUIStyle() {
    return this.currentUIStyle;
  }

  /**
   * Apply a theme to the document
   * @param {string} theme - Theme name to apply
   */
  applyTheme(theme) {
    const selectedTheme = theme || 'slate';
    const themeClass = `theme-${selectedTheme}`;

    // Remove all theme classes
    THEME_NAMES.forEach(t => document.body.classList.remove(t));

    // Enable a short transition class
    document.body.classList.add('theme-animating');
    setTimeout(() => document.body.classList.remove('theme-animating'), 400);

    if (!THEME_NAMES.includes(themeClass)) {
      document.body.classList.add('theme-slate');
      this.currentTheme = 'slate';
    } else {
      document.body.classList.add(themeClass);
      this.currentTheme = selectedTheme;
    }

    // Update particles if weather is enabled
    if (this.weatherEnabled) {
      this.updateParticles();
    }

    return this.currentTheme;
  }

  /**
   * Enable weather effects (easter egg feature)
   */
  enableWeather() {
    this.weatherEnabled = true;
    document.body.classList.add('weather-enabled');
    // Set weather class for overlay effects
    document.body.classList.add(`weather-${this.currentWeather}`);
    this.updateParticles();
  }

  /**
   * Disable weather effects
   */
  disableWeather() {
    this.weatherEnabled = false;
    document.body.classList.remove('weather-enabled');
    // Remove all weather type classes
    ['clear', 'rain', 'snow', 'storm', 'leaves'].forEach(w => {
      document.body.classList.remove(`weather-${w}`);
    });
    this.clearParticles();
  }

  /**
   * Check if weather is enabled
   * @returns {boolean} Weather enabled state
   */
  isWeatherEnabled() {
    return this.weatherEnabled;
  }

  /**
   * Set the weather type
   * @param {string} weather - Weather type (clear, rain, snow, storm, leaves)
   */
  setWeather(weather) {
    const validWeathers = ['clear', 'rain', 'snow', 'storm', 'leaves'];
    const previousWeather = this.currentWeather;
    this.currentWeather = validWeathers.includes(weather) ? weather : 'clear';

    // Update body class for weather-specific overlay effects
    validWeathers.forEach(w => document.body.classList.remove(`weather-${w}`));
    document.body.classList.add(`weather-${this.currentWeather}`);

    if (this.weatherEnabled) {
      this.updateParticles();
    }

    return this.currentWeather;
  }

  /**
   * Get current weather
   * @returns {string} Current weather type
   */
  getWeather() {
    return this.currentWeather;
  }

  /**
   * Initialize particle container
   */
  initParticleContainer() {
    this.particleContainer = document.getElementById('weatherParticles');
  }

  /**
   * Update particles based on weather
   */
  updateParticles() {
    if (!this.particleContainer) {
      this.initParticleContainer();
    }
    if (!this.particleContainer) {
      console.warn('Weather particles: container not found');
      return;
    }

    this.clearParticles();

    const weather = this.currentWeather;

    // Determine particle type based on weather
    let particleType = 'dust';
    let particleCount = 10;

    if (weather === 'rain') {
      particleType = 'rain';
      particleCount = 25;
    } else if (weather === 'snow') {
      particleType = 'snow';
      particleCount = 15;
    } else if (weather === 'storm') {
      particleType = 'rain';
      particleCount = 40;
    } else if (weather === 'leaves') {
      particleType = 'leaf';
      particleCount = 8;
    } else if (weather === 'clear') {
      particleType = 'dust';
      particleCount = 8;
    }

    // Create initial batch of particles
    for (let i = 0; i < particleCount; i++) {
      this.createParticle(particleType, i * (100 / particleCount));
    }

    // Set up continuous particle generation for falling particles
    if (['rain', 'snow', 'leaf'].includes(particleType)) {
      const interval = particleType === 'rain' ? 80 : particleType === 'snow' ? 300 : 600;
      this.particleInterval = setInterval(() => {
        if (this.weatherEnabled) {
          this.createParticle(particleType);
        }
      }, interval);
    }
  }

  /**
   * Create a single particle
   * @param {string} type - Particle type
   * @param {number} delay - Animation delay percentage
   */
  createParticle(type, delay = 0) {
    if (!this.particleContainer) return;

    const particle = document.createElement('div');

    // Assign a random variant class to avoid nth-child shifting issues
    const variant = Math.floor(Math.random() * 4) + 1; // 1-4
    particle.className = `weather-particle ${type} v${variant}`;

    // Position based on particle type
    if (type === 'rain') {
      // Rain falls from top, spread across full width
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.top = '-25px';
    } else if (type === 'snow') {
      // Snow from top, spread across width
      particle.style.left = `${Math.random() * 90}%`;
      particle.style.top = '-15px';
    } else if (type === 'leaf') {
      // Leaves from top-left area
      const fromTop = Math.random() > 0.3;
      if (fromTop) {
        particle.style.left = `${Math.random() * 60}%`;
        particle.style.top = '-15px';
      } else {
        particle.style.left = '-15px';
        particle.style.top = `${Math.random() * 40}%`;
      }
    } else {
      // Dust/other - from top-left corner area
      particle.style.left = `${Math.random() * 50}%`;
      particle.style.top = `${Math.random() * 30}%`;
    }

    // Random animation delay
    const animDelay = delay ? delay / 100 : Math.random();
    particle.style.animationDelay = `${animDelay * 1.5}s`;

    // Duration based on particle type
    const baseDuration = type === 'rain' ? 0.7 : type === 'snow' ? 3.5 : type === 'leaf' ? 5 : 6;
    const variation = type === 'rain' ? 0.3 : 1.5;
    particle.style.animationDuration = `${baseDuration + Math.random() * variation}s`;

    this.particleContainer.appendChild(particle);

    // Remove particles after animation completes
    const duration = parseFloat(particle.style.animationDuration) * 1000;
    const delayMs = parseFloat(particle.style.animationDelay) * 1000;
    setTimeout(() => {
      if (particle.parentNode) {
        particle.remove();
      }
    }, duration + delayMs + 100);
  }

  /**
   * Clear all particles
   */
  clearParticles() {
    if (this.particleInterval) {
      clearInterval(this.particleInterval);
      this.particleInterval = null;
    }
    if (this.particleContainer) {
      this.particleContainer.innerHTML = '';
    }
  }

  /**
   * Get weather icon for current weather
   * @returns {string} Weather icon emoji
   */
  getWeatherIcon() {
    const icons = {
      clear: '☀️',
      rain: '🌧️',
      snow: '❄️',
      storm: '⛈️',
      leaves: '🍂'
    };
    return icons[this.currentWeather] || '☀️';
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
