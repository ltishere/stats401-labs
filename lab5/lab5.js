
const CONFIG = {
  stationsFile: "../data/lab5_assignment_stations.csv",
  routesFile:   "../data/lab5_assignment_routes.csv"
};

/* ---------- Palettes -------------------------------------- */

// Okabe–Ito derived: distinguishable under the common colour-vision deficiencies.
const DISTRICT_PALETTE = ["#333F48", "#0072B2", "#009E73", "#E69F00", "#CC79A7"];
const DISTRICT_ORDER   = ["Central", "North", "South", "East", "West"];

const ROUTE_ORDER = ["Metro", "Express", "Shuttle"];
const ROUTE_STYLE = {
  Metro:   { color: "#24405B", dash: null },
  Express: { color: "#B2182B", dash: "7,3" },
  Shuttle: { color: "#6E7B87", dash: "1.5,3" }
};

const TYPE_ORDER  = ["Local", "Transfer", "Terminal"];
const TYPE_SYMBOL = {
  Local:    d3.symbolCircle,
  Transfer: d3.symbolSquare,
  Terminal: d3.symbolTriangle
};

/* ---------- Small helpers --------------------------------- */

// Works before OR after d3.forceLink() swaps the id strings for node objects.
const sid = l => (typeof l.source === "object" ? l.source.id : l.source);
const tid = l => (typeof l.target === "object" ? l.target.id : l.target);

// Keep a preferred category order, but never drop a value the data actually has.
function orderedDomain(values, preferred) {
  const present = new Set(values);
  const head = preferred.filter(v => present.has(v));
  const tail = [...present].filter(v => !preferred.includes(v)).sort(d3.ascending);
  return head.concat(tail);
}

const tooltip = d3.select("#tooltip");

function showTip(html, event) {
  tooltip.style("opacity", 1).html(html);
  moveTip(event);
}
function moveTip(event) {
  const pad = 14;
  const w = tooltip.node().offsetWidth;
  const h = tooltip.node().offsetHeight;
  let x = event.pageX + pad;
  let y = event.pageY + pad;
  if (x + w > window.scrollX + window.innerWidth)  x = event.pageX - w - pad;
  if (y + h > window.scrollY + window.innerHeight) y = event.pageY - h - pad;
  tooltip.style("left", x + "px").style("top", y + "px");
}
function hideTip() {
  tooltip.style("opacity", 0);
}

/* ============================================================
   Load both tables, then build everything
   ============================================================ */

