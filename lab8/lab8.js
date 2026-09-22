// ================= 全局状态 =================
// 所有交互都只改 state，然后调用 update() 统一重画
const state = {
  query: "",        // 搜索关键词
  section: "all",   // section 筛选（matrix_row）
  topic: "all",     // topic 筛选（cluster 编号）
  cell: null,       // 矩阵格子选择 {row, cluster}，下一步用
  selected: null,   // 当前点击的 passage_id
};

const TOPIC_COLORS = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#34495e",
  "#d95f02", "#7570b3", "#e7298a", "#66a61e", "#17becf",
];

const fmt = d3.format(",");
const tooltip = d3.select("#tooltip");

let data = [], byId = new Map(), overview, matrixData = [];
let topicColor, points, nbLayer, xBase, yBase;
let currentT = d3.zoomIdentity;


// ================= 读数据 =================
Promise.all([
  d3.csv("../data/lab8_embedding_map.csv", d => ({
    ...d,
    x: +d.x, y: +d.y, page: +d.page,
    word_count: +d.word_count, cluster: +d.cluster,
    matrix_order: +d.matrix_order,
    section_typicality: +d.section_typicality,
    neighbors: d.neighbors.split("|"),
    neighbor_sims: d.neighbor_sims.split("|").map(Number),
  })),
  d3.json("../data/lab8_overview.json"),
  d3.csv("../data/lab8_topic_section_matrix.csv", d3.autoType),
]).then(([mapData, ov, mx]) => {
  data = mapData;
  overview = ov;
  matrixData = mx;
  byId = new Map(data.map(d => [d.passage_id, d]));
  topicColor = d3.scaleOrdinal()
    .domain(overview.clusters.map(c => c.cluster))
    .range(TOPIC_COLORS);

  drawStats();
  drawChapterChart();
  drawTermsChart();
  drawTopicTable();
  buildControls();
  drawMap();
  drawTopicLegend();
  if (typeof drawMatrix === "function") drawMatrix();   // 下一步加
  update();
});


// ================= 1. 语料统计卡片 =================
function drawStats() {
  const s = overview.stats;
  const items = [
    ["Raw passages", s.raw_passages],
    ["After cleaning", s.clean_passages],
    ["Avg. words / passage", s.avg_words],
    ["Chapters", s.n_chapters],
    ["Formal sections", s.n_sections],
    ["Semantic topics", s.n_clusters],
  ];
  d3.select("#stats").selectAll("div").data(items).join("div")
    .attr("class", "stat")
    .html(d => `<span class="value">${fmt(d[1])}</span><span class="label">${d[0]}</span>`);
}


// ================= 2. 通用横向条形图 =================
function hbar(selector, rows, { label, value, text, color, tip }) {
  const barH = 22, labelW = 250, w = 580;
  const h = rows.length * barH + 8;
  const x = d3.scaleLinear().domain([0, d3.max(rows, value)]).range([0, w - labelW - 90]);

  const svg = d3.select(selector).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
  const g = svg.selectAll("g").data(rows).join("g")
    .attr("transform", (d, i) => `translate(0, ${i * barH + 4})`);

  g.append("text")
    .attr("x", labelW - 8).attr("y", barH / 2).attr("dy", "0.35em")
    .attr("text-anchor", "end").attr("font-size", 11)
    .text(d => { const s = label(d); return s.length > 40 ? s.slice(0, 39) + "…" : s; });

  g.append("rect")
    .attr("x", labelW).attr("y", 3).attr("height", barH - 7).attr("rx", 2)
    .attr("width", d => x(value(d))).attr("fill", color);

  g.append("text")
    .attr("x", d => labelW + x(value(d)) + 5).attr("y", barH / 2).attr("dy", "0.35em")
    .attr("font-size", 11).attr("fill", "#555").text(text);

  if (tip) g.on("mouseover", (e, d) => showTip(e, tip(d))).on("mousemove", moveTip).on("mouseout", hideTip);
}

function drawChapterChart() {
  hbar("#chapter-chart", overview.chapters, {
    label: d => d.short,
    value: d => d.passages,
    text: d => d.passages,
    color: "#4e79a7",
    tip: d => `<strong>${d.short}</strong><br>${d.passages} passages<br>Avg. length: ${d.avg_words} words`,
  });
}

