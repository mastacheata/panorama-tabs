/**
 * Shared Theme Manager for Tab Collections Manager
 */

let currentThemePreference = 'system';
const registeredButtons = [];

// Initialize theme as soon as DOM Content is loaded or script runs
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}

/**
 * Initialize theme from storage or default
 */
async function initTheme() {
  let pref = null;
  
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
    try {
      const res = await browser.storage.local.get('themePreference');
      pref = res.themePreference;
    } catch (err) {
      console.error('Error loading theme preference:', err);
    }
  }
  
  if (!pref || pref === 'firefox') {
    // If it was previously 'firefox' (scrapped), migrate to 'system'
    pref = 'system';
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ themePreference: pref });
    }
  }
  
  currentThemePreference = pref;
  await applyTheme(pref);
}

/**
 * Apply a theme by name
 */
async function applyTheme(pref) {
  currentThemePreference = pref;
  document.documentElement.setAttribute('data-theme', pref);
  updateToggleButtons();
}

/**
 * Cycle through theme configurations
 */
async function cycleTheme() {
  const list = ['light', 'dark', 'system'];
    
  let idx = list.indexOf(currentThemePreference);
  if (idx === -1) idx = 0;
  
  const nextTheme = list[(idx + 1) % list.length];
  currentThemePreference = nextTheme;
  
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
    await browser.storage.local.set({ themePreference: nextTheme });
  }
  
  await applyTheme(nextTheme);
}

/**
 * Bind the theme toggle button action
 */
function bindThemeToggle(btnId, textId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  
  const textEl = textId ? document.getElementById(textId) : null;
  
  // Avoid duplicate registrations
  if (!registeredButtons.some(item => item.btn === btn)) {
    registeredButtons.push({ btn, textEl });
    btn.addEventListener('click', cycleTheme);
  }
  
  updateToggleButtons();
}

/**
 * Update visual states of all registered buttons
 */
function updateToggleButtons() {
  for (const { btn, textEl } of registeredButtons) {
    const iconEl = btn.querySelector('.theme-icon') || btn.querySelector('#themeToggleIcon') || btn;
    let label = '';
    let emoji = '';
    
    switch (currentThemePreference) {
      case 'light':
        label = 'Theme: Light';
        emoji = '☀️';
        break;
      case 'dark':
        label = 'Theme: Dark';
        emoji = '🌙';
        break;
      case 'system':
        label = 'Theme: System';
        emoji = '⚙️';
        break;
    }
    
    if (textEl || btn.querySelector('#themeToggleText')) {
      const targetText = textEl || btn.querySelector('#themeToggleText');
      targetText.textContent = label;
    }
    
    if (iconEl && iconEl !== btn) {
      iconEl.textContent = emoji;
    } else if (iconEl === btn) {
      btn.title = label;
      const iconSpan = btn.querySelector('#themeToggleIcon');
      if (iconSpan) {
        iconSpan.textContent = emoji;
      } else {
        btn.textContent = emoji;
      }
    }
  }
}

// Expose on window context
window.initTheme = initTheme;
window.applyTheme = applyTheme;
window.cycleTheme = cycleTheme;
window.bindThemeToggle = bindThemeToggle;
