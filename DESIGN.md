---
name: PDF Toolkit
description: A local Mac PDF editor where the page is the only thing at rest and every control floats above it.
colors:
  canvas: "oklch(0.925 0 0)"
  paper: "#ffffff"
  float: "oklch(0.995 0 0 / 0.78)"
  float-solid: "oklch(0.99 0 0)"
  float-edge: "oklch(0 0 0 / 0.08)"
  foreground: "oklch(0.2 0.004 264)"
  muted-foreground: "oklch(0.46 0.006 264)"
  muted: "oklch(0 0 0 / 0.05)"
  accent: "oklch(0 0 0 / 0.06)"
  border: "oklch(0 0 0 / 0.1)"
  input: "oklch(0 0 0 / 0.14)"
  ink: "oklch(0.46 0.2 266)"
  ink-soft: "oklch(0.46 0.2 266 / 0.12)"
  ink-foreground: "oklch(0.99 0 0)"
  ring: "oklch(0.46 0.2 266 / 0.55)"
  destructive: "oklch(0.56 0.21 27)"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    fontFeature: "\"tnum\""
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
rounded:
  sheet: "2px"
  inner: "8px"
  control: "10px"
  capsule: "14px"
  panel: "16px"
  pill: "9999px"
spacing:
  bar-pad: "4px"
  window-edge: "12px"
  bar-gap: "8px"
  page-gap: "32px"
  canvas-pad: "80px"
components:
  float-bar:
    backgroundColor: "{colors.float}"
    rounded: "{rounded.capsule}"
    padding: "4px"
  tool-button:
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    size: "32px"
  tool-button-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.foreground}"
  tool-button-active:
    backgroundColor: "{colors.ink-soft}"
    textColor: "{colors.ink}"
  segmented:
    backgroundColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "2px"
    height: "28px"
  segmented-thumb:
    backgroundColor: "{colors.float-solid}"
    rounded: "{rounded.inner}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "32px"
  button-ghost:
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "32px"
  float-panel:
    backgroundColor: "{colors.float-solid}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.panel}"
    padding: "16px"
    width: "288px"
  inline-field:
    backgroundColor: "{colors.muted}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    height: "32px"
  page-number-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-foreground}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: PDF Toolkit

## Overview

**Creative North Star: "The Paper on the Desk"**

The document is the only thing at rest. A neutral desk-grey canvas holds white paper sheets that cast a soft, real shadow, and every control lives in a separate floating layer of translucent rounded capsules hovering above the work, the way Figma floats its tools over a design. There is no full-width header bar and no docked side panel framing the page; the window chrome is the canvas itself.

The floating layer is monochrome, set in the system font at macOS density (13px), so the controls read as instruments rather than decoration. One colour carries meaning: the blue of a ballpoint signature. It marks only what the user is acting on (selection, handles, the active tool, focus) and the one action that commits work (Save). Everything else is greys and alpha over grey.

Light and dark are equal citizens. In dark mode the canvas goes near-black, capsules become smoked glass, and the white sheets are dimmed slightly so they do not glow in a dark room; the paper stays paper.

**Key Characteristics:**
- Desk-grey canvas, white paper sheets with layered ambient shadow.
- Controls float in translucent glass capsules (blur 24px, 0.5px hairline edge, layered soft shadow), anchored to window corners and the bottom centre.
- One accent, signature ink blue, rationed to selection, active state, focus and Save.
- System font throughout, 13px base, medium weight for controls, tabular numbers for every count, size and angle.
- Concentric rounding: 14px capsule, 4px padding, 10px buttons inside.
- Motion is short and soft: things rise in with a slight blur and settle on a smooth-out curve.

## Colors

A colourless room with one pen in it: neutrals do all the structural work, and the ink appears only where the user's hand is.

### Primary
- **Signature Ink** (ink): the only chromatic UI colour. Fills the Save button and the selected page-number pill; tints the active tool (ink at 12%, ink-soft, under ink-coloured glyphs); draws selection outlines (1.5px), rotation and resize handles, the page drop indicator, focus rings (ring), the text caret and text-selection highlight. In dark mode it lifts to a lighter blue (oklch(0.62 0.17 264)) with a dark foreground.

### Neutral
- **Desk Grey** (canvas): the window background behind the pages. Pure neutral, no hue.
- **Paper White** (paper): the page sheet only. Never used as a UI surface.
- **Clear Glass** (float): the translucent capsule fill, 78% opaque over a 24px backdrop blur.
- **Frosted Solid** (float-solid): popovers, dialogs, the text-bearing side panel, and the fallback capsule fill when reduced transparency is requested.
- **Hairline** (float-edge, border): 8-10% black edges and in-bar dividers.
- **Graphite** (foreground): primary text and glyphs; tool glyphs sit at 80% and rise to full on hover.
- **Pencil Grey** (muted-foreground): secondary labels, hints, unselected page numbers, inactive segmented options.
- **Smudge** (muted, accent): 5-6% black wash for hover states, the segmented track and inline number fields.
- **Correction Red** (destructive): delete only, and only on hover (10% tinted wash plus red glyph), never at rest.

