# ECS 163 — Team 24 Project Plan <--> Created by Claude from the Project Document
**Visualizing the World's Tallest Buildings**

Team: Hao Jyun Bai · Coen King · Ricky Cavazos Garcia · Alexander Stroev · William Tullius

Source proposal: `team24proposal.pdf`

---

## 1. Goal

Tell a visual story about *where* and *when* major achievements in human construction have taken place by exploring the 78-building "Tallest Buildings in the World" Kaggle dataset (height, location, year, floors, rank).

## 2. Dataset

- **Source:** Kaggle — *Tallest Buildings in the World* (derived from Wikipedia's list).
- **Records:** 78 skyscrapers.
- **Columns:** `name, height, year_built, floors, city, country, rank` — augmented locally with `lat`/`lon` so dots can be placed on the map without geocoding at runtime.
- **Local copy:** `data/buildings.csv` (committed; small enough to ship with the app).

### Findings to surface
- Skyscrapers are clustered: a handful of countries dominate.
- The frontier has moved *up and east* over time — recent buildings are taller and more often in Asia / the Middle East.
- Year-built distribution skews heavily post-2000.

## 3. Visualizations

### 3.1 Primary — Interactive world map (drill-down entry point)
- One dot per building, positioned by `lat`/`lon`.
- Color encodes **rank** (sequential scale; tallest = most saturated).
- Hover → tooltip with name + key stats. Click → locks the side panel.

### 3.2 Secondary — Comparison bar chart (skyline-style)
- Bars sorted shortest → tallest.
- Defaults to selected building + a few peers (mix of nearby ranks + landmark anchors).
- Bars styled as silhouettes so silhouettes evoke a skyline rather than abstract bars.

### 3.3 Supporting controls
- **Time selector** (decade brush 1900 → 2026) — filters dots and bars.
- **Side info panel** — country, city, floors, year, factoid slot.
- **Legend** — rank color ramp; legend rows can highlight matching dots on hover (link with HW3 pattern).

## 4. Interaction model

| Trigger | Effect |
|---|---|
| Hover dot | Tooltip + side panel preview |
| Click dot | Lock side panel; push building into comparison chart |
| Hover legend row | Highlight matching dot(s) |
| Brush time selector | Filter dots & bars to that decade range |
| Click "Add to compare" in panel | Append to skyline chart (sorted shortest→tallest) |
| Optional | Map zoom / pan if dense regions need it |

Cross-view linking mirrors the HW3 dashboard pattern (`Homework3/agorodnov`): a shared `state` object + per-view `updaters[]` array, with `applyFilter()` fanning out updates.

## 5. Storytelling structure

**Drill-down** (per proposal §5). No fixed narrative order — users land on the map, follow whichever buildings catch their eye, and accumulate appreciation as they explore. The decade brush gives an optional temporal narrative for users who want it.

## 6. Storyboard (from proposal §6)

```
+----------------------------------------------------+
|                  WORLD MAP                         |
|     • dots = buildings, color = rank               |
|                                  +---------------+ |
|                                  | Info box       | |
|                                  | (selected      | |
|                                  |  building)     | |
|                                  +---------------+ |
+----------------------------------------------------+
| Time selector: 1900 1910 ... 2020 2026             |
+--------------------+-------------------+-----------+
| Large info / facts | Comparison bars   | Legend    |
|  (history + city)  | (skyline view)    | (rank)    |
+--------------------+-------------------+-----------+
```

## 7. Tech stack

- **D3.js v7** (the HW3 reference uses v5; v7 gives us `d3.geoNaturalEarth1`, `d3.group`, `d3.event`-free handlers — worth the upgrade).
- **TopoJSON** world atlas (`world-atlas@2/countries-110m.json`) for the base map.
- Plain `index.html` + `main.js` + `style.css` — no bundler. Served via any static server (e.g. `python3 -m http.server`).

## 8. Repo layout

```
ECS163TeamProject/
├── plan.md                  ← this file
├── README.md
├── index.html               ← single-page dashboard
├── main.js                  ← all D3 logic
├── style.css                ← layout + theme
├── data/
│   └── buildings.csv        ← 78 rows
└── team24proposal.pdf       (reference; not committed)
```

## 9. Milestones

| # | Milestone | Owner | Status |
|---|---|---|---|
| M1 | Plan + scaffold (this commit) | — | ✅ |
| M2 | Sample dataset + map renders with dots | — | ✅ (seeded subset; expand to 78) |
| M3 | Hover + side panel + tooltip | — | ✅ |
| M4 | Comparison bar chart + selection sync | — | ✅ |
| M5 | Decade brush + legend cross-highlighting | — | ⏳ |
| M6 | Skyline-style bars (replace plain rects) | — | ⏳ |
| M7 | Polish, accessibility, write-up | — | ⏳ |

## 10. Open questions

- **Skyline aesthetic.** How literal should the bars look? (windowed silhouettes vs. plain rects with a roofline.)
- **Decade brush vs. dropdown.** Brush feels more exploratory but eats vertical space.
- **Map projection.** Natural Earth reads as "world atlas"; Mercator over-emphasizes the Northern hemisphere where most skyscrapers cluster — pick the projection that supports the story, not the convention.
- **Dataset completeness.** Initial scaffold ships a seeded subset; need to ingest the full 78-row Kaggle CSV and confirm lat/lon for every entry.