function drawTermsChart() {
  hbar("#terms-chart", overview.top_terms, {
    label: d => d.term,
    value: d => d.count,
    text: d => fmt(d.count),
    color: "#76b7b2",
  });
}


// ================= 3. 主题表（Part C 文档） =================
function drawTopicTable() {
  const t = d3.select("#topic-table");
  t.append("tr").html("<th></th><th>Topic label</th><th>Passages</th><th>Top TF-IDF terms</th>");
  t.selectAll("tr.row").data(overview.clusters).join("tr").attr("class", "row")
    .html(d => `<td><span class="swatch" style="background:${topicColor(d.cluster)}"></span></td>
                <td><strong>${d.name}</strong></td><td>${d.size}</td>
                <td>${d.terms.join(", ")}</td>`);
}


// ================= 4. 控件：搜索 + 两个筛选 + 重置 =================
function buildControls() {
  const rows = Array.from(new Map(data.map(d => [d.matrix_row, d.matrix_order])))
    .sort((a, b) => a[1] - b[1]).map(d => d[0]);

  d3.select("#section-filter").selectAll("option").data(["all", ...rows]).join("option")
    .attr("value", d => d).text(d => d === "all" ? "All sections" : d);

  d3.select("#topic-filter").selectAll("option")
    .data(["all", ...overview.clusters.map(c => c.cluster)]).join("option")
    .attr("value", d => d)
    .text(d => d === "all" ? "All topics" : overview.clusters[d].name);

  d3.select("#search").on("input", function () {
    state.query = this.value.toLowerCase().trim();
    update();
  });
  d3.select("#section-filter").on("change", function () {
    state.section = this.value;
    state.cell = null;
    update();
  });
  d3.select("#topic-filter").on("change", function () {
    state.topic = this.value === "all" ? "all" : +this.value;
    state.cell = null;
    update();
  });
  d3.select("#reset").on("click", resetAll);
}

function resetAll() {
  Object.assign(state, { query: "", section: "all", topic: "all", cell: null, selected: null });
  d3.select("#search").property("value", "");
  d3.select("#section-filter").property("value", "all");
  d3.select("#topic-filter").property("value", "all");
  d3.select("#detail-panel").html('<p class="note">Click a passage on the map to see its details.</p>');
  update();
}


// ================= 5. 语义地图 =================
const MAP_W = 800, MAP_H = 620, PAD = 20;

function drawMap() {
  xBase = d3.scaleLinear().domain(d3.extent(data, d => d.x)).nice().range([PAD, MAP_W - PAD]);
  yBase = d3.scaleLinear().domain(d3.extent(data, d => d.y)).nice().range([MAP_H - PAD, PAD]);
  const rScale = d3.scaleSqrt().domain(d3.extent(data, d => d.word_count)).range([2.5, 7]);

  const svg = d3.select("#map").append("svg")
    .attr("viewBox", `0 0 ${MAP_W} ${MAP_H}`)
    .style("background", "#fcfcfa").style("border-radius", "8px");

  svg.append("defs").append("clipPath").attr("id", "map-clip")
    .append("rect").attr("width", MAP_W).attr("height", MAP_H);
  const g = svg.append("g").attr("clip-path", "url(#map-clip)");

  nbLayer = g.append("g");                       // 近邻连线在点下面

  points = g.append("g").selectAll("circle")
    .data(data, d => d.passage_id)
    .join("circle")
    .attr("r", d => rScale(d.word_count))
    .attr("fill", d => topicColor(d.cluster))
    .attr("stroke", "white").attr("stroke-width", 0.6)
    .style("cursor", "pointer")
    .on("mouseover", (e, d) => showTip(e, `
      <strong>${d.cluster_name}</strong><br>${d.matrix_row} · p.${d.page}<br>
      <span style="opacity:.8">${d.text.slice(0, 110)}…</span>`))
    .on("mousemove", moveTip)
    .on("mouseout", hideTip)
    .on("click", (e, d) => selectPassage(d.passage_id));

  // 缩放：改变比例尺而不是放大整个 g，这样点的大小不会跟着变大
  svg.call(d3.zoom().scaleExtent([1, 12]).on("zoom", e => {
    currentT = e.transform;
    positionMap();
  }));

  positionMap();
}

