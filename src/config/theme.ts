/* ============================================================================
 * ★★★ EDIT THIS FILE TO CHANGE THE WHOLE SITE ★★★
 * ----------------------------------------------------------------------------
 * This is the ONE-AND-ONLY place that controls the look of the entire site:
 *   • fonts (body text, headings, code, Bengali text)
 *   • colors (background, text, cards, buttons, borders, the brand green, …)
 *   • corner radius (one base value drives small/medium/large/xl corners)
 *   • popups (toast notifications, dropdowns, dialogs — corners, shadow, border)
 *
 * HOW IT WORKS (you do not need to read this part):
 *   Every value below is turned into CSS variables and injected into every
 *   page by src/app/layout.tsx (see src/config/theme-css.ts). All styles,
 *   components and Tailwind utility classes (bg-brand-600, bg-card,
 *   rounded-lg, font-sans, …) read those variables. Change a value here and
 *   it updates EVERYWHERE automatically — no other file needs editing.
 *
 * VALUE FORMAT:
 *   • Colors: any CSS color works. Hex is easiest ("#059669"). You can also
 *     use rgb()/hsl()/oklch() or see-through colors like "rgb(0 0 0 / 0.5)".
 *   • Fonts: a comma-separated list. The browser tries each font from left
 *     to right and uses the first one it has. Always keep a generic keyword
 *     (sans-serif / serif / monospace) at the end as a safety net.
 *   • Sizes: CSS lengths — "0.625rem", "12px", …
 *
 * NOTE ABOUT WEB FONTS: this site loads 4 real web fonts in
 * src/app/layout.tsx via next/font (they get CSS variables:
 * --font-kalpurush, --font-sutonny, --font-geist-sans, --font-geist-mono,
 * --font-bengali). The stacks below reference those variables. To use a
 * DIFFERENT web font site-wide: (1) add its import in src/app/layout.tsx
 * with variable: "--font-myfont", (2) put "var(--font-myfont)" FIRST in the
 * stack here. To use a normal font everyone has installed (e.g. Verdana),
 * just put the name in quotes first: "Verdana", …
 * ========================================================================== */

/* ---------- 1) FONTS ------------------------------------------------------ */
export interface ThemeFonts {
  /** Main site font (body text, buttons, everything by default). */
  sans: string;
  /** Optional heading/serif font. Headings currently use `sans`; switch the
   *  `font-serif`/`font-heading` usages in components if you want this. */
  serif: string;
  /** Font for code / preformatted text. */
  mono: string;
  /** Font used for Bengali (বাংলা) glyphs — it is part of the `sans` stack,
   *  so Bengali characters automatically fall through to it. */
  bengali: string;
}

/* ---------- 2) COLORS ----------------------------------------------------- */
/** Brand shades 50 (lightest) … 950 (darkest). Used by utilities like
 *  bg-brand-600, text-brand-700, border-brand-300, from-brand-400, … */
export type BrandShade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;
export type BrandScale = Record<BrandShade, string>;

/** One full set of surface/semantic colors. `light` is the normal site look,
 *  `dark` is used only if the <html> element gets a "dark" class. */
export interface ThemeColorSet {
  /** Page background / default text color. */
  background: string;
  foreground: string;
  /** Card surfaces (the rounded panels every section lives in). */
  card: string;
  cardForeground: string;
  /** Popup background / text (toast notifications, dropdown lists). */
  popover: string;
  popoverForeground: string;
  /** Primary brand surface (dark buttons etc.). */
  primary: string;
  primaryForeground: string;
  /** Subtle secondary surface (secondary buttons, hover fills). */
  secondary: string;
  secondaryForeground: string;
  /** Muted backgrounds and the dimmed ("muted") body text color. */
  muted: string;
  mutedForeground: string;
  /** Hover/highlight surface. */
  accent: string;
  accentForeground: string;
  /** Error / delete color. */
  destructive: string;
  /** Text/icon color used ON TOP of the destructive color (error toasts etc.).
   *  Keep it white — the destructive red is dark enough for white text. */
  destructiveForeground: string;
  /** Success color (new token — free for future use). */
  success: string;
  /** Warning color (new token — free for future use). */
  warning: string;
  /** Lines/borders around inputs and panels. */
  border: string;
  /** Input border color. */
  input: string;
  /** Focus ring color (keyboard focus outlines). */
  ring: string;
  /** The site's brand color scale (currently the emerald green family). */
  brand: BrandScale;
}

