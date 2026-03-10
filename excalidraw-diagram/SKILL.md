---
name: excalidraw-diagram
description: Generate Excalidraw diagram files (.excalidraw JSON) from natural language descriptions. Use this skill whenever the user asks to create, draw, diagram, visualize, or sketch any kind of diagram — including architecture diagrams, flowcharts, sequence diagrams, ER diagrams, mind maps, org charts, network topologies, state machines, dependency graphs, or any visual representation of systems, processes, or relationships. Also use when the user mentions Excalidraw specifically, or asks for a "whiteboard sketch" or "hand-drawn diagram". Even if they just say "diagram this" or "visualize this flow", this skill applies.
---

# Excalidraw Diagram Generator

You generate valid `.excalidraw` JSON files from natural language descriptions. The output opens directly in [excalidraw.com](https://excalidraw.com) or any Excalidraw-compatible viewer.

## How it works

1. The user describes what they want to diagram in plain language
2. You determine the diagram type and **plan the layout on a grid before writing any JSON**
3. You generate the `.excalidraw` JSON with proper elements, bindings, and positioning
4. You save the file and tell the user where it is

## File structure

Every `.excalidraw` file has this top-level shape:

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [],
  "appState": { "viewBackgroundColor": "#ffffff" },
  "files": {}
}
```

All the work is in the `elements` array. Read `references/excalidraw-schema.md` for the full element schema — it covers every property, enum value, and binding pattern you need.

## Core generation rules

### IDs

Use descriptive string IDs like `"rect_auth_service"`, `"arrow_auth_to_db"`, `"text_auth_label"`. This makes the JSON readable and debugging easy. IDs just need to be unique strings.

### Every element needs these base properties

```json
{
  "id": "unique_id",
  "type": "rectangle",
  "x": 100,
  "y": 100,
  "width": 160,
  "height": 60,
  "angle": 0,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "seed": 1234567,
  "version": 1,
  "versionNonce": 0,
  "index": null,
  "isDeleted": false,
  "groupIds": [],
  "frameId": null,
  "boundElements": null,
  "updated": 1700000000000,
  "link": null,
  "locked": false,
  "roundness": { "type": 3 }
}
```

Generate a random integer for `seed` (used by roughjs for the hand-drawn look). Each element should have a different seed.

### Text inside shapes (bound text)

This is the most common pattern — a labeled box. It requires bidirectional binding:

1. The **shape** lists the text in `boundElements`: `[{"id": "text_id", "type": "text"}]`
2. The **text** references the shape via `containerId`: `"container_id"`
3. Use `"textAlign": "center"` and `"verticalAlign": "middle"` for centered labels
4. **Text sizing**: Set text `width` and `height` to approximate the rendered text size, NOT the container size. Estimate: `width ≈ fontSize × 0.6 × charCount`, `height ≈ fontSize × lineHeight × lineCount`. Excalidraw recalculates on load, but a close estimate prevents initial visual glitches.
5. **Text positioning**: Center the text within the container: `x = container.x + (container.width - text.width) / 2`, `y = container.y + (container.height - text.height) / 2`

### Arrows connecting shapes

Arrows also require bidirectional binding:

1. The **arrow** sets `startBinding` and `endBinding` with `elementId`, `fixedPoint`, and `mode`
2. Each **bound shape** lists the arrow in `boundElements`: `[{"id": "arrow_id", "type": "arrow"}]`
3. Arrow `points` are offsets from `(x, y)` — first point is always `[0, 0]`
4. `fixedPoint` is normalized `[0-1]` on the target shape: `[1.0, 0.5]` = right-center, `[0.0, 0.5]` = left-center, `[0.5, 0.0]` = top-center, `[0.5, 1.0]` = bottom-center
5. **Always use `"mode": "fixed"`** — this anchors the arrow to the exact fixedPoint you specified. Do NOT use `"orbit"`, which lets Excalidraw dynamically reposition the arrow endpoint and can cause arrows to appear disconnected.

### Arrow position anchoring

The arrow's `(x, y)` position and `points` array must be geometrically consistent with the shapes it connects. Calculate them from the shape boundaries:

1. **Compute start point**: From the source shape's boundary at the `startBinding.fixedPoint`.
   - Rectangle: `startX = shape.x + fixedPoint[0] * shape.width`, `startY = shape.y + fixedPoint[1] * shape.height`
   - Diamond: same formula (the fixedPoint maps to the bounding box, which aligns with the diamond tips at [0, 0.5], [1, 0.5], [0.5, 0], [0.5, 1])
   - Ellipse: same formula for cardinal points
2. **Compute end point**: Same formula for the target shape at `endBinding.fixedPoint`.
3. **Set arrow properties**: `x = startX`, `y = startY`, `points = [[0, 0], [endX - startX, endY - startY]]`, `width = |endX - startX|`, `height = |endY - startY|`

This ensures the arrow visually connects the two shapes. If the arrow appears disconnected, the (x, y) or points are likely wrong.

### Arrowhead style

Use `"triangle"` as the default arrowhead type — it's the cleanest and most professional. The `"arrow"` type looks hand-drawn and can appear messy at scale. Reserve `"arrow"` for playful/sketch styles only.

```json
"endArrowhead": "triangle"
```

### Arrow labels

To label an arrow, create a text element with `containerId` set to the arrow's ID, and add `{"id": "text_id", "type": "text"}` to the arrow's `boundElements`. Position the text near the midpoint of the arrow.

### Label text

Keep labels short and crisp — 1-3 words is ideal for node labels. Use noun phrases, not sentences. For example: "Validate" not "System validates the user's credentials". "Auth Service" not "Authentication Service Component". Brevity keeps the diagram scannable.

**Use exact technical names.** When diagramming a system with specific state/entity names, always use the precise name the system uses. If the system has a state called `phase_blocked`, write `phase_blocked` — not "Blocked", "Phase Blocked", or any abbreviation. The diagram is technical documentation; precision matters.

### Annotation depth scales with complexity

The level of detail in a diagram should match its complexity. Simple diagrams stay clean; complex diagrams need more context to be useful. **This is not optional** — complex diagrams without sufficient detail are incomplete.

**Simple diagrams (3-8 nodes):**

- Node labels only
- Arrow labels only where the connection type isn't obvious
- No legend, no annotations

**Medium diagrams (8-20 nodes):**

- Node labels + arrow labels on all connections
- A title text element at the top (larger font, e.g., `fontSize: 28`)
- Color legend if 3+ colors are used (small text block in a corner explaining the color scheme)
- Section labels for visual groupings (e.g., "Services", "Data Layer")

**Complex diagrams (20+ nodes):**

Every complex diagram MUST include ALL of the following. A complex diagram without these elements is incomplete:

- **Descriptive arrow labels on EVERY connection** — no unlabeled arrows in a complex diagram. Include the event name, action, or protocol (e.g., `VERIFY_PASSED`, `HTTP POST /auth`, `on timeout`, `START_TASK`). For state machines, use the exact event type names.
- **Annotation notes** (minimum 5-8 notes for 20+ node diagrams): free-standing text elements near important areas explaining behavior, constraints, or context. Examples: "Retries up to 3×", "Async via message queue", "Checkpoint saved here", "Auto-transitions after 30s timeout". Use `fontSize: 14`, `fontFamily: 2` (Helvetica), gray stroke color (`#868e96`) to visually distinguish from node labels. Place them near the relevant node or arrow, offset by 10-20px.
- **Legend**: a small framed area in a corner with color/shape key. This is mandatory when 3+ colors or 2+ shape types are used.
- **Section frames**: use frame elements to group logically related nodes (e.g., "Happy Path", "Error Handling", "Phase Actor States")
- **Condition labels**: for branching arrows, always label the condition (e.g., "success", "failure", "timeout")
- **Subtitle/description**: a smaller text element below the title explaining the diagram's scope or purpose (`fontSize: 16`, `strokeColor: "#868e96"`)