function positionMap() {
  const x = currentT.rescaleX(xBase), y = currentT.rescaleY(yBase);
  points.attr("cx", d => x(d.x)).attr("cy", d => y(d.y));
  nbLayer.selectAll("line")
    .attr("x1", d => x(d.a.x)).attr("y1", d => y(d.a.y))
    .attr("x2", d => x(d.b.x)).attr("y2", d => y(d.b.y));
}

function drawTopicLegend() {
  d3.select("#topic-legend").selectAll("div").data(overview.clusters).join("div")
    .attr("class", "item")
    .html(d => `<span class="swatch" style="background:${topicColor(d.cluster)}"></span>${d.name}`)
    .on("click", (e, d) => {
      state.topic = state.topic === d.cluster ? "all" : d.cluster;
      state.cell = null;
      d3.select("#topic-filter").property("value", state.topic);
      update();
    });
}


// ================= 6. 点击：详情面板 + 最近邻 =================
function selectPassage(id) {
  state.selected = id;
  const d = byId.get(id);

  const nbHtml = d.neighbors.map((nid, i) => {
    const n = byId.get(nid);
    const cross = n.matrix_row !== d.matrix_row ? " · <em>different section</em>" : "";
    return `<div class="nb" data-id="${nid}" style="border-left-color:${topicColor(n.cluster)}">
        <strong>${n.matrix_row}</strong> · p.${n.page} · similarity ${d.neighbor_sims[i].toFixed(2)}${cross}<br>
        ${n.text.slice(0, 160)}…</div>`;
  }).join("");

  d3.select("#detail-panel").html(`
    <h3>${d.section}</h3>
    <div class="meta">
      ${d.chapter}<br>
      ${d.subsection ? "Subsection: " + d.subsection + "<br>" : ""}
      ${d.heading ? "Heading: " + d.heading + "<br>" : ""}
      Page ${d.page} · ${d.word_count} words
    </div>
    <div class="meta" style="margin-top:6px">
      <span class="swatch" style="background:${topicColor(d.cluster)}"></span>
      Topic: <strong>${d.cluster_name}</strong> · Section typicality: ${d.section_typicality.toFixed(2)}
    </div>
    <div class="passage">${d.text}</div>
    <h3>5 nearest semantic neighbors</h3>
    ${nbHtml}
  `);

  // 点近邻卡片 = 跳转到那段
  d3.selectAll("#detail-panel .nb").on("click", function () {
    selectPassage(this.dataset.id);
  });

  update();
}


// ================= 7. 统一更新 =================
function baseMatch(d) {          // 搜索 + section + topic
  if (state.query && !d.text.toLowerCase().includes(state.query)) return false;
  if (state.section !== "all" && d.matrix_row !== state.section) return false;
  if (state.topic !== "all" && d.cluster !== state.topic) return false;
  return true;
}

function matches(d) {            // 再加上矩阵格子
  if (!d._base) return false;
  if (state.cell && (d.matrix_row !== state.cell.row || d.cluster !== state.cell.cluster)) return false;
  return true;
}

function update() {
  const sel = state.selected ? byId.get(state.selected) : null;
  const nbSet = new Set(sel ? sel.neighbors : []);
  const isSel = d => d.passage_id === state.selected;
  const isNb = d => nbSet.has(d.passage_id);

  let n = 0;
  data.forEach(d => { d._base = baseMatch(d); d._match = matches(d); if (d._match) n++; });
  points
    .attr("opacity", d => isSel(d) || isNb(d) ? 1 : d._match ? 0.85 : 0.07)
    .attr("stroke", d => isSel(d) || isNb(d) ? "#111" : "white")
    .attr("stroke-width", d => isSel(d) ? 3 : isNb(d) ? 1.5 : 0.6);
  points.filter(d => d._match).raise();
  points.filter(d => isSel(d) || isNb(d)).raise();

  const links = sel ? sel.neighbors.map(id => ({ a: sel, b: byId.get(id) })) : [];
  nbLayer.selectAll("line").data(links).join("line")
    .attr("stroke", "#111").attr("stroke-width", 1)
    .attr("stroke-dasharray", "3,2").attr("opacity", 0.6);
  positionMap();

  const filtering = state.query || state.section !== "all" || state.topic !== "all" || state.cell;
  d3.select("#match-count").text(filtering
    ? `${n} of ${data.length} passages match`
    : `${data.length} passages`);

  d3.selectAll("#topic-legend .item")
    .classed("dim", d => state.topic !== "all" && d.cluster !== state.topic);

  if (typeof updateMatrix === "function") updateMatrix();   // 下一步加
}