/* ---------- 3) CORNER RADIUS ---------------------------------------------- */
export interface ThemeRadius {
  /** ★ THE one radius value. sm/md/lg/xl below are derived from it —
   *  change ONLY this (and `full` if you ever want pill-shaped things). */
  base: string;
  /** Derived — buttons/inputs small corners. Leave as-is. */
  sm: string;
  /** Derived — medium corners (toasts, dropdowns). Leave as-is. */
  md: string;
  /** Derived — large corners (cards' inner elements). Leave as-is. */
  lg: string;
  /** Derived — extra-large corners (cards themselves). Leave as-is. */
  xl: string;
  /** Fully-round (circles/pills). */
  full: string;
}

/* ---------- 4) POPUPS (toasts, dropdowns, dialogs) ------------------------- */
export interface ThemePopup {
  /** Corner rounding of popups. "var(--st-radius-md)" follows the radius
   *  above; or set a fixed size like "12px" to decouple it. */
  radius: string;
  /** Shadow of big popups (toast notifications, future dialogs). */
  shadow: string;
  /** Shadow of small popups (select dropdown lists, future tooltips). */
  shadowSm: string;
  /** Border thickness of popups. */
  borderWidth: string;
  /** Border style of popups (solid / dashed / …). */
  borderStyle: string;
  /** Blur of the dimmed page behind modal dialogs (future dialogs). */
  backdropBlur: string;
}

/* ==========================================================================
 * THE THEME — everything below this line is what you actually edit.
 * ========================================================================== */
export interface SiteTheme {
  fonts: ThemeFonts;
  colors: { light: ThemeColorSet; dark: ThemeColorSet };
  radius: ThemeRadius;
  popup: ThemePopup;
}

