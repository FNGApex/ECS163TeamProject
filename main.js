const state = {
  allData: [],
  filteredData: [],
  displayedData: [],
  selected: null,
  compareTarget: null,
  country: "all",
  search: "",
  sort: "height-desc",
  topN: 18,
  yearRange: null,
  world: null,
  recordTimeline: [],
  mapTransform: d3.zoomIdentity
};

const mapSvg = d3.select("#map-svg");
const skylineSvg = d3.select("#skyline-svg");
const timelineSvg = d3.select("#timeline-svg");
const connectionSvg = d3.select("#connection-svg");
const tooltip = d3.select("#tooltip");

const rankColor = d3.scaleSequential()
  .domain([80, 1])
  .interpolator(d3.interpolateRgbBasis(["#5a0707", "#c81414", "#ff5a2f", "#ffb24a"]));

const formatNumber = d3.format(",");
const keySafe = value => String(value || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");

/* 
Datasets for country context are set up with different formatting
This is here to make sure the datasets can be joined properly
 */
const GDP_ALIAS = {
  "South Korea": "Korea, Rep.",
  "Russia": "Russian Federation",
  "Vietnam": "Viet Nam",
  "Egypt": "Egypt, Arab Rep.",
  "England": "United Kingdom",
  "Turkey": "Turkiye"
};
const ENERGY_POP_ALIAS = {
  "United States": "USA",
  "United Arab Emirates": "UAE",
  "England": "UK"
};

//Sort through country context data
const contextData = { gdp: new Map(), energy: new Map(), population: new Map() };

function addContextRows(map, rows, countryKey, valueKey) {
  for (const row of rows) {
    const country = (row[countryKey] || "").trim();
    const year = cleanNumber(row.year);
    const value = cleanNumber(row[valueKey]);
    if (!country || !Number.isFinite(year) || !Number.isFinite(value)) continue;
    if (!map.has(country)) map.set(country, []);
    map.get(country).push({ year, value });
  }
  for (const arr of map.values()) arr.sort((a, b) => a.year - b.year);
}

//Energy production dataset only tracks until 2009, so we have to track the closest year for buildings built after 2009
function nearestByYear(arr, year) {
  if (!arr || !arr.length) return null;
  let best = arr[0];
  for (const point of arr) {
    if (Math.abs(point.year - year) < Math.abs(best.year - year)) best = point;
  }
  return best;
}

//Returns { value, year, exact } for a building's country at (or near) its build
//year, or null when that country is missing from the source dataset.
function lookupContext(metric, country, year) {
  const alias = metric === "gdp" ? GDP_ALIAS : ENERGY_POP_ALIAS;
  const canonical = alias[country] || country;
  const hit = nearestByYear(contextData[metric].get(canonical), year);
  if (!hit) return null;
  return { value: hit.value, year: hit.year, exact: hit.year === year };
}

function formatUSD(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${formatNumber(Math.round(value))}`;
}

function formatPeople(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return formatNumber(Math.round(value));
}

//Change unit from kilotons of oil equivalent to millions of tons of oil equivalent
function formatEnergy(value) {
  if (!Number.isFinite(value)) return "-";
  const mtoe = value / 1000;
  if (mtoe >= 1000) return `${formatNumber(Math.round(mtoe))} Mtoe`;
  if (mtoe >= 1) return `${mtoe.toFixed(1)} Mtoe`;
  return `${formatNumber(Math.round(value))} ktoe`;
}

//Setting up scale for timeline dates
function formatEraYear(year) {
  if (!Number.isFinite(year)) return "-";
  if (year < 0) return `${formatNumber(Math.abs(year))} BCE`;
  if (year < 1000) return `${year} CE`;
  return `${year}`;
}

function normalizeHistorical(row) {
  const height = cleanNumber(row.height_m);
  const year = cleanNumber(row.year_start);
  const yearEnd = cleanNumber(row.year_end);
  const held = cleanNumber(row.years_held);
  const lat = cleanNumber(row.lat);
  const lon = cleanNumber(row.lon);
  return {
    name: row.name || "Unknown structure",
    height,
    year,
    yearEnd: Number.isFinite(yearEnd) ? yearEnd : null,
    yearsHeld: Number.isFinite(held) ? held : null,
    type: row.type || "Structure",
    country: row.country || "",
    city: row.city || "",
    lat,
    lon,
    hasLocation: Number.isFinite(lat) && Number.isFinite(lon)
  };
}

//Combining the historical dataset with 78 tallest dataset.
function buildRecordTimeline(historical, buildings) {
  const buildingByName = new Map(buildings.map(b => [String(b.name).toLowerCase(), b]));
  return historical
    .filter(h => Number.isFinite(h.height) && Number.isFinite(h.year) && h.hasLocation)
    .sort((a, b) => a.year - b.year)
    .map(h => {
      const match = buildingByName.get(String(h.name).toLowerCase());
      return { ...h, modernRank: match ? match.rank : null };
    });
}

function firstDefined(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== "") {
      return row[name];
    }
  }
  return "";
}

function cleanNumber(value) {
  if (value === undefined || value === null) return NaN;
  const cleaned = String(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return cleaned ? +cleaned[0] : NaN;
}

function inferProfile(name, index = 0) {
  const n = String(name || "").toLowerCase();

  if (/burj khalifa/.test(n)) return "burj";
  if (/merdeka 118/.test(n)) return "needle";
  if (/shanghai tower/.test(n)) return "twist";
  if (/abraj|clock tower|makkah/.test(n)) return "clock";
  if (/ping an|lotte world|one world|wuhan greenland|guangzhou ctf|tianjin ctf/.test(n)) return "taper";
  if (/taipei 101/.test(n)) return "taipei";
  if (/lakhta/.test(n)) return "lance";
  if (/central park tower|china zun|skyscraper|changsha ifs|park avenue|marina 101/.test(n)) return "slab";
  if (/petronas|jin mao|exchange 106/.test(n)) return "crown";
  if (/shard/.test(n)) return "shard";
  if (/kk100|432 park avenue|willis|empire/.test(n)) return "setback";

  const fallbacks = ["taper", "setback", "slab", "needle", "crown", "twist"];
  return fallbacks[index % fallbacks.length];
}

function normalizeRow(row, index) {
  const rank = cleanNumber(firstDefined(row, ["rank", "Rank"]));
  const height = cleanNumber(firstDefined(row, ["height_m", "height", "Height", "height_meters", "Height (m)"]));
  const floors = cleanNumber(firstDefined(row, ["floors", "Floors"]));
  const year = cleanNumber(firstDefined(row, ["year_built", "year", "Year", "built", "Completed"]));
  const lat = cleanNumber(firstDefined(row, ["lat", "Lat", "latitude", "Latitude", "LAT"]));
  const lon = cleanNumber(firstDefined(row, ["lon", "Lon", "lng", "Lng", "longitude", "Longitude", "LON"]));
  const name = firstDefined(row, ["name", "Name", "building", "Building", "Building Name"]) || `Building ${index + 1}`;
  const city = firstDefined(row, ["city", "City"]);
  const country = firstDefined(row, ["country", "Country"]);

  return {
    ...row,
    id: `${rank || index + 1}-${keySafe(name)}`,
    rank: Number.isFinite(rank) ? rank : index + 1,
    name,
    height,
    floors: Number.isFinite(floors) ? floors : null,
    year: Number.isFinite(year) ? year : null,
    city,
    country,
    lat,
    lon,
    hasLocation: Number.isFinite(lat) && Number.isFinite(lon),
    profile: inferProfile(name, index)
  };
}

Promise.all([
  d3.csv("data/buildings.csv", normalizeRow),
  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
  d3.csv("data/historical_structures.csv", normalizeHistorical),
  d3.csv("data/gdp.csv"),
  d3.csv("data/energy_production.csv"),
  d3.csv("data/population.csv")
]).then(([buildings, world, historical, gdpRows, energyRows, populationRows]) => {
  state.allData = buildings.filter(d => Number.isFinite(d.height)).sort((a, b) => d3.ascending(a.rank, b.rank));
  state.world = topojson.feature(world, world.objects.countries);
  state.selected = state.allData[0] || null;

  //formatting for faster country + year lookups
  addContextRows(contextData.gdp, gdpRows, "country", "gdp_usd");
  addContextRows(contextData.energy, energyRows, "country", "energy_production");
  addContextRows(contextData.population, populationRows, "country", "population");

  //building the timeline
  state.recordTimeline = buildRecordTimeline(historical, state.allData);

  //Initialize dashboard after timeline animation
  initializeControls();
  applyFilters();
  window.addEventListener("resize", debounce(() => renderAll(), 180));

  startIntro();
}).catch(error => {
  console.error(error);
  d3.select(".page-shell").classed("pre-reveal", false);
  d3.select("#intro-overlay").remove();
  document.body.classList.remove("intro-active");
  d3.select(".page-shell").append("div")
    .attr("class", "story-card")
    .html(`<h2>Data loading problem</h2><p>Make sure the files in <strong>data/</strong> (buildings.csv, historical_structures.csv, gdp.csv, energy_production.csv, population.csv) are present and that you are running the project through a local server such as VS Code Live Server.</p>`);
});

function initializeControls() {
  d3.select("#hero-count").text(state.allData.length);

  const countries = Array.from(new Set(state.allData.map(d => d.country).filter(Boolean))).sort(d3.ascending);
  d3.select("#country-select")
    .selectAll("option.country-option")
    .data(countries)
    .join("option")
    .attr("class", "country-option")
    .attr("value", d => d)
    .text(d => d);

  const buildingOptions = state.allData.map(d => ({ id: d.id, label: `${d.rank}. ${d.name} — ${Math.round(d.height)}m` }));
  for (const selector of ["#compare-a-select", "#compare-b-select"]) {
    const select = d3.select(selector);
    select.selectAll("option")
      .data([{ id: "", label: selector === "#compare-a-select" ? "Choose Building A" : "Choose Building B" }, ...buildingOptions])
      .join("option")
      .attr("value", d => d.id)
      .text(d => d.label);
  }

  d3.select("#compare-a-select").on("change", event => {
    state.selected = state.allData.find(d => d.id === event.target.value) || null;
    if (state.compareTarget && state.selected && state.compareTarget.id === state.selected.id) state.compareTarget = null;
    applyFilters();
  });

  d3.select("#compare-b-select").on("change", event => {
    state.compareTarget = state.allData.find(d => d.id === event.target.value) || null;
    if (state.selected && state.compareTarget && state.selected.id === state.compareTarget.id) state.compareTarget = null;
    applyFilters();
  });

  d3.select("#search-input").on("input", event => {
    state.search = event.target.value.trim().toLowerCase();
    applyFilters();
  });

  d3.select("#country-select").on("change", event => {
    state.country = event.target.value;
    applyFilters();
  });

  d3.select("#sort-select").on("change", event => {
    state.sort = event.target.value;
    applyFilters();
  });

  d3.select("#topn-slider").on("input", event => {
    state.topN = +event.target.value;
    d3.select("#topn-label").text(state.topN);
    applyFilters();
  });

  d3.select("#reset-button").on("click", () => {
    state.country = "all";
    state.search = "";
    state.sort = "height-desc";
    state.topN = 18;
    state.yearRange = null;
    state.selected = state.allData[0] || null;
    state.compareTarget = null;
    state.mapTransform = d3.zoomIdentity;
    d3.select("#country-select").property("value", "all");
    d3.select("#search-input").property("value", "");
    d3.select("#sort-select").property("value", "height-desc");
    d3.select("#topn-slider").property("value", 18);
    d3.select("#topn-label").text(18);
    syncCompareControls();
    applyFilters();
  });
}

function applyFilters() {
  const search = state.search;
  let data = state.allData.filter(d => {
    const matchesCountry = state.country === "all" || d.country === state.country;
    const matchesSearch = !search || `${d.name} ${d.city} ${d.country}`.toLowerCase().includes(search);
    const matchesYear = !state.yearRange || (Number.isFinite(d.year) && d.year >= state.yearRange[0] && d.year <= state.yearRange[1]);
    return matchesCountry && matchesSearch && matchesYear;
  });

  data = sortData(data, state.sort);
  state.filteredData = data;
  state.displayedData = data.slice(0, state.topN);

  const pinned = [state.selected, state.compareTarget].filter(Boolean);
  for (const item of pinned) {
    if (!state.displayedData.some(d => d.id === item.id)) {
      state.displayedData.push(item);
    }
  }
  state.displayedData = sortData(state.displayedData, state.sort);

  if (state.selected && state.compareTarget && state.selected.id === state.compareTarget.id) {
    state.compareTarget = null;
  }

  syncCompareControls();
  renderAll();
}

function syncCompareControls() {
  d3.select("#compare-a-select").property("value", state.selected ? state.selected.id : "");
  d3.select("#compare-b-select").property("value", state.compareTarget ? state.compareTarget.id : "");
}

function sortData(data, mode) {
  const copied = [...data];
  if (mode === "rank-asc") return copied.sort((a, b) => d3.ascending(a.rank, b.rank));
  if (mode === "year-asc") return copied.sort((a, b) => d3.ascending(a.year || 9999, b.year || 9999));
  if (mode === "country-asc") return copied.sort((a, b) => d3.ascending(a.country, b.country) || d3.descending(a.height, b.height));
  return copied.sort((a, b) => d3.descending(a.height, b.height));
}

function renderAll() {
  renderMap();
  renderSkyline();
  renderTimeline();
  renderDetails();
  renderStatsAndStory();
  setTimeout(drawConnection, 40);
}

function renderMap() {
  const rect = mapSvg.node().getBoundingClientRect();
  const width = Math.max(360, rect.width);
  const height = Math.max(300, rect.height);

  mapSvg.attr("viewBox", [0, 0, width, height]);
  mapSvg.selectAll("*").remove();

  const projection = d3.geoNaturalEarth1()
    .fitExtent([[18, 16], [width - 18, height - 18]], state.world);
  const path = d3.geoPath(projection);

  const g = mapSvg.append("g").attr("class", "map-root");

  g.selectAll("path.country")
    .data(state.world.features)
    .join("path")
    .attr("class", "country")
    .attr("d", path);

  const markerScale = d3.scaleSqrt()
    .domain(d3.extent(state.allData, d => d.height))
    .range([3.5, 11]);

  const visibleById = new Set(state.filteredData.map(d => d.id));
  const markerData = state.allData.filter(d => d.hasLocation);

  g.selectAll("circle.map-marker")
    .data(markerData, d => d.id)
    .join("circle")
    .attr("class", d => `map-marker ${state.selected && state.selected.id === d.id ? "selected selected-a" : ""} ${state.compareTarget && state.compareTarget.id === d.id ? "selected selected-b" : ""}`)
    .attr("data-id", d => d.id)
    .attr("cx", d => projection([d.lon, d.lat])?.[0])
    .attr("cy", d => projection([d.lon, d.lat])?.[1])
    .attr("r", 0)
    .attr("fill", d => rankColor(d.rank))
    .attr("opacity", d => visibleById.has(d.id) ? 0.95 : 0.12)
    .on("mouseenter", (event, d) => showTooltip(event, d))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (event, d) => selectBuilding(d))
    .transition()
    .duration(650)
    .attr("r", d => markerScale(d.height));

  [
    { item: state.selected, label: "A", cls: "map-label-a" },
    { item: state.compareTarget, label: "B", cls: "map-label-b" }
  ].forEach(entry => {
    if (!entry.item?.hasLocation) return;
    const [x, y] = projection([entry.item.lon, entry.item.lat]);
    g.append("text")
      .attr("class", `map-label ${entry.cls}`)
      .attr("x", x + 14)
      .attr("y", y - 12)
      .text(`${entry.label}: ${entry.item.name}`);
  });

  const zoom = d3.zoom()
    .scaleExtent([1, 7])
    .on("zoom", event => {
      state.mapTransform = event.transform;
      g.attr("transform", event.transform);
      g.selectAll(".country").style("stroke-width", `${0.6 / event.transform.k}px`);
      g.selectAll(".map-marker").style("stroke-width", `${1.6 / event.transform.k}px`);
      drawConnection();
    });

  mapSvg.call(zoom).call(zoom.transform, state.mapTransform);
}

function renderSkyline() {
  const rect = skylineSvg.node().getBoundingClientRect();
  const width = Math.max(700, rect.width);
  const height = Math.max(420, rect.height);
  const margin = { top: 34, right: 34, bottom: 112, left: 70 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const baseY = margin.top + innerHeight;

  skylineSvg.attr("viewBox", [0, 0, width, height]);
  skylineSvg.selectAll("*").remove();

  if (!state.displayedData.length) {
    skylineSvg.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#9fb0c7")
      .attr("font-weight", 800)
      .text("No buildings match the current filters.");
    return;
  }

  const x = d3.scaleBand()
    .domain(state.displayedData.map(d => d.id))
    .range([margin.left, margin.left + innerWidth])
    .paddingInner(0.18)
    .paddingOuter(0.08);

  const y = d3.scaleLinear()
    .domain([0, d3.max(state.allData, d => d.height)]).nice()
    .range([baseY, margin.top]);

  const defs = skylineSvg.append("defs");

  const guideTicks = y.ticks(5);
  skylineSvg.append("g")
    .selectAll("line")
    .data(guideTicks)
    .join("line")
    .attr("class", "height-guide")
    .attr("x1", margin.left)
    .attr("x2", width - margin.right)
    .attr("y1", d => y(d))
    .attr("y2", d => y(d));

  skylineSvg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d}m`));

  skylineSvg.append("line")
    .attr("class", "ground-line")
    .attr("x1", margin.left)
    .attr("x2", width - margin.right)
    .attr("y1", baseY)
    .attr("y2", baseY);

  [
    { item: state.selected, label: "A", cls: "selected-height-a" },
    { item: state.compareTarget, label: "B", cls: "selected-height-b" }
  ].forEach((entry, index) => {
    if (!entry.item || !Number.isFinite(entry.item.height)) return;
    const selectedY = y(entry.item.height);
    skylineSvg.append("line")
      .attr("class", `selected-height-line ${entry.cls}`)
      .attr("x1", margin.left)
      .attr("x2", width - margin.right)
      .attr("y1", selectedY)
      .attr("y2", selectedY);

    skylineSvg.append("text")
      .attr("class", `selected-height-note ${entry.cls}`)
      .attr("x", width - margin.right)
      .attr("y", selectedY - 7 - index * 15)
      .text(`${entry.label}: ${shortName(entry.item.name, 22)} · ${Math.round(entry.item.height)}m`);
  });

  const groups = skylineSvg.append("g")
    .selectAll("g.building-group")
    .data(state.displayedData, d => d.id)
    .join("g")
    .attr("class", d => `building-group ${state.selected && state.selected.id === d.id ? "selected selected-a" : ""} ${state.compareTarget && state.compareTarget.id === d.id ? "selected selected-b" : ""}`)
    .attr("data-id", d => d.id)
    .on("mouseenter", (event, d) => showTooltip(event, d))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (event, d) => selectBuilding(d));

  groups.each(function(d, i) {
    const g = d3.select(this);
    const bw = Math.max(16, x.bandwidth() * 0.72);
    const cx = x(d.id) + x.bandwidth() / 2;
    const topY = y(d.height);
    const bh = baseY - topY;
    const shellPath = buildingPath(cx, baseY, bw, bh, d.profile);
    const clipId = `clip-${keySafe(d.id)}`;
    const gradId = `grad-${keySafe(d.id)}`;
    const bodyColor = rankColor(d.rank);

    const grad = defs.append("linearGradient")
      .attr("id", gradId)
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "100%");
    grad.append("stop").attr("offset", "0%" ).attr("stop-color", tint(bodyColor, 0.9));
    grad.append("stop").attr("offset", "45%" ).attr("stop-color", tint(bodyColor, 0.25));
    grad.append("stop").attr("offset", "100%" ).attr("stop-color", tint(bodyColor, -0.25));

    defs.append("clipPath")
      .attr("id", clipId)
      .append("path")
      .attr("d", shellPath);

    g.append("ellipse")
      .attr("class", "building-shadow")
      .attr("cx", cx)
      .attr("cy", baseY + 6)
      .attr("rx", bw * 0.52)
      .attr("ry", Math.max(4, bw * 0.1));

    g.append("path")
      .attr("class", "building-shell")
      .attr("d", shellPath)
      .attr("fill", `url(#${gradId})`)
      .attr("opacity", 0.97);

    const facade = g.append("g")
      .attr("clip-path", `url(#${clipId})`);

    facade.append("rect")
      .attr("x", cx - bw / 2)
      .attr("y", topY)
      .attr("width", bw)
      .attr("height", bh)
      .attr("fill", `url(#${gradId})`)
      .attr("opacity", 0.94);

    facade.append("rect")
      .attr("x", cx - bw * 0.14)
      .attr("y", topY)
      .attr("width", bw * 0.16)
      .attr("height", bh)
      .attr("fill", "rgba(255,255,255,0.13)")
      .attr("transform", `skewX(-8)`);

    const lineCount = Math.min(18, Math.max(4, Math.round((d.floors || 60) / 8)));
    const lineData = d3.range(1, lineCount).map(step => topY + (bh * step) / lineCount);
    facade.selectAll(`line.window-row-${i}`)
      .data(lineData)
      .join("line")
      .attr("class", "window-line")
      .attr("x1", cx - bw * 0.32)
      .attr("x2", cx + bw * 0.32)
      .attr("y1", line => line)
      .attr("y2", line => line);

    const colData = [-0.22, 0, 0.22];
    facade.selectAll(`line.window-col-${i}`)
      .data(colData)
      .join("line")
      .attr("class", "window-col")
      .attr("x1", frac => cx + bw * frac)
      .attr("x2", frac => cx + bw * frac)
      .attr("y1", topY + bh * 0.1)
      .attr("y2", baseY);

    g.append("path")
      .attr("class", "building-outline")
      .attr("d", shellPath)
      .attr("fill", "none");

    g.append("text")
      .attr("class", "height-label")
      .attr("x", cx)
      .attr("y", topY - 8)
      .text(`${Math.round(d.height)}m`);

    g.append("text")
      .attr("class", "building-label")
      .attr("transform", `translate(${cx - 3},${baseY + 16}) rotate(-42)`)
      .text(shortName(d.name));
  });
}