Promise.all([
  d3.csv(CONFIG.stationsFile, d => ({
    id:         d.id,
    name:       d.station_name,
    district:   d.district,
    passengers: +d.daily_passengers,
    type:       d.station_type
  })),
  d3.csv(CONFIG.routesFile, d => ({
    source:    d.source,
    target:    d.target,
    time:      +d.travel_time_min,
    routeType: d.route_type
  }))
])
.then(([nodes, rawLinks]) => {

  /* ---------- Validate ------------------------------------ */
  const byId = new Map(nodes.map(d => [d.id, d]));
  const links = rawLinks.filter(l => byId.has(l.source) && byId.has(l.target));
  if (links.length !== rawLinks.length) {
    console.warn(`${rawLinks.length - links.length} route(s) referenced an unknown station id and were dropped.`);
  }

  /* ---------- Adjacency bookkeeping (string ids, built up front) ---------- */
  const neighbours = new Map(nodes.map(d => [d.id, new Set()]));
  const linkByPair = new Map();                       // "a|b" (sorted) -> link
  const pairKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);

  links.forEach(l => {
    neighbours.get(l.source).add(l.target);
    neighbours.get(l.target).add(l.source);
    linkByPair.set(pairKey(l.source, l.target), l);
  });
  nodes.forEach(d => { d.degree = neighbours.get(d.id).size; });

  /* ---------- Scales -------------------------------------- */
  const districts  = orderedDomain(nodes.map(d => d.district), DISTRICT_ORDER);
  const types      = orderedDomain(nodes.map(d => d.type),     TYPE_ORDER);
  const routeTypes = orderedDomain(links.map(d => d.routeType), ROUTE_ORDER);

  const districtColor = d3.scaleOrdinal()
    .domain(districts)
    .range(DISTRICT_PALETTE)
    .unknown("#9AA3AB");

  const routeColor = rt => (ROUTE_STYLE[rt] || {}).color || "#9AA3AB";
  const routeDash  = rt => (ROUTE_STYLE[rt] || {}).dash  || null;
  const typeSymbol = t  => TYPE_SYMBOL[t] || d3.symbolCircle;

  // Passenger volume -> symbol AREA (so perceived size is proportional to value).
  const passExtent = d3.extent(nodes, d => d.passengers);
  const areaScale  = d3.scaleLinear().domain(passExtent).range([90, 950]);
  const radiusOf   = d => Math.sqrt(areaScale(d.passengers) / Math.PI) * 1.18;

  // Travel time -> link length, link width, and (in the matrix) cell opacity.
  const timeExtent   = d3.extent(links, d => d.time);
  const linkDistance = d3.scaleLinear().domain(timeExtent).range([48, 155]);
  const linkWidth    = d3.scaleLinear().domain(timeExtent).range([1.2, 5.2]);
  const timeOpacity  = d3.scaleLinear().domain(timeExtent).range([0.32, 1]);

  /* ========================================================
     PART A — Force-directed node-link diagram
     ======================================================== */

  const W = 940, H = 620;

  const svg = d3.select("#network")
    .append("svg")
    .attr("viewBox", [0, 0, W, H])
    .attr("width", "100%")
    .attr("height", H)
    .attr("role", "img")
    .attr("aria-label", "Force-directed diagram of 50 transit stations and 50 direct connections");

  const linkG  = svg.append("g").attr("class", "links");
  const nodeG  = svg.append("g").attr("class", "nodes");
  const labelG = svg.append("g").attr("class", "labels");

  const linkSel = linkG.selectAll("line")
    .data(links)
    .join("line")
      .attr("stroke", d => routeColor(d.routeType))
      .attr("stroke-dasharray", d => routeDash(d.routeType))
      .attr("stroke-width", d => linkWidth(d.time))
      .attr("stroke-opacity", 0.72)
      .attr("stroke-linecap", "round");

  const nodeSel = nodeG.selectAll("path")
    .data(nodes)
    .join("path")
      .attr("d", d => d3.symbol().type(typeSymbol(d.type)).size(areaScale(d.passengers))())
      .attr("fill", d => districtColor(d.district))
      .attr("stroke", "#FFFFFF")
      .attr("stroke-width", 1.4)
      .attr("tabindex", 0)
      .style("cursor", "grab");

  const labelSel = labelG.selectAll("text")
    .data(nodes)
    .join("text")
      .text(d => d.name)
      .attr("font-size", 9)
      .attr("dy", 3.5)
      .attr("fill", "#3B4650")
      .attr("stroke", "#FFFFFF")
      .attr("stroke-width", 2.6)
      .attr("paint-order", "stroke")
      .attr("pointer-events", "none");

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(d => linkDistance(d.time)).strength(0.55))
    .force("charge", d3.forceManyBody().strength(-240).distanceMax(340))
    .force("center", d3.forceCenter(W / 2, H / 2))
    .force("collision", d3.forceCollide().radius(d => radiusOf(d) + 5))
    // 50 nodes / 50 links is sparse, so components can drift apart.
    // Weak positional forces keep every component on canvas.
    .force("x", d3.forceX(W / 2).strength(0.045))
    .force("y", d3.forceY(H / 2).strength(0.055))
    .on("tick", ticked);

  function ticked() {
    // 50 nodes over 50 links leaves isolated stations that repulsion would push
    // off-canvas, so every node is kept inside the frame (plus room for its label).
    nodes.forEach(d => {
      const r = radiusOf(d) + 4;
      d.x = Math.max(r, Math.min(W - r - 52, d.x));
      d.y = Math.max(r + 6, Math.min(H - r - 6, d.y));
    });

    linkSel
      .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x).attr("y2", d => d.target.y);

    nodeSel.attr("transform", d => `translate(${d.x},${d.y})`);

    labelSel
      .attr("x", d => d.x + radiusOf(d) + 3)
      .attr("y", d => d.y);
  }

  /* ---------- Dragging ------------------------------------ */
  nodeSel.call(
    d3.drag()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
        d3.select(event.sourceEvent.target).style("cursor", "grabbing");
      })
      .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
        d3.select(event.sourceEvent.target).style("cursor", "grab");
      })
  );

  /* ---------- Hover: highlight + tooltip + cross-view ------ */
  nodeSel
    .on("mouseover focus", (event, d) => {
      focusNode(d.id);
      showTip(nodeTip(d), event);
    })
    .on("mousemove", moveTip)
    .on("mouseout blur", () => { clearFocus(); hideTip(); });

  linkSel
    .on("mouseover", (event, d) => {
      focusLink(sid(d), tid(d));
      showTip(linkTip(d), event);
    })
    .on("mousemove", moveTip)
    .on("mouseout", () => { clearFocus(); hideTip(); });

  function nodeTip(d) {
    return `<strong>${d.name}</strong>
      <dl>
        <dt>District</dt><dd><i class="swatch" style="background:${districtColor(d.district)}"></i>${d.district}</dd>
        <dt>Type</dt><dd>${d.type}</dd>
        <dt>Daily passengers</dt><dd>${d3.format(",")(d.passengers)}</dd>
        <dt>Direct links</dt><dd>${d.degree}</dd>
      </dl>`;
  }
  function linkTip(d) {
    const a = byId.get(sid(d)), b = byId.get(tid(d));
    return `<strong>${a.name} — ${b.name}</strong>
      <dl>
        <dt>Service</dt><dd><i class="swatch" style="background:${routeColor(d.routeType)}"></i>${d.routeType}</dd>
        <dt>Travel time</dt><dd>${d.time} min</dd>
      </dl>`;
  }

  /* ---------- Controls ------------------------------------ */
  d3.select("#toggle-labels").on("change", function () {
    labelG.attr("display", this.checked ? null : "none");
  });
  d3.select("#reheat").on("click", () => {
    nodes.forEach(d => { d.fx = null; d.fy = null; });
    simulation.alpha(0.9).restart();
  });

  /* ========================================================
     PART B — Adjacency matrix
     ======================================================== */

  const M = { top: 118, right: 14, bottom: 26, left: 196 };
  const grid = 520;

  const matrixSvg = d3.select("#matrix")
    .append("svg")
    .attr("viewBox", [0, 0, grid + M.left + M.right, grid + M.top + M.bottom])
    .attr("width", "100%")
    .attr("height", grid + M.top + M.bottom)
    .attr("role", "img")
    .attr("aria-label", "Adjacency matrix of the same 50-station transit network");

  const mg = matrixSvg.append("g").attr("transform", `translate(${M.left},${M.top})`);

  const scaleBand = d3.scaleBand().range([0, grid]).paddingInner(0.06);
  const barScale  = d3.scaleLinear().domain([0, passExtent[1]]).range([0, 56]);

  // Every ordered pair, including the diagonal (self, always empty).
  const cells = [];
  nodes.forEach(r => nodes.forEach(c => {
    const l = r.id === c.id ? null : linkByPair.get(pairKey(r.id, c.id));
    cells.push({
      row: r.id, col: c.id,
      diagonal: r.id === c.id,
      linked: !!l,
      time: l ? l.time : null,
      routeType: l ? l.routeType : null
    });
  }));

  const cellG   = mg.append("g").attr("class", "cells");
  const rowG    = mg.append("g").attr("class", "row-labels");
  const colG    = mg.append("g").attr("class", "col-labels");
  const sepG    = mg.append("g").attr("class", "separators");
  const crossG  = mg.append("g").attr("class", "crosshair").attr("pointer-events", "none");

  const cellSel = cellG.selectAll("rect")
    .data(cells, d => d.row + "|" + d.col)
    .join("rect")
      .attr("fill", d =>
        d.diagonal ? "#E3E8EC"
        : d.linked  ? routeColor(d.routeType)
        : "#F2F5F7")
      .attr("fill-opacity", d => (d.linked ? timeOpacity(d.time) : 1))
      .on("mouseover", (event, d) => {
        if (d.diagonal) return;
        focusLinkCells(d.row, d.col);
        showTip(cellTip(d), event);
      })
      .on("mousemove", moveTip)
      .on("mouseout", () => { clearFocus(); hideTip(); });

  function cellTip(d) {
    const a = byId.get(d.row), b = byId.get(d.col);
    const head = `<strong>${a.name} → ${b.name}</strong>`;
    if (!d.linked) return `${head}<dl><dt>Connection</dt><dd>none</dd></dl>`;
    return `${head}
      <dl>
        <dt>Service</dt><dd><i class="swatch" style="background:${routeColor(d.routeType)}"></i>${d.routeType}</dd>
        <dt>Travel time</dt><dd>${d.time} min</dd>
      </dl>`;
  }

  // ---- Row furniture: passenger bar, name, district tick, type glyph ----
  const rowItem = rowG.selectAll("g")
    .data(nodes, d => d.id)
    .join("g")
      .attr("tabindex", 0)
      .style("cursor", "pointer")
      .on("mouseover focus", (event, d) => { focusNode(d.id); showTip(nodeTip(d), event); })
      .on("mousemove", moveTip)
      .on("mouseout blur", () => { clearFocus(); hideTip(); });

  rowItem.append("rect")          // invisible hit area across the whole row strip
    .attr("class", "hit")
    .attr("x", -M.left + 2).attr("width", M.left - 2)
    .attr("fill", "transparent");

  rowItem.append("rect")          // daily passengers
    .attr("class", "vol-bar")
    .attr("x", -M.left + 6)
    .attr("fill", d => districtColor(d.district))
    .attr("fill-opacity", 0.42);

  rowItem.append("text")          // station name, coloured by district
    .attr("class", "row-name")
    .attr("x", -M.left + 70)
    .attr("font-size", 8.5)
    .attr("fill", d => districtColor(d.district))
    .text(d => d.name);

  rowItem.append("path")          // station type glyph
    .attr("class", "type-glyph")
    .attr("d", d => d3.symbol().type(typeSymbol(d.type)).size(26)())
    .attr("fill", d => districtColor(d.district));

  const colItem = colG.selectAll("g")
    .data(nodes, d => d.id)
    .join("g")
      .style("cursor", "pointer")
      .on("mouseover", (event, d) => { focusNode(d.id); showTip(nodeTip(d), event); })
      .on("mousemove", moveTip)
      .on("mouseout", () => { clearFocus(); hideTip(); });

  colItem.append("rect")          // district tick above each column
    .attr("class", "col-tick")
    .attr("y", -9).attr("height", 5)
    .attr("fill", d => districtColor(d.district));

  colItem.append("text")
    .attr("class", "col-name")
    .attr("font-size", 8.5)
    .attr("text-anchor", "start")
    .attr("fill", d => districtColor(d.district))
    .text(d => d.name);

  crossG.append("rect").attr("class", "cross cross-row").attr("display", "none");
  crossG.append("rect").attr("class", "cross cross-col").attr("display", "none");

  /* ---------- Ordering ------------------------------------ */
  const ORDERS = {
    district: {
      cmp: (a, b) =>
        d3.ascending(districts.indexOf(a.district), districts.indexOf(b.district)) ||
        d3.ascending(types.indexOf(a.type), types.indexOf(b.type)) ||
        d3.descending(a.passengers, b.passengers),
      blocksBy: d => d.district
    },
    type: {
      cmp: (a, b) =>
        d3.ascending(types.indexOf(a.type), types.indexOf(b.type)) ||
        d3.ascending(districts.indexOf(a.district), districts.indexOf(b.district)) ||
        d3.descending(a.passengers, b.passengers),
      blocksBy: d => d.type
    },
    degree:     { cmp: (a, b) => d3.descending(a.degree, b.degree) || d3.descending(a.passengers, b.passengers) },
    passengers: { cmp: (a, b) => d3.descending(a.passengers, b.passengers) },
    id:         { cmp: (a, b) => d3.ascending(+a.id.replace(/\D/g, ""), +b.id.replace(/\D/g, "")) }
  };

  let currentOrder = "district";

  function applyOrder(key, animate = true) {
    currentOrder = key;
    const ordered = nodes.slice().sort(ORDERS[key].cmp);
    scaleBand.domain(ordered.map(d => d.id));
    const bw = scaleBand.bandwidth();
    const step = scaleBand.step();
    const t = animate ? matrixSvg.transition().duration(650).ease(d3.easeCubicInOut) : null;

    const place = sel => sel
      .attr("x", d => scaleBand(d.col))
      .attr("y", d => scaleBand(d.row))
      .attr("width", bw).attr("height", bw);

    animate ? place(cellSel.transition(t)) : place(cellSel);

    const rowPos = sel => sel.attr("transform", d => `translate(0,${scaleBand(d.id)})`);
    animate ? rowPos(rowItem.transition(t)) : rowPos(rowItem);

    rowItem.select(".hit").attr("y", -step * 0.5 + bw * 0.5).attr("height", step);
    rowItem.select(".vol-bar")
      .attr("y", bw * 0.12).attr("height", Math.max(1.5, bw * 0.76))
      .attr("width", d => Math.max(1, barScale(d.passengers)));
    rowItem.select(".row-name").attr("y", bw * 0.5 + 3);
    rowItem.select(".type-glyph").attr("transform", `translate(${-12},${bw * 0.5})`);

    const colPos = sel => sel.attr("transform", d => `translate(${scaleBand(d.id) + bw / 2},0)`);
    animate ? colPos(colItem.transition(t)) : colPos(colItem);

    colItem.select(".col-tick").attr("x", -bw / 2).attr("width", bw);
    colItem.select(".col-name").attr("transform", "translate(3,-13) rotate(-90)");

    // Block separators only make sense for the two categorical orderings.
    const blocksBy = ORDERS[key].blocksBy;
    let boundaries = [];
    if (blocksBy) {
      ordered.forEach((d, i) => {
        if (i > 0 && blocksBy(d) !== blocksBy(ordered[i - 1])) {
          boundaries.push({ at: scaleBand(d.id) - scaleBand.paddingInner() * step / 2, label: blocksBy(d) });
        }
      });
    }
    const sep = sepG.selectAll("line").data(boundaries.flatMap(b => [
      { x1: 0, y1: b.at, x2: grid, y2: b.at },
      { x1: b.at, y1: 0, x2: b.at, y2: grid }
    ]));
    sep.join("line")
      .attr("stroke", "#16202A").attr("stroke-opacity", 0.55).attr("stroke-width", 0.9)
      .attr("x1", d => d.x1).attr("y1", d => d.y1).attr("x2", d => d.x2).attr("y2", d => d.y2);

    d3.select("#matrix-order-note").text(
      key === "district" ? "Rows and columns are grouped by district, then by station type, then by descending passenger volume."
      : key === "type"   ? "Rows and columns are grouped by station type, then by district."
      : key === "degree" ? "Rows and columns run from the most-connected station to the least-connected."
      : key === "passengers" ? "Rows and columns run from the busiest station to the quietest."
      : "Rows and columns follow the original station id order — the arbitrary baseline."
    );
  }

  applyOrder("district", false);
  d3.select("#matrix-order").on("change", function () { applyOrder(this.value); });

  /* ========================================================
     Linked highlighting across both views
     ======================================================== */

  function focusNode(id) {
    const nbrs = neighbours.get(id);
    const on = other => other.id === id || nbrs.has(other.id);

    nodeSel.attr("opacity", d => (on(d) ? 1 : 0.12))
           .attr("stroke", d => (d.id === id ? "#16202A" : "#FFFFFF"))
           .attr("stroke-width", d => (d.id === id ? 2.2 : 1.4));
    labelSel.attr("opacity", d => (on(d) ? 1 : 0.08));
    linkSel.attr("stroke-opacity", l => (sid(l) === id || tid(l) === id ? 0.95 : 0.06));

    cellSel.attr("opacity", d => (d.row === id || d.col === id ? 1 : 0.16));
    rowItem.attr("opacity", d => (on(d) ? 1 : 0.3));
    colItem.attr("opacity", d => (on(d) ? 1 : 0.3));
    drawCrosshair(id, id);
  }

  function focusLink(a, b) {
    const pair = new Set([a, b]);
    nodeSel.attr("opacity", d => (pair.has(d.id) ? 1 : 0.12));
    labelSel.attr("opacity", d => (pair.has(d.id) ? 1 : 0.08));
    linkSel.attr("stroke-opacity", l => (pair.has(sid(l)) && pair.has(tid(l)) ? 0.95 : 0.06));
    cellSel.attr("opacity", d =>
      (pair.has(d.row) && pair.has(d.col)) || d.row === a || d.col === b ? 1 : 0.16);
    rowItem.attr("opacity", d => (pair.has(d.id) ? 1 : 0.3));
    colItem.attr("opacity", d => (pair.has(d.id) ? 1 : 0.3));
    drawCrosshair(a, b);
  }

  const focusLinkCells = focusLink;

  function drawCrosshair(rowId, colId) {
    const bw = scaleBand.bandwidth();
    crossG.select(".cross-row")
      .attr("display", null)
      .attr("x", -6).attr("y", scaleBand(rowId)).attr("width", grid + 6).attr("height", bw)
      .attr("fill", "none").attr("stroke", "#16202A").attr("stroke-width", 1);
    crossG.select(".cross-col")
      .attr("display", null)
      .attr("x", scaleBand(colId)).attr("y", -6).attr("width", bw).attr("height", grid + 6)
      .attr("fill", "none").attr("stroke", "#16202A").attr("stroke-width", 1);
  }

  function clearFocus() {
    nodeSel.attr("opacity", 1).attr("stroke", "#FFFFFF").attr("stroke-width", 1.4);
    labelSel.attr("opacity", 1);
    linkSel.attr("stroke-opacity", 0.72);
    cellSel.attr("opacity", 1);
    rowItem.attr("opacity", 1);
    colItem.attr("opacity", 1);
    crossG.selectAll(".cross").attr("display", "none");
  }

  /* ========================================================
     Legends
     ======================================================== */

  function swatchSvg(render, w = 26, h = 16) {
    const s = d3.create("svg").attr("width", w).attr("height", h).attr("class", "key-mark");
    render(s.append("g").attr("transform", `translate(${w / 2},${h / 2})`));
    return s.node();
  }

  function buildKey(selector, title, items) {
    const box = d3.select(selector);
    box.append("h4").text(title);
    const ul = box.append("ul");
    items.forEach(it => {
      const li = ul.append("li");
      li.node().appendChild(it.mark);
      li.append("span").text(it.label);
    });
  }

  buildKey("#key-district", "District — node and label colour",
    districts.map(d => ({
      label: d,
      mark: swatchSvg(g => g.append("circle").attr("r", 6).attr("fill", districtColor(d)))
    })));

  buildKey("#key-type", "Station type — node shape",
    types.map(t => ({
      label: t,
      mark: swatchSvg(g => g.append("path")
        .attr("d", d3.symbol().type(typeSymbol(t)).size(90)())
        .attr("fill", "#5C6773"))
    })));

  buildKey("#key-size", "Daily passengers — node area",
    [passExtent[0], Math.round(d3.mean(passExtent)), passExtent[1]].map(v => ({
      label: d3.format(",")(v),
      mark: swatchSvg(g => g.append("circle")
        .attr("r", Math.sqrt(areaScale(v) / Math.PI))
        .attr("fill", "#B9C3CC"), 40, 40)
    })));

  buildKey("#key-route", "Service type — line colour and dash",
    routeTypes.map(rt => ({
      label: rt,
      mark: swatchSvg(g => g.append("line")
        .attr("x1", -13).attr("x2", 13)
        .attr("stroke", routeColor(rt))
        .attr("stroke-dasharray", routeDash(rt))
        .attr("stroke-width", 3))
    })));

  buildKey("#key-time", "Travel time — line width and edge length",
    [timeExtent[0], timeExtent[1]].map((v, i) => ({
      label: `${v} min — ${i === 0 ? "thin, short edge" : "thick, long edge"}`,
      mark: swatchSvg(g => g.append("line")
        .attr("x1", -13).attr("x2", 13)
        .attr("stroke", "#5C6773")
        .attr("stroke-width", linkWidth(v)))
    })));

  buildKey("#key-cell", "Cell colour — service type",
    routeTypes.map(rt => ({
      label: rt,
      mark: swatchSvg(g => g.append("rect")
        .attr("x", -7).attr("y", -7).attr("width", 14).attr("height", 14)
        .attr("fill", routeColor(rt)))
    })).concat([
      { label: "no direct connection", mark: swatchSvg(g => g.append("rect")
          .attr("x", -7).attr("y", -7).attr("width", 14).attr("height", 14).attr("fill", "#F2F5F7")
          .attr("stroke", "#DDE3E8")) },
      { label: "same station (diagonal)", mark: swatchSvg(g => g.append("rect")
          .attr("x", -7).attr("y", -7).attr("width", 14).attr("height", 14).attr("fill", "#E3E8EC")) }
    ]));

  buildKey("#key-opacity", "Cell opacity — travel time",
    [timeExtent[0], timeExtent[1]].map(v => ({
      label: `${v} min`,
      mark: swatchSvg(g => g.append("rect")
        .attr("x", -7).attr("y", -7).attr("width", 14).attr("height", 14)
        .attr("fill", "#24405B").attr("fill-opacity", timeOpacity(v)))
    })));

  buildKey("#key-rowbar", "Row margin — station attributes",
    [
      { label: "bar length = daily passengers", mark: swatchSvg(g => g.append("rect")
          .attr("x", -13).attr("y", -4).attr("width", 22).attr("height", 8)
          .attr("fill", "#0072B2").attr("fill-opacity", 0.32)) },
      { label: "glyph = station type", mark: swatchSvg(g => g.append("path")
          .attr("d", d3.symbol().type(d3.symbolSquare).size(40)()).attr("fill", "#5C6773")) },
      { label: "label colour = district", mark: swatchSvg(g => g.append("text")
          .attr("text-anchor", "middle").attr("dy", 3).attr("font-size", 10)
          .attr("fill", "#009E73").text("Aa")) }
    ]);

  /* ========================================================
     Read-off panel: figures to check your written answers against
     ======================================================== */

  const fmt = d3.format(",");

  const topDegree = nodes.slice().sort((a, b) =>
    d3.descending(a.degree, b.degree) || d3.descending(a.passengers, b.passengers)).slice(0, 8);
  const topVolume = nodes.slice().sort((a, b) => d3.descending(a.passengers, b.passengers)).slice(0, 8);
  const longest   = links.slice().sort((a, b) => d3.descending(a.time, b.time)).slice(0, 6);

  const pairCount = new Map();
  links.forEach(l => {
    const da = byId.get(sid(l)).district, db = byId.get(tid(l)).district;
    const k = da < db ? da + " ↔ " + db : db + " ↔ " + da;
    pairCount.set(k, (pairCount.get(k) || 0) + 1);
  });
  const topPairs = [...pairCount].sort((a, b) => d3.descending(a[1], b[1])).slice(0, 8);

  const typeStats = types.map(t => {
    const g = nodes.filter(d => d.type === t);
    return [t, g.length, d3.mean(g, d => d.degree).toFixed(2), fmt(Math.round(d3.mean(g, d => d.passengers)))];
  });

  const routeStats = routeTypes.map(rt => {
    const g = links.filter(d => d.routeType === rt);
    return [rt, g.length, d3.mean(g, d => d.time).toFixed(1),
            g.filter(l => byId.get(sid(l)).district !== byId.get(tid(l)).district).length];
  });

  function table(sel, headers, rows) {
    const t = d3.select(sel).append("table");
    t.append("thead").append("tr").selectAll("th").data(headers).join("th").text(d => d);
    t.append("tbody").selectAll("tr").data(rows).join("tr")
      .selectAll("td").data(d => d).join("td").text(d => d);
  }

  table("#check-degree", ["Station", "District", "Type", "Links", "Passengers"],
    topDegree.map(d => [d.name, d.district, d.type, d.degree, fmt(d.passengers)]));
  table("#check-volume", ["Station", "District", "Type", "Passengers", "Links"],
    topVolume.map(d => [d.name, d.district, d.type, fmt(d.passengers), d.degree]));
  table("#check-longest", ["From", "To", "Minutes", "Service"],
    longest.map(l => [byId.get(sid(l)).name, byId.get(tid(l)).name, l.time, l.routeType]));
  table("#check-pairs", ["District pair", "Direct connections"], topPairs.map(p => [p[0], p[1]]));
  table("#check-types", ["Station type", "Count", "Mean links", "Mean passengers"], typeStats);
  table("#check-routes", ["Service", "Routes", "Mean minutes", "Cross-district"], routeStats);

  d3.select("#dataset-facts").html(
    `The network has <strong>${nodes.length}</strong> stations and <strong>${links.length}</strong> direct
     connections across <strong>${districts.length}</strong> districts
     (${districts.join(", ")}). Daily passenger volume ranges from ${fmt(passExtent[0])} to
     ${fmt(passExtent[1])}; direct journeys take between ${timeExtent[0]} and ${timeExtent[1]} minutes.
     ${nodes.filter(d => d.degree === 0).length} station(s) have no direct connection at all.`
  );
})
.catch(err => {
  console.error(err);
  d3.select("#network").html(
    `<p class="loaderror">The station and route files did not load.
     Check that <code>${CONFIG.stationsFile}</code> and <code>${CONFIG.routesFile}</code> exist,
     and open this page through a local server rather than as a <code>file://</code> path.</p>`
  );
});