# ECS 163 Team Project: The World's Tallest Buildings

This project is an interactive D3.js dashboard for exploring the world's tallest buildings.

## How to run locally

Do not open `index.html` directly. Serve the folder over a local web server so the CSV and map data can load. All platforms use Python's built-in HTTP server — run the command from the project root.

### macOS / Linux (regular Unix)

```bash
python3 -m http.server 8000
```

### Windows

```bash
py -m http.server 8000
```

If `py` is not available, try:

```bash
python -m http.server 8000
```

### WSL

```bash
python3 -m http.server 8000
```

On modern WSL2 installs, `localhost` is auto-forwarded to Windows, so you can open the URL below directly in your Windows browser. If that does not work:

- Get the WSL IP with `hostname -I` and open `http://<that-ip>:8000`, or
- Run the command from the VS Code integrated terminal, which sets up port forwarding for you.

### Then open

```text
http://localhost:8000
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