function buildingPath(cx, baseY, width, height, profile) {
  const left = cx - width / 2;
  const right = cx + width / 2;
  const top = baseY - height;
  const mid = cx;

  if (height <= 1) return `M${left},${baseY}L${right},${baseY}Z`;

  if (profile === "burj") {
    return [
      `M${left},${baseY}`,
      `L${left},${top + height * 0.58}`,
      `L${left + width * 0.14},${top + height * 0.58}`,
      `L${left + width * 0.14},${top + height * 0.38}`,
      `L${left + width * 0.3},${top + height * 0.38}`,
      `L${left + width * 0.3},${top + height * 0.19}`,
      `L${mid - width * 0.06},${top + height * 0.19}`,
      `L${mid - width * 0.03},${top + height * 0.08}`,
      `L${mid},${top}`,
      `L${mid + width * 0.06},${top + height * 0.26}`,
      `L${right - width * 0.08},${top + height * 0.26}`,
      `L${right - width * 0.08},${baseY}`,
      "Z"
    ].join("");
  }

  if (profile === "twist") {
    return `M${left + width * 0.15},${baseY}Q${left - width * 0.02},${top + height * 0.65} ${mid - width * 0.12},${top + height * 0.2}Q${mid - width * 0.05},${top + height * 0.05} ${mid},${top}Q${mid + width * 0.08},${top + height * 0.1} ${right - width * 0.08},${top + height * 0.34}Q${right + width * 0.02},${top + height * 0.62} ${right - width * 0.12},${baseY}Z`;
  }

  if (profile === "clock") {
    return [
      `M${left},${baseY}`,
      `L${left},${top + height * 0.42}`,
      `L${left + width * 0.13},${top + height * 0.42}`,
      `L${left + width * 0.13},${top + height * 0.2}`,
      `L${left + width * 0.22},${top + height * 0.2}`,
      `L${left + width * 0.22},${top + height * 0.13}`,
      `L${mid - width * 0.12},${top + height * 0.13}`,
      `L${mid - width * 0.12},${top + height * 0.05}`,
      `L${mid - width * 0.04},${top + height * 0.05}`,
      `L${mid},${top}`,
      `L${mid + width * 0.04},${top + height * 0.05}`,
      `L${mid + width * 0.12},${top + height * 0.05}`,
      `L${mid + width * 0.12},${top + height * 0.13}`,
      `L${right - width * 0.22},${top + height * 0.13}`,
      `L${right - width * 0.22},${top + height * 0.2}`,
      `L${right - width * 0.13},${top + height * 0.2}`,
      `L${right - width * 0.13},${top + height * 0.42}`,
      `L${right},${top + height * 0.42}`,
      `L${right},${baseY}`,
      "Z"
    ].join("");
  }

  if (profile === "taipei") {
    const s = [1, 0.84, 0.92, 0.76, 0.85, 0.68, 0.76, 0.58];
    let path = `M${cx - width * 0.44},${baseY}`;
    const stepH = height / (s.length + 1.8);
    s.forEach((scale, i) => {
      const y0 = baseY - stepH * (i + 1);
      path += `L${cx - width * 0.44 * scale},${y0}L${cx - width * 0.44 * scale},${y0 - stepH * 0.55}`;
    });
    path += `L${cx - width * 0.08},${top + stepH * 0.45}L${cx},${top}L${cx + width * 0.08},${top + stepH * 0.45}`;
    for (let i = s.length - 1; i >= 0; i--) {
      const scale = s[i];
      const y0 = baseY - stepH * (i + 1);
      path += `L${cx + width * 0.44 * scale},${y0 - stepH * 0.55}L${cx + width * 0.44 * scale},${y0}`;
    }
    path += `L${cx + width * 0.44},${baseY}Z`;
    return path;
  }

  if (profile === "needle") {
    return `M${left + width * 0.12},${baseY}L${left + width * 0.22},${top + height * 0.72}L${mid - width * 0.08},${top + height * 0.2}L${mid},${top}L${mid + width * 0.08},${top + height * 0.2}L${right - width * 0.22},${top + height * 0.72}L${right - width * 0.12},${baseY}Z`;
  }

  if (profile === "lance") {
    return `M${left + width * 0.18},${baseY}Q${left + width * 0.02},${top + height * 0.58} ${mid - width * 0.05},${top + height * 0.12}L${mid},${top}L${mid + width * 0.05},${top + height * 0.12}Q${right - width * 0.02},${top + height * 0.58} ${right - width * 0.18},${baseY}Z`;
  }

  if (profile === "shard") {
    return `M${left + width * 0.1},${baseY}L${left + width * 0.26},${top + height * 0.28}L${mid},${top}L${right - width * 0.1},${top + height * 0.18}L${right - width * 0.18},${baseY}Z`;
  }

  if (profile === "crown") {
    return `M${left},${baseY}L${left},${top + height * 0.22}L${left + width * 0.16},${top + height * 0.22}L${left + width * 0.16},${top + height * 0.1}L${mid - width * 0.07},${top + height * 0.1}L${mid},${top}L${mid + width * 0.07},${top + height * 0.1}L${right - width * 0.16},${top + height * 0.1}L${right - width * 0.16},${top + height * 0.22}L${right},${top + height * 0.22}L${right},${baseY}Z`;
  }

  if (profile === "setback") {
    return `M${left},${baseY}L${left},${top + height * 0.62}L${left + width * 0.12},${top + height * 0.62}L${left + width * 0.12},${top + height * 0.42}L${left + width * 0.24},${top + height * 0.42}L${left + width * 0.24},${top + height * 0.25}L${left + width * 0.34},${top + height * 0.25}L${left + width * 0.34},${top + height * 0.08}L${mid},${top}L${right - width * 0.34},${top + height * 0.08}L${right - width * 0.34},${top + height * 0.25}L${right - width * 0.24},${top + height * 0.25}L${right - width * 0.24},${top + height * 0.42}L${right - width * 0.12},${top + height * 0.42}L${right - width * 0.12},${top + height * 0.62}L${right},${top + height * 0.62}L${right},${baseY}Z`;
  }

  if (profile === "slab") {
    return `M${left + width * 0.06},${baseY}L${left + width * 0.06},${top + height * 0.08}L${mid - width * 0.06},${top + height * 0.02}L${mid},${top}L${mid + width * 0.06},${top + height * 0.02}L${right - width * 0.06},${top + height * 0.08}L${right - width * 0.06},${baseY}Z`;
  }

  return `M${left},${baseY}L${left},${top + height * 0.18}L${mid},${top}L${right},${top + height * 0.18}L${right},${baseY}Z`;
}