// ================= tooltip =================
function showTip(event, html) {
  tooltip.style("opacity", 1).html(html);
  moveTip(event);
}
function moveTip(event) {
  tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
}
function hideTip() { tooltip.style("opacity", 0); }

// ================= 8. Topic × Section 矩阵 =================
const MX = { labelW: 340, cellW: 40, cellH: 26, top: 215, right: 190 };
let mxCells, mxRowLabels, mxColLabels, mxColor, topicSize;

function drawMatrix() {
  const rows = Array.from(new Map(matrixData.map(d => [d.matrix_row, d.matrix_order])))
    .sort((a, b) => a[1] - b[1]).map(d => d[0]);
  const cols = overview.clusters.map(c => c.cluster);
  topicSize = new Map(overview.clusters.map(c => [c.cluster, c.size]));

  const W = MX.labelW + cols.length * MX.cellW + MX.right;
  const H = MX.top + rows.length * MX.cellH + 10;

  const x = d3.scaleBand().domain(cols)
    .range([MX.labelW, MX.labelW + cols.length * MX.cellW]).padding(0.08);
  const y = d3.scaleBand().domain(rows)
    .range([MX.top, MX.top + rows.length * MX.cellH]).padding(0.08);

  // 用 sqrt 让小比例也能看出颜色
  mxColor = d3.scaleSequentialSqrt(d3.interpolateBlues).domain([0, 1]);

  const svg = d3.select("#matrix").html("").append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).style("min-width", "900px");

  // ---- 颜色图例（放在左上角空白处） ----
  const grad = svg.append("defs").append("linearGradient").attr("id", "mx-grad");
  d3.range(0, 1.01, 0.1).forEach(t =>
    grad.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", mxColor(t)));

  const lg = svg.append("g").attr("transform", "translate(20, 40)");
  lg.append("text").attr("font-size", 11).attr("font-weight", 600).text("Share of section's passages");
  lg.append("rect").attr("y", 8).attr("width", 200).attr("height", 10).attr("rx", 2).attr("fill", "url(#mx-grad)");
  [["0%", 0, "start"], ["50%", 100, "middle"], ["100%", 200, "end"]].forEach(([t, xx, a]) =>
    lg.append("text").attr("x", xx).attr("y", 32).attr("font-size", 10).attr("text-anchor", a).text(t));
  lg.append("rect").attr("y", 44).attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", "#f1f0eb");
  lg.append("text").attr("x", 18).attr("y", 54).attr("font-size", 10).text("no passages");

  // ---- 列标题（主题） ----
  mxColLabels = svg.append("g").selectAll("g").data(overview.clusters).join("g")
    .attr("transform", d => `translate(${x(d.cluster) + x.bandwidth() / 2}, ${MX.top - 10})`)
    .style("cursor", "pointer")
    .on("click", (e, d) => {
      state.topic = state.topic === d.cluster ? "all" : d.cluster;
      state.cell = null;
      d3.select("#topic-filter").property("value", state.topic);
      update();
    });
  mxColLabels.append("circle").attr("r", 4).attr("fill", d => topicColor(d.cluster));
  mxColLabels.append("text")
    .attr("transform", "rotate(-45)").attr("x", 8).attr("dy", "0.35em")
    .attr("font-size", 10.5).text(d => d.name);

  // ---- 行标题（section） ----
  mxRowLabels = svg.append("g").selectAll("text").data(rows).join("text")
    .attr("x", MX.labelW - 8).attr("y", d => y(d) + y.bandwidth() / 2).attr("dy", "0.35em")
    .attr("text-anchor", "end").attr("font-size", 11).style("cursor", "pointer")
    .text(d => d.length > 50 ? d.slice(0, 49) + "…" : d)
    .on("click", (e, d) => {
      state.section = state.section === d ? "all" : d;
      state.cell = null;
      d3.select("#section-filter").property("value", state.section);
      update();
    });
  mxRowLabels.append("title").text(d => d);

  // ---- 每行右侧的段落总数 ----
  const rowTotals = new Map(matrixData.map(d => [d.matrix_row, d.row_total]));
  svg.append("g").selectAll("text").data(rows).join("text")
    .attr("x", MX.labelW + cols.length * MX.cellW + 8)
    .attr("y", d => y(d) + y.bandwidth() / 2).attr("dy", "0.35em")
    .attr("font-size", 10).attr("fill", "#888").text(d => `n=${rowTotals.get(d)}`);

  // ---- 格子 ----
  mxCells = svg.append("g").selectAll("g").data(matrixData).join("g")
    .attr("transform", d => `translate(${x(d.cluster)}, ${y(d.matrix_row)})`)
    .style("cursor", d => d.count ? "pointer" : "default");

  mxCells.append("rect")
    .attr("width", x.bandwidth()).attr("height", y.bandwidth()).attr("rx", 3)
    .attr("fill", d => d.count ? mxColor(d.proportion) : "#f1f0eb");

  mxCells.append("text")
    .attr("x", x.bandwidth() / 2).attr("y", y.bandwidth() / 2).attr("dy", "0.35em")
    .attr("text-anchor", "middle").attr("font-size", 10)
    .attr("fill", d => d.proportion > 0.45 ? "white" : "#333");

  const pct = d3.format(".0%");
  mxCells
    .on("mouseover", (e, d) => showTip(e, `
      <strong>${d.matrix_row}</strong><br>
      Topic: ${d.cluster_name}<br>
      ${d.count} of ${d.row_total} passages (${pct(d.proportion)} of this section)<br>
      ${pct(d.count / topicSize.get(d.cluster))} of all passages in this topic`))
    .on("mousemove", moveTip)
    .on("mouseout", hideTip)
    .on("click", (e, d) => {
      if (!d.count) return;
      const same = state.cell && state.cell.row === d.matrix_row && state.cell.cluster === d.cluster;
      state.cell = same ? null : { row: d.matrix_row, cluster: d.cluster };
      // 格子选择本身已经同时限定了 section 和 topic，所以清空两个下拉筛选
      state.section = "all";
      state.topic = "all";
      d3.select("#section-filter").property("value", "all");
      d3.select("#topic-filter").property("value", "all");
      update();
      if (!same) document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "center" });
    });
}

