# Codex Icon Gauge

## Overview
A metric-to-icon gauge for Power BI. Bind a value and a target, and the icon itself carries the reading: the vessel fills in proportion, and its colour follows the health band — so the state is readable before anyone reads the number. Built for the single KPI that has to be understood at a glance from across the room: a wallboard, a report header, a status tile on a floor screen.

## Features
- Four display modes — **fill vessel**, **icon row**, **traffic light** and **state morph**
- Six vessels for fill mode: bolt, battery, droplet, heart, person and thumb
- State morph in three styles: faces, thumbs or tick/cross
- Three health bands derived automatically from the target: at or over target, within 10% of target, and below
- Optional headline value and subtitle, each switchable
- Full font control — family, size, bold, italic, underline, colour and alignment — on the title, value and label
- Background colour with transparency; border with width, colour and radius
- Card signature accent with style, colour, corner radius and mirrored corners
- Custom tooltips through the Tooltips field well
- High contrast mode support and keyboard focus

## Data Roles
| Role | Display Name | Kind | Required? | Description |
|------|--------------|------|-----------|-------------|
| category | Category | Grouping | No | Optional context label; binding it enables click-to-filter |
| value | Value | Measure | Yes | The reading |
| target | Target | Measure | No | Target the reading is judged against (health tint and % of target) |
| tooltips | Tooltips | Measure | No | Extra measures for the hover tooltip |

### Health banding
`value >= target` renders the success band, `value >= 0.9 * target` the warning band, and anything below that the danger band. Note the consequence: a vessel in the success band is by definition full, so a demonstration of both the fill mechanic *and* the full colour range needs more than one reading.

`dataReductionAlgorithm` is 30,000.

### A note on `supportsHighlight`
It is declared **false**, deliberately. This visual does not read the `highlights` array, so the host filters `values[]` per the documented default. Declaring `true` without reading `highlights[]` makes cross-filtering silently do nothing and fails certification rule 1180.2.2.

## Formatting Options

### Visual Title
Show Title, Title Text, Font Family, Font Size, Bold, Italic, Underline, Alignment, Font Colour.

### Icon Gauge
- **Mode** — Fill vessel, Icon row, Traffic light or State morph
- **Vessel** — Bolt, Battery, Droplet, Heart, Person or Thumb (fill mode)
- **Morph style** — Faces, Thumbs or Tick/cross (state morph mode)
- **Show glyph / Show value / Show subtitle** — independent toggles

### Value / Label
Font Family, Font Size, Bold, Italic, Colour, Alignment (Value also has Underline).

### Background / Border / Card signature
Background colour and transparency; border show, colour, transparency, width and radius; card signature show, style, auto colour, colour, corner radius and mirrored corners.

## Build
Node 20, `powerbi-visuals-tools` 7.0.2, `powerbi-visuals-api` 5.11.0, TypeScript 5.5.4.

```bash
npm install
npm run package     # writes dist/<guid>.<version>.pbiviz
npx eslint src      # 0 errors expected
```

No external network calls, no third-party services and no telemetry.

---
Built by [Nexus Codex](https://nexuscodex.nexus). Support: support@nexuscodex.nexus