function renderTimeline() {
  const rect = timelineSvg.node().getBoundingClientRect();
  const width = Math.max(700, rect.width);
  const height = Math.max(220, rect.height);
  const margin = { top: 26, right: 34, bottom: 45, left: 70 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  timelineSvg.attr("viewBox", [0, 0, width, height]);
  timelineSvg.selectAll("*").remove();

  const years = state.allData.map(d => d.year).filter(Number.isFinite);
  const x = d3.scaleLinear()
    .domain(d3.extent(years)).nice()
    .range([margin.left, margin.left + innerWidth]);
  const y = d3.scaleLinear()
    .domain([0, d3.max(state.allData, d => d.height)]).nice()
    .range([margin.top + innerHeight, margin.top]);

  timelineSvg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${margin.top + innerHeight})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));

  timelineSvg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(4).tickFormat(d => `${d}m`));

  const visibleById = new Set(state.filteredData.map(d => d.id));

  timelineSvg.append("g")
    .selectAll("circle.timeline-dot")
    .data(state.allData.filter(d => Number.isFinite(d.year)), d => d.id)
    .join("circle")
    .attr("class", d => `timeline-dot ${state.selected && state.selected.id === d.id ? "selected selected-a" : ""} ${state.compareTarget && state.compareTarget.id === d.id ? "selected selected-b" : ""}`)
    .attr("cx", d => x(d.year))
    .attr("cy", d => y(d.height))
    .attr("r", d => (state.selected && state.selected.id === d.id) || (state.compareTarget && state.compareTarget.id === d.id) ? 7 : 4.5)
    .attr("fill", d => rankColor(d.rank))
    .attr("opacity", d => visibleById.has(d.id) ? 0.88 : 0.18)
    .on("mouseenter", (event, d) => showTooltip(event, d))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (event, d) => selectBuilding(d));

  const brush = d3.brushX()
    .extent([[margin.left, margin.top], [margin.left + innerWidth, margin.top + innerHeight]])
    .on("end", event => {
      //Bug fix from Claude - Anthropic
      // Ignore programmatic moves (brush.move below) — only react to real user gestures.
      // Without this guard, restoring the selection re-fires "end" and recurses until the tab crashes.
      if (!event.sourceEvent) return;
      if (!event.selection) {
        if (state.yearRange) {
          state.yearRange = null;
          applyFilters();
        }
        return;
      }
      const selectedYears = event.selection.map(x.invert).map(Math.round);
      state.yearRange = [Math.min(...selectedYears), Math.max(...selectedYears)];
      applyFilters();
    });

  const brushG = timelineSvg.append("g")
    .attr("class", "brush")
    .call(brush);

  if (state.yearRange) {
    brushG.call(brush.move, state.yearRange.map(x));
  }
}

