async function drawChart() {

  // 1. 读 CSV，并把 score 转成数字
  const data = await d3.csv("../data/students.csv", d => ({
    name: d.name,
    score: +d.score
  }));

  console.log(data);

  // 2. 画布尺寸和边距
  const width  = 820;
  const height = 440;
  const margin = { top: 30, right: 20, bottom: 70, left: 20 };
  const innerW = width  - margin.left - margin.right;
  const innerH = height - margin.top  - margin.bottom;

  // 3. 创建 SVG
  const svg = d3.select("#chart")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // 4. 比例尺：把数据映射到像素
  const x = d3.scaleBand()
    .domain(data.map(d => d.name))
    .range([0, innerW])
    .padding(0.25);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.score)])
    .nice()
    .range([innerH, 0]);

  // 5. 画柱子（数据绑定）
  g.append("g")
    .selectAll("rect")
    .data(data)
    .join("rect")
      .attr("class", "bar")
      .attr("x", d => x(d.name))
      .attr("y", d => y(d.score))
      .attr("width", x.bandwidth())
      .attr("height", d => innerH - y(d.score));

  // 6. 柱子下面的分数
  g.append("g")
    .selectAll("text")
    .data(data)
    .join("text")
      .attr("class", "score-label")
      .attr("x", d => x(d.name) + x.bandwidth() / 2)
      .attr("y", innerH + 22)
      .attr("text-anchor", "middle")
      .text(d => d.score);

  // 7. 再下面的姓名
  g.append("g")
    .selectAll("text")
    .data(data)
    .join("text")
      .attr("class", "name-label")
      .attr("x", d => x(d.name) + x.bandwidth() / 2)
      .attr("y", innerH + 42)
      .attr("text-anchor", "middle")
      .text(d => d.name);
}

drawChart();