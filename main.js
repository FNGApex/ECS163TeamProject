const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const state = {
    hovered: null,
    selected: null,
    compareIds: [],
    maxCompare: 8,
    search: "",
    country: "All",
    yearMin: null,
    yearMax: null,
    mapTransform: d3.zoomIdentity
};

const updaters = [];
function applyState() { updaters.forEach(fn => fn()); }

const tooltipEl = document.getElementById("tooltip");
function showTooltip(html, evt) {
    tooltipEl.innerHTML = html;
    tooltipEl.hidden = false;
    const pad = 12;
    const x = Math.min(evt.clientX + pad, window.innerWidth - tooltipEl.offsetWidth - pad);
    const y = Math.min(evt.clientY + pad, window.innerHeight - tooltipEl.offsetHeight - pad);
    tooltipEl.style.left = x + "px";
    tooltipEl.style.top = y + "px";
}
function hideTooltip() { tooltipEl.hidden = true; }

Promise.all([
    d3.csv("data/buildings.csv", d3.autoType),
    d3.json(WORLD_URL)
]).then(([buildings, world]) => {
    buildings.forEach(b => { b.id = b.rank; });
    buildings.sort((a, b) => d3.ascending(a.rank, b.rank));

    const years = d3.extent(buildings, d => d.year);
    state.yearMin = years[0];
    state.yearMax = years[1];
    state.compareIds = [1, 2, 3, 4, 5].filter(r => buildings.some(b => b.id === r));

    const color = d3.scaleSequential(d3.interpolateYlOrRd)
        .domain([buildings.length, 1]);

    setupControls(buildings, years);
    drawSummary(buildings);
    drawMap(buildings, world, color);
    drawInfoPanel(buildings);
    drawCompare(buildings, color);
    drawCountryChart(buildings);
    drawTimeline(buildings);
    drawLegend(buildings, color);

    applyState();
}).catch(err => {
    console.error(err);
    document.body.insertAdjacentHTML("beforeend",
        `<pre style="color:#f88;padding:24px">Failed to load data: ${err.message}\n` +
        `Serve this folder over HTTP, for example: <code>python -m http.server 8000</code>.</pre>`);
});

function setupControls(buildings, years) {
    const search = document.getElementById("search");
    const countrySelect = document.getElementById("country-filter");
    const yearMin = document.getElementById("year-min");
    const yearMax = document.getElementById("year-max");
    const reset = document.getElementById("reset");

    const countries = Array.from(new Set(buildings.map(d => d.country))).sort(d3.ascending);
    countrySelect.insertAdjacentHTML("beforeend", countries.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join(""));

    yearMin.min = years[0];
    yearMin.max = years[1];
    yearMin.value = years[0];
    yearMax.min = years[0];
    yearMax.max = years[1];
    yearMax.value = years[1];

    search.addEventListener("input", () => {
        state.search = search.value.trim().toLowerCase();
        applyState();
    });

    countrySelect.addEventListener("change", () => {
        state.country = countrySelect.value;
        applyState();
    });

    function updateYearRange() {
        let lo = +yearMin.value;
        let hi = +yearMax.value;
        if (Number.isNaN(lo)) lo = years[0];
        if (Number.isNaN(hi)) hi = years[1];
        if (lo > hi) [lo, hi] = [hi, lo];
        state.yearMin = lo;
        state.yearMax = hi;
        applyState();
    }
    yearMin.addEventListener("change", updateYearRange);
    yearMax.addEventListener("change", updateYearRange);

    reset.addEventListener("click", () => {
        state.hovered = null;
        state.selected = null;
        state.search = "";
        state.country = "All";
        state.yearMin = years[0];
        state.yearMax = years[1];
        state.compareIds = [1, 2, 3, 4, 5].filter(r => buildings.some(b => b.id === r));
        state.mapTransform = d3.zoomIdentity;
        search.value = "";
        countrySelect.value = "All";
        yearMin.value = years[0];
        yearMax.value = years[1];
        applyState();
    });
}

function filteredBuildings(buildings) {
    return buildings.filter(d => {
        const text = `${d.name} ${d.city} ${d.country}`.toLowerCase();
        return (!state.search || text.includes(state.search)) &&
            (state.country === "All" || d.country === state.country) &&
            d.year >= state.yearMin && d.year <= state.yearMax;
    });
}