### Named Rules
**The One Pen Rule.** Signature Ink is reserved for selection, handles, the active tool, focus, drop targets and Save. If something is ink-coloured, the user is either touching it or about to commit it.

**The Alpha-Over-Grey Rule.** UI neutrals are black (light) or white (dark) at low alpha, not fixed greys, so hover and fill states read the same over canvas, glass or paper.

## Typography

**Display Font:** System UI (SF Pro on macOS, Segoe UI on Windows, system-ui elsewhere)
**Body Font:** the same stack
**Label/Mono Font:** the same stack with tabular numerals

**Character:** One native face at native density. The app should feel like it shipped with the Mac, so it never introduces a brand typeface.

### Hierarchy
- **Display** (600, 22px, -0.01em): the single headline of the empty state. Nowhere else.
- **Title** (600, 13px): panel and dialog headings; weight, not size, carries hierarchy.
- **Body** (400, 13px): panel copy, form labels, menu text.
- **Label** (500, 13px, tabular numerals): button text, file name, segmented options, zoom percentage, font size and angle readouts.
- **Caption** (400, 12px): page numbers under sheets and thumbnails, field hints.

### Named Rules
**The Native Density Rule.** The base is 13px, the macOS body size. Hierarchy comes from weight (400/500/600) and grey level, not from a size ramp.

**The Tabular Rule.** Every number that changes (zoom, size, angle, page index) uses tabular figures so controls never jitter.

## Layout

The canvas fills the window and scrolls; pages stack in a centred column 32px apart with 80px of top and side breathing room and 128px at the bottom so the tool capsule never covers the last page. The floating layer is a pointer-transparent overlay pinned to the window: a top-left capsule (file menu and Modifica/Pagine segmented control) inset 84px on macOS to clear the traffic lights, 12px elsewhere; a top-right capsule (stamps, zoom, Save) 12px from the edge; both 10px from the top. The tool capsule is centred 16px above the bottom edge. The stamps panel floats 60px from the top on the right, 288px wide, and never docks.

The pages view swaps the column for an auto-filling thumbnail grid (32px column gap, 40px row gap, 40px side padding) and swaps the bottom tool capsule for a page-actions capsule in the same position. The contextual item bar floats above the selected element (below it when there is no room), centred on it.

## Elevation & Depth

Depth is literal: three planes, each with its own shadow. The canvas is the floor. Paper sits one step up with an ambient two-layer shadow. The floating layer sits highest with a hairline ring plus a tight and a wide soft shadow, and blurs what is under it. Nothing uses hard or offset shadows.

### Shadow Vocabulary
- **Paper** (`box-shadow: 0 1px 2px oklch(0 0 0 / 0.08), 0 6px 24px -6px oklch(0 0 0 / 0.16)`): page sheets and thumbnails only. Dark mode adds a 1px white 7% ring and deepens the drop.
- **Float** (`box-shadow: 0 0 0 0.5px oklch(0 0 0 / 0.08), 0 2px 4px oklch(0 0 0 / 0.04), 0 10px 32px -8px oklch(0 0 0 / 0.2)`): every capsule and the floating panel.
- **Thumb** (`box-shadow: 0 1px 2px oklch(0 0 0 / 0.12), 0 0 0 0.5px oklch(0 0 0 / 0.06)`): the sliding highlight inside the segmented control.

### Named Rules
**The Three Planes Rule.** Canvas, paper, float. A new surface joins one of the three planes and takes that plane's shadow; it does not invent a fourth.

**The Glass Needs a Floor Rule.** Translucent float material is for compact capsules. Surfaces that carry paragraphs or forms (the stamps panel) use the 95% solid panel material so text reads as one tone over paper or canvas; under prefers-reduced-transparency capsules go fully solid.

## Shapes

Rounding is concentric and scaled to the object: page sheets are nearly square (2px; 3px on the tilted empty-state sheet) because paper is paper. Capsules are 14px with 4px padding so the 10px buttons inside share their curve; the segmented track is 10px with an 8px thumb; the side panel is 16px. Swatches, the rotation handle and page-number chips are full circles or pills; the resize handle is a 10px square with 2px corners. Borders are hairlines (0.5px on glass, 1px dividers 20px tall inside bars); selection is an outline, not a border, so it never shifts layout.

