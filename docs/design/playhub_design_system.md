---
name: "PlayHub Portal Design System"
description: "Crisp, high-energy light-mode design system for the PlayHub browser game portal and creator-connected play experience."
---

## Overview

PlayHub is a zero-friction browser game portal where players discover, launch, and save web games instantly without mandatory sign-in, while seamlessly connecting to PlayForge creator releases, 3D avatars, social parties, and PlayCoin commerce. The visual language is **Vibrant Modern**: bright, airy neutral surfaces (`#FAF8FF` / `#FFFFFF`) that let colorful game cover art stand out, anchored by electric cobalt (`#004AC6`) for primary play actions and warm terracotta-amber (`#BC4800` / `#F59E0B`) for new-release badges and PlayCoin highlights.

## Colors

The palette uses an electric cobalt primary (`#004AC6`) for instant-play calls to action and active navigation states, paired with cool slate-tinted surfaces that keep dense game libraries scannable without visual fatigue.

- **Primary (`#004AC6`):** Instant-play buttons, active genre chips, and primary focus rings.
- **Tertiary (`#943700` / `#BC4800`):** New/Updated release badges, trending indicators, and creator spotlight tags.
- **PlayCoin Gold (`#D97706`):** Dedicated to the header PlayCoin balance pill and currency indicators.
- **Success (`#15803D`):** Touch-ready device badges and online/ready indicators.

```yaml
colors:
  coin-gold: "#D97706"
  coin-surface: "#FEF3C7"
  on-coin-surface: "#78350F"
  success: "#15803D"
  success-container: "#DCFCE7"
  on-success-container: "#14532D"
  light:
    primary: "#004AC6"
    on-primary: "#FFFFFF"
    primary-container: "#2563EB"
    on-primary-container: "#EEEFFF"
    secondary: "#495C95"
    on-secondary: "#FFFFFF"
    secondary-container: "#DBE1FF"
    on-secondary-container: "#182D63"
    tertiary: "#943700"
    on-tertiary: "#FFFFFF"
    tertiary-container: "#FFDBCD"
    on-tertiary-container: "#581E00"
    error: "#BA1A1A"
    on-error: "#FFFFFF"
    error-container: "#FFDAD6"
    on-error-container: "#93000A"
    background: "#FAF8FF"
    on-background: "#191B23"
    surface: "#FAF8FF"
    surface-container-lowest: "#FFFFFF"
    surface-container-low: "#F3F3FE"
    surface-container: "#EDEDF9"
    surface-container-high: "#E7E7F3"
    surface-container-highest: "#E1E2ED"
    on-surface: "#191B23"
    surface-variant: "#DFE1F4"
    on-surface-variant: "#434655"
    outline: "#737686"
    outline-variant: "#C3C6D7"
    inverse-surface: "#2E3039"
    inverse-on-surface: "#F0F0FB"
  dark:
    primary: "#B4C5FF"
    on-primary: "#002A78"
    primary-container: "#2563EB"
    on-primary-container: "#EEEFFF"
    secondary: "#B4C5FF"
    on-secondary: "#182D63"
    secondary-container: "#33467E"
    on-secondary-container: "#DBE1FF"
    tertiary: "#FFB596"
    on-tertiary: "#581E00"
    tertiary-container: "#BC4800"
    on-tertiary-container: "#FFEDE6"
    error: "#FFB4AB"
    on-error: "#690005"
    error-container: "#93000A"
    on-error-container: "#FFDAD6"
    background: "#11131B"
    on-background: "#E1E2ED"
    surface: "#11131B"
    surface-container-lowest: "#0C0E16"
    surface-container-low: "#191B23"
    surface-container: "#1D1F27"
    surface-container-high: "#282A32"
    surface-container-highest: "#32343D"
    on-surface: "#E1E2ED"
    surface-variant: "#434655"
    on-surface-variant: "#C3C6D7"
    outline: "#8D90A0"
    outline-variant: "#434655"
    inverse-surface: "#E1E2ED"
    inverse-on-surface: "#2E3039"
```

## Typography

**Rubik** drives display and section headings with friendly geometric weight, while **Plus Jakarta Sans** keeps game summaries, filter labels, and navigation crisp at small sizes. **Red Hat Mono** handles game IDs, version tags, and numeric counters with `tabular-nums`.

