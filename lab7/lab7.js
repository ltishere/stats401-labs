const width = 1000, height = 620;
const fmtMoney = d3.format(",");
const tooltip = d3.select("#tooltip");

let nodes = [];          // 只建一次，全程复用
let nodeById = new Map();
let transactions = [];
let simulation, linkGroup, nodeGroup;
let sectorColor, regionDash, sizeScale, widthScale;

Promise.all([
  d3.csv("../data/lab7_assignment_companies.csv"),
  d3.csv("../data/lab7_assignment_transactions_60days.csv", d => ({
    date: d.date,
    day: +d.day,
    sourceId: d.source,
    targetId: d.target,
    amount: +d.amount_usd,
    type: d.transaction_type,
    count: +d.transaction_count
  }))
]).then(([companies, tx]) => {
  transactions = tx;

  // ---- 节点：整个生命周期只创建这一次 ----
  nodes = companies.map((c, i) => ({
    id: c.id,
    name: c.company_name,
    sector: c.sector,
    region: c.region,
    volume: 0,                             // 当天交易额，每帧更新
    // 给一个环形初始位置，避免开局全挤在中心
    x: width / 2 + 220 * Math.cos(i / companies.length * 2 * Math.PI),
    y: height / 2 + 220 * Math.sin(i / companies.length * 2 * Math.PI)
  }));
  nodeById = new Map(nodes.map(n => [n.id, n]));

  // ---- 比例尺 ----
  const sectors = [...new Set(nodes.map(d => d.sector))].sort();
  const regions = [...new Set(nodes.map(d => d.region))].sort();

  sectorColor = d3.scaleOrdinal().domain(sectors).range(d3.schemeTableau10);
  regionDash = d3.scaleOrdinal().domain(["Asia", "North America", "Europe"]).range(["none", "4,2", "1,2"]);

  sizeScale = d3.scaleSqrt()                // 面积正比于金额，用 sqrt
    .domain([0, d3.max(transactions, d => d.amount) * 2])
    .range([7, 30]);

  widthScale = d3.scaleLinear()
    .domain(d3.extent(transactions, d => d.amount))
    .range([2, 7]);

  buildSvg();
  buildLegend(sectors, regions);
  showDay(1);
});

