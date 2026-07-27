# TaxBot Design System Foundation

## Source Of Truth

- `public/css/tokens.css` owns primitive values, semantic theme roles, and compatibility aliases.
- `tailwind.config.cjs` maps existing Tailwind color names to primitive token channels.
- `public/js/theme.js` owns theme detection, persistence, application, and toggle binding.
- `public/css/console-shell.css` owns authenticated console geometry, navigation, header actions, shell menus, and responsive shell modes.
- `public/js/console-shell.js` owns sidebar persistence, mobile drawer state, and the profile menu.

Page-level styles may consume tokens but must not redefine global theme values.

## Token Layers

1. Primitive tokens hold raw palette, spacing, typography, radius, motion, shadow, and layer values.
2. Semantic tokens describe purpose, such as surface, border, text, accent, status, focus, and disabled roles.
3. Compatibility aliases preserve the existing console and landing APIs, including `--bg-app`, `--primary`, `--text-muted`, and `--surface-card`.

New components should prefer semantic roles. Compatibility aliases exist to support gradual migration without changing product behavior.

## Theme Contract

The persisted value uses `taxbot_theme` with `light` or `dark`. Without a saved preference, TaxBot follows the operating-system preference.

The controller applies:

- `html.dark` for Tailwind dark variants
- `html[data-theme]` as the canonical state
- `body.dark-theme` for existing console selectors and chart code
- `taxbot:themechange` when the active theme changes

Use `window.TaxBotTheme.bindToggle()` for theme controls. Do not add page-specific storage or root-class logic.

## Console Shell Contract

- Desktop sidebar widths are defined by `--shell-sidebar-expanded` and `--shell-sidebar-collapsed`.
- Header and action dimensions use `--shell-header-height` and `--shell-action-size`.
- Desktop sidebar collapse preference uses `taxbot_sidebar_collapsed`.
- Mobile navigation is a focus-managed drawer and closes on navigation, backdrop click, or Escape.
- Command search, notifications, and profile controls expose their expanded state through ARIA.
- Mobile notification and profile menus anchor to viewport gutters so they cannot overflow the screen.

## Migration Rules

- Do not add raw color values to new component rules when an existing semantic token fits.
- Keep spacing on the 4px foundation scale.
- Use the shared radius, shadow, motion, and z-index tokens.
- Keep text and status contrast meaningful in both themes.
- Preserve visible focus styles and honor reduced-motion preferences.
- Validate changes through `npm run test:ui` at 390px and 1440px in both themes.
