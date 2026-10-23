---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/components/PdfPage.tsx","src/components/PagesView.tsx"]
---

# Editor surface

Scope: the whole app window (editor and pages views). Mode: Operate. Owner signs, fills and fixes PDFs on a Mac.

## Direction contract

THESIS: The document is the only thing at rest; every control floats above it like Figma. Refuses the category default of a full-width header bar plus side panels framing the page.

OWN-WORLD: Neutral desk-grey canvas, white paper sheets with soft real shadow. Floating functional layer of translucent rounded capsules (regular glass, 0.5px edge, layered soft shadow). Monochrome system-font controls. One accent: blue ballpoint signature ink, only for selection, handles, the active tool and Save.

STORY: Open or drop a PDF, pick a tool from the bottom bar, place and rotate marks directly on the page, save. Pages view swaps the tool bar for page actions.

FIRST VIEWPORT: Pages centred on the canvas. Top-left capsule: file name and Modifica/Pagine segmented control (clears the macOS traffic lights). Top-right capsule: Timbri, zoom, Save (ink blue). Bottom-centre capsule: tools with shortcuts. A contextual capsule floats above the selected element with rotation and style.

FORM: Pinned by the user's brief (Figma-like floating editor); no concept-seed roll. Code-led, no image generation.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
