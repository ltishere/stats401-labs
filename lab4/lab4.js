/* STATS 401 Lab 4 — sentiment by account
   Reads the cleaned tweets, aggregates per author in the browser, and draws a
   100% stacked bar chart ordered by mean sentiment score. */

const DATA_URL = "../data/lab4_clean_tweets.csv";

const CLASSES = ["Negative", "Neutral", "Positive"];
const COLOR = {
  Negative: "#b4451f",
  Neutral: "#cbc6bd",
  Positive: "#1b6b50"
};

const tooltip = d3.select("#tooltip");

d3.csv(DATA_URL, d => ({
  author: d.author,
  sentiment: d.sentiment,
  sentiment_score: +d.sentiment_score,
  likes: +d.likes,
  retweets: +d.retweets
}))
  .then(draw)
  .catch(err => {
    d3.select("#chart").html(
      `<p class="error">Could not load ${DATA_URL} — ${err.message}. ` +
      `If you opened this file directly, serve it over http instead ` +
      `(<code>python -m http.server</code>).</p>`
    );
    console.error(err);
  });

function draw(rows) {
  // --- aggregate per author -------------------------------------------------
  const authors = d3.rollups(rows, group => {
    const counts = {};
    CLASSES.forEach(c => {
      counts[c] = group.filter(d => d.sentiment === c).length;
    });
    return {
      n: group.length,
      counts,
      meanScore: d3.mean(group, d => d.sentiment_score),
      medianLikes: d3.median(group, d => d.likes)
    };
  }, d => d.author)
    .map(([author, stats]) => ({ author, ...stats }))
    .sort((a, b) => d3.descending(a.meanScore, b.meanScore));

  // --- layout ---------------------------------------------------------------
  const margin = { top: 28, right: 72, bottom: 34, left: 116 };
  const width = 860;
  const rowHeight = 26;
  const height = margin.top + margin.bottom + authors.length * rowHeight;
  const innerWidth = width - margin.left - margin.right;

  const x = d3.scaleLinear([0, 1], [0, innerWidth]);
  const y = d3.scaleBand()
    .domain(authors.map(d => d.author))
    .range([margin.top, height - margin.bottom])
    .padding(0.28);

  d3.select("#chart").html("");

  const svg = d3.select("#chart")
    .append("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("role", "img")
    .attr("aria-label",
      "Share of negative, neutral and positive tweets for each of 20 accounts.");

  // --- x axis: percentage grid ---------------------------------------------
  const xAxis = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  xAxis.selectAll("line")
    .data(x.ticks(5))
    .join("line")
    .attr("x1", d => x(d))
    .attr("x2", d => x(d))
    .attr("y1", -8)
    .attr("y2", height - margin.top - margin.bottom)
    .attr("stroke", "#e6e2db");

  xAxis.selectAll("text")
    .data(x.ticks(5))
    .join("text")
    .attr("x", d => x(d))
    .attr("y", -14)
    .attr("text-anchor", d => (d === 1 ? "end" : "middle"))
    .attr("font-size", 11)
    .attr("fill", "#6b6a65")
    .text(d => d3.format(".0%")(d));

  // --- author labels --------------------------------------------------------
  svg.append("g")
    .selectAll("text")
    .data(authors)
    .join("text")
    .attr("x", margin.left - 10)
    .attr("y", d => y(d.author) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .attr("font-size", 12)
    .attr("fill", "#1c1c1a")
    .text(d => d.author);

  // --- stacked bars ---------------------------------------------------------
  const rowsG = svg.append("g")
    .selectAll("g")
    .data(authors)
    .join("g")
    .attr("transform", `translate(${margin.left},0)`)
    .style("cursor", "default")
    .on("mousemove", showTooltip)
    .on("mouseleave", hideTooltip);

  rowsG.each(function (d) {
    let offset = 0;
    const segments = CLASSES.map(cls => {
      const share = d.counts[cls] / d.n;
      const seg = { cls, share, start: offset };
      offset += share;
      return seg;
    });

    d3.select(this)
      .selectAll("rect")
      .data(segments)
      .join("rect")
      .attr("x", s => x(s.start))
      .attr("y", y(d.author))
      .attr("width", s => Math.max(0, x(s.share) - x(0)))
      .attr("height", y.bandwidth())
      .attr("fill", s => COLOR[s.cls]);
  });

  // --- mean score at the right ---------------------------------------------
  svg.append("g")
    .selectAll("text")
    .data(authors)
    .join("text")
    .attr("x", margin.left + innerWidth + 10)
    .attr("y", d => y(d.author) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("font-size", 11)
    .attr("fill", "#6b6a65")
    .attr("font-variant-numeric", "tabular-nums")
    .text(d => d3.format("+.2f")(d.meanScore));

  svg.append("text")
    .attr("x", margin.left + innerWidth + 10)
    .attr("y", margin.top - 14)
    .attr("font-size", 11)
    .attr("fill", "#6b6a65")
    .text("mean");

  // --- tooltip --------------------------------------------------------------
  function showTooltip(event, d) {
    const pct = n => d3.format(".0%")(n / d.n);
    tooltip
      .style("opacity", 1)
      .style("left", `${Math.min(event.clientX + 14, window.innerWidth - 240)}px`)
      .style("top", `${event.clientY + 14}px`)
      .html(
        `<b>${d.author}</b><br>` +
        `${d.n} tweets<br>` +
        `Positive ${pct(d.counts.Positive)} · ` +
        `Neutral ${pct(d.counts.Neutral)} · ` +
        `Negative ${pct(d.counts.Negative)}<br>` +
        `Mean score ${d3.format("+.2f")(d.meanScore)}<br>` +
        `Median likes ${d3.format(",")(d.medianLikes)}`
      );
  }

  function hideTooltip() {
    tooltip.style("opacity", 0);
  }
}