```yaml
typography:
  display-lg:
    fontFamily: "Rubik"
    fontSize: 40px
    fontWeight: 700
    lineHeight: 46px
    letterSpacing: -0.5px
  display-lg-mobile:
    fontFamily: "Rubik"
    fontSize: 28px
    fontWeight: 700
    lineHeight: 34px
    letterSpacing: -0.25px
  headline-lg:
    fontFamily: "Rubik"
    fontSize: 28px
    fontWeight: 700
    lineHeight: 34px
    letterSpacing: -0.25px
  headline-md:
    fontFamily: "Rubik"
    fontSize: 22px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: -0.15px
  title-lg:
    fontFamily: "Rubik"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 24px
    letterSpacing: 0px
  title-md:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 22px
    letterSpacing: 0px
  body-md:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 21px
    letterSpacing: 0px
  body-sm:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: 0px
  label-lg:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
    letterSpacing: 0px
  label-sm:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.2px
  mono-sm:
    fontFamily: "Red Hat Mono"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0px
```

## Layout & Spacing

Desktop uses a **1280px max-width container** with 24px horizontal page padding and a 12-column fluid grid (`16px`–`24px` gutters). Mobile (`390px`) collapses multi-column grids to 1 or 2 columns with `16px` horizontal page padding and zero horizontal overflow. A strict `4px` / `8px` spacing rhythm separates inner component padding (`8px`–`16px`) from section-level gaps (`32px`–`48px`).

```yaml
spacing:
  gutter-xs: 4px
  gutter-sm: 8px
  gutter-md: 16px
  gutter-lg: 24px
  gutter-xl: 32px
  section: 40px
  page-margin: 24px
  page-margin-mobile: 16px
```

## Elevation & Depth

Hierarchy relies on **tonal surface steps** (`surface` → `surface-container-lowest` `#FFFFFF` cards → `surface-container-low` `#F3F3FE` filter bars) paired with subtle `1px` `outline-variant` borders. Heavy drop shadows are avoided; interactive game cards lift slightly on hover with a soft, low-opacity tinted border transition.

## Shapes

Friendly, approachable corner radii: pills (`9999px`) for genre chips, status badges, and header balance pills; `12px` (`md`) for buttons and search inputs; `16px` (`lg`) for game cards; and `24px` (`xl`) for hero spotlight containers.

```yaml
rounded:
  sm: 6px
  DEFAULT: 8px
  md: 12px
  lg: 16px
  xl: 24px
  full: 9999px
```

## Motion & Micro-interaction

Interactions are crisp and responsive: button and card hover states resolve within `150ms` using `ease-out`, while layout reorder transitions and drawer reveals use `240ms` with a decelerating curve. Only `transform`, `opacity`, and color properties are animated.

```yaml
motion:
  state-change:
    duration: 150ms
    delay: 0ms
    timingFunction: ease-out
  surface-enter:
    duration: 240ms
    delay: 0ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
```

## Voice & Content Strategy

- **Tone:** Direct, welcoming, and player-focused. Emphasize instant action ("즉시 플레이", "이어하기") without onboarding friction.
- **Terminology:** Use consistent PlayHub terms from the sitemap: `홈`, `게임 찾기`, `내 게임`, `아바타`, `소셜`, `만들기`, `PlayCoin`, `계정`.
- **Card Economy:** Each game card shows only cover art, title, 1-line summary, genre/touch/new badges, wishlist toggle, and play action.

## Components

Component implementations live as individual HTML sticker sheet files in
`components/`. Each file contains the canonical, styled HTML components with
`<!-- COMPONENT: name -->` comment markers. Read each file before use.

- **Badge** → `@components/badge.html`: `badge-numeric`, `badge-dot`
- **Button** → `@components/button.html`: `button-primary`, `button-icon`, `button-with-icon`
- **Card** → `@components/card.html`: `card-elevated`, `card-action`, `card-interactive`, `card-interactive-2`
- **Chip** → `@components/chip.html`: `chip-action`, `chip-input`, `chip-with-icon`
- **Searchbar** → `@components/searchbar.html`: `searchbar-standard`, `searchbar-with-suggestions`
