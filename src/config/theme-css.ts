/* ============================================================================
 * THEME → CSS VARS BRIDGE (do not edit — edit src/config/theme.ts instead)
 * ----------------------------------------------------------------------------
 * Turns the `siteTheme` object into a plain CSS string of custom properties:
 *   :root  { --st-font-sans: …; --st-background: …; --st-brand-600: …; … }
 *   .dark  { …same variable names, dark values… }
 *
 * src/app/layout.tsx injects this string into every page with a <style> tag.
 * src/app/globals.css re-points all shadcn/Tailwind tokens at these --st-*
 * variables, which is how ONE file (theme.ts) drives the whole site.
 *
 * Static-export safe: pure string building, no DOM, no fetch, runs anywhere.
 * ========================================================================== */
import { siteTheme, type BrandScale, type ThemeColorSet } from "./theme";

const BRAND_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

function cssVarName(token: string): string {
  return `--st-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** font/radius/popup tokens (mode-independent — defined once on :root). */
function structuralVars(): string[] {
  const t = siteTheme;
  return [
    // fonts
    `--st-font-sans: ${t.fonts.sans}`,
    `--st-font-serif: ${t.fonts.serif}`,
    `--st-font-mono: ${t.fonts.mono}`,
    `--st-font-bengali: ${t.fonts.bengali}`,
    // radius (sm/md/lg/xl derive from base → one value rules them all)
    `--st-radius-base: ${t.radius.base}`,
    `--st-radius-sm: ${t.radius.sm}`,
    `--st-radius-md: ${t.radius.md}`,
    `--st-radius-lg: ${t.radius.lg}`,
    `--st-radius-xl: ${t.radius.xl}`,
    `--st-radius-full: ${t.radius.full}`,
    // popups (toasts, dropdowns, dialogs)
    `--st-popup-radius: ${t.popup.radius}`,
    `--st-popup-shadow: ${t.popup.shadow}`,
    `--st-popup-shadow-sm: ${t.popup.shadowSm}`,
    `--st-popup-border-width: ${t.popup.borderWidth}`,
    `--st-popup-border-style: ${t.popup.borderStyle}`,
    `--st-popup-backdrop-blur: ${t.popup.backdropBlur}`,
  ];
}

/** One color set (light or dark) → "–st-<name>: <value>" lines. */
function colorVars(c: ThemeColorSet): string[] {
  const tokens: Array<[string, string]> = [
    ["background", c.background],
    ["foreground", c.foreground],
    ["card", c.card],
    ["card-foreground", c.cardForeground],
    ["popover", c.popover],
    ["popover-foreground", c.popoverForeground],
    ["primary", c.primary],
    ["primary-foreground", c.primaryForeground],
    ["secondary", c.secondary],
    ["secondary-foreground", c.secondaryForeground],
    ["muted", c.muted],
    ["muted-foreground", c.mutedForeground],
    ["accent", c.accent],
    ["accent-foreground", c.accentForeground],
    ["destructive", c.destructive],
    ["destructive-foreground", c.destructiveForeground],
    ["success", c.success],
    ["warning", c.warning],
    ["border", c.border],
    ["input", c.input],
    ["ring", c.ring],
  ];
  const lines = tokens.map(([name, value]) => `--st-${name}: ${value}`);
  lines.push(...brandVars(c.brand));
  return lines;
}

function brandVars(brand: BrandScale): string[] {
  return BRAND_SHADES.map((shade) => `--st-brand-${shade}: ${brand[shade]}`);
}

function block(selector: string, lines: string[]): string {
  const body = lines.map((l) => (l.startsWith("/*") ? `  ${l}` : `  ${l};`)).join("\n");
  return `${selector} {\n${body}\n}`;
}

/** Build the full injected stylesheet ("(re)compute the CSS vars"). */
export function themeToCssVars(): string {
  const header =
    "/* Auto-generated from src/config/theme.ts — DO NOT EDIT HERE.\n" +
    "   To change the whole site (fonts, colors, radius, popups) edit theme.ts. */";
  const root = block(":root", [
    "/* fonts, radius, popups */",
    ...structuralVars(),
    "/* colors (light) */",
    ...colorVars(siteTheme.colors.light),
  ]);
  const dark = block(".dark", [
    "/* colors (dark) — same variable names, active when <html class=\"dark\"> */",
    ...colorVars(siteTheme.colors.dark),
  ]);
  return `${header}\n${root}\n${dark}`;
}

/** The final CSS string injected by layout.tsx. */
export const themeCss: string = themeToCssVars();