function drawSummary(buildings) {
    const countEl = document.getElementById("summary-count");
    const countriesEl = document.getElementById("summary-countries");
    const tallestEl = document.getElementById("summary-tallest");
    const yearsEl = document.getElementById("summary-years");

    updaters.push(() => {
        const data = filteredBuildings(buildings);
        const countries = new Set(data.map(d => d.country));
        const tallest = d3.greatest(data, d => d.height_m);
        const yearExtent = d3.extent(data, d => d.year);
        countEl.textContent = data.length;
        countriesEl.textContent = countries.size;
        tallestEl.textContent = tallest ? `${tallest.name} (${fmtHeight(tallest.height_m)})` : "—";
        yearsEl.textContent = data.length ? `${yearExtent[0]}–${yearExtent[1]}` : "—";
    });
}

function drawMap(buildings, world, color) {
    const svg = d3.select("#map");
    const node = svg.node();
    let mapUpdater = () => {};
    let zoomBehavior = null;

    function render() {
        svg.selectAll("*").remove();
        const { width, height } = node.getBoundingClientRect();
        if (width === 0 || height === 0) return;

        const projection = d3.geoNaturalEarth1().fitSize([width, height], { type: "Sphere" });
        const path = d3.geoPath(projection);
        const root = svg.append("g").attr("class", "map-root");

        root.append("path")
            .datum({ type: "Sphere" })
            .attr("d", path)
            .attr("fill", "#1a1d23")
            .attr("stroke", "none");

        const land = topojson.feature(world, world.objects.countries);
        root.append("g").selectAll("path")
            .data(land.features)
            .join("path")
            .attr("class", "land")
            .attr("d", path);

        const borders = topojson.mesh(world, world.objects.countries, (a, b) => a !== b);
        root.append("path")
            .datum(borders)
            .attr("class", "border")
            .attr("d", path);

        const dotsG = root.append("g").attr("class", "dots");

        zoomBehavior = d3.zoom()
            .scaleExtent([1, 8])
            .translateExtent([[0, 0], [width, height]])
            .on("zoom", evt => {
                state.mapTransform = evt.transform;
                root.attr("transform", state.mapTransform);
            });

        svg.call(zoomBehavior).on("dblclick.zoom", null);
        svg.call(zoomBehavior.transform, state.mapTransform);

        const update = () => {
            const currentZoom = d3.zoomTransform(svg.node());
            if (!sameTransform(currentZoom, state.mapTransform)) {
                svg.call(zoomBehavior.transform, state.mapTransform);
            }
            root.attr("transform", state.mapTransform);

            const data = filteredBuildings(buildings);
            const dots = dotsG.selectAll("circle.dot")
                .data(data, d => d.id)
                .join(
                    enter => enter.append("circle")
                        .attr("class", "dot")
                        .attr("cx", d => projection([d.lon, d.lat])[0])
                        .attr("cy", d => projection([d.lon, d.lat])[1])
                        .attr("r", 0)
                        .attr("fill", d => color(d.rank))
                        .call(enter => enter.transition().duration(350).attr("r", d => dotRadius(d)))
                        .on("mouseenter", (evt, d) => {
                            state.hovered = d.id;
                            showTooltip(
                                `<strong>${escapeHtml(d.name)}</strong><br>` +
                                `${escapeHtml(d.city)}, ${escapeHtml(d.country)}<br>` +
                                `${fmtHeight(d.height_m)} · ${d.floors} fl · ${d.year}`,
                                evt
                            );
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
                        }),
                    update => update,
                    exit => exit.transition().duration(200).attr("r", 0).remove()
                );

            dots.sort((a, b) => d3.descending(a.rank, b.rank));
            dots.classed("selected", d => d.id === state.selected)
                .classed("dim", d => state.hovered != null && d.id !== state.hovered)
                .transition().duration(150)
                .attr("r", d => dotRadius(d) * (d.id === state.hovered ? 1.5 : 1));
        };

        const idx = updaters.indexOf(mapUpdater);
        if (idx >= 0) updaters.splice(idx, 1);
        mapUpdater = update;
        updaters.push(mapUpdater);
        update();
    }

    render();

    let raf = null;
    window.addEventListener("resize", () => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(render);
    });
}

function dotRadius(d) {
    return Math.max(3.4, Math.sqrt(d.height_m) * 0.28);
}

