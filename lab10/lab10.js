/* =====================================================================
   Lab 10 — Novel interaction on top of the Lab 7 temporal network
   结构：
   (1) Lab 7 原有的网络图（基本不动，只加了几个 hook）
   (2) 与输入方式无关的“可视化命令”层：goToDay / filterRegion / highlightCompany …
   (3) 三种输入都只调用 (2)：鼠标/键盘（fallback）、语音、手势
   ===================================================================== */

const width = 1000, height = 620;
const fmtMoney = d3.format(",");
const tooltip = d3.select("#tooltip");

let nodes = [];          // 只建一次，全程复用
let nodeById = new Map();
let transactions = [];
let currentLinks = [];   // LAB10: 当前这一天的 links，highlight 时要用
let simulation, linkGroup, nodeGroup;
let sectorColor, regionDash, sizeScale, widthScale;

// 播放状态（提前声明）
let currentDay = 1;      // LAB10: 始终等于“屏幕上正在显示的那一天”
let timer = null;
let playSpeed = 700;     // ms / day，语音 "faster" / "slower" 可调
const MAX_DAY = 60;

// LAB10: 焦点状态 —— region 过滤或 company 高亮
let focus = { type: null, value: null };

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

  nodes = companies.map((c, i) => ({
    id: c.id,
    name: c.company_name,
    sector: c.sector,
    region: c.region,
    volume: 0,
    x: width / 2 + 220 * Math.cos(i / companies.length * 2 * Math.PI),
    y: height / 2 + 220 * Math.sin(i / companies.length * 2 * Math.PI)
  }));
  nodeById = new Map(nodes.map(n => [n.id, n]));

  const sectors = [...new Set(nodes.map(d => d.sector))].sort();
  const regions = [...new Set(nodes.map(d => d.region))].sort();

  sectorColor = d3.scaleOrdinal().domain(sectors).range(d3.schemeTableau10);
  regionDash = d3.scaleOrdinal().domain(["Asia", "North America", "Europe"]).range(["none", "4,2", "1,2"]);

  sizeScale = d3.scaleSqrt()
    .domain([0, d3.max(transactions, d => d.amount) * 2])
    .range([7, 30]);

  widthScale = d3.scaleLinear()
    .domain(d3.extent(transactions, d => d.amount))
    .range([2, 7]);

  buildSvg();
  buildLegend(sectors, regions);
  initFocusControls(regions);   // LAB10
  showDay(1);
});

/* ===================== (1) Lab 7 network ===================== */