export const siteTheme: SiteTheme = {
  /* ---------- FONTS ----------
   * `sans` drives ALL body text. Bengali glyphs fall through to the
   * bengali web font automatically (it sits in the sans stack). */
  fonts: {
    sans: 'var(--font-kalpurush), var(--font-bengali), var(--font-geist-sans), "Noto Sans Bengali", sans-serif',
    serif: 'Georgia, Cambria, "Times New Roman", Times, var(--font-bengali), serif',
    mono: 'var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    bengali: 'var(--font-bengali), "Noto Sans Bengali", var(--font-kalpurush), sans-serif',
  },

  /* ---------- COLORS (light = the normal site) ---------- */
  colors: {
    light: {
      background: "#ffffff",
      foreground: "#0a0a0a",
      card: "#ffffff",
      cardForeground: "#0a0a0a",
      popover: "#ffffff",
      popoverForeground: "#0a0a0a",
      primary: "#171717",
      primaryForeground: "#fafafa",
      secondary: "#f5f5f5",
      secondaryForeground: "#171717",
      muted: "#f5f5f5",
      mutedForeground: "#737373",
      accent: "#f5f5f5",
      accentForeground: "#171717",
      destructive: "#e7000b",
      destructiveForeground: "#ffffff",
      success: "#16a34a",
      warning: "#d97706",
      border: "#e5e5e5",
      input: "#e5e5e5",
      ring: "#a3a3a3",

      /* BRAND scale — the green used across the whole site.
       * Change brand-600 (buttons) + brand-700 (hover) for the most visible
       * change; adjust the neighbours to taste. */
      brand: {
        50: "#ecfdf5",
        100: "#d1fae5",
        200: "#a7f3d0",
        300: "#6ee7b7",
        400: "#34d399",
        500: "#10b981",
        600: "#059669",
        700: "#047857",
        800: "#065f46",
        900: "#064e3b",
        950: "#022c22",
      },
    },

    /* ---------- COLORS (dark) ----------
     * Used only when <html> has class="dark" (the site has no dark toggle
     * yet, so these are dormant). Kept in sync so a toggle can be added
     * without redesigning. */
    dark: {
      background: "#0a0a0a",
      foreground: "#fafafa",
      card: "#171717",
      cardForeground: "#fafafa",
      popover: "#171717",
      popoverForeground: "#fafafa",
      primary: "#e5e5e5",
      primaryForeground: "#171717",
      secondary: "#262626",
      secondaryForeground: "#fafafa",
      muted: "#262626",
      mutedForeground: "#a3a3a3",
      accent: "#262626",
      accentForeground: "#fafafa",
      destructive: "#ff6467",
      destructiveForeground: "#ffffff",
      success: "#22c55e",
      warning: "#f59e0b",
      border: "rgb(255 255 255 / 0.1)",
      input: "rgb(255 255 255 / 0.15)",
      ring: "#737373",

      /* Brand on dark backgrounds — currently identical to light. If your
       * brand color ever looks too dark/bright on dark mode, override
       * individual shades here (e.g. 400: "#4ade80"). */
      brand: {
        50: "#ecfdf5",
        100: "#d1fae5",
        200: "#a7f3d0",
        300: "#6ee7b7",
        400: "#34d399",
        500: "#10b981",
        600: "#059669",
        700: "#047857",
        800: "#065f46",
        900: "#064e3b",
        950: "#022c22",
      },
    },
  },

  /* ---------- CORNER RADIUS ----------
   * One value rules them all: buttons, inputs, cards AND popups. */
  radius: {
    base: "0.625rem", // ← edit this single value to re-round the whole site
    sm: "calc(var(--st-radius-base) - 4px)", // derived — leave as-is
    md: "calc(var(--st-radius-base) - 2px)", // derived — leave as-is
    lg: "var(--st-radius-base)", // derived — leave as-is
    xl: "calc(var(--st-radius-base) + 4px)", // derived — leave as-is
    full: "9999px", // circles & pills
  },

  /* ---------- POPUPS (toasts, dropdown lists, dialogs) ---------- */
  popup: {
    radius: "var(--st-radius-md)", // follows radius.base; or e.g. "12px"
    shadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    shadowSm: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    borderWidth: "1px",
    borderStyle: "solid",
    backdropBlur: "8px",
  },
};

/* ============================================================================
 * HOW TO — 3 recipes
 * ----------------------------------------------------------------------------
 * (a) CHANGE THE SITE FONT EVERYWHERE:
 *     1. If it is a common font, edit `fonts.sans` below: put the name first,
 *        e.g. sans: 'Verdana, "Noto Sans Bengali", sans-serif'.
 *     2. If it is a web font, first add it in src/app/layout.tsx:
 *          import { Inter } from "next/font/google";
 *          const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
 *        …put ${inter.variable} in the <html> className there, then use
 *        sans: 'var(--font-inter), "Noto Sans Bengali", sans-serif' here.
 *     Body text, headings, buttons — everything — switches at once. Keep a
 *     Bengali-capable font in the stack (e.g. var(--font-bengali)) so
 *     বাংলা text still renders.
 *
 * (b) CHANGE THE BRAND COLOR (the green):
 *     Edit `colors.light.brand` below. Start with 600 (buttons/solid fills)
 *     and 700 (hover) — e.g. for a blue site: 600: "#2563eb", 700: "#1d4ed8",
 *     then tweak 50–500 (light tints) and 800–950 (dark tints) to match.
 *     Every brand- utility (bg-brand-600, text-brand-700, border-brand-300 …)
 *     across the site updates.
 *     For dark mode adjust `colors.dark.brand` the same way.
 *
 * (c) CHANGE POPUP CORNERS / SHADOW:
 *     Edit the `popup` object below. radius: "0px" = sharp corners,
 *     "12px" = very round. shadow: a CSS box-shadow, e.g.
 *     "0 20px 40px -12px rgb(0 0 0 / 0.35)" for a dramatic floating look.
 *     Toasts, select dropdowns (and any dialogs you add later) all follow.
 * ========================================================================== */