function renderDetails() {
  const card = d3.select("#detail-card");

  if (!state.selected && !state.compareTarget) {
    card.attr("class", "detail-card empty").html("Select Building A and Building B from the map, skyline, or dropdown menus.");
    return;
  }

  if (!state.selected || !state.compareTarget) {
    const d = state.selected || state.compareTarget;
    const slot = state.selected ? "A" : "B";
    card.attr("class", "detail-card").html(`
      <div class="detail-top">
        <div class="detail-copy">
          <div class="detail-rank">Building ${slot} · Rank #${d.rank}</div>
          <h3>${d.name}</h3>
          <p>${[d.city, d.country].filter(Boolean).join(", ")}</p>
        </div>
        <div class="detail-visual-wrap">${detailIllustrationMarkup(d)}</div>
      </div>
      <div class="pair-empty-note">Choose one more building to compare directly.</div>
    `);
    return;
  }

  const a = state.selected;
  const b = state.compareTarget;
  card.attr("class", "detail-card pair-detail-card").html(pairComparisonMarkup(a, b));
}

function pairComparisonMarkup(a, b) {
  const heightDiff = a.height - b.height;
  const taller = heightDiff >= 0 ? a : b;
  const shorter = heightDiff >= 0 ? b : a;
  const pct = shorter.height ? (Math.abs(heightDiff) / shorter.height) * 100 : 0;
  const floorDiff = Number.isFinite(a.floors) && Number.isFinite(b.floors) ? a.floors - b.floors : null;
  const yearDiff = Number.isFinite(a.year) && Number.isFinite(b.year) ? a.year - b.year : null;
  const rankDiff = a.rank - b.rank;
  const maxHeight = Math.max(a.height, b.height);

  return `
    <div class="pair-header">
      <div>
        <div class="detail-rank">A vs B</div>
        <h3>${a.name} <span>vs</span> ${b.name}</h3>
        <p>${taller.name} is ${formatNumber(Math.round(Math.abs(heightDiff)))}m taller than ${shorter.name} (${pct.toFixed(1)}%).</p>
      </div>
    </div>

    <div class="pair-visual-row">
      ${pairTowerMarkup(a, "A", maxHeight)}
      ${pairTowerMarkup(b, "B", maxHeight)}
    </div>

    <div class="pair-bars">
      ${pairMetricBar("Height", a, b, d => d.height, "m")}
      ${Number.isFinite(a.floors) && Number.isFinite(b.floors) ? pairMetricBar("Floors", a, b, d => d.floors, "") : ""}
      ${Number.isFinite(a.year) && Number.isFinite(b.year) ? pairMetricBar("Year built", a, b, d => d.year, "") : ""}
      ${pairMetricBar("Rank", a, b, d => state.allData.length - d.rank + 1, "", true)}
    </div>

    <div class="pair-diff-grid">
      <div><span>${formatNumber(Math.round(Math.abs(heightDiff)))}m</span><small>Height difference</small></div>
      <div><span>${pct.toFixed(1)}%</span><small>Percent difference vs shorter</small></div>
      <div><span>${floorDiff === null ? "—" : `${Math.abs(floorDiff)}`}</span><small>Floor difference</small></div>
      <div><span>${yearDiff === null ? "—" : `${Math.abs(yearDiff)} yrs`}</span><small>Year difference</small></div>
      <div><span>${Math.abs(rankDiff)}</span><small>Rank difference</small></div>
      <div><span>${taller.name === a.name ? "A" : "B"}</span><small>Taller building</small></div>
    </div>

    ${pairContextSection(a, b)}
  `;
}