function buildSvg() {
  const svg = d3.select("#network")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`);

  linkGroup = svg.append("g");
  nodeGroup = svg.append("g");

  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink([]).id(d => d.id).distance(110).strength(0.35))
    .force("charge", d3.forceManyBody().strength(-260))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("x", d3.forceX(width / 2).strength(0.06))
    .force("y", d3.forceY(height / 2).strength(0.06))
    .force("collide", d3.forceCollide().radius(d => sizeScale(d.volume) + 8))
    .on("tick", ticked);

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
    .on("mouseout", () => tooltip.style("opacity", 0))
    // LAB10: 点击节点 = 鼠标版的 "highlight <company>"
    .on("click", (event, d) => {
      if (event.defaultPrevented) return;          // 拖拽结束不算点击
      const desc = focus.type === "company" && focus.value === d.id
        ? clearFocus() : highlightCompany(d.id);
      logAction("Mouse", `click ${d.name}`, desc);
    });
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

function showDay(day) {
  currentDay = day;                                // LAB10
  const dayLinks = transactions
    .filter(d => d.day === day)
    .map(d => ({ ...d, source: d.sourceId, target: d.targetId }));
  currentLinks = dayLinks;                         // LAB10

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

  linkGroup.selectAll("line")
    .data(dayLinks, d => `${d.sourceId}-${d.targetId}`)
    .join(
      enter => enter.append("line")
        .attr("stroke", "#e07a4a")
        .attr("stroke-opacity", 0)
        .attr("stroke-width", d => widthScale(d.amount))
        .attr("stroke-dasharray", d =>
          nodeById.get(d.sourceId).region !== nodeById.get(d.targetId).region ? "5,3" : "none")
        .call(e => e.transition().duration(400)
          .attr("stroke-opacity", 0.75)
          .transition().duration(600)
          .attr("stroke", "#7a8a99")),
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

  simulation.force("link").links(linkGroup.selectAll("line").data());
  simulation.force("collide").radius(d => sizeScale(d.volume) + 8);
  simulation.alpha(0.3).restart();

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

  applyFocus();                                    // LAB10: 换天后保持焦点
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
        + "Link width = amount · Dashed link = cross-region · Orange flash = new link · "
        + "Orange ring = highlighted company");
}

/* ===================== (2) 可视化命令层（与输入方式无关） =====================
   每个函数都返回一句人类可读的描述，用于反馈面板。                              */

function play() {
  if (timer) return "Already playing";
  if (currentDay >= MAX_DAY) showDay(1);           // 播完再 play = 从头播
  timer = d3.interval(() => {
    if (currentDay >= MAX_DAY) { pause(); return; }
    showDay(currentDay + 1);
  }, playSpeed);
  updatePlayButtons();
  return "Playing";
}

function pause() {
  if (timer) { timer.stop(); timer = null; }
  updatePlayButtons();
  return `Paused on day ${currentDay}`;
}

function reset() {
  pause();
  clearFocus();
  showDay(1);
  return "Reset to day 1";
}

function goToDay(n) {
  pause();
  const day = Math.max(1, Math.min(MAX_DAY, Math.round(n)));
  showDay(day);
  return `Jumped to day ${day}`;
}

function stepDay(delta) {
  pause();
  const day = Math.max(1, Math.min(MAX_DAY, currentDay + delta));
  if (day === currentDay) return delta > 0 ? "Already at day 60" : "Already at day 1";
  showDay(day);
  return delta > 0 ? `Next → day ${day}` : `Previous → day ${day}`;
}

function setSpeed(factor) {
  playSpeed = Math.max(200, Math.min(2000, Math.round(playSpeed * factor)));
  if (timer) { timer.stop(); timer = null; play(); }   // 正在播则用新速度重启
  return `Speed: ${(1000 / playSpeed).toFixed(1)} days/s`;
}

function filterRegion(region) {
  focus = { type: "region", value: region };
  applyFocus();
  return `Showing ${region}`;
}

function highlightCompany(id) {
  focus = { type: "company", value: id };
  applyFocus();
  return `Highlighting ${nodeById.get(id).name}`;
}

function clearFocus() {
  focus = { type: null, value: null };
  applyFocus();
  return "Showing all companies";
}

// 根据 focus 调整透明度。用命名 transition("focus")，不打断 Lab 7 原有的淡入淡出动画。
function applyFocus() {
  if (!nodeGroup) return;
  const partners = new Set();
  if (focus.type === "company") {
    currentLinks.forEach(l => {
      if (l.sourceId === focus.value) partners.add(l.targetId);
      if (l.targetId === focus.value) partners.add(l.sourceId);
    });
  }

  const nodeIn = d => {
    if (!focus.type) return true;
    if (focus.type === "region") return d.region === focus.value;
    return d.id === focus.value || partners.has(d.id);
  };
  const linkIn = d => {
    if (!focus.type) return true;
    if (focus.type === "region")
      return nodeById.get(d.sourceId).region === focus.value || nodeById.get(d.targetId).region === focus.value;
    return d.sourceId === focus.value || d.targetId === focus.value;
  };

  nodeGroup.selectAll("g")
    .transition("focus").duration(300)
    .style("opacity", d => nodeIn(d) ? 1 : 0.12);

  nodeGroup.selectAll("circle")
    .style("stroke", d => focus.type === "company" && d.id === focus.value ? "#e07a4a" : null)
    .style("stroke-width", d => focus.type === "company" && d.id === focus.value ? "5px" : null);

  linkGroup.selectAll("line")
    .transition("focus").duration(300)
    .style("opacity", d => linkIn(d) ? 1 : 0.07);

  // 同步 fallback 控件与标签
  let label = "None";
  if (focus.type === "region") label = `Region: ${focus.value}`;
  if (focus.type === "company") label = `${nodeById.get(focus.value).name} (${partners.size} partner${partners.size === 1 ? "" : "s"} today)`;
  d3.select("#focus-label").text(label);
  d3.select("#region-select").property("value", focus.type === "region" ? focus.value : "");
  d3.select("#company-select").property("value", focus.type === "company" ? focus.value : "");
}

function updatePlayButtons() {
  d3.select("#play").classed("active", !!timer);
}

/* ===================== (3a) 常规输入：鼠标 / 键盘（fallback） ===================== */

function initFocusControls(regions) {
  d3.select("#region-select").selectAll("option.r").data(regions).join("option")
    .attr("class", "r").attr("value", d => d).text(d => d);
  d3.select("#company-select").selectAll("option.c")
    .data([...nodes].sort((a, b) => d3.ascending(a.name, b.name))).join("option")
    .attr("class", "c").attr("value", d => d.id).text(d => d.name);

  d3.select("#region-select").on("change", function () {
    const desc = this.value ? filterRegion(this.value) : clearFocus();
    logAction("Mouse", "region menu", desc);
  });
  d3.select("#company-select").on("change", function () {
    const desc = this.value ? highlightCompany(this.value) : clearFocus();
    logAction("Mouse", "company menu", desc);
  });
}

d3.select("#play").on("click", () => logAction("Mouse", "Play button", play()));
d3.select("#pause").on("click", () => logAction("Mouse", "Pause button", pause()));
d3.select("#reset").on("click", () => logAction("Mouse", "Reset button", reset()));
d3.select("#clear-focus").on("click", () => logAction("Mouse", "Clear focus", clearFocus()));

d3.select("#time-slider").on("input", function () {
  pause();
  showDay(+this.value);
});

d3.select("body").on("keydown", event => {
  // 焦点在按钮/滑块/下拉框上时交给浏览器默认行为，避免重复触发
  if (["INPUT", "SELECT", "BUTTON", "TEXTAREA"].includes(event.target.tagName)) return;
  if (event.key === " ") { event.preventDefault(); timer ? pause() : play(); }
  if (event.key === "ArrowRight") stepDay(1);
  if (event.key === "ArrowLeft") stepDay(-1);
  if (event.key === "Escape") clearFocus();
});

/* ===================== 反馈：动作日志 + 图上提示 ===================== */

const logEntries = [];
let toastTimer = null;

function logAction(source, input, action) {
  logEntries.unshift({ source, input, action });
  logEntries.length = Math.min(logEntries.length, 6);
  d3.select("#log").selectAll("li").data(logEntries).join("li")
    .html(d => `<span class="src ${d.source}">${d.source}</span> ${d.input} → <strong>${d.action}</strong>`);

  if (source !== "Mouse") {   // 鼠标操作本身就有直接反馈，不需要 toast
    const icon = source === "Voice" ? "🎤" : "✋";
    const toast = d3.select("#toast").text(`${icon} ${action}`).classed("show", true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classed("show", false), 1400);
  }
}

/* ===================== (3b) 语音输入 ===================== */

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let voiceOn = false;

function setVoice(field, text) { d3.select(`#voice-${field}`).text(text); }

if (!SpeechRecognition) {
  d3.select("#voice-button").attr("disabled", true);
  setVoice("state", "Not supported here — use Chrome or Edge");
} else {
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = true;       // 打开后持续监听，直到再次点击按钮
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;     // 多拿几个候选，提高公司名命中率

  recognition.onresult = event => {
    const result = event.results[event.results.length - 1];
    const alts = Array.from(result).map(a => a.transcript.toLowerCase().trim());
    handleVoiceCommand(alts);
  };

  recognition.onerror = event => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      voiceOn = false;
      updateVoiceButton();
      setVoice("state", "Microphone blocked — use the buttons instead");
    } else if (event.error !== "no-speech" && event.error !== "aborted") {
      setVoice("state", `Error: ${event.error}`);
    }
  };

  // continuous 模式下浏览器仍会定期自动结束，开着就自动重启
  recognition.onend = () => {
    if (voiceOn) {
      try { recognition.start(); } catch (_) { /* 已在运行 */ }
    } else {
      setVoice("state", "Inactive");
    }
  };

  d3.select("#voice-button").on("click", () => {
    voiceOn = !voiceOn;
    if (voiceOn) {
      try { recognition.start(); } catch (_) {}
      setVoice("state", "Listening…");
    } else {
      recognition.stop();
      setVoice("state", "Inactive");
    }
    updateVoiceButton();
  });
}

