// Lab 9 — 2025 GDP: Choropleth vs. Cartogram
// 数据放在仓库根目录的 data/ 文件夹，所以路径以 ../data/ 开头

const W = 960, H = 520;
const NO_DATA = "#e3e3e3";
const tooltip = d3.select("#tooltip");

// 不在 world.geojson 里的小经济体，手动给 [经度, 纬度]，供 cartogram 定位
const FALLBACK_LONLAT = {
  HKG: [114.17, 22.32],
  SGP: [103.82, 1.35]
};

const fmt = v => v >= 1000
  ? `$${(v / 1000).toFixed(2)} trillion`
  : `$${d3.format(",.0f")(v)} billion`;

// ---------- Part A: 读取并 join ----------
Promise.all([
  d3.json("../data/world.geojson"),
  d3.csv("../data/lab9_gdp_2025_top50.csv", d => ({
    iso3: d.iso3.trim(),
    country: d.country,
    gdp: +d.gdp_2025_billion_usd,
    rank: +d.rank
  }))
]).then(([geo, gdp]) => {
  // 去掉南极洲
  geo.features = geo.features.filter(f => f.id !== "ATA");

  const byId = new Map(gdp.map(d => [d.iso3, d]));

  geo.features.forEach(f => {
    const rec = byId.get(f.id);              // 这个 GeoJSON 的 ISO-3 在 feature.id
    f.properties.iso3 = f.id;
    f.properties.gdp = rec ? rec.gdp : null; // null = no data，不是 0
    f.properties.rank = rec ? rec.rank : null;
  });

  // 检查匹配情况
  const geoIds = new Set(geo.features.map(f => f.id));
  const unmatched = gdp.filter(d => !geoIds.has(d.iso3));
  console.log(`Matched ${gdp.length - unmatched.length} / ${gdp.length} economies`);
  console.log("Unmatched (no polygon in GeoJSON):",
    unmatched.map(d => `${d.iso3} ${d.country}`));

  drawChoropleth(geo);
  drawCartogram(geo, gdp);
}).catch(err => {
  console.error("Failed to load data. Check the ../data/ paths:", err);
});

// ---------- Part D: 共用交互（linked highlighting） ----------
function highlight(iso3) {
  d3.selectAll("[data-iso]")
    .classed("highlight", function () { return this.dataset.iso === iso3; });

  if (iso3) {
    d3.selectAll(`[data-iso="${iso3}"]`).each(function () {
      // 圆在 <g> 里，要把整个 <g> 提到最上层
      d3.select(this.tagName === "circle" ? this.parentNode : this).raise();
    });
  }
}

function showTip(event, name, gdp, rank) {
  tooltip.style("opacity", 1).html(
    `<strong>${name}</strong><br>` +
    (gdp == null
      ? "No data (not in top 50)"
      : `GDP 2025: ${fmt(gdp)}<br>Rank: #${rank}`)
  );
  moveTip(event);
}

function moveTip(event) {
  tooltip
    .style("left", `${event.pageX + 12}px`)
    .style("top", `${event.pageY + 12}px`);
}

function hideTip() {
  tooltip.style("opacity", 0);
}

// ---------- Part B: Choropleth ----------
function drawChoropleth(geo) {
  const svg = d3.select("#choropleth");
  const projection = d3.geoNaturalEarth1()
    .fitExtent([[0, 40], [W, H - 60]], geo);
  const path = d3.geoPath(projection);

  const values = geo.features
    .map(f => f.properties.gdp)
    .filter(v => v != null);

  // log 色阶；从 0.15 开始取色，避免最小值接近白色、和 no data 混淆
  const color = d3.scaleSequentialLog(t => d3.interpolateBlues(0.15 + 0.85 * t))
    .domain(d3.extent(values));

  // 地图组（会被缩放）
  const g = svg.append("g");

  g.selectAll("path")
    .data(geo.features)
    .join("path")
    .attr("class", "country")
    .attr("data-iso", d => d.properties.iso3)
    .attr("d", path)
    .attr("fill", d => d.properties.gdp == null ? NO_DATA : color(d.properties.gdp))
    .on("mouseover", (event, d) => {
      highlight(d.properties.iso3);
      showTip(event, d.properties.name, d.properties.gdp, d.properties.rank);
    })
    .on("mousemove", moveTip)
    .on("mouseout", () => {
      highlight(null);
      hideTip();
    });

  // 标题和图例画在 svg 上，不随缩放移动
  svg.append("rect")
    .attr("width", W).attr("height", 40)
    .attr("fill", "#f8fbff");
  svg.append("text")
    .attr("x", 20).attr("y", 28)
    .attr("font-size", 18).attr("font-weight", "bold")
    .text("2025 Nominal GDP by Country (Top 50 Economies)");

  drawColorLegend(svg, color);

  svg.call(
    d3.zoom()
      .scaleExtent([1, 8])
      .translateExtent([[0, 0], [W, H]])
      .on("zoom", event => g.attr("transform", event.transform))
  );
}