function buildSvg() {
  const svg = d3.select("#network")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`);

  linkGroup = svg.append("g");   // 先建 link 组，保证线在点下面
  nodeGroup = svg.append("g");

  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink([]).id(d => d.id).distance(110).strength(0.35))
    .force("charge", d3.forceManyBody().strength(-260))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("x", d3.forceX(width / 2).strength(0.06))     // 新增：往中间收
    .force("y", d3.forceY(height / 2).strength(0.06))    // 新增
    .force("collide", d3.forceCollide().radius(d => sizeScale(d.volume) + 8))
    .on("tick", ticked);

  // 节点只 join 一次（12 个点，永不增删）
  const g = nodeGroup.selectAll("g")
    .data(nodes, d => d.id)
    .join("g")
    .style("cursor", "grab")
    .call(d3.drag()
      .on("start", (e, d) => {
        if (!e.active) simulation.alphaTarget(0.25).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on("end", (e, d) => {
        if (!e.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      }));

  g.append("circle")
    .attr("fill", d => sectorColor(d.sector))
    .attr("stroke", "#333")
    .attr("stroke-width", 1.8)
    .attr("stroke-dasharray", d => regionDash(d.region));

  g.append("text")
    .attr("text-anchor", "middle")
    .attr("font-size", 10)
    .attr("font-weight", 600)
    .attr("fill", "#333")
    .attr("paint-order", "stroke")
    .attr("stroke", "white")
    .attr("stroke-width", 3)
    .text(d => d.name);

  g.on("mouseover", (event, d) => {
      tooltip.style("opacity", 1).html(`
        <strong>${d.name}</strong><br>
        Sector: ${d.sector}<br>
        Region: ${d.region}<br>
        Volume today: $${fmtMoney(Math.round(d.volume))}`);
    })
    .on("mousemove", moveTip)
    .on("mouseout", () => tooltip.style("opacity", 0));
}

function ticked() {
  linkGroup.selectAll("line")
    .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x).attr("y2", d => d.target.y);

  nodeGroup.selectAll("g")
    .attr("transform", d => `translate(${d.x},${d.y})`);

  nodeGroup.selectAll("text")
    .attr("dy", d => sizeScale(d.volume) + 13);
}

// ====== 画某一天 ======
function showDay(day) {
  const dayLinks = transactions
    .filter(d => d.day === day)
    .map(d => ({                              // 每帧新建 link 对象（links 本来就在变）
      ...d,
      source: d.sourceId,
      target: d.targetId
    }));

  // 1. 更新节点当天交易额
  nodes.forEach(n => { n.volume = 0; });
  dayLinks.forEach(l => {
    nodeById.get(l.sourceId).volume += l.amount;
    nodeById.get(l.targetId).volume += l.amount;
  });
  const activeIds = new Set(dayLinks.flatMap(d => [d.sourceId, d.targetId]));

  nodeGroup.selectAll("circle")
    .transition().duration(400)
    .attr("r", d => sizeScale(d.volume))
    .attr("opacity", d => activeIds.has(d.id) ? 1 : 0.28)
    .attr("stroke-width", d => activeIds.has(d.id) ? 2.6 : 1.2);

  nodeGroup.selectAll("text")
    .transition().duration(400)
    .attr("opacity", d => activeIds.has(d.id) ? 1 : 0.3);

  // 2. 更新 links：有 key 的 join，淡入淡出
  linkGroup.selectAll("line")
    .data(dayLinks, d => `${d.sourceId}-${d.targetId}`)
    .join(
      enter => enter.append("line")
        .attr("stroke", "#e07a4a")            // 新出现的先高亮
        .attr("stroke-opacity", 0)
        .attr("stroke-width", d => widthScale(d.amount))
        .attr("stroke-dasharray", d =>
          nodeById.get(d.sourceId).region !== nodeById.get(d.targetId).region ? "5,3" : "none")
        .call(e => e.transition().duration(400)
          .attr("stroke-opacity", 0.75)
          .transition().duration(600)
          .attr("stroke", "#7a8a99")),        // 再褪成普通色
      update => update,
      exit => exit.transition().duration(400)
        .attr("stroke-opacity", 0).remove()
    );

  linkGroup.selectAll("line")
    .on("mouseover", (event, d) => {
      tooltip.style("opacity", 1).html(`
        <strong>${nodeById.get(d.sourceId).name} ↔ ${nodeById.get(d.targetId).name}</strong><br>
        Amount: $${fmtMoney(d.amount)}<br>
        Type: ${d.type}<br>
        Transactions: ${d.count}<br>
        ${nodeById.get(d.sourceId).region} → ${nodeById.get(d.targetId).region}`);
    })
    .on("mousemove", moveTip)
    .on("mouseout", () => tooltip.style("opacity", 0));    
  // 3. 喂给 simulation，温和重启（不是重建）
  simulation.force("link").links(linkGroup.selectAll("line").data());
  simulation.force("collide").radius(d => sizeScale(d.volume) + 8);
  simulation.alpha(0.3).restart();

  // 4. 更新统计
  const totalValue = d3.sum(dayLinks, d => d.amount);
  const crossCount = dayLinks.filter(d =>
    nodeById.get(d.sourceId).region !== nodeById.get(d.targetId).region).length;

  d3.select("#day-label").text(`Day ${day}${dayLinks[0] ? " · " + dayLinks[0].date : ""}`);
  d3.select("#stat-companies").text(activeIds.size);
  d3.select("#stat-links").text(dayLinks.length);
  d3.select("#stat-value").text("$" + fmtMoney(Math.round(totalValue)));
  d3.select("#stat-cross").text(
    dayLinks.length ? Math.round(crossCount / dayLinks.length * 100) + "%" : "0%");
  d3.select("#time-slider").property("value", day);
}

function moveTip(event) {
  tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
}

function buildLegend(sectors, regions) {
  const legend = d3.select("#legend");
  legend.html("");

  const s = legend.append("div").style("display", "flex").style("gap", "14px").style("flex-wrap", "wrap");
  s.append("strong").text("Sector:");
  s.selectAll("div.item").data(sectors).join("div").attr("class", "item")
    .html(d => `<span class="swatch" style="background:${sectorColor(d)}"></span>${d}`);

  const r = legend.append("div").style("display", "flex").style("gap", "14px").style("flex-wrap", "wrap").style("align-items", "center").style("width", "100%");
  r.append("strong").text("Region (node outline):");
  r.selectAll("div.item").data(regions).join("div").attr("class", "item")
    .html(d => `<svg width="16" height="16"><circle cx="8" cy="8" r="6" fill="none"
      stroke="#333" stroke-width="2" stroke-dasharray="${regionDash(d)}"/></svg>${d}`);

  legend.append("div").style("width", "100%").style("color", "#777").style("font-size", "12px")
    .html("Node size = daily volume · Faded node = inactive today · "
        + "Link width = amount · Dashed link = cross-region · Orange flash = new link");
}

// ====== 播放控制 ======
let currentDay = 1;
let timer = null;
const MAX_DAY = 60;

function play() {
  if (timer) return;                       // 防止重复点 Play 叠加多个 timer
  if (currentDay >= MAX_DAY) currentDay = 1;   // 播完后再点等于重播

  timer = d3.interval(() => {
    showDay(currentDay);
    currentDay += 1;
    if (currentDay > MAX_DAY) {
      currentDay = MAX_DAY;
      pause();
    }
  }, 700);                                 // 每天 700ms，力导向图需要时间稳定
}

function pause() {
  if (timer) { timer.stop(); timer = null; }
}

function reset() {
  pause();
  currentDay = 1;
  showDay(1);
}

d3.select("#play").on("click", play);
d3.select("#pause").on("click", pause);
d3.select("#reset").on("click", reset);

d3.select("#time-slider").on("input", function () {
  pause();                                 // 手动拖动时自动暂停
  currentDay = +this.value;
  showDay(currentDay);
});

// 键盘：空格播放/暂停，左右箭头逐天
d3.select("body").on("keydown", event => {
  if (event.key === " ") { event.preventDefault(); timer ? pause() : play(); }
  if (event.key === "ArrowRight" && currentDay < MAX_DAY) { pause(); currentDay++; showDay(currentDay); }
  if (event.key === "ArrowLeft" && currentDay > 1) { pause(); currentDay--; showDay(currentDay); }
});