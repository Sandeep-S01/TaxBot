---
name: TaxBot Design System
version: 1.0.0
tokens:
  colors:
    primary: "#6366f1"
    secondary: "#8b5cf6"
    success: "#10b981"
    warning: "#f59e0b"
    danger: "#ef4444"
    background: "#090b10"
    surface: "#121520"
    surface_hover: "#1a1e2d"
    border: "#1f2433"
    text:
      main: "#f8fafc"
      muted: "#94a3b8"
      dim: "#64748b"
  typography:
    fonts:
      body: "'Inter', system-ui, -apple-system, sans-serif"
      heading: "'Outfit', 'Inter', system-ui, sans-serif"
    sizes:
      h1: "48px"
      h2: "32px"
      h3: "20px"
      body: "15px"
      small: "13px"
    weights:
      normal: "400"
      medium: "500"
      semibold: "600"
      bold: "700"
  spacing:
    xs: "4px"
    sm: "8px"
    md: "16px"
    lg: "24px"
    xl: "40px"
    xxl: "64px"
  radius:
    sm: "8px"
    md: "12px"
    lg: "20px"
    round: "9999px"
  transitions:
    fast: "0.2s cubic-bezier(0.16, 1, 0.3, 1)"
    normal: "0.3s cubic-bezier(0.16, 1, 0.3, 1)"
---

# TaxBot Design System Specification

This document serves as the machine-readable design system manifest for **TaxBot**. It defines the visual tokens, design principles, component styles, and interaction behaviors for use with AI generation tools (e.g., Google Labs Stitch, code generation models).

---

## 1. Visual Principles

### 1.1 Cosmic Dark Aesthetic
- The interface utilizes a deep, cosmic dark navy background canvas (`#090b10`) to project high trust and financial security.
- Surfaces use translucent, glassmorphic filters (`rgba(18, 21, 32, 0.65)`) with a backdrop blur (`16px`) to separate hierarchy layers.

### 1.2 Contrast & Legibility
- Typography focuses on high legibility of numbers and text using standard font systems (`Inter` for values/data, `Outfit` for display headings).
- Colors are leveraged semantically—Green (`#10b981`) indicates tax offsets or growth inputs; Red (`#ef4444`) shows liabilities and error states.

### 1.3 Adaptive Responsiveness
- All views automatically adapt layout columns dynamically from ultra-mobile screen boundaries (`320px`) to desktop viewports (`1200px+`).
- Side panels and navigation blocks transition into collapsible panels and off-canvas drawers on touch screens.

---

## 2. Component Guidelines

### 2.1 Buttons & Call-to-Actions (CTAs)
- **Primary Buttons**: Rendered with active gradient styling (`linear-gradient(135deg, #6366f1, #8b5cf6)`) and soft box-shadows. On hover, buttons scale upwards slightly and enhance their shadow.
- **Outline Buttons**: Transparent background, thin bordered edges. Transitions to a soft white background opacity (`rgba(255, 255, 255, 0.05)`) on hover.

### 2.2 Cards & Containers
- Built with rounded corners (`border-radius: var(--radius-lg)`).
- On hover, cards lift up (`transform: translateY(-4px)`) and active border glowing is triggered (`border-color: rgba(99, 102, 241, 0.25)`).

### 2.3 Form Fields & Selectors
- Flat-styled dark inputs with a subtle inset shadow and soft border lines.
- Focused fields automatically change borders to Indigo (`#6366f1`) and cast a subtle light-blue glow.

### 2.4 Data Tables
- Wrapped in container slots featuring `overflow-x: auto` to prevent overflow on small screens.
- Rows highlight with light transparent backgrounds (`rgba(255, 255, 255, 0.015)`) on focus.

---

## 3. Motion & Animation
- **Hardware Acceleration**: Transitions use CSS properties (`transform`, `opacity`) to ensure 60fps scrolling animations on mobile layouts.
- **Scroll Toggles**: Clean page scroll behaviors using `scroll-behavior: smooth`.
- **Scrollbars**: Stylized scrollbars matching the dark canvas palette are applied to avoid visual clutter.