function updateMatrix() {
  if (!mxCells) return;

  // 每个格子里满足"搜索 + section + topic"条件的段落数
  const counts = d3.rollup(data.filter(d => d._base), v => v.length, d => d.matrix_row, d => d.cluster);
  const cellCount = d => counts.get(d.matrix_row)?.get(d.cluster) || 0;
  const filtering = state.query || state.section !== "all" || state.topic !== "all";
  const sel = state.selected ? byId.get(state.selected) : null;
  const isCell = d => state.cell && state.cell.row === d.matrix_row && state.cell.cluster === d.cluster;
  const isSelCell = d => sel && sel.matrix_row === d.matrix_row && sel.cluster === d.cluster;

  mxCells.select("rect")
    .attr("opacity", d => !filtering || cellCount(d) > 0 ? 1 : 0.15)
    .attr("stroke", d => isCell(d) || isSelCell(d) ? "#111" : "none")
    .attr("stroke-width", d => isCell(d) ? 3 : 2)
    .attr("stroke-dasharray", d => !isCell(d) && isSelCell(d) ? "3,2" : null);

  // 有搜索时，格子里的数字变成"匹配的段落数"
  mxCells.select("text")
    .attr("opacity", d => !filtering || cellCount(d) > 0 ? 1 : 0)
    .text(d => {
      const n = state.query ? cellCount(d) : d.count;
      return n || "";
    });

  mxRowLabels.attr("font-weight", d =>
    state.section === d || state.cell?.row === d || sel?.matrix_row === d ? 700 : 400);
  mxColLabels.select("text").attr("font-weight", d =>
    state.topic === d.cluster || state.cell?.cluster === d.cluster || sel?.cluster === d.cluster ? 700 : 400);

  // 状态提示
  let msg = "";
  if (state.cell) {
    const name = overview.clusters[state.cell.cluster].name;
    const n = data.filter(d => d._match).length;
    msg = `Selected cell: ${state.cell.row} × ${name} — ${n} passages highlighted on the map. Click the cell again to clear.`;
  } else if (state.query) {
    msg = `Numbers show passages matching "${state.query}". Cells with no matches are faded.`;
  }
  d3.select("#matrix-status").text(msg);
}