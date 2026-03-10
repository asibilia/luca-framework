# Excalidraw JSON Schema Reference

Complete reference for every element type, property, and enum value in the `.excalidraw` format.

## Table of Contents

1. [Top-Level Structure](#top-level-structure)
2. [Base Element Properties](#base-element-properties)
3. [Element Types](#element-types)
4. [Enum Values](#enum-values)
5. [Bindings](#bindings)
6. [Grouping and Frames](#grouping-and-frames)
7. [Color Palette](#color-palette)
8. [Coordinate System](#coordinate-system)

---

## Top-Level Structure

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [],
  "appState": {
    "viewBackgroundColor": "#ffffff"
  },
  "files": {}
}
```

Only 5 `appState` properties persist in exported files:

| Property                | Type             | Default     |
| ----------------------- | ---------------- | ----------- |
| `viewBackgroundColor`   | `string`         | `"#ffffff"` |
| `gridSize`              | `number \| null` | `null`      |
| `gridStep`              | `number`         | `5`         |
| `gridModeEnabled`       | `boolean`        | `false`     |
| `lockedMultiSelections` | `Record`         | `{}`        |

---

## Base Element Properties

Every element has these properties:

| Property          | Type             | Default         | Description                         |
| ----------------- | ---------------- | --------------- | ----------------------------------- |
| `id`              | `string`         | unique          | Unique identifier                   |
| `type`            | `string`         | --              | Element type                        |
| `x`               | `number`         | --              | X position (top-left)               |
| `y`               | `number`         | --              | Y position (top-left)               |
| `width`           | `number`         | `0`             | Width in pixels                     |
| `height`          | `number`         | `0`             | Height in pixels                    |
| `angle`           | `number`         | `0`             | Rotation in radians                 |
| `strokeColor`     | `string`         | `"#1e1e1e"`     | Border/line color                   |
| `backgroundColor` | `string`         | `"transparent"` | Fill color                          |
| `fillStyle`       | `string`         | `"solid"`       | Fill pattern                        |
| `strokeWidth`     | `number`         | `2`             | Border thickness                    |
| `strokeStyle`     | `string`         | `"solid"`       | Border dash pattern                 |
| `roughness`       | `number`         | `1`             | Hand-drawn effect (0-2)             |
| `opacity`         | `number`         | `100`           | Opacity (0-100)                     |
| `seed`            | `number`         | random int      | Roughjs render seed                 |
| `version`         | `number`         | `1`             | Change counter                      |
| `versionNonce`    | `number`         | `0`             | Collaboration nonce                 |
| `index`           | `string \| null` | `null`          | Z-order (null = use array position) |
| `isDeleted`       | `boolean`        | `false`         | Soft-delete flag                    |
| `groupIds`        | `string[]`       | `[]`            | Group memberships                   |
| `frameId`         | `string \| null` | `null`          | Parent frame ID                     |
| `boundElements`   | `array \| null`  | `null`          | Bound element refs                  |
| `updated`         | `number`         | epoch ms        | Last modified timestamp             |
| `link`            | `string \| null` | `null`          | URL link                            |
| `locked`          | `boolean`        | `false`         | Edit lock                           |
| `roundness`       | `object \| null` | `null`          | Corner rounding                     |
| `customData`      | `Record`         | --              | Optional custom data                |

---

## Element Types

### Shapes: rectangle, ellipse, diamond

Use base properties only. No extra fields needed.

- `"rectangle"` — Rectangular shape
- `"ellipse"` — Circle/oval
- `"diamond"` — Rotated square (diamond/rhombus)

### Text

| Property        | Type             | Default  | Description                     |
| --------------- | ---------------- | -------- | ------------------------------- |
| `text`          | `string`         | --       | Display text                    |
| `originalText`  | `string`         | --       | Original text (before wrapping) |
| `fontSize`      | `number`         | `20`     | Font size in px                 |
| `fontFamily`    | `number`         | `5`      | Font family code                |
| `textAlign`     | `string`         | `"left"` | Horizontal alignment            |
| `verticalAlign` | `string`         | `"top"`  | Vertical alignment              |
| `containerId`   | `string \| null` | `null`   | Parent container ID             |
| `autoResize`    | `boolean`        | `true`   | Auto-resize bounds              |
| `lineHeight`    | `number`         | `1.25`   | Line height multiplier          |

When bound to a container (`containerId` is set):

- `textAlign` and `verticalAlign` control position within the container
- `x`/`y` should be container position + 5px padding
- `width`/`height` should be container dimensions - 10px

### Line and Arrow

| Property         | Type                 | Default | Description                                            |
| ---------------- | -------------------- | ------- | ------------------------------------------------------ |
| `points`         | `[number, number][]` | `[]`    | Offset points from (x,y). First point MUST be `[0, 0]` |
| `startBinding`   | `object \| null`     | `null`  | Start endpoint binding                                 |
| `endBinding`     | `object \| null`     | `null`  | End endpoint binding                                   |
| `startArrowhead` | `string \| null`     | `null`  | Start arrowhead type                                   |
| `endArrowhead`   | `string \| null`     | `null`  | End arrowhead type                                     |
| `elbowed`        | `boolean`            | `false` | Elbow routing (arrow only)                             |

Use `roundness: {"type": 2}` for smooth curved arrows.

### Frame

| Property | Type             | Default |
| -------- | ---------------- | ------- |
| `name`   | `string \| null` | `null`  |

Children reference the frame via `frameId`. Frames clip their contents visually.

### Freedraw

| Property           | Type                 |
| ------------------ | -------------------- |
| `points`           | `[number, number][]` |
| `pressures`        | `number[]`           |
| `simulatePressure` | `boolean`            |

### Image

| Property | Type               | Default     |
| -------- | ------------------ | ----------- |
| `fileId` | `string \| null`   | `null`      |
| `status` | `string`           | `"pending"` |
| `scale`  | `[number, number]` | `[1, 1]`    |

Requires matching entry in the top-level `files` object with base64 data URL.

---

## Enum Values

### fillStyle

`"solid"` | `"hachure"` | `"cross-hatch"` | `"zigzag"`

### strokeStyle

`"solid"` | `"dashed"` | `"dotted"`

### roughness

| Value | Name       | Effect             |
| ----- | ---------- | ------------------ |
| `0`   | Architect  | Clean/smooth       |
| `1`   | Artist     | Default hand-drawn |
| `2`   | Cartoonist | Very rough/sketchy |

### strokeWidth

| Value | Name           |
| ----- | -------------- |
| `1`   | Thin           |
| `2`   | Bold (default) |
| `4`   | Extra bold     |

### fontFamily

| Value | Name         | Style              |
| ----- | ------------ | ------------------ |
| `1`   | Virgil       | Hand-drawn         |
| `2`   | Helvetica    | Clean sans-serif   |
| `3`   | Cascadia     | Monospace          |
| `5`   | Excalifont   | Default, balanced  |
| `6`   | Nunito       | Rounded sans-serif |
| `7`   | Lilita One   | Display/bold       |
| `8`   | Comic Shanns | Comic style        |

### textAlign

`"left"` | `"center"` | `"right"`

### verticalAlign

`"top"` | `"middle"` | `"bottom"`

### Arrowhead types

- Standard: `"arrow"` | `"bar"` | `"dot"` | `"triangle"`
- Outline variants: `"circle"` | `"circle_outline"` | `"triangle_outline"` | `"diamond"` | `"diamond_outline"`
- ER cardinality: `"crowfoot_one"` | `"crowfoot_many"` | `"crowfoot_one_or_many"`
- None: `null`

### roundness.type

| Value | Usage                                  |
| ----- | -------------------------------------- |
| `2`   | Proportional radius (for lines/arrows) |
| `3`   | Adaptive radius, max 32px (for shapes) |

---

## Bindings

### Arrow-to-shape binding

Bindings MUST be bidirectional:

**Arrow side** — `startBinding` / `endBinding`:

```json
{
  "elementId": "target_shape_id",
  "fixedPoint": [0.5, 1.0],
  "mode": "orbit"
}
```

- `fixedPoint`: Normalized `[0-1]` position on the target. `[0,0]` = top-left, `[0.5, 0.5]` = center, `[1,1]` = bottom-right
- `mode`: `"orbit"` (snap to perimeter) or `"inside"` (point inside element)

**Shape side** — `boundElements` array entry:

```json
{ "id": "arrow_id", "type": "arrow" }
```

### fixedPoint quick reference

| Position      | fixedPoint   |
| ------------- | ------------ |
| Top-center    | `[0.5, 0.0]` |
| Right-center  | `[1.0, 0.5]` |
| Bottom-center | `[0.5, 1.0]` |
| Left-center   | `[0.0, 0.5]` |
| Center        | `[0.5, 0.5]` |

### Text-to-shape binding

**Shape side** — `boundElements`:

```json
{ "id": "text_id", "type": "text" }
```

**Text side** — `containerId`:

```json
"containerId": "shape_id"
```

Only one text element can bind to a container.

---

## Grouping and Frames

### Groups

Groups are NOT elements. Elements carry `groupIds` arrays:

```json
{"id": "e1", "groupIds": ["group_A"]},
{"id": "e2", "groupIds": ["group_A"]}
```

Nested groups: array order = nesting depth, last ID = outermost.

### Frames

Frames ARE elements (`type: "frame"`). Children set `frameId`:

```json
{"id": "frame_1", "type": "frame", "x": 50, "y": 50, "width": 500, "height": 400, "name": "Section"},
{"id": "child_1", "type": "rectangle", "frameId": "frame_1", ...}
```

---

## Color Palette

| Color  | Background [1] | Stroke [4] |
| ------ | -------------- | ---------- |
| Gray   | `#e9ecef`      | `#343a40`  |
| Red    | `#ffc9c9`      | `#e03131`  |
| Pink   | `#fcc2d7`      | `#c2255c`  |
| Grape  | `#eebefa`      | `#9c36b5`  |
| Violet | `#d0bfff`      | `#6741d9`  |
| Blue   | `#a5d8ff`      | `#1971c2`  |
| Cyan   | `#99e9f2`      | `#0c8599`  |
| Teal   | `#96f2d7`      | `#099268`  |
| Green  | `#b2f2bb`      | `#2f9e44`  |
| Yellow | `#ffec99`      | `#f08c00`  |
| Orange | `#ffd8a8`      | `#e8590c`  |
| Bronze | `#eaddd7`      | `#846358`  |

Special: `"transparent"`, `"#1e1e1e"` (black), `"#ffffff"` (white)

Full palette has 5 shades per color: `[0]` lightest to `[4]` darkest.

---

## Coordinate System

- **Origin**: Top-left of infinite canvas
- **X-axis**: Increases rightward
- **Y-axis**: Increases downward
- **Units**: Logical pixels
- **Rotation**: Radians, clockwise positive
- **(x, y)**: Top-left corner of bounding box

### Typical sizing

| Element          | Width | Height |
| ---------------- | ----- | ------ |
| Standard box     | 160   | 60     |
| Decision diamond | 140   | 100    |
| Ellipse          | 120   | 70     |
| Small circle     | 30    | 30     |

### Spacing

- Gap between elements: 40-60px minimum
- Arrow length: 60-150px
- Bound text padding: 5px from container edges
