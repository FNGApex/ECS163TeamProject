# ECS 163 Team Project: The World's Tallest Buildings

This project is an interactive D3.js dashboard for exploring the world's tallest buildings.

## How to run locally

Do not open `index.html` directly. Serve the folder over a local web server so the CSV and map data can load.

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

If `python` does not work on Windows, try:

```bash
py -m http.server 8000
```

## Current features

- World map overview using latitude and longitude
- Hover tooltip and click selection
- Linked side detail panel
- Skyline height comparison chart
- Country summary chart
- Construction timeline chart
- Search, country filter, and year-range controls
- Map zoom/pan and reset button
- Responsive dark dashboard layout
