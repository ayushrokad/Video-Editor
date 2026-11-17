/**
 * @frameflow/design-system - Design Tokens
 * Professional dark theme color tokens inspired by high-end studio monitoring setups.
 */

export const tokens = {
  colors: {
    bg: {
      root: '#0d0f12',         // Deep obsidian background
      panel: '#15181e',        // Neutral slate panel surface
      panelHeader: '#1a1e26',  // Elevated tab/header bar
      input: '#101217',        // Recessed control background
      hover: '#222834',        // Subtle interactive hover state
      active: '#2a3242',       // Active click/drag state
    },
    border: {
      subtle: '#222732',       // Panel boundaries
      focus: '#3b82f6',        // Focused element indicator
      divider: '#1c202a',      // Inner item separators
    },
    accent: {
      blue: '#3b82f6',         // Primary action / playhead
      cyan: '#06b6d4',         // Secondary selection / in-points
      amber: '#f59e0b',        // Markers / warnings
      rose: '#f43f5e',         // Recording / errors / drop frames
      emerald: '#10b981',      // Success / online status / audio OK
      purple: '#8b5cf6',       // Video transitions / FX
    },
    text: {
      primary: '#f3f4f6',      // 95% white text
      secondary: '#9ca3af',    // 60% gray labels
      muted: '#6b7280',        // 40% gray placeholders
      accent: '#60a5fa',       // Highlighted text
    },
    track: {
      video: '#2563eb',        // Video track default banner
      audio: '#059669',        // Audio track default banner
      text: '#7c3aed',         // Subtitle/text track banner
      adjustment: '#d97706',   // Adjustment layer banner
    },
  },
  typography: {
    fontMono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    fontSans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  spacing: {
    headerHeight: '36px',
    statusBarHeight: '24px',
    trackHeightMin: '28px',
    trackHeightDefault: '52px',
    trackHeightMax: '160px',
  },
} as const;
