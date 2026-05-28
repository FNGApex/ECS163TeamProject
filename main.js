const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const state = {
    hovered: null,
    selected: null,
    compareIds: [],     // building ranks shown in the comparison chart
    maxCompare: 7
};

const updaters = [];
function applyState() { updaters.forEach(fn => fn()); }

const tooltipEl = document.getElementById("tooltip");
function showTooltip(html, evt) {
    tooltipEl.innerHTML = html;
    tooltipEl.hidden = false;
    const pad = 12;
    const x = Math.min(evt.clientX + pad, window.innerWidth  - tooltipEl.offsetWidth  - pad);
    const y = Math.min(evt.clientY + pad, window.innerHeight - tooltipEl.offsetHeight - pad);
    tooltipEl.style.left = x + "px";
    tooltipEl.style.top  = y + "px";
}
function hideTooltip() { tooltipEl.hidden = true; }

Promise.all([
    d3.csv("data/buildings.csv", d3.autoType),
    d3.json(WORLD_URL)
]).then(([buildings, world]) => {
    // Stable id: rank is unique in the dataset.
    buildings.forEach(b => { b.id = b.rank; });
    buildings.sort((a, b) => a.rank - b.rank);

    // Seed the comparison chart with a spread of ranks so the user sees the
    // chart populated on first load (better than an empty view).
    state.compareIds = [1, 7, 23, 44, 78].filter(r => buildings.some(b => b.id === r));

    const color = d3.scaleSequential(d3.interpolateYlOrRd)
        .domain([buildings.length, 1]);   // rank 1 → darkest

    drawMap(buildings, world, color);
    drawCompare(buildings, color);
    drawLegend(buildings, color);
    drawInfoPanel(buildings);

    document.getElementById("reset").addEventListener("click", () => {
        state.selected = null;
        state.hovered  = null;
        state.compareIds = [1, 7, 23, 44, 78];
        applyState();
    });

    applyState();
}).catch(err => {
    console.error(err);
    document.body.insertAdjacentHTML("beforeend",
        `<pre style="color:#f88;padding:24px">Failed to load data: ${err.message}\n` +
        `Serve this folder over HTTP (e.g. <code>python3 -m http.server</code>) so the CSV + atlas can load.</pre>`);
});


function drawMap(buildings, world, color) {
    const svg = d3.select("#map");
    const node = svg.node();

    function render() {
        svg.selectAll("*").remove();
        const { width, height } = node.getBoundingClientRect();
        if (width === 0 || height === 0) return;

        const projection = d3.geoNaturalEarth1()
            .fitSize([width, height], { type: "Sphere" });
        const path = d3.geoPath(projection);

        const sphere = svg.append("path")
            .datum({ type: "Sphere" })
            .attr("d", path)
            .attr("fill", "#1a1d23")
            .attr("stroke", "none");

        const land = topojson.feature(world, world.objects.countries);
        svg.append("g").selectAll("path")
            .data(land.features)
            .join("path")
                .attr("class", "land")
                .attr("d", path);

        const borders = topojson.mesh(world, world.objects.countries, (a, b) => a !== b);
        svg.append("path")
            .datum(borders)
            .attr("class", "border")
            .attr("d", path);

        const dotsG = svg.append("g").attr("class", "dots");
        const dots = dotsG.selectAll("circle.dot")
            .data(buildings, d => d.id)
            .join("circle")
                .attr("class", "dot")
                .attr("cx", d => projection([d.lon, d.lat])[0])
                .attr("cy", d => projection([d.lon, d.lat])[1])
                .attr("r", d => dotRadius(d))
                .attr("fill", d => color(d.rank))
                .on("mouseenter", (evt, d) => {
                    state.hovered = d.id;
                    showTooltip(
                        `<strong>${d.name}</strong><br>` +
                        `${d.city}, ${d.country}<br>` +
                        `${d.height_m} m · ${d.floors} fl · ${d.year}`,
                        evt);
                    applyState();
                })
                .on("mousemove", evt => showTooltip(tooltipEl.innerHTML, evt))
                .on("mouseleave", () => {
                    state.hovered = null;
                    hideTooltip();
                    applyState();
                })
                .on("click", (_evt, d) => {
                    state.selected = d.id;
                    addToCompare(d.id);
                    applyState();
                });

        // Tallest dots last so they paint above smaller ones in dense areas.
        dots.sort((a, b) => d3.descending(a.rank, b.rank));

        const update = () => {
            dotsG.selectAll("circle.dot")
                .classed("selected", d => d.id === state.selected)
                .classed("dim", d => state.hovered != null && d.id !== state.hovered)
                .attr("r", d => dotRadius(d) * (d.id === state.hovered ? 1.6 : 1));
        };

        // Replace the previous map updater with this render's version.
        const idx = updaters.indexOf(mapUpdater);
        if (idx >= 0) updaters.splice(idx, 1);
        mapUpdater = update;
        updaters.push(mapUpdater);
    }

    let mapUpdater = () => {};
    render();

    // Re-project on resize. Debounced via rAF — projection.fitSize is cheap
    // for a 110m atlas but the join still costs a frame.
    let raf = null;
    window.addEventListener("resize", () => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(render);
    });
}

function dotRadius(d) {
    // Square-root so area roughly tracks height.
    return Math.max(3, Math.sqrt(d.height_m) * 0.28);
}