## Layout planning — the most important step

The difference between a good diagram and a bad one is layout. A diagram with correct data but messy arrow routing is hard to read. **Always plan the layout before generating JSON.**

### Step 1: Assign nodes to a grid

Think in rows and columns. Place each node at a grid intersection. Use a consistent cell size:

- **Standard cell**: 220px wide, 100px tall (fits a 160x60 node with 60px horizontal gap and 40px vertical gap)
- **Compact cell**: 200px wide, 90px tall (for dense diagrams)

Example grid assignment for a flowchart:

```
Row 0: [Start]
Row 1: [Enter Credentials]
Row 2: [Validate?]
Row 3, Col 0: [Dashboard]    Row 3, Col 1: [Show Error]
Row 4: [End]
```

Then compute coordinates: `x = col * cellWidth + baseX`, `y = row * cellHeight + baseY`.

### Step 2: Plan arrow routes to avoid crossings

This is critical. Before placing arrows:

1. **List all connections** as (source, target) pairs
2. **Identify potential crossings** — if two arrows would cross, adjust node placement or use connection points on different sides of the shapes
3. **Use consistent flow direction** — in a top-to-bottom diagram, arrows should primarily go downward. Side connections should go left or right, not diagonally.
4. **Offset parallel arrows** — if two arrows run in parallel, offset their connection points slightly (e.g., one at `[0.4, 1.0]` and another at `[0.6, 1.0]`)