//in country comparison tool, we need to build demographic and economic comparisons.
function pairContextSection(a, b) {
  const metrics = [
    { label: "GDP (national)", metric: "gdp", format: formatUSD },
    { label: "Energy production", metric: "energy", format: formatEnergy },
    { label: "Population", metric: "population", format: formatPeople }
  ];

  const rows = metrics.map(m => pairContextMetric(m.label, a, b, m.metric, m.format)).join("");

  return `
    <div class="pair-context">
      <div class="pair-context-head">
        <strong>Country context at completion</strong>
        <span>National figures for each building's country in its build year</span>
      </div>
      <div class="pair-context-key">
        <span class="ctx-key ctx-key-a">A · ${[a.city, a.country].filter(Boolean).join(", ")} · ${formatEraYear(a.year)}</span>
        <span class="ctx-key ctx-key-b">B · ${[b.city, b.country].filter(Boolean).join(", ")} · ${formatEraYear(b.year)}</span>
      </div>
      <div class="pair-bars pair-context-bars">
        ${rows}
      </div>
      <p class="pair-context-note">Sources: World Bank (GDP), Gapminder (energy production, population). “~year” marks the nearest available year; energy data ends ≈2009, so most modern towers use that fallback.</p>
    </div>
  `;
}

function pairContextMetric(label, a, b, metric, format) {
  const ca = lookupContext(metric, a.country, a.year);
  const cb = lookupContext(metric, b.country, b.year);
  const av = ca ? ca.value : NaN;
  const bv = cb ? cb.value : NaN;
  const max = Math.max(Number.isFinite(av) ? av : 0, Number.isFinite(bv) ? bv : 0) || 1;
  const aw = Number.isFinite(av) ? Math.max(4, (av / max) * 100) : 0;
  const bw = Number.isFinite(bv) ? Math.max(4, (bv / max) * 100) : 0;

  const tag = ctx => !ctx ? `<em class="ctx-missing">no data</em>` : (ctx.exact ? "" : `<em class="ctx-approx">~${ctx.year}</em>`);
  const displayA = ca ? `${format(av)} ${tag(ca)}` : `— ${tag(ca)}`;
  const displayB = cb ? `${format(bv)} ${tag(cb)}` : `— ${tag(cb)}`;

  return `
    <div class="pair-metric">
      <div class="pair-metric-title">${label}</div>
      <div class="pair-metric-line"><span>A</span><div class="pair-track"><div class="pair-fill a" style="width:${aw.toFixed(1)}%"></div></div><strong>${displayA}</strong></div>
      <div class="pair-metric-line"><span>B</span><div class="pair-track"><div class="pair-fill b" style="width:${bw.toFixed(1)}%"></div></div><strong>${displayB}</strong></div>
    </div>
  `;
}

function pairTowerMarkup(d, label, maxHeight) {
  const width = 160;
  const height = 210;
  const baseY = 178;
  const towerHeight = 38 + (d.height / maxHeight) * 126;
  const shape = buildingPath(width / 2, baseY, 64, towerHeight, d.profile);
  const body = rankColor(d.rank);
  const id = keySafe(`${d.id}-${label}-pair`);
  return `
    <div class="pair-tower-card pair-${label.toLowerCase()}">
      <div class="pair-badge">${label}</div>
      <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
        <defs>
          <linearGradient id="grad-${id}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${tint(body, 0.95)}"></stop>
            <stop offset="45%" stop-color="${tint(body, 0.3)}"></stop>
            <stop offset="100%" stop-color="${tint(body, -0.25)}"></stop>
          </linearGradient>
        </defs>
        <line x1="18" x2="142" y1="${baseY}" y2="${baseY}" stroke="rgba(255,255,255,0.28)" stroke-width="2"></line>
        <path d="${shape}" fill="url(#grad-${id})" stroke="rgba(255,255,255,0.74)" stroke-width="1.5"></path>
      </svg>
      <strong>${shortName(d.name, 22)}</strong>
      <small>${[d.city, d.country].filter(Boolean).join(", ")}</small>
      <span>${Math.round(d.height)}m · Rank #${d.rank}</span>
    </div>
  `;
}

