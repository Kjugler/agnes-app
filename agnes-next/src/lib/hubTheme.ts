/** Light hub pages — shared palette (Sample Chapters, Contest, Author refresh). */

import type { CSSProperties } from 'react';

export const HUB_THEME = {
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  text: '#222222',
  textMuted: '#555555',
  border: '#E5E5E5',
  accentCyan: '#00ffe5',
  primaryGreen: '#00ff7f',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
} as const;

export const HUB_ACCENT_RED = '#b91c1c';

export function hubPageShellStyle(paddingBottom = '4rem'): CSSProperties {
  return {
    backgroundColor: HUB_THEME.bg,
    color: HUB_THEME.text,
    fontFamily: HUB_THEME.fontFamily,
    minHeight: '100vh',
    paddingBottom,
  };
}

export function hubContentWrapStyle(): CSSProperties {
  return {
    maxWidth: '960px',
    margin: '0 auto',
    padding: '24px 20px 0',
    width: '100%',
  };
}

export function hubEyebrowStyle(): CSSProperties {
  return {
    margin: '0 0 12px 0',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: HUB_ACCENT_RED,
  };
}

export function hubPrimaryButtonStyle(active = true): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 22px',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 700,
    border: active ? 'none' : `2px solid ${HUB_THEME.primaryGreen}`,
    background: active ? HUB_THEME.primaryGreen : HUB_THEME.surface,
    color: active ? '#0a0a0a' : HUB_THEME.text,
    textDecoration: 'none',
    boxShadow: active ? '0 0 24px rgba(0, 255, 127, 0.22)' : 'none',
    minWidth: '160px',
    width: '100%',
    cursor: 'pointer',
    transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
  };
}

export function hubSecondaryButtonStyle(): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 22px',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 600,
    border: `2px solid ${HUB_THEME.accentCyan}`,
    background: HUB_THEME.surface,
    color: HUB_THEME.text,
    textDecoration: 'none',
    minHeight: 48,
    minWidth: '160px',
    width: '100%',
    cursor: 'pointer',
    transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
  };
}

export function hubNavCardStyle(emphasis = false): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '18px 20px',
    borderRadius: '12px',
    border: `1px solid ${emphasis ? 'rgba(0, 255, 127, 0.4)' : HUB_THEME.border}`,
    background: HUB_THEME.surface,
    boxShadow: emphasis
      ? '0 12px 32px rgba(0, 0, 0, 0.08)'
      : '0 4px 16px rgba(0, 0, 0, 0.04)',
    textAlign: 'center',
    flex: '1 1 auto',
    minWidth: '160px',
    maxWidth: '100%',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  };
}

export function hubMicroPromptStyle(emphasis = false): CSSProperties {
  return {
    fontSize: '0.75rem',
    color: emphasis ? HUB_THEME.text : HUB_THEME.textMuted,
    marginBottom: '0.25rem',
    minHeight: '1.2em',
    fontWeight: emphasis ? 600 : 400,
  };
}