### Step 3: Choose connection points deliberately

Don't default to center connections for everything. Use the side of the shape closest to the target:

- **Downward flow**: bottom-center `[0.5, 1.0]` → top-center `[0.5, 0.0]`
- **Rightward flow**: right-center `[1.0, 0.5]` → left-center `[0.0, 0.5]`
- **Loop-back**: use side connections to route around the main flow (e.g., right side out, then curve back to the top)
- **Branch from decision**: one path goes down (main), the other goes right (alternate)

### Arrow routing for complex diagrams

For diagrams with 10+ arrows, clean routing is the difference between a useful diagram and a mess.

**The #1 rule: keep arrows simple.** Use only 2-point arrows (start and end). Do NOT manually create multi-segment arrows with 3+ points — the coordinate math is error-prone and produces ugly looping paths. Instead, solve routing through **node placement** and **elbowed arrows**.

**How to avoid crossings without multi-segment arrows:**

1. **Place nodes so direct connections don't cross.** If state A connects to state B, place them close together. Rearrange the grid to minimize distance between connected nodes.

2. **Use elbowed arrows** for any non-straight connection. Set `"elbowed": true` on the arrow — Excalidraw automatically routes it with clean right-angle bends. Only needs 2 points `[[0, 0], [dx, dy]]`.

```json
{
  "type": "arrow",
  "elbowed": true,
  "points": [
    [0, 0],
    [150, -200]
  ],
  "startBinding": {
    "elementId": "source",
    "fixedPoint": [1.0, 0.5],
    "mode": "fixed"
  },
  "endBinding": {
    "elementId": "target",
    "fixedPoint": [0.5, 0.0],
    "mode": "fixed"
  }
}
```

3. **De-emphasize exceptional paths**: Use `strokeStyle: "dashed"` and lighter color (`"#868e96"`) for recovery/error/abort arrows so the eye focuses on the primary flow.

4. **Replace very long arrows with annotation notes.** If an "abort" arrow would cross 8 states, a text note saying "abort → idle" next to the state is clearer than a line crossing everything.

### Spacing rules

| Context                     | Spacing                                             |
| --------------------------- | --------------------------------------------------- |
| Between nodes in same group | 40-60px gap                                         |
| Between groups/sections     | 120-160px gap                                       |
| Arrow straight segment      | Keep at least 30px from nearest non-connected shape |
| Diagram padding from edge   | Start at `x: 80, y: 80`                             |

## Layout strategies by diagram type

### Flowcharts (top-to-bottom)

- **Grid**: 220px wide columns, 100px tall rows
- Nodes: 160x60 rectangles, rounded corners
- Decision: diamond 140x100, centered in its cell
- Start/end: ellipses 120x50 with distinct color (green start, red end)
- **Main flow goes straight down** — keep the primary path on column 0
- **Branches go sideways** — "No" path from a decision goes right to column 1
- Arrows: bottom-center `[0.5, 1.0]` → top-center `[0.5, 0.0]` for vertical flow
- **Loop-back arrows** (e.g., retry): use `"elbowed": true` with 2 points. Connect right-center of the error node to right-center of the target node. The elbowed engine handles the routing cleanly.

### Architecture diagrams

- **Tier layout**: one row per tier (client → gateway → services → data stores)
- Row height: 120-140px between tiers
- Nodes: spaced 200-220px apart horizontally within a tier
- Center nodes in their tier — if a tier has 3 nodes, center them relative to the tier above
- **Use different shapes for different component types** — this is what makes architecture diagrams visually interesting and scannable:
  - **Rectangles** (180x70): services, applications, APIs
  - **Diamonds** (200x100): databases, data stores — visually distinct from services
  - **Ellipses** (160x70): external systems, clients, users
  - **Rounded rectangles**: gateways, load balancers, proxies
