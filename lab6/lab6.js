const statusColor = d3.scaleOrdinal()
  .domain(["Increase", "Unchanged", "Decrease"])
  .range(["#3d8b7d", "#c4c4c4", "#d9694a"]);   // 青绿 / 灰 / 珊瑚橙，柔和且色盲友好

const textColor = status => status === "Unchanged" ? "#333" : "white";
const fmt = d3.format(",");
const tooltip = d3.select("#tooltip");

d3.json("../data/lab6_assignment_gdp.json").then(data => {
  drawLegend();
  drawTreemap("#treemap-squarify", data, d3.treemapSquarify);
  drawTreemap("#treemap-slicedice", data, d3.treemapSliceDice);
});

function drawTreemap(selector, data, tileMethod) {
  const width = 960, height = 600;

  const root = d3.hierarchy(data)
    .sum(d => d.gdp || 0)
    .sort((a, b) => b.value - a.value);

  d3.treemap()
    .tile(tileMethod)
    .size([width, height])
    .paddingInner(d => d.depth === 0 ? 6 : d.depth === 1 ? 4 : 2)
    .paddingOuter(d => d.depth === 1 ? 4 : 0)
    .paddingTop(d => d.depth === 1 ? 24 : d.depth === 2 ? 16 : 0)
    (root);

  const svg = d3.select(selector)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`);

  // ---- 洲：浅色底块 + 粗体标题，不描边 ----
  const continents = svg.selectAll("g.continent")
    .data(root.children)
    .join("g")
    .attr("transform", d => `translate(${d.x0},${d.y0})`);

  continents.append("rect")
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0)
    .attr("rx", 6)
    .attr("fill", "#efede6");

  continents.append("text")
    .attr("x", 6).attr("y", 17)
    .attr("font-size", 13).attr("font-weight", 700)
    .text(d => d.data.name)
    .call(fitText, d => d.x1 - d.x0 - 10);

  // ---- 区域：只有灰色小标题 ----
  const areas = svg.selectAll("g.area")
    .data(root.descendants().filter(d => d.depth === 2))
    .join("g")
    .attr("transform", d => `translate(${d.x0},${d.y0})`);

  areas.append("rect")   // 透明底，用来接收 hover
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0)
    .attr("fill", "transparent");

  areas.append("text")
    .attr("x", 2).attr("y", 11)
    .attr("font-size", 10).attr("fill", "#777")
    .text(d => d.data.name)
    .call(fitText, d => d.x1 - d.x0 - 4);

  // 细条洲/区域的名字放不下，就靠 hover 看
  continents.on("mouseover", (e, d) => showTip(e, `<strong>${d.data.name}</strong><br>Total GDP: $${fmt(d.value)}B`));
  areas.on("mouseover", (e, d) => showTip(e, `<strong>${d.data.name}</strong> (${d.parent.data.name})<br>Total GDP: $${fmt(d.value)}B`));
  svg.selectAll("g.continent, g.area")
    .attr("class", function () { return this.getAttribute("class"); });
  continents.merge(areas)
    .on("mousemove", moveTip)
    .on("mouseout", hideTip);

  // ---- 国家：面积 = GDP，颜色 = status ----
  const leaves = svg.selectAll("g.leaf")
    .data(root.leaves())
    .join("g")
    .attr("transform", d => `translate(${d.x0},${d.y0})`)
    .style("cursor", "pointer");

  leaves.append("rect")
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0)
    .attr("rx", 3)
    .attr("fill", d => statusColor(d.data.status));

  // 国家名：宽 > 40 且高 > 18 才显示
  leaves.filter(d => d.x1 - d.x0 > 40 && d.y1 - d.y0 > 18)
    .append("text")
    .attr("x", 6).attr("y", 16)
    .attr("font-size", 12).attr("font-weight", 600)
    .attr("fill", d => textColor(d.data.status))
    .text(d => d.data.name)
    .call(fitText, d => d.x1 - d.x0 - 10);

  // GDP 数值：再高一点才显示
  leaves.filter(d => d.x1 - d.x0 > 50 && d.y1 - d.y0 > 36)
    .append("text")
    .attr("x", 6).attr("y", 31)
    .attr("font-size", 11)
    .attr("fill", d => textColor(d.data.status))
    .attr("opacity", 0.85)
    .text(d => `$${fmt(d.data.gdp)}B`)
    .call(fitText, d => d.x1 - d.x0 - 10);

  leaves
    .on("mouseover", function (event, d) {
      d3.select(this).select("rect").attr("stroke", "#222").attr("stroke-width", 2);
      showTip(event, `
        <strong>${d.data.name}</strong><br>
        Continent: ${d.parent.parent.data.name}<br>
        Area: ${d.parent.data.name}<br>
        GDP: $${fmt(d.data.gdp)} billion<br>
        Status: ${d.data.status}`);
    })
    .on("mousemove", moveTip)
    .on("mouseout", function () {
      d3.select(this).select("rect").attr("stroke", null);
      hideTip();
    });
}

// 文字太长就截断加 "…"，太窄就干脆不显示
function fitText(selection, maxWidth) {
  selection.each(function (d) {
    const el = d3.select(this);
    const max = maxWidth(d);
    let s = el.text();
    while (s.length > 0 && this.getComputedTextLength() > max) {
      s = s.slice(0, -1);
      el.text(s + "…");
    }
    if (s.length < 3) el.text("");
  });
}

function showTip(event, html) {
  tooltip.style("opacity", 1).html(html);
  moveTip(event);
}
function moveTip(event) {
  tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
}
function hideTip() { tooltip.style("opacity", 0); }

function drawLegend() {
  const items = d3.select("#legend")
    .selectAll("div")
    .data(statusColor.domain())
    .join("div");
  items.append("span").attr("class", "swatch").style("background", d => statusColor(d));
  items.append("span").text(d => `GDP ${d}`);
}