function drawInfoPanel(buildings) {
    const $name = document.getElementById("info-name");
    const $where = document.getElementById("info-where");
    const $stats = document.getElementById("info-stats");
    const $height = document.getElementById("stat-height");
    const $floors = document.getElementById("stat-floors");
    const $year = document.getElementById("stat-year");
    const $rank = document.getElementById("stat-rank");
    const $facto = document.getElementById("factoid");

    function render() {
        const visible = filteredBuildings(buildings);
        const id = state.selected ?? state.hovered;
        let b = id != null ? buildings.find(x => x.id === id) : null;
        if (b && !visible.some(x => x.id === b.id)) b = null;

        if (!b) {
            $name.textContent = "Select a building";
            $where.textContent = visible.length ? "Hover or click any visible dot on the map." : "No buildings match the current filters.";
            $stats.hidden = true;
            $facto.textContent = "";
            return;
        }

        $name.textContent = b.name;
        $where.textContent = `${b.city}, ${b.country}`;
        $stats.hidden = false;
        $height.textContent = fmtHeight(b.height_m);
        $floors.textContent = b.floors;
        $year.textContent = b.year;
        $rank.textContent = `#${b.rank} of ${buildings.length}`;
        $facto.textContent = factoid(b, buildings);
    }

    updaters.push(render);
}

function drawCompare(buildings, color) {
    const svg = d3.select("#compare");
    const margin = { top: 10, right: 18, bottom: 28, left: 150 };

    function render() {
        const { width, height } = svg.node().getBoundingClientRect();
        if (width === 0 || height === 0) return;
        svg.selectAll("*").remove();

        const data = state.compareIds
            .map(id => buildings.find(b => b.id === id))
            .filter(Boolean)
            .sort((a, b) => d3.ascending(a.height_m, b.height_m));

        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;
        const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        if (data.length === 0) {
            emptyMessage(g, innerW, innerH, "Click any dot on the map to add it here.");
            return;
        }

        const x = d3.scaleLinear().domain([0, d3.max(buildings, d => d.height_m)]).nice().range([0, innerW]);
        const y = d3.scaleBand().domain(data.map(d => d.id)).range([innerH, 0]).padding(0.22);

        g.append("g").attr("class", "axis")
            .attr("transform", `translate(0, ${innerH})`)
            .call(d3.axisBottom(x).ticks(5).tickFormat(d => d + " m"));

        g.append("g").attr("class", "axis")
            .call(d3.axisLeft(y).tickFormat(id => {
                const b = data.find(d => d.id === id);
                return b ? truncate(b.name, 22) : "";
            }));

        g.selectAll("rect.bar")
            .data(data, d => d.id)
            .join("rect")
            .attr("class", "bar")
            .attr("x", 0)
            .attr("y", d => y(d.id))
            .attr("height", y.bandwidth())
            .attr("fill", d => color(d.rank))
            .attr("stroke", d => d.id === state.selected ? "#fff" : "none")
            .attr("stroke-width", 1.5)
            .attr("width", 0)
            .on("click", (_evt, d) => {
                state.selected = d.id;
                applyState();
            })
            .transition().duration(500)
            .attr("width", d => x(d.height_m));

        g.selectAll("text.bar-label")
            .data(data, d => d.id)
            .join("text")
            .attr("class", "bar-label")
            .attr("y", d => y(d.id) + y.bandwidth() / 2 + 4)
            .attr("text-anchor", d => x(d.height_m) > innerW - 58 ? "end" : "start")
            .attr("x", d => x(d.height_m) > innerW - 58 ? x(d.height_m) - 6 : x(d.height_m) + 6)
            .attr("fill", d => x(d.height_m) > innerW - 58 ? "#fff" : "#c4c7cc")
            .text(d => fmtHeight(d.height_m));
    }

    updaters.push(render);
    window.addEventListener("resize", render);
    render();
}

function drawCountryChart(buildings) {
    const svg = d3.select("#country-chart");
    const margin = { top: 8, right: 16, bottom: 22, left: 108 };

    function render() {
        const { width, height } = svg.node().getBoundingClientRect();
        if (width === 0 || height === 0) return;
        svg.selectAll("*").remove();
        const data = Array.from(d3.rollup(filteredBuildings(buildings), v => v.length, d => d.country), ([country, count]) => ({ country, count }))
            .sort((a, b) => d3.descending(a.count, b.count))
            .slice(0, 7);

        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;
        const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        if (data.length === 0) {
            emptyMessage(g, innerW, innerH, "No countries match the current filters.");
            return;
        }

        const x = d3.scaleLinear().domain([0, d3.max(data, d => d.count)]).nice().range([0, innerW]);
        const y = d3.scaleBand().domain(data.map(d => d.country)).range([0, innerH]).padding(0.22);

        g.append("g").attr("class", "axis")
            .attr("transform", `translate(0, ${innerH})`)
            .call(d3.axisBottom(x).ticks(4));
        g.append("g").attr("class", "axis")
            .call(d3.axisLeft(y).tickFormat(d => truncate(d, 16)));

        g.selectAll("rect.country-bar")
            .data(data)
            .join("rect")
            .attr("class", "country-bar")
            .attr("x", 0)
            .attr("y", d => y(d.country))
            .attr("height", y.bandwidth())
            .attr("width", 0)
            .on("click", (_evt, d) => {
                state.country = d.country;
                document.getElementById("country-filter").value = d.country;
                applyState();
            })
            .transition().duration(450)
            .attr("width", d => x(d.count));

        g.selectAll("text.country-label")
            .data(data)
            .join("text")
            .attr("class", "country-label")
            .attr("x", d => x(d.count) + 5)
            .attr("y", d => y(d.country) + y.bandwidth() / 2 + 4)
            .text(d => d.count);
    }

    updaters.push(render);
    window.addEventListener("resize", render);
    render();
}