- Color by category: blue for services, green for databases, orange for gateways/proxies, red for caches, violet for external
- Vary node sizes slightly by importance — gateway might be 200x80, services 180x70, databases 200x100 (as diamonds)
- Arrows: bottom-center → top-center between tiers. Use offset fixedPoints when multiple arrows fan from one node (e.g., `[0.3, 1.0]`, `[0.5, 1.0]`, `[0.7, 1.0]`)
- Add dashed arrows for secondary connections (e.g., service-to-database reads)

### ER diagrams

- **Row layout**: place entities in a clean grid, 300px apart horizontally, 250px apart vertically
- Entity header: rectangle 180x40 with entity name, colored background
- Entity body: rectangle 180x(variable) directly below header, white background, monospace font for attributes
- **Group header+body** using `groupIds` so they move together
- Relationship arrows between entities using crowfoot notation:
  - `"crowfoot_one"` for the "one" side
  - `"crowfoot_many"` for the "many" side
- **Route arrows to minimize crossing**: connect from the side of the entity closest to the target. If entities are side-by-side, use left/right connections. If they're stacked, use top/bottom.
- Junction tables for many-to-many: place between the two related entities

### State machines

State machines are the hardest diagram type because they have many long-distance arrows (e.g., "abort → idle" crossing 8 states). Clean routing is everything.

**Layout structure:**

- **Column 0 (main flow)**: happy path states in a single vertical column, top-to-bottom
- **Column 1 (side states)**: error/paused/suspended states placed to the right, aligned vertically with the state they branch from
- **Column 2 or frame**: child/nested state machines in a separate frame, further right
- States: rounded rectangles 150x50, `roundness: {"type": 3}`
- Initial state: small filled ellipse (30x30, `backgroundColor: "#1e1e1e"`)
- Terminal states: distinct color (green for success, red for failure)
- Vertical spacing: 80px between happy path states (tight, keeps the diagram compact)
- **State labels MUST use exact technical names** from the system. If the system calls it `phase_blocked`, the label says `phase_blocked` — not "Blocked", "Phase Blocked", or "blocked". This is critical for technical accuracy.

**Arrow routing rules (critical for readability):**

1. **Happy path arrows**: straight down, 2-point arrows. Bottom-center `[0.5, 1.0]` → top-center `[0.5, 0.0]`. These are simple and short. **Label every transition arrow with the event name** (e.g., `PREFLIGHT_DONE`, `CLASSIFY_DONE`).

2. **Side-to-main arrows (e.g., resume → executing)**: horizontal 2-point arrows. Side state left-center `[0.0, 0.5]` → main state right-center `[1.0, 0.5]`. Label with event name.

3. **Loop-back arrows (e.g., verify fail → executing)**: use `"elbowed": true` with 2 points. Connect left-center `[0.0, 0.5]` of source to left-center `[0.0, 0.5]` of target. The elbowed engine will route it cleanly to the left of the main flow.

4. **Long-distance return arrows (e.g., abort → idle, reset → idle)**: do NOT draw these as arrows. Instead, add an **annotation text** next to the source state: `"abort → idle"` or `"reset → idle"` in gray italic (`fontSize: 14`, `strokeColor: "#868e96"`). This avoids the ugly long-distance lines that cross everything. Only draw arrows between states that are close to each other (within 2-3 positions).

5. **General rule**: if an arrow would span more than 3 states vertically, replace it with an annotation note. The diagram stays clean and the information is preserved.

**Detail requirements for state machines (they are always complex diagrams):**

State machines with 10+ states are complex. Apply ALL complex diagram requirements:

- **Every transition arrow** gets a label with the event type (e.g., `START_TASK`, `PLAN_APPROVED`, `VERIFY_PASSED`)
- **Annotation notes** near key states explaining behavior:
  - Near the executing state: "Spawns phase actor child machine"
  - Near error/abort states: "All states can abort → idle"
  - Near verification: "Loops back on VERIFY_FAILED"
  - Near learning: "Captures patterns, decisions, pitfalls"
  - Near checkpoints: "State persisted for resume"
- **Section frames** for logical groupings: "Happy Path", "Exception Handling", "Phase Actor"
- **Color legend** in the bottom-right corner
- **Subtitle** below the title explaining what the state machine models

**Child/nested state machines**: use a frame element. Place the frame 200px to the right of the main flow, aligned with the parent state. Connect with a single dashed arrow labeled "invokes". The child's internal layout follows the same rules (vertical happy path, side branches). **Child state labels must also use exact technical names** (e.g., `phase_researching`, `phase_discussing`, `phase_planning`, `phase_executing`, `phase_reviewing`, `phase_blocked`).

### Sequence diagrams

