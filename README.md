# World's Tallest Buildings

An interactive D3 dashboard that tells a visual story about *where* and *when* humanity built its tallest towers. Explore the 78-building "Tallest Buildings in the World" dataset on a world map, compare any two skyscrapers as building silhouettes, and scrub through history with an animated timeline.

> ECS 163 Final Project — Team 24

## Features

- **World map** — one dot per building, placed by latitude/longitude and color-coded by rank. Hover for a tooltip, click to lock the detail panel.
- **Skyline comparison** — buildings drawn as silhouettes on a shared height scale, so the comparison reads like a real skyline instead of abstract bars.
- **Two-building compare mode** — pick Building A and Building B from the dropdowns (or click one tower, then another) to highlight and measure two towers side by side, with reference height lines on both the skyline and the map.
- **Connection line** — a link drawn between a selected map marker and its skyline silhouette ties location back to height.
- **Animated intro** — a timeline-driven reveal walks through the dataset before handing control to you; skippable, with play/pause.
- **Timeline brush** — filter dots and bars to a range of years.
- **Search & filters** — search by building, city, or country; filter by country; cap the view with a top-N slider; reset to defaults.
- **Synthesized UI sound** — subtle, royalty-free audio effects generated in-browser via the Web Audio API, with a mute toggle that remembers your preference.
- **Map zoom & pan** plus animated transitions for height and markers.

## Getting started

This is a plain `index.html` + `main.js` + `style.css` app with no build step. Because it loads CSV data with `d3.csv`, it must be served over HTTP — opening `index.html` by double-clicking will be blocked by browser file rules.

Serve the folder with any static server:

```bash
python3 -m http.server
```

Then open <http://localhost:8000>. VS Code's Live Server extension also works.

## Data

The dataset lives in `data/buildings.csv` (78 skyscrapers, committed with the app). Column parsing is flexible and accepts common name variants:

| Field    | Accepted column names                          |
| -------- | ---------------------------------------------- |
| Rank     | `rank`, `Rank`                                 |
| Name     | `name`, `Name`, `Building Name`                |
| Height   | `height`, `Height`, `Height (m)`               |
| Floors   | `floors`, `Floors`                             |
| Year     | `year`, `Year`, `Year Built`, `Completed`      |
| City     | `city`, `City`                                 |
| Country  | `country`, `Country`                           |
| Latitude | `lat`, `latitude`, `Latitude`                  |
| Longitude| `lon`, `lng`, `longitude`, `Longitude`         |


All data files needed to run the dashboard are already included in the `data/` folder. No extra download is required.

Required files:
- `data/buildings.csv` — tallest buildings dataset used for the main map, skyline, filters, and comparison views
- `data/historical_structures.csv` — historical tallest-structure timeline used in the animated intro
- `data/gdp.csv` — country GDP context data
- `data/energy_production.csv` — country energy-production context data
- `data/population.csv` — country population context data

To reproduce the demo, clone the repository and run the project through a local HTTP server.

## Tech stack

- [D3.js v7](https://d3js.org/) for all visualization logic
- [TopoJSON](https://github.com/topojson/topojson-client) world atlas for the base map
- Web Audio API for synthesized UI sound — no audio files to host

## Project layout

```
ECS163TeamProject/
├── index.html      single-page dashboard
├── main.js         all D3 logic
├── sound.js        Web Audio sound effects
├── style.css       layout + theme
├── plan.md         project plan and milestones
└── data/
    └── buildings.csv
```

Team Members

Hao Jyun Bai
Coen King
Ricky Cavazos Garcia
Alexander Stroev
William Tullius