function updateVoiceButton() {
  d3.select("#voice-button")
    .classed("active", voiceOn)
    .text(voiceOn ? "Stop Voice Control" : "Start Voice Control");
}

function handleVoiceCommand(alternatives) {
  setVoice("heard", `“${alternatives[0]}”`);
  for (const text of alternatives) {
    const cmd = parseVoice(text);
    if (cmd) {
      if (text !== alternatives[0]) setVoice("heard", `“${text}”`);
      const desc = cmd();
      setVoice("action", desc);
      logAction("Voice", `“${text}”`, desc);
      return;
    }
  }
  setVoice("action", "Not recognized — try “day 30”, “next”, “show Asia”");
  d3.select("#voice-help").style("color", "#b5532a")
    .transition().delay(1500).duration(600).style("color", "#777");
}

// 把一句话翻译成一个命令（返回无参函数），不认识就返回 null
function parseVoice(raw) {
  const t = raw.replace(/[.,!?']/g, "").replace(/\s+/g, " ");
  const has = re => re.test(t);

  if (has(/\b(help|what can i say)\b/)) return () => {
    d3.select("#voice-help").style("color", "#b5532a")
      .transition().delay(2500).duration(600).style("color", "#777");
    return "Showing available commands";
  };

  // 焦点类
  if (has(/\b(show all|show everything|all regions|clear|everything|unhighlight)\b/)) return clearFocus;
  for (const region of ["North America", "Europe", "Asia"]) {
    if (t.includes(region.toLowerCase()) || (region === "North America" && has(/\bamerica\b/)))
      return () => filterRegion(region);
  }
  const company = matchCompany(t);
  if (company) return () => highlightCompany(company.id);

  // 时间类（next/previous 必须在 "day N" 之前判断，因为 "next day" 也含 day）
  if (has(/\b(next|forward)\b/)) return () => stepDay(1);
  if (has(/\b(previous|back|last one|go back)\b/)) return () => stepDay(-1);
  if (has(/\bfirst day\b/)) return () => goToDay(1);
  if (has(/\blast day\b/)) return () => goToDay(MAX_DAY);
  const m = t.match(/\bday\s+(.+)/);
  if (m) {
    const n = parseNumber(m[1]);
    if (n !== null && n >= 1 && n <= MAX_DAY) return () => goToDay(n);
  }
  const bare = t.match(/^(?:go to )?(\d{1,2})$/);   // 只说一个数字 "42"
  if (bare && +bare[1] >= 1 && +bare[1] <= MAX_DAY) return () => goToDay(+bare[1]);

  // 播放类
  if (has(/\b(reset|restart|start over)\b/)) return reset;
  if (has(/\b(pause|stop|wait|hold)\b/)) return pause;
  if (has(/\b(play|start|go|resume|continue)\b/)) return play;
  if (has(/\b(faster|speed up)\b/)) return () => setSpeed(0.6);
  if (has(/\b(slower|slow down)\b/)) return () => setSpeed(1 / 0.6);

  return null;
}

// 公司名匹配：完整名字（去空格）或第一个词。"blue river" 也能匹配 "BlueRiver Logistics"
function matchCompany(text) {
  const norm = s => s.toLowerCase().replace(/[^a-z]/g, "");
  const textNorm = norm(text);
  const words = new Set(text.split(" ").map(norm));
  for (const n of nodes) {
    const full = norm(n.name);
    const first = norm(n.name.split(" ")[0]);
    if (textNorm.includes(full)) return n;
    if (words.has(first)) return n;                          // 短名字（如 "ion"）按整词匹配
    if (first.length >= 5 && textNorm.includes(first)) return n;  // 长名字允许被识别成两个词
  }
  return null;
}

const SMALL = { one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6,
  seven: 7, eight: 8, ate: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60 };

function parseNumber(s) {
  const digits = s.match(/\d+/);
  if (digits) return +digits[0];
  let total = null;
  for (const w of s.split(/[\s-]+/)) {
    if (w in TENS) total = (total || 0) + TENS[w];
    else if (w in SMALL) { total = (total || 0) + SMALL[w]; break; }
    else if (total !== null) break;
  }
  return total;
}

/* ===================== (3c) 摄像头手势输入（MediaPipe Gesture Recognizer） ===================== */

const MP_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const GESTURE_MODEL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

const video = document.getElementById("camera");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");

let recognizer = null;
let stream = null;
let cameraOn = false;
let rafId = null;
let lastVideoTime = -1;

// 手势状态机参数
// v2：实测后放宽 —— 原来挥手太快/太慢都识别不到，手稍微一动静态手势就中断
const SWIPE_WINDOW = 800;     // ms：慢一点的挥手也算（原 450）
const SWIPE_DIST = 0.18;      // 横向移动超过画面宽度 18% 即算挥手（原 25%）
const RETURN_BLOCK = 1500;    // 挥完手往回收的动作，1.5 s 内不算反方向挥手
const STILL_RANGE = 0.08;     // 静态手势允许的晃动幅度（原 0.04）
const HOLD_TIME = 500;        // 静态手势需保持 0.5 s
const GRACE = 300;            // 识别结果短暂丢失 < 0.3 s 不打断计时
const MIN_SCORE = 0.5;        // 手势置信度门槛（原 0.6）
const COOLDOWN = 900;         // 任何手势触发后的冷却时间
let history = [];             // [{t, x}] 手掌中心横坐标（已镜像）
let holdLabel = null, holdStart = 0, lastGood = 0;
let latched = null, latchLostSince = null;   // 刚触发过的静态手势：确实换了手势才能再触发
let lastSwipe = { dir: 0, t: -Infinity };
let blockedUntil = 0;

// 手势 → 命令（与语音、按钮共用同一组函数）
const GESTURE_ACTIONS = {
  Swipe_Right: { name: "Swipe right →", run: () => stepDay(1) },
  Swipe_Left:  { name: "← Swipe left",  run: () => stepDay(-1) },
  Open_Palm:   { name: "✋ Open palm",   run: play },
  Closed_Fist: { name: "✊ Fist",        run: pause },
  Victory:     { name: "✌️ Victory",     run: reset }
};

function setCam(field, text) { d3.select(`#${field}`).text(text); }

d3.select("#camera-start").on("click", startCamera);
d3.select("#camera-stop").on("click", stopCamera);

async function startCamera() {
  if (cameraOn) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setCam("camera-state", "Camera not available (needs https or localhost)");
    return;
  }
  d3.select("#camera-start").attr("disabled", true);
  setCam("camera-state", "Waiting for permission…");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
  } catch (err) {
    setCam("camera-state", err.name === "NotAllowedError"
      ? "Permission denied — use buttons/keyboard" : `Camera error: ${err.message}`);
    d3.select("#camera-start").attr("disabled", null);
    return;
  }
  video.srcObject = stream;
  await video.play();
  cameraOn = true;
  d3.select("#cam-box").classed("on", true);
  d3.select("#camera-stop").attr("disabled", null);

  if (!recognizer) {
    setCam("camera-state", "Loading hand model (first time only)…");
    try {
      recognizer = await createRecognizer();
    } catch (err) {
      setCam("camera-state", `Model failed to load: ${err.message}`);
      stopCamera();
      return;
    }
  }
  if (!cameraOn) return;          // 加载期间用户点了 Stop
  setCam("camera-state", "On — show one hand");
  loop();
}