function pairMetricBar(label, a, b, accessor, suffix = "", rankMode = false) {
  const av = accessor(a);
  const bv = accessor(b);
  const max = Math.max(Math.abs(av), Math.abs(bv)) || 1;
  const aw = Math.max(4, (Math.abs(av) / max) * 100);
  const bw = Math.max(4, (Math.abs(bv) / max) * 100);
  const displayA = rankMode ? `#${a.rank}` : `${formatNumber(Math.round(accessor(a)))}${suffix}`;
  const displayB = rankMode ? `#${b.rank}` : `${formatNumber(Math.round(accessor(b)))}${suffix}`;

  return `
    <div class="pair-metric">
      <div class="pair-metric-title">${label}</div>
      <div class="pair-metric-line"><span>A</span><div class="pair-track"><div class="pair-fill a" style="width:${aw.toFixed(1)}%"></div></div><strong>${displayA}</strong></div>
      <div class="pair-metric-line"><span>B</span><div class="pair-track"><div class="pair-fill b" style="width:${bw.toFixed(1)}%"></div></div><strong>${displayB}</strong></div>
    </div>
  `;
}

function detailIllustrationMarkup(d) {
  const width = 180;
  const height = 190;
  const baseY = 165;
  const shape = buildingPath(width / 2, baseY, 72, 132, d.profile);
  const body = rankColor(d.rank);
  const id = keySafe(`${d.id}-detail`);
  return `
    <svg class="detail-visual" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <defs>
        <linearGradient id="grad-${id}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${tint(body, 0.95)}"></stop>
          <stop offset="45%" stop-color="${tint(body, 0.3)}"></stop>
          <stop offset="100%" stop-color="${tint(body, -0.25)}"></stop>
        </linearGradient>
        <clipPath id="clip-${id}">
          <path d="${shape}"></path>
        </clipPath>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="20" fill="rgba(255,255,255,0.04)"></rect>
      <circle cx="135" cy="34" r="18" fill="rgba(255,207,90,0.15)"></circle>
      <ellipse cx="90" cy="171" rx="42" ry="7" fill="rgba(0,0,0,0.28)"></ellipse>
      <path d="${shape}" fill="url(#grad-${id})" stroke="rgba(255,255,255,0.72)" stroke-width="1.5"></path>
      <g clip-path="url(#clip-${id})">
        <rect x="60" y="26" width="16" height="142" fill="rgba(255,255,255,0.13)" transform="skewX(-8)"></rect>
        ${Array.from({length: 11}, (_, i) => `<line x1="66" x2="114" y1="${56 + i * 9}" y2="${56 + i * 9}" stroke="rgba(255,255,255,0.18)" stroke-width="1"></line>`).join("")}
        ${[-18, 0, 18].map(dx => `<line x1="${90 + dx}" x2="${90 + dx}" y1="52" y2="165" stroke="rgba(255,255,255,0.08)" stroke-width="1"></line>`).join("")}
      </g>
    </svg>
  `;
}

function renderStatsAndStory() {
  const data = state.filteredData;

  if (!data.length) {
    d3.select("#stat-tallest").text("—");
    d3.select("#stat-countries").text("0");
    d3.select("#stat-years").text("—");
    d3.select("#story-text").text("No buildings match the current filters. Reset the dashboard or loosen the search, country, or year filter.");
    return;
  }

  const tallest = d3.greatest(data, d => d.height);
  const countries = new Set(data.map(d => d.country).filter(Boolean)).size;
  const years = d3.extent(data.map(d => d.year).filter(Number.isFinite));

  d3.select("#stat-tallest").text(tallest ? shortName(tallest.name, 18) : "—");
  d3.select("#stat-countries").text(countries);
  d3.select("#stat-years").text(years[0] ? `${years[0]}–${years[1]}` : "—");

  const countryPhrase = state.country === "all" ? `${countries} countries` : state.country;
  d3.select("#story-text").text(
    `In the current view, ${data.length} buildings across ${countryPhrase} are shown. ` +
    `${tallest.name} is the tallest visible building at ${Math.round(tallest.height)} meters. ` +
    `The map shows where these buildings are located, the skyline compares the towers on one shared height scale, and the side panel lets you directly compare two specific selected buildings.`
  );
}

function selectBuilding(d) {
  if (!state.selected || (state.selected && state.compareTarget)) {
    state.selected = d;
    if (state.compareTarget && state.compareTarget.id === d.id) state.compareTarget = null;
  } else if (state.selected.id !== d.id) {
    state.compareTarget = d;
  }
  syncCompareControls();
  renderAll();
}

const COUNTRY_FLAGS = {
  "Australia": "🇦🇺", "Chile": "🇨🇱", "China": "🇨🇳", "Kuwait": "🇰🇼",
  "Malaysia": "🇲🇾", "Russia": "🇷🇺", "Saudi Arabia": "🇸🇦",
  "South Africa": "🇿🇦", "South Korea": "🇰🇷", "Taiwan": "🇹🇼",
  "Thailand": "🇹🇭", "United Arab Emirates": "🇦🇪", "United States": "🇺🇸",
  "Vietnam": "🇻🇳"
};

const HEIGHT_LANDMARKS = [
  { name: "the Statue of Liberty", m: 93, emoji: "🗽" },
  { name: "Big Ben", m: 96, emoji: "🕰️" },
  { name: "the Great Pyramid of Giza", m: 139, emoji: "🔺" },
  { name: "the Eiffel Tower", m: 330, emoji: "🗼" },
  { name: "the Empire State Building", m: 381, emoji: "🏙️" }
];

function rankMedal(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "🏢";
}

function funHeightFact(height) {
  const shorter = HEIGHT_LANDMARKS.filter(l => l.m < height);
  const ref = shorter.length ? shorter[shorter.length - 1] : HEIGHT_LANDMARKS[0];
  return `${ref.emoji} ${(height / ref.m).toFixed(1)}× the height of ${ref.name}`;
}

function tooltipSilhouette(d) {
  const w = 58, h = 96, baseY = 88;
  const maxHeight = d3.max(state.allData, b => b.height) || d.height;
  const towerH = 22 + (d.height / maxHeight) * 60;
  const shape = buildingPath(w / 2, baseY, 30, towerH, d.profile);
  const body = rankColor(d.rank);
  return `
    <svg class="tt-silhouette" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <defs>
        <linearGradient id="tt-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${tint(body, 0.95)}"></stop>
          <stop offset="55%" stop-color="${tint(body, 0.2)}"></stop>
          <stop offset="100%" stop-color="${tint(body, -0.3)}"></stop>
        </linearGradient>
      </defs>
      <ellipse cx="${w / 2}" cy="${baseY + 3}" rx="15" ry="3" fill="rgba(0,0,0,0.35)"></ellipse>
      <path d="${shape}" fill="url(#tt-grad)" stroke="rgba(255,255,255,0.65)" stroke-width="1"></path>
    </svg>`;
}

function showTooltip(event, d) {
  const maxHeight = d3.max(state.allData, b => b.height) || d.height;
  const pct = Math.max(6, (d.height / maxHeight) * 100);
  const flag = COUNTRY_FLAGS[d.country] || "📍";
  const loc = [d.city, d.country].filter(Boolean).join(", ");

  const node = tooltip.node();
  tooltip.classed("pop", false);
  void node.offsetWidth;

  tooltip
    .classed("pop", true)
    .style("opacity", 1)
    .html(`
      <div class="tt-head" style="--rank-color:${rankColor(d.rank)}">
        <span class="tt-rank">${rankMedal(d.rank)} #${d.rank}</span>
        <span class="tt-flag">${flag}</span>
      </div>
      <div class="tt-body">
        ${tooltipSilhouette(d)}
        <div class="tt-info">
          <strong class="tt-name">${d.name}</strong>
          <span class="tt-loc">${loc}</span>
          <div class="tt-stats">
            <span>📏 ${formatNumber(Math.round(d.height))} m</span>
            ${d.floors ? `<span>🏢 ${d.floors} fl</span>` : ""}
            ${d.year ? `<span>📅 ${d.year}</span>` : ""}
          </div>
          <div class="tt-bar"><div class="tt-bar-fill" style="width:${pct.toFixed(0)}%"></div></div>
        </div>
      </div>
      <div class="tt-fun">${funHeightFact(d.height)}</div>
    `);
  moveTooltip(event);
}

