// ============================================================
// Lab 2 Assignment — Four-dimensional city visualization
//
//   population        (Ratio)     -> bar length
//   temp_c            (Interval)  -> bar fill colour (blue = cold, red = warm)
//   development_level (Ordinal)   -> bar thickness (Low / Medium / High)
//   region            (Nominal)   -> grouping into four panels
//
//   city                          -> row label + tooltip
// ============================================================

const width = 900;
const margin = { top: 56, right: 240, bottom: 64, left: 128 };

const rowH = 32;        // vertical space for one city
const headerH = 30;     // vertical space for a region title
const regionGap = 18;   // gap between two region panels

const tooltip = d3.select("#tooltip");

d3.csv("../data/cities_multivariate.csv", d => ({
    city: d.city,
    population: +d.population,
    temp_c: +d.temp_c,
    development_level: d.development_level,
    region: d.region
}))
.then(data => {

    // ---------- 1. Group by region and lay the rows out ----------
    const regionOrder = ["North", "South", "East", "West"];
    const grouped = d3.group(data, d => d.region);
    const regions = regionOrder.filter(r => grouped.has(r));

    const rows = [];   // one entry per city, with its y position
    const bands = [];  // one entry per region panel

    let cursor = margin.top;

    regions.forEach(region => {
        const y0 = cursor;
        cursor += headerH;

        grouped.get(region)
            .slice()
            .sort((a, b) => d3.descending(a.population, b.population))
            .forEach(c => {
                rows.push(Object.assign({}, c, { y: cursor + rowH / 2 }));
                cursor += rowH;
            });

        bands.push({ region, y0: y0, y1: cursor });
        cursor += regionGap;
    });

    const chartBottom = cursor - regionGap;
    const height = chartBottom + margin.bottom;

    // ---------- 2. Scales ----------
    const xScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.population)])
        .nice()
        .range([margin.left, width - margin.right]);

    const tempExtent = d3.extent(data, d => d.temp_c);

    // Domain reversed so that cold -> blue and warm -> red.
    const colorScale = d3.scaleSequential(d3.interpolateRdYlBu)
        .domain([tempExtent[1], tempExtent[0]]);

    const thicknessScale = d3.scaleOrdinal()
        .domain(["Low", "Medium", "High"])
        .range([9, 17, 25]);

    // ---------- 3. SVG ----------
    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`);

    // ---------- 4. Region panels (the nominal encoding) ----------
    const panels = svg.append("g").attr("class", "panels");

    panels.selectAll("rect")
        .data(bands)
        .join("rect")
        .attr("x", 14)
        .attr("y", d => d.y0)
        .attr("width", width - margin.right + 24 - 14)
        .attr("height", d => d.y1 - d.y0)
        .attr("rx", 6)
        .attr("fill", "#f4f6f9");

    panels.selectAll("text")
        .data(bands)
        .join("text")
        .attr("class", "region-label")
        .attr("x", 26)
        .attr("y", d => d.y0 + 20)
        .text(d => d.region);

    // ---------- 5. Grid lines ----------
    svg.append("g")
        .attr("class", "grid")
        .selectAll("line")
        .data(xScale.ticks(6))
        .join("line")
        .attr("x1", d => xScale(d))
        .attr("x2", d => xScale(d))
        .attr("y1", margin.top - 8)
        .attr("y2", chartBottom + 4)
        .attr("stroke", "#d8dee6")
        .attr("stroke-dasharray", "2,3");

    // ---------- 6. Bars ----------
    svg.append("g")
        .attr("class", "bars")
        .selectAll("rect")
        .data(rows)
        .join("rect")
        .attr("class", "city-bar")
        .attr("x", margin.left)
        .attr("y", d => d.y - thicknessScale(d.development_level) / 2)
        .attr("width", d => xScale(d.population) - margin.left)
        .attr("height", d => thicknessScale(d.development_level))
        .attr("rx", 3)
        .attr("fill", d => colorScale(d.temp_c))
        .attr("stroke", "#37414c")
        .attr("stroke-width", 0.8)
        .on("mouseover", function (event, d) {
            d3.select(this).attr("stroke-width", 2);
            tooltip
                .style("opacity", 1)
                .html(`
                    <strong>${d.city}</strong><br>
                    Region: ${d.region}<br>
                    Population: ${d.population} million<br>
                    Avg. temperature: ${d.temp_c} &deg;C<br>
                    Development level: ${d.development_level}
                `);
        })
        .on("mousemove", function (event) {
            tooltip
                .style("left", `${event.pageX + 12}px`)
                .style("top", `${event.pageY + 12}px`);
        })
        .on("mouseout", function () {
            d3.select(this).attr("stroke-width", 0.8);
            tooltip.style("opacity", 0);
        });

    // ---------- 7. City names and population values ----------
    svg.append("g")
        .attr("class", "city-names")
        .selectAll("text")
        .data(rows)
        .join("text")
        .attr("x", margin.left - 10)
        .attr("y", d => d.y)
        .attr("dy", "0.35em")
        .attr("text-anchor", "end")
        .text(d => d.city);

    svg.append("g")
        .attr("class", "value-labels")
        .selectAll("text")
        .data(rows)
        .join("text")
        .attr("x", d => xScale(d.population) + 8)
        .attr("y", d => d.y)
        .attr("dy", "0.35em")
        .text(d => `${d.population.toFixed(1)}M`);

    // ---------- 8. X axis ----------
    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0, ${chartBottom + 10})`)
        .call(d3.axisBottom(xScale).ticks(6));

    svg.append("text")
        .attr("class", "axis-title")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", chartBottom + 52)
        .attr("text-anchor", "middle")
        .text("Population (millions)");

    // ---------- 9. Legends ----------
    const lx = width - margin.right + 46;
    const legend = svg.append("g").attr("transform", `translate(${lx}, ${margin.top})`);

    // 9a. Temperature colour legend
    const legendW = 150;
    const legendH = 12;

    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
        .attr("id", "temp-gradient")
        .attr("x1", "0%").attr("x2", "100%");

    d3.range(0, 1.001, 0.05).forEach(t => {
        gradient.append("stop")
            .attr("offset", `${t * 100}%`)
            .attr("stop-color",
                colorScale(tempExtent[0] + t * (tempExtent[1] - tempExtent[0])));
    });

    legend.append("text")
        .attr("class", "legend-title")
        .attr("x", 0).attr("y", 0)
        .text("Average temperature");

    legend.append("rect")
        .attr("x", 0).attr("y", 10)
        .attr("width", legendW).attr("height", legendH)
        .attr("fill", "url(#temp-gradient)")
        .attr("stroke", "#9aa5b1");

    const legendScale = d3.scaleLinear()
        .domain(tempExtent)
        .range([0, legendW]);

    legend.append("g")
        .attr("class", "axis legend-axis")
        .attr("transform", `translate(0, ${10 + legendH})`)
        .call(d3.axisBottom(legendScale).ticks(4).tickFormat(d => `${d}°C`));

    // 9b. Development level thickness legend
    const devLegend = legend.append("g").attr("transform", "translate(0, 90)");

    devLegend.append("text")
        .attr("class", "legend-title")
        .attr("x", 0).attr("y", 0)
        .text("Development level");

    const devItems = devLegend.selectAll(".dev-item")
        .data(["Low", "Medium", "High"])
        .join("g")
        .attr("class", "dev-item")
        .attr("transform", (d, i) => `translate(0, ${18 + i * 32})`);

    devItems.append("rect")
        .attr("x", 0)
        .attr("y", d => -thicknessScale(d) / 2)
        .attr("width", 64)
        .attr("height", d => thicknessScale(d))
        .attr("rx", 3)
        .attr("fill", "#c9d2dc")
        .attr("stroke", "#37414c")
        .attr("stroke-width", 0.8);

    devItems.append("text")
        .attr("x", 74)
        .attr("y", 0)
        .attr("dy", "0.35em")
        .text(d => d);

    // 9c. Note about the grouping encoding
    const regionNote = legend.append("g").attr("transform", "translate(0, 222)");

    regionNote.append("text")
        .attr("class", "legend-title")
        .attr("x", 0).attr("y", 0)
        .text("Region");

    regionNote.append("text")
        .attr("class", "legend-note")
        .attr("x", 0).attr("y", 20)
        .text("Cities are grouped into four");

    regionNote.append("text")
        .attr("class", "legend-note")
        .attr("x", 0).attr("y", 36)
        .text("panels, one per region.");
});