async function createRecognizer() {
  // 只在用户启动摄像头后才下载 MediaPipe，页面平时不加载
  const { FilesetResolver, GestureRecognizer } = await import(`${MP_BASE}/vision_bundle.mjs`);
  const fileset = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
  const options = delegate => ({
    baseOptions: { modelAssetPath: GESTURE_MODEL, delegate },
    runningMode: "VIDEO",
    numHands: 1
  });
  try {
    return await GestureRecognizer.createFromOptions(fileset, options("GPU"));
  } catch (_) {
    return await GestureRecognizer.createFromOptions(fileset, options("CPU"));  // 没有 WebGL 时退回 CPU
  }
}

function stopCamera() {
  cameraOn = false;
  cancelAnimationFrame(rafId);
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  video.srcObject = null;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  d3.select("#cam-box").classed("on", false);
  d3.select("#camera-start").attr("disabled", null);
  d3.select("#camera-stop").attr("disabled", true);
  d3.select("#hold-bar").style("width", "0%");
  history = []; holdLabel = null; latched = null;
  setCam("camera-state", "Off");
  setCam("gesture-detected", "—");
}

function loop() {
  if (!cameraOn) return;
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = recognizer.recognizeForVideo(video, performance.now());
    processHand(result);
  }
  rafId = requestAnimationFrame(loop);
}