- Participant boxes: 140x50, spaced 220px apart horizontally at top
- Vertical lifelines: dashed lines extending downward from each participant
- Messages: horizontal arrows between lifelines, spaced 60px vertically
- Return messages: dashed arrows (`strokeStyle: "dashed"`)
- Keep message arrows strictly horizontal — all at the same y-coordinate for each step

### Mind maps

- Central node: 200x80, bold color, centered at (400, 300)
- Level 1 children: 160x60, arranged in a circle 250px from center
- Level 2 children: 130x50, 200px from their parent
- Curved connectors (3-point arrows for organic feel)

### Org charts

- Top-down tree layout
- Person boxes: 160x60
- Vertical spacing: 100px between levels
- Center children symmetrically under their parent
- Arrows: straight down, `startArrowhead: null`, `endArrowhead: "triangle"`

### Network topology

- Device nodes: rectangles with type labels (Router, Switch, Server)
- Use frames for network zones (LAN, DMZ, WAN)
- Bidirectional connections: `startArrowhead: "triangle"`, `endArrowhead: "triangle"`
- Color-code by zone

## Styling and theming

### Color palette

Use Excalidraw's built-in palette. Convention: index [4] (darkest) for strokes, index [1] (light) for backgrounds.

| Color  | Background (light) | Stroke (dark) |
| ------ | ------------------ | ------------- |
| Blue   | `#a5d8ff`          | `#1971c2`     |
| Green  | `#b2f2bb`          | `#2f9e44`     |
| Red    | `#ffc9c9`          | `#e03131`     |
| Yellow | `#ffec99`          | `#f08c00`     |
| Orange | `#ffd8a8`          | `#e8590c`     |
| Violet | `#d0bfff`          | `#6741d9`     |
| Cyan   | `#99e9f2`          | `#0c8599`     |
| Teal   | `#96f2d7`          | `#099268`     |
| Pink   | `#fcc2d7`          | `#c2255c`     |
| Gray   | `#e9ecef`          | `#343a40`     |

### Roughness presets

| Value | Style      | Best for                           |
| ----- | ---------- | ---------------------------------- |
| 0     | Architect  | Clean, precise technical diagrams  |
| 1     | Artist     | Default hand-drawn (most diagrams) |
| 2     | Cartoonist | Playful, informal sketches         |

### Font families

| Value | Name       | Best for            |
| ----- | ---------- | ------------------- |
| 1     | Virgil     | Hand-drawn feel     |
| 2     | Helvetica  | Clean, professional |
| 3     | Cascadia   | Code/monospace      |
| 5     | Excalifont | Default, balanced   |

### Theme suggestions

When the user asks for a specific style:

- **Professional/clean**: `roughness: 0`, `fontFamily: 2`, solid fills, muted colors
- **Sketch/whiteboard**: `roughness: 1`, `fontFamily: 5`, default Excalidraw look
- **Playful**: `roughness: 2`, `fontFamily: 1`, bright colors, `fillStyle: "hachure"`
- **Dark mode**: Set `appState.viewBackgroundColor` to `"#1e1e1e"`, use light stroke colors (`#ffffff`), light background fills

## Output instructions

1. **Plan the layout first**: Before writing JSON, do this explicitly:
   - List all nodes with short labels
   - Assign each node to a grid cell (row, column)
   - List all arrows as (source → target) with connection points
   - Identify and resolve any crossing arrows by adjusting grid positions or connection points
2. **Generate valid JSON**: All bindings must be bidirectional, all required properties present
3. **Save the file**: Write to `<descriptive-name>.excalidraw` in the current directory (or wherever the user specifies)
4. **Tell the user**: Explain what you created and how to open it — drag and drop into excalidraw.com, or open in VS Code with the Excalidraw extension

## Validation checklist

Before saving, mentally verify:

- [ ] Every text with a `containerId` has a matching `boundElements` entry on the container
- [ ] Every arrow with `startBinding`/`endBinding` has matching `boundElements` entries on the bound shapes
- [ ] Arrow `points[0]` is always `[0, 0]`
- [ ] All IDs are unique
- [ ] All elements have a unique `seed` value
- [ ] Element positions don't overlap (unless intentionally stacked)
- [ ] The `type` field at the top level is `"excalidraw"` and `version` is `2`
- [ ] No arrows cross other arrows unnecessarily
- [ ] The main flow reads clearly in one direction (top-to-bottom or left-to-right)
- [ ] Labels are short (1-3 words) and scannable