function drawCompare(buildings, color) {
    const svg = d3.select("#compare");
    const margin = { top: 16, right: 14, bottom: 28, left: 130 };

    function render() {
        const { width, height } = svg.node().getBoundingClientRect();
        if (width === 0 || height === 0) return;

        svg.selectAll("*").remove();

        const data = state.compareIds
            .map(id => buildings.find(b => b.id === id))
            .filter(Boolean)
            .sort((a, b) => d3.ascending(a.height_m, b.height_m));

        const innerW = width  - margin.left - margin.right;
        const innerH = height - margin.top  - margin.bottom;

        const g = svg.append("g")
            .attr("transform", `translate(${margin.left}, ${margin.top})`);

        if (data.length === 0) {
            g.append("text")
                .attr("x", innerW / 2).attr("y", innerH / 2)
                .attr("text-anchor", "middle")
                .attr("fill", "#8b9099")
                .attr("font-size", 12)
                .text("Click any dot on the map to add it here.");
            return;
        }

        const xMax = d3.max(data, d => d.height_m);
        const x = d3.scaleLinear().domain([0, xMax]).nice().range([0, innerW]);
        const y = d3.scaleBand().domain(data.map(d => d.id))
            .range([innerH, 0]).padding(0.18);

        g.append("g").attr("class", "axis")
            .attr("transform", `translate(0, ${innerH})`)
            .call(d3.axisBottom(x).ticks(6).tickFormat(d => d + " m"));

        g.append("g").attr("class", "axis")
            .call(d3.axisLeft(y).tickFormat(id => {
                const b = data.find(d => d.id === id);
                return b ? truncate(b.name, 18) : "";
            }));

        g.selectAll("rect.bar")
            .data(data, d => d.id)
            .join("rect")
                .attr("class", "bar")
                .attr("x", 0)
                .attr("y", d => y(d.id))
                .attr("height", y.bandwidth())
                .attr("width", d => x(d.height_m))
                .attr("fill", d => color(d.rank))
                .attr("stroke", d => d.id === state.selected ? "#fff" : "none")
                .attr("stroke-width", 1.5)
                .on("click", (_evt, d) => {
                    state.selected = d.id;
                    applyState();
                });

        g.selectAll("text.bar-label")
            .data(data, d => d.id)
            .join("text")
                .attr("class", "bar-label")
                .attr("x", d => x(d.height_m) + 6)
                .attr("y", d => y(d.id) + y.bandwidth() / 2 + 3)
                .attr("fill", "#c4c7cc")
                .attr("font-size", 10)
                .text(d => `${d.height_m} m`);
    }

    updaters.push(render);
    window.addEventListener("resize", render);
    render();
}


function addToCompare(id) {
    const i = state.compareIds.indexOf(id);
    if (i >= 0) return;
    state.compareIds.push(id);
    if (state.compareIds.length > state.maxCompare) state.compareIds.shift();
}


function drawLegend(buildings, color) {
    const svg = d3.select("#legend").attr("height", 80);
    const { width } = svg.node().getBoundingClientRect();
    const w = width - 24;
    const h = 14;

    // Render the sequential scale into a horizontal gradient.
    const defs = svg.append("defs");
    const grad = defs.append("linearGradient").attr("id", "rank-grad");
    const n = 12;
    d3.range(n + 1).forEach(i => {
        grad.append("stop")
            .attr("offset", `${(i / n) * 100}%`)
            .attr("stop-color", color(buildings.length - (i / n) * (buildings.length - 1)));
    });

    svg.append("rect")
        .attr("x", 12).attr("y", 18).attr("width", w).attr("height", h)
        .attr("fill", "url(#rank-grad)").attr("rx", 2);

    const x = d3.scaleLinear().domain([1, buildings.length]).range([12, 12 + w]);
    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0, ${18 + h})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d => "#" + d));
}


function drawInfoPanel(buildings) {
    const $name   = document.getElementById("info-name");
    const $where  = document.getElementById("info-where");
    const $stats  = document.getElementById("info-stats");
    const $height = document.getElementById("stat-height");
    const $floors = document.getElementById("stat-floors");
    const $year   = document.getElementById("stat-year");
    const $rank   = document.getElementById("stat-rank");
    const $facto  = document.getElementById("factoid");

    function render() {
        const id = state.selected ?? state.hovered;
        const b = id != null ? buildings.find(x => x.id === id) : null;

        if (!b) {
            $name.textContent  = "Select a building";
            $where.textContent = "Hover or click any dot on the map.";
            $stats.hidden = true;
            $facto.textContent = "";
            return;
        }

        $name.textContent  = b.name;
        $where.textContent = `${b.city}, ${b.country}`;
        $stats.hidden = false;
        $height.textContent = `${b.height_m} m`;
        $floors.textContent = b.floors;
        $year.textContent   = b.year;
        $rank.textContent   = `#${b.rank} of ${buildings.length}`;
        $facto.textContent  = factoid(b, buildings);
    }

    updaters.push(render);
}


function factoid(b, all) {
    // Quick contextual line so the panel feels alive without a hand-written
    // database. Pick the nearest taller and nearest shorter neighbour.
    const sorted = [...all].sort((a, x) => x.height_m - a.height_m);
    const idx = sorted.findIndex(s => s.id === b.id);
    const taller  = sorted[idx - 1];
    const shorter = sorted[idx + 1];
    const bits = [];
    if (taller)  bits.push(`${(taller.height_m  - b.height_m).toFixed(1)} m shorter than ${taller.name}`);
    if (shorter) bits.push(`${(b.height_m - shorter.height_m).toFixed(1)} m taller than ${shorter.name}`);
    return bits.join(" · ");
}


function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
