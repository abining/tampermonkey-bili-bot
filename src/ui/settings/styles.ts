import settingsCssText from './settings.css?inline';

export const SETTINGS_CSS_TEXT = settingsCssText;
export const SETTINGS_STYLE_MARKER = 'bvs-settings-styles';

export function injectSettingsStyles(
  root: Document | ShadowRoot | HTMLElement,
): HTMLStyleElement {
  const existing = root.querySelector<HTMLStyleElement>(
    `style[data-style-id="${SETTINGS_STYLE_MARKER}"]`,
  );
  if (existing) return existing;

  const style = document.createElement('style');
  style.dataset.styleId = SETTINGS_STYLE_MARKER;
  style.textContent = SETTINGS_CSS_TEXT;
  const target = root instanceof Document
    ? root.head || root.documentElement
    : root;
  target.appendChild(style);
  return style;
}