function processHand(result) {
  const hand = result.landmarks && result.landmarks[0];
  drawHand(hand);
  const now = performance.now();

  if (!hand) {
    history = []; holdLabel = null; latched = null;
    d3.select("#hold-bar").style("width", "0%");
    setCam("gesture-detected", "No hand");
    return;
  }

  // 手掌中心 = 手腕 + 四个指根的平均；1 - x 做镜像，使“向右挥”= x 增大
  const palm = [0, 5, 9, 13, 17].map(i => hand[i]);
  const x = 1 - d3.mean(palm, p => p.x);
  history.push({ t: now, x });
  history = history.filter(p => now - p.t <= SWIPE_WINDOW + 100);

  const top = result.gestures && result.gestures[0] && result.gestures[0][0];
  const label = top && top.score > MIN_SCORE ? top.categoryName : "None";

  // ---- 1. 挥手（动态手势）优先 ----
  // 不再只比较窗口首尾两点：取窗口内任意一点到当前位置的最大位移，
  // 这样快挥（帧少）和慢挥（时间长）都能被抓到
  if (now > blockedUntil && history.length >= 3) {
    let best = 0;
    for (const p of history) {
      if (now - p.t > SWIPE_WINDOW) continue;
      const dx = x - p.x;
      if (Math.abs(dx) > Math.abs(best)) best = dx;
    }
    const dir = Math.sign(best);
    const isReturn = dir === -lastSwipe.dir && now - lastSwipe.t < RETURN_BLOCK;
    if (Math.abs(best) > SWIPE_DIST && !isReturn) {
      history = []; holdLabel = null;
      blockedUntil = now + COOLDOWN;
      lastSwipe = { dir, t: now };
      fireGesture(dir > 0 ? "Swipe_Right" : "Swipe_Left");
      return;
    }
  }

  // ---- 2. 静态手势：手大致不动 + 保持 HOLD_TIME ----
  const recent = history.filter(p => now - p.t <= 300).map(p => p.x);
  const still = recent.length > 1 && d3.max(recent) - d3.min(recent) < STILL_RANGE;

  // 换成别的手势并持续 GRACE 以上才解除锁定，避免一帧抖动就重复触发
  if (latched && label !== latched) {
    if (latchLostSince === null) latchLostSince = now;
    if (now - latchLostSince > GRACE) { latched = null; latchLostSince = null; }
  } else latchLostSince = null;

  const known = GESTURE_ACTIONS[label] && label !== latched;

  if (!known || !still) {
    // 识别结果短暂丢失（模型某几帧输出 None 或手微动）时保留进度，不从头计时
    if (holdLabel && now - lastGood < GRACE) return;
    holdLabel = null;
    d3.select("#hold-bar").style("width", "0%");
    setCam("gesture-detected", label === "None" ? "Hand (no gesture)" : label.replace("_", " "));
    return;
  }

  lastGood = now;
  if (label !== holdLabel) { holdLabel = label; holdStart = now; }
  const progress = Math.min(1, (now - holdStart) / HOLD_TIME);
  d3.select("#hold-bar").style("width", `${progress * 100}%`);
  setCam("gesture-detected", `${GESTURE_ACTIONS[label].name} (hold…)`);

  if (progress >= 1 && now > blockedUntil) {
    latched = label; holdLabel = null;
    blockedUntil = now + COOLDOWN;
    d3.select("#hold-bar").style("width", "0%");
    fireGesture(label);
  }
}

function fireGesture(key) {
  const g = GESTURE_ACTIONS[key];
  const desc = g.run();
  setCam("gesture-detected", g.name);
  setCam("gesture-action", desc);
  logAction("Gesture", g.name, desc);
}

const HAND_LINKS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

function drawHand(hand) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!hand) return;
  const W = overlay.width, H = overlay.height;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 3;
  HAND_LINKS.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(hand[a].x * W, hand[a].y * H);
    ctx.lineTo(hand[b].x * W, hand[b].y * H);
    ctx.stroke();
  });
  ctx.fillStyle = "#e07a4a";
  hand.forEach(p => { ctx.beginPath(); ctx.arc(p.x * W, p.y * H, 5, 0, 2 * Math.PI); ctx.fill(); });
}