function moveTooltip(event) {
  tooltip
    .style("left", `${event.clientX}px`)
    .style("top", `${event.clientY}px`);
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

function drawConnection() {
  connectionSvg.selectAll("*").remove();
  const gridNode = document.querySelector("#viz-grid");
  if (!gridNode) return;

  const gridBox = gridNode.getBoundingClientRect();
  connectionSvg
    .attr("width", gridBox.width)
    .attr("height", gridBox.height)
    .attr("viewBox", [0, 0, gridBox.width, gridBox.height]);

  [
    { item: state.selected, cls: "connection-a" },
    { item: state.compareTarget, cls: "connection-b" }
  ].forEach(entry => drawConnectionFor(entry.item, entry.cls, gridBox));
}

function drawConnectionFor(item, cls, gridBox) {
  if (!item) return;
  const mapNode = document.querySelector(`#map-svg .map-marker[data-id="${CSS.escape(item.id)}"]`);
  const buildingNode = document.querySelector(`#skyline-svg .building-group[data-id="${CSS.escape(item.id)}"]`);
  if (!mapNode || !buildingNode) return;

  // Aim at the tower's peak: the shell path's top edge (apex) and horizontal center,
  // not the whole group box (which includes labels above/below and the rotated name).
  const peakNode = buildingNode.querySelector(".building-shell") || buildingNode;
  const mapBox = mapNode.getBoundingClientRect();
  const peakBox = peakNode.getBoundingClientRect();

  const x1 = mapBox.left + mapBox.width / 2 - gridBox.left;
  const y1 = mapBox.top + mapBox.height / 2 - gridBox.top;
  const x2 = peakBox.left + peakBox.width / 2 - gridBox.left;
  const y2 = peakBox.top - gridBox.top;

  connectionSvg.append("line")
    .attr("class", `connection-line ${cls}`)
    .attr("x1", x1)
    .attr("y1", y1)
    .attr("x2", x1)
    .attr("y2", y1)
    .transition()
    .duration(450)
    .attr("x2", x2)
    .attr("y2", y2);

  connectionSvg.selectAll(`circle.connection-dot.${cls}`)
    .data([[x1, y1], [x2, y2]])
    .join("circle")
    .attr("class", `connection-dot ${cls}`)
    .attr("cx", d => d[0])
    .attr("cy", d => d[1])
    .attr("r", 5);
}

function shortName(name, max = 16) {
  if (!name) return "";
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

function tint(colorString, delta) {
  const c = d3.hsl(colorString);
  c.l = Math.max(0.08, Math.min(0.92, c.l + delta * 0.18));
  c.s = Math.max(0.15, Math.min(0.95, c.s + delta * 0.06));
  return c.formatHex();
}

function debounce(fn, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

/* 
==========================================================================
Set up for Intro Animation
==========================================================================
*/
function startIntro() {
  const overlay = document.querySelector("#intro-overlay");
  const records = state.recordTimeline || [];

  //if the overlay markup or data is missing, just show the dashboard.
  if (!overlay || !records.length || !state.world) {
    revealDashboard();
    return;
  }

  document.body.classList.add("intro-active");

  const introMap = d3.select("#intro-map");
  const introTimeline = d3.select("#intro-timeline");
  const caption = d3.select("#intro-caption");

  //create same map as dashboard
  const mapRect = introMap.node().getBoundingClientRect();
  const mapW = Math.max(360, mapRect.width);
  const mapH = Math.max(260, mapRect.height);
  introMap.attr("viewBox", [0, 0, mapW, mapH]);
  introMap.selectAll("*").remove();

  const projection = d3.geoNaturalEarth1()
    .fitExtent([[14, 14], [mapW - 14, mapH - 14]], state.world);
  const path = d3.geoPath(projection);

  introMap.append("g").selectAll("path.intro-country")
    .data(state.world.features)
    .join("path")
    .attr("class", "intro-country")
    .attr("d", path);

  const trailLayer = introMap.append("g").attr("class", "intro-trail-layer");
  const markerLayer = introMap.append("g").attr("class", "intro-marker-layer");
  const bloomLayer = introMap.append("g").attr("class", "intro-bloom-layer");

  //Log scale timeline
  const tlRect = introTimeline.node().getBoundingClientRect();
  const tlW = Math.max(360, tlRect.width);
  const tlH = Math.max(90, tlRect.height);
  const tlPad = { left: 26, right: 26, axis: 52 };
  const x0 = tlPad.left;
  const x1 = tlW - tlPad.right;
  introTimeline.attr("viewBox", [0, 0, tlW, tlH]);
  introTimeline.selectAll("*").remove();

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  //Anchor at a BASE point in time and create log scale around that
  const recYears = records.map(r => r.year);
  const minYear = d3.min(recYears);
  const BASE = 2035;
  const agoOf = y => Math.max(1, BASE - y);
  const xLog = d3.scaleLog()
    .domain([agoOf(minYear), agoOf(2025)])
    .range([x0, x1]);
  const xYear = y => xLog(agoOf(y));
  const yearAtX = px => BASE - xLog.invert(px);

  const axisY = tlH - tlPad.axis;

  introTimeline.append("line")
    .attr("class", "intro-tl-base")
    .attr("x1", x0).attr("x2", x1)
    .attr("y1", axisY).attr("y2", axisY);

  // Era reference labels at their true (log) positions.
  [-10000, -2000, 0, 1500, 1900, 1970, 2025].forEach(y => {
    const x = xYear(y);
    if (x < x0 - 1 || x > x1 + 1) return;
    introTimeline.append("line")
      .attr("class", "intro-tl-eratick")
      .attr("x1", x).attr("x2", x)
      .attr("y1", axisY - 5).attr("y2", axisY + 5);
    introTimeline.append("text")
      .attr("class", "intro-tl-eralabel")
      .attr("x", x).attr("y", axisY + 20)
      .attr("text-anchor", "middle")
      .text(formatEraYear(y));
  });

  // One tick per record.
  introTimeline.append("g").selectAll("line.intro-tl-tick")
    .data(records)
    .join("line")
    .attr("class", "intro-tl-tick")
    .attr("x1", d => xYear(d.year)).attr("x2", d => xYear(d.year))
    .attr("y1", axisY - 9).attr("y2", axisY);

  const playhead = introTimeline.append("g").attr("class", "intro-playhead").style("opacity", 0);
  playhead.append("line").attr("y1", 12).attr("y2", axisY);
  playhead.append("circle").attr("class", "intro-handle").attr("cy", 12).attr("r", 7);
  const yearReadout = introTimeline.append("text")
    .attr("class", "intro-year-readout")
    .attr("y", 22)
    .attr("text-anchor", "middle");

  // Transparent band that captures drag / click for manual scrubbing.
  const hit = introTimeline.append("rect")
    .attr("class", "intro-tl-hit")
    .attr("x", x0).attr("y", 4)
    .attr("width", x1 - x0).attr("height", (axisY + 14) - 4)
    .attr("fill", "transparent");

  //Playback animation for timeline
  //Hold for a set amount of time on each record so its readable.
  const recX = records.map(r => xYear(r.year));
  const lastIndex = records.length - 1;
  const HOLD = 850;                          // ms parked on each record
  const TRAVEL_TOTAL = 8000;                 // target ms to traverse the full width
  const spanPx = Math.max(1, x1 - x0);
  const PX_PER_MS = spanPx / TRAVEL_TOTAL;
  const MIN_TRAVEL = 90;
  const MAX_TRAVEL = 1500;

  const segments = [];
  const holdStartByIndex = new Array(records.length).fill(0);
  let cursor = 0;
  for (let i = 0; i < records.length; i++) {
    holdStartByIndex[i] = cursor;
    segments.push({ type: "hold", i, start: cursor, end: cursor + HOLD });
    cursor += HOLD;
    if (i < lastIndex) {
      const dist = Math.abs(recX[i + 1] - recX[i]);
      const dur = clamp(dist / PX_PER_MS, MIN_TRAVEL, MAX_TRAVEL);
      segments.push({ type: "travel", from: i, to: i + 1, start: cursor, end: cursor + dur });
      cursor += dur;
    }
  }
  const totalDuration = cursor;

  function segAt(ms) {
    for (const s of segments) if (ms < s.end) return s;
    return segments[segments.length - 1];
  }

  // ---- Sequencing & interaction -------------------------------------------
  const maxHeight = d3.max(records, r => r.height) || 1;
  let currentActive = -1;
  let scheduleElapsed = 0;
  let prevTick = 0;
  let clock = null;
  let playing = false;
  let finished = false;
  let entered = false;
  let scrubbing = false;

  function setHandle(px, year) {
    playhead.style("opacity", 1).attr("transform", `translate(${px},0)`);
    yearReadout.attr("x", clamp(px, x0 + 14, x1 - 14)).text(formatEraYear(Math.round(year)));
  }

  // Caption + map marker for a record. The handle is owned by the scheduler/scrubber,
  // so this no longer moves the playhead.
  function showBeat(rec) {
    const [mx, my] = projection([rec.lon, rec.lat]);

    trailLayer.append("circle")
      .attr("class", "intro-trail-dot")
      .attr("cx", mx).attr("cy", my).attr("r", 3)
      .style("opacity", 0)
      .transition().duration(380).style("opacity", 0.5);

    markerLayer.selectAll("*").remove();
    const g = markerLayer.append("g").attr("transform", `translate(${mx},${my})`);
    g.append("circle").attr("class", "intro-pulse").attr("r", 6)
      .transition().duration(1000).ease(d3.easeCubicOut)
      .attr("r", 24).style("opacity", 0);
    g.append("circle").attr("class", "intro-marker").attr("r", 0)
      .transition().duration(380).ease(d3.easeBackOut).attr("r", 8);

    const heldText = rec.yearsHeld ? `Held the title for ~${formatNumber(Math.round(rec.yearsHeld))} years` : "Current record holder";
    const modernText = rec.modernRank ? `<span class="intro-cap-modern">#${rec.modernRank} in today's tallest-buildings dataset</span>` : "";
    caption.html(`
      <div class="intro-cap-era">${formatEraYear(rec.year)} · ${rec.type}</div>
      <h2 class="intro-cap-name">${rec.name}</h2>
      <div class="intro-cap-loc">${[rec.city, rec.country].filter(Boolean).join(", ")}</div>
      <div class="intro-cap-height">${formatNumber(rec.height)} m</div>
      <div class="intro-cap-bar"><div class="intro-cap-fill" style="width:${Math.max(4, (rec.height / maxHeight) * 100).toFixed(1)}%"></div></div>
      <div class="intro-cap-held">${heldText}</div>
      ${modernText}
    `);
    caption.classed("pop", false);
    void caption.node().offsetWidth;
    caption.classed("pop", true);
  }

  function activate(index) {
    if (index === currentActive) return;
    currentActive = index;
    showBeat(records[index]);
  }

  function applySchedule(ms) {
    const seg = segAt(ms);
    if (seg.type === "hold") {
      setHandle(recX[seg.i], records[seg.i].year);
      activate(seg.i);
    } else {
      const f = clamp((ms - seg.start) / (seg.end - seg.start), 0, 1);
      const e = d3.easeCubicInOut(f);
      const px = recX[seg.from] + (recX[seg.to] - recX[seg.from]) * e;
      setHandle(px, yearAtX(px));
      activate(seg.from);
    }
  }

  function tick(t) {
    if (finished) { stopClock(); return; }
    const delta = t - prevTick;
    prevTick = t;
    scheduleElapsed = Math.min(totalDuration, scheduleElapsed + delta);
    applySchedule(scheduleElapsed);
    if (scheduleElapsed >= totalDuration) finishSequence();
  }

  function startClock() {
    if (playing || finished) return;
    playing = true;
    prevTick = 0;
    clock = d3.timer(tick);
    updatePlayPauseUI();
  }

  function stopClock() {
    playing = false;
    if (clock) { clock.stop(); clock = null; }
    updatePlayPauseUI();
  }

  function updatePlayPauseUI() {
    const btn = d3.select("#intro-playpause");
    if (btn.empty()) return;
    if (finished) { btn.style("display", "none"); return; }
    btn.html(playing ? "&#10073;&#10073; Pause" : "&#9658; Play");
  }

  // Which record was the title-holder at a given year (last record not after it).
  function holderIndexForYear(year) {
    let idx = 0;
    for (let i = 0; i < records.length; i++) {
      if (records[i].year <= year) idx = i; else break;
    }
    return idx;
  }

  function enableEnter() {
    d3.select("#intro-enter").property("disabled", false).classed("ready", true);
  }

  function seekToX(px) {
    const clampedPx = clamp(px, x0, x1);
    const year = Math.round(yearAtX(clampedPx));
    setHandle(clampedPx, year);
    const idx = holderIndexForYear(year);
    scheduleElapsed = holdStartByIndex[idx];   // so Play resumes coherently
    activate(idx);
    if (idx >= lastIndex) enableEnter();
  }

  const drag = d3.drag()
    .container(() => introTimeline.node())
    .on("start", event => {
      stopClock();
      scrubbing = true;
      playhead.classed("dragging", true);
      seekToX(event.x);
    })
    .on("drag", event => seekToX(event.x))
    .on("end", () => {
      scrubbing = false;
      playhead.classed("dragging", false);
      updatePlayPauseUI();
    });
  hit.call(drag);
  playhead.call(drag);

  // Finale: scatter all 78 modern towers across the map and invite the user in.
  function finishSequence() {
    if (finished) return;
    finished = true;
    stopClock();
    markerLayer.selectAll(".intro-pulse").interrupt();
    setHandle(x1, 2025);

    const towers = state.allData.filter(d => d.hasLocation);
    bloomLayer.selectAll("circle.intro-bloom-dot")
      .data(towers)
      .join("circle")
      .attr("class", "intro-bloom-dot")
      .attr("cx", d => projection([d.lon, d.lat])[0])
      .attr("cy", d => projection([d.lon, d.lat])[1])
      .attr("r", 0)
      .attr("fill", d => rankColor(d.rank))
      .transition()
      .delay((d, i) => i * 16)
      .duration(420)
      .ease(d3.easeBackOut)
      .attr("r", 4.2);

    caption.html(`
      <div class="intro-cap-era">Today</div>
      <h2 class="intro-cap-name">Tallest Building of an era to an Era of Tallest Buildings</h2>
      <div class="intro-cap-loc">Burj Khalifa still holds the title of "Tallest building" and it now leads a field of
        <strong>${state.allData.length} of history's tallest towers</strong>.</div>
      <div class="intro-cap-held">Step inside to explore where they stand, compare their forms, and see the world that built them.</div>
    `);
    caption.classed("pop", false);
    void caption.node().offsetWidth;
    caption.classed("pop", true);

    enableEnter();
    d3.select("#intro-skip").text("Skip to dashboard");
    updatePlayPauseUI();
    currentActive = -1;
  }

  function enterDashboard() {
    if (entered) return;
    entered = true;
    stopClock();
    markerLayer.selectAll("*").interrupt();

    d3.select("#intro-overlay").classed("hidden", true);
    revealDashboard();
    setTimeout(() => {
      const node = document.querySelector("#intro-overlay");
      if (node) node.remove();
      // Re-render so cross-view connection lines align now that the dashboard is
      // on-screen and laid out.
      renderAll();
    }, 750);
  }

  d3.select("#intro-skip").on("click", enterDashboard);
  d3.select("#intro-enter").on("click", enterDashboard);
  d3.select("#intro-playpause").on("click", () => {
    if (finished || entered) return;
    if (playing) stopClock(); else startClock();
  });

  // Park on the first record so the timeline reads, then auto-play after a beat.
  applySchedule(0);
  setTimeout(() => { if (!entered && !scrubbing && !playing && !finished) startClock(); }, 800);
}

function revealDashboard() {
  document.body.classList.remove("intro-active");
  d3.select(".page-shell").classed("pre-reveal", false).classed("revealed", true);
}