function drawColorLegend(svg, color) {
  const [lo, hi] = color.domain();
  const lw = 300, lh = 10;

  const grad = svg.append("defs")
    .append("linearGradient")
    .attr("id", "gdp-grad");

  // 按 log 均匀取色，和色阶一致
  d3.range(0, 1.0001, 0.1).forEach(t => {
    grad.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", color(lo * Math.pow(hi / lo, t)));
  });

  const lg = svg.append("g")
    .attr("transform", `translate(20,${H - 42})`);

  lg.append("rect")
    .attr("x", -10).attr("y", -20)
    .attr("width", lw + 220).attr("height", 52)
    .attr("fill", "white").attr("fill-opacity", 0.85);

  lg.append("text")
    .attr("y", -6).attr("font-size", 12)
    .text("2025 nominal GDP (log scale)");

  lg.append("rect")
    .attr("width", lw).attr("height", lh)
    .attr("fill", "url(#gdp-grad)");

  const axisScale = d3.scaleLog().domain([lo, hi]).range([0, lw]);
  lg.append("g")
    .attr("transform", `translate(0,${lh})`)
    .call(
      d3.axisBottom(axisScale)
        .tickValues([500, 1000, 2000, 5000, 10000, 20000].filter(v => v >= lo && v <= hi))
        .tickFormat(v => v >= 1000 ? `$${v / 1000}T` : `$${v}B`)
    );

  lg.append("rect")
    .attr("x", lw + 25).attr("width", 14).attr("height", lh)
    .attr("fill", NO_DATA);
  lg.append("text")
    .attr("x", lw + 45).attr("y", lh)
    .attr("font-size", 12)
    .text("No data (not in top 50)");
}

// ---------- Part C: Cartogram (Dorling) ----------
function drawCartogram(geo, gdp) {
  const svg = d3.select("#cartogram");
  const projection = d3.geoNaturalEarth1()
    .fitExtent([[0, 40], [W, H - 20]], geo);
  const path = d3.geoPath(projection);

  const featById = new Map(geo.features.map(f => [f.properties.iso3, f]));

  // scaleSqrt：半径 ∝ √GDP → 面积 ∝ GDP
  const r = d3.scaleSqrt()
    .domain([0, d3.max(gdp, d => d.gdp)])
    .range([0, 70]);

  const nodes = gdp
    .map(d => {
      const f = featById.get(d.iso3);
      let xy = null;
      if (FALLBACK_LONLAT[d.iso3]) xy = projection(FALLBACK_LONLAT[d.iso3]);
      else if (f) xy = path.centroid(f);
      if (!xy) {
        console.warn("No position for", d.iso3, d.country, "— add it to FALLBACK_LONLAT");
        return null;
      }
      return { ...d, x: xy[0], y: xy[1], x0: xy[0], y0: xy[1], r: r(d.gdp) };
    })
    .filter(Boolean);

  // 力导向：靠近原位置 + 圆不重叠
  const sim = d3.forceSimulation(nodes)
    .force("x", d3.forceX(d => d.x0).strength(0.2))
    .force("y", d3.forceY(d => d.y0).strength(0.2))
    .force("collide", d3.forceCollide(d => d.r + 1).iterations(3))
    .stop();
  for (let i = 0; i < 300; i++) sim.tick();

  // 浅灰底图作为地理参照
  svg.append("g")
    .selectAll("path")
    .data(geo.features)
    .join("path")
    .attr("d", path)
    .attr("fill", "#eeeeee")
    .attr("stroke", "white")
    .attr("stroke-width", 0.5);

  // 大的圆先画，小的圆在上面，避免被挡住
  nodes.sort((a, b) => b.r - a.r);

  const node = svg.append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("transform", d => `translate(${d.x},${d.y})`);

  node.append("circle")
    .attr("class", "bubble")
    .attr("data-iso", d => d.iso3)
    .attr("r", d => d.r)
    .attr("fill", "#3a6ea5")
    .attr("fill-opacity", 0.85)
    .attr("stroke", "white")
    .attr("stroke-width", 1)
    .on("mouseover", (event, d) => {
      highlight(d.iso3);
      showTip(event, d.country, d.gdp, d.rank);
    })
    .on("mousemove", moveTip)
    .on("mouseout", () => {
      highlight(null);
      hideTip();
    });

  node.filter(d => d.r > 14)
    .append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("fill", "white")
    .attr("font-size", d => Math.min(d.r / 2, 16))
    .attr("pointer-events", "none")
    .text(d => d.iso3);

  // 标题
  svg.append("text")
    .attr("x", 20).attr("y", 28)
    .attr("font-size", 18).attr("font-weight", "bold")
    .text("2025 Nominal GDP Cartogram: circle area = GDP");

  // 面积图例：同心圆，放在南太平洋空白处，避免挡住南美
  const refs = [20000, 5000, 1000];
  const lx = 75, ly = H - 25;
  const sl = svg.append("g");
  sl.append("text")
    .attr("x", lx - r(20000)).attr("y", ly - 2 * r(20000) - 10)
    .attr("font-size", 12).text("GDP (circle area)");
  refs.forEach(v => {
    sl.append("circle")
      .attr("cx", lx).attr("cy", ly - r(v)).attr("r", r(v))
      .attr("fill", "none").attr("stroke", "#555");
    sl.append("line")
      .attr("x1", lx).attr("x2", lx + r(20000) + 12)
      .attr("y1", ly - 2 * r(v)).attr("y2", ly - 2 * r(v))
      .attr("stroke", "#999").attr("stroke-dasharray", "2,2");
    sl.append("text")
      .attr("x", lx + r(20000) + 15).attr("y", ly - 2 * r(v))
      .attr("dy", "0.35em").attr("font-size", 11)
      .text(`$${v / 1000}T`);
  });
}