## Components

### Floating Capsule
The signature container: a translucent glass pill of controls hovering over the canvas.
- **Shape:** 14px radius, 4px padding, 2px gap between buttons.
- **Material:** float glass, 24px backdrop blur with 1.6 saturation, Float shadow.
- **Grouping:** 1px x 20px hairline dividers with 4px side margin separate tool groups.
- **Entrance:** rises 6px from 97% scale with a 2px blur over 250ms on the smooth-out curve; reduced motion removes it.

### Tool Button
- **Shape:** 32px square, 10px radius; icons 18px at 1.75 stroke.
- **Default:** Graphite at 80%, no fill.
- **Hover / Focus:** Smudge fill and full Graphite; 2px ink focus ring; presses to 96% scale.
- **Active:** ink-soft fill with an ink glyph; it stays that way on hover.
- **Destructive:** Delete stays neutral at rest and turns Correction Red over a 10% red wash on hover.
- **Tooltip:** inverted (Graphite fill, canvas text), 12px, carrying the keyboard shortcut in a key cap.

### Segmented Control
- **Track:** Smudge fill, 10px radius, 2px inset; equal-width options 28px tall, label weight with a 16px icon.
- **Thumb:** Frosted Solid (white 12% in dark), 8px radius, Thumb shadow, slides between options over 250ms on the smooth-out curve.
- **States:** selected option Graphite, others Pencil Grey rising to Graphite on hover.

### Buttons
- **Shape:** 10px radius in the floating layer and empty state; 32px tall in bars, 36px in the empty state.
- **Primary (Save, Apri):** Signature Ink with Ink Foreground text, 14-16px horizontal padding, 80% ink on hover, presses to 96%.
- **Ghost:** no fill, Graphite text, Smudge on hover; used for the file menu, zoom readout and page actions with text.

### Contextual Item Bar
A Floating Capsule that appears over the selected mark: size stepper with tabular readout, round 20px ink swatches (the chosen one ringed in ink with a 2px offset), a custom-colour picker, rotate button and an inline angle field, then delete. The inline angle field is a 32px Smudge pill with an ink focus-within ring.

### Selection & Handles
- **Selected mark:** 1.5px ink outline; hover on an unselected mark shows ink at 60%.
- **Rotate handle:** a 12px white circle with a 1.5px ink border on a 1px ink stem, 32px above the mark.
- **Resize handle:** a 10px white square with 2px corners and 1.5px ink border at the bottom-right corner (not on text).

### Form-Field Tint
Fillable AcroForm fields on the page wear an 8% ink wash (14% on hover, 6% plus a 2px ink ring when focused) with 2px corners, so the user sees what is fillable without anything being drawn onto the paper. Read-only fields lose the tint.

### Page Thumbnails
Paper sheets with 2px corners that lift 2px on hover; selection is a 2.5px ink outline at a 4px offset, plus the page-number chip turning into an ink pill. Reorder drop position is a 3px ink rule between thumbnails.

### Floating Panel
The stamps panel: 288px wide, 16px radius, 16px padding, 20px between sections, 95% solid panel material with Float shadow and the same rise-in entrance. Native selects and inputs inside use 8px radius with a 1px input border.

### Empty State
A single paper sheet tilted -2deg (264 x 340px) with faint grey text lines and a signature that draws itself in ink once; it straightens and grows 2% on hover over 400ms. Below it, the only Display headline, a one-line Pencil Grey subline, and a Primary plus a Ghost button.

## Do's and Don'ts

### Do:
- **Do** put every new control in a Floating Capsule or the Floating Panel over the canvas, anchored to a window corner, the bottom centre, or the element it acts on.
- **Do** keep capsules concentric: 14px outer radius, 4px padding, 10px controls.
- **Do** use Signature Ink only for selection, handles, the active tool, focus, drop targets and the commit action.
- **Do** use the system font at 13px with weight for hierarchy and tabular figures for every changing number.
- **Do** give floating surfaces the float-enter rise (250ms, cubic-bezier(0.22, 1, 0.36, 1)) and honour reduced motion and reduced transparency.
- **Do** dim paper (brightness 0.92) rather than greying it in dark mode.

### Don't:
- **Don't** add a full-width header bar or dock panels to the window edges; the canvas runs edge to edge.
- **Don't** introduce a second accent colour or use ink for decoration, headings or idle states.
- **Don't** put translucent glass under paragraphs or forms; use the panel material.
- **Don't** use hard or offset shadows, or a fourth shadow plane.
- **Don't** use paper white as a UI surface; white belongs to the page.
- **Don't** show destructive red at rest; it appears on hover of a delete control only.
