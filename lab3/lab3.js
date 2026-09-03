d3.csv("../data/lab3_data.csv").then(data => {

    const columns = data.columns;
    const ascending = {};                   // 每列各自记录方向
    const table = d3.select("#data-table");

    table.select("thead").append("tr")
        .selectAll("th")
        .data(columns)
        .join("th")
        .text(d => d)
        .on("click", (event, column) => {
            ascending[column] = !ascending[column];
            const isNumeric = data.every(row => !isNaN(+row[column]));

            data.sort((a, b) => {
                const va = isNumeric ? +a[column] : a[column];
                const vb = isNumeric ? +b[column] : b[column];
                return ascending[column]
                    ? d3.ascending(va, vb)
                    : d3.descending(va, vb);
            });
            renderRows();
        });

    function renderRows() {
        table.select("tbody")
            .selectAll("tr")
            .data(data)
            .join("tr")
            .selectAll("td")
            .data(row => columns.map(c => row[c]))
            .join("td")
            .text(d => d);
    }

    renderRows();
});