function drawTimeline(buildings) {
    const svg = d3.select("#timeline");
    const margin = { top: 12, right: 20, bottom: 28, left: 36 };

    function render() {
        const { width, height } = svg.node().getBoundingClientRect();
        if (width === 0 || height === 0) return;
        svg.selectAll("*").remove();

        const data = filteredBuildings(buildings);
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;
        const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        if (data.length === 0) {
            emptyMessage(g, innerW, innerH, "No buildings match the current filters.");
            return;
        }

        const allYears = d3.extent(buildings, d => d.year);
        const x = d3.scaleLinear().domain(allYears).nice().range([0, innerW]);
        const bins = d3.bin().domain(x.domain()).thresholds(d3.range(allYears[0], allYears[1] + 10, 10)).value(d => d.year)(data);
        const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length) || 1]).nice().range([innerH, 0]);

        g.append("g").attr("class", "axis")
            .attr("transform", `translate(0, ${innerH})`)
            .call(d3.axisBottom(x).ticks(8).tickFormat(d3.format("d")));
        g.append("g").attr("class", "axis")
            .call(d3.axisLeft(y).ticks(3));

        g.selectAll("rect.timeline-bar")
            .data(bins)
            .join("rect")
            .attr("class", "timeline-bar")
            .attr("x", d => x(d.x0) + 1)
            .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 2))
            .attr("y", innerH)
            .attr("height", 0)
            .transition().duration(450)
            .attr("y", d => y(d.length))
            .attr("height", d => innerH - y(d.length));
    }

    updaters.push(render);
    window.addEventListener("resize", render);
    render();
}

function drawLegend(buildings, color) {
    const svg = d3.select("#legend");

    function render() {
        svg.selectAll("*").remove();
        const { width } = svg.node().getBoundingClientRect();
        if (width === 0) return;
        svg.attr("height", 82);
        const w = width - 24;
        const h = 14;

        const defs = svg.append("defs");
        const grad = defs.append("linearGradient").attr("id", "rank-grad");
        const n = 16;
        d3.range(n + 1).forEach(i => {
            grad.append("stop")
                .attr("offset", `${(i / n) * 100}%`)
                .attr("stop-color", color(buildings.length - (i / n) * (buildings.length - 1)));
        });

        svg.append("rect")
            .attr("x", 12).attr("y", 18).attr("width", w).attr("height", h)
            .attr("fill", "url(#rank-grad)").attr("rx", 2);

        const x = d3.scaleLinear().domain([buildings.length, 1]).range([12, 12 + w]);
        svg.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(0, ${18 + h})`)
            .call(d3.axisBottom(x).tickValues([78, 60, 40, 20, 1]).tickFormat(d => "#" + d));
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

function factoid(b, all) {
    const sorted = [...all].sort((a, x) => x.height_m - a.height_m);
    const idx = sorted.findIndex(s => s.id === b.id);
    const taller = sorted[idx - 1];
    const shorter = sorted[idx + 1];
    const bits = [];
    if (taller) bits.push(`${(taller.height_m - b.height_m).toFixed(1)} m shorter than ${taller.name}`);
    if (shorter) bits.push(`${(b.height_m - shorter.height_m).toFixed(1)} m taller than ${shorter.name}`);
    return bits.join(" · ");
}

function emptyMessage(g, w, h, msg) {
    g.append("text")
        .attr("x", w / 2)
        .attr("y", h / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#8b9099")
        .attr("font-size", 12)
        .text(msg);
}

function fmtHeight(m) {
    return `${d3.format(".1f")(m).replace(/\.0$/, "")} m`;
}

function truncate(s, n) {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function sameTransform(a, b) {
    return Math.abs(a.x - b.x) < 0.001 &&
        Math.abs(a.y - b.y) < 0.001 &&
        Math.abs(a.k - b.k) < 0.001;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
