---
theme: dashboard
title: Media Counts
toc: false
---

# Media Counts

```js
const raw = FileAttachment("data/media-counts.json").json();
```

```js
// service display config
const serviceConfig = [
  { id: "youtube",      name: "Videos (YouTube)",     mainMetric: "count", additionalMetrics: [
    { metric: "total_length_min", label: "Total Duration (min)", decimals: 1 },
  ]},
  { id: "letterboxd",  name: "Movies (Letterboxd)",  mainMetric: "count", additionalMetrics: [] },
  { id: "feedly",       name: "Articles (Feedly)",      mainMetric: "count", additionalMetrics: [] },
  { id: "goodreads",    name: "Books (Goodreads)",   mainMetric: "count", additionalMetrics: [] },
  { id: "spotify",      name: "Podcasts (Spotify)",     mainMetric: "count", additionalMetrics: [
    { metric: "total_duration_hrs",     label: "Total Duration (hrs)",     decimals: 2 },
    { metric: "remaining_duration_hrs", label: "Remaining Duration (hrs)", decimals: 2 },
  ]},
  { id: "sequel_shows", name: "Shows (Sequel)",    mainMetric: "count", additionalMetrics: [
    { metric: "total_runtime_hrs",   label: "Total Duration (hrs)",      decimals: 2 },
    { metric: "total_eps",           label: "Episodes (Total)",         decimals: 0 },
    { metric: "count_want_to_watch", label: "Count (Want to Watch)",    decimals: 0 },
    { metric: "total_eps_wtw_shows", label: "Episodes (Want to Watch)", decimals: 0 },
  ]},
  { id: "sequel_games", name: "Games (Sequel)", mainMetric: "count", additionalMetrics: [] },
  { id: "musicbox",     name: "Music (MusicBox)",    mainMetric: "count", additionalMetrics: [
    { metric: "count_new",          label: "Count (New)", decimals: 0 },
    { metric: "total_duration_min", label: "Total Duration (min)", decimals: 1 }
  ]},
  { id: "raindrop",     name: "Links (Raindrop)",    mainMetric: "count", additionalMetrics: [] },
];

const serviceIds = serviceConfig.map(d => d.id);
const serviceNames = Object.fromEntries(serviceConfig.map(d => [d.id, d.name]));
const serviceMainMetric = Object.fromEntries(serviceConfig.map(d => [d.id, d.mainMetric]));

function metricValue(d) {
  return d[serviceMainMetric[d.service] || "count"] ?? 0;
}
```

```js
// parse dates and filter to configured services
const allData = raw
  .filter(d => serviceIds.includes(d.service))
  .map(d => ({...d, date: d3.utcParse("%Y-%m-%d")(d.date)}));
```

```js
const dateRange = view(Inputs.radio(
  new Map([["7d", 7], ["14d", 14], ["30d", 30], ["60d", 60], ["90d", 90], ["All", null]]),
  {value: null, label: "Date range"}
));
```

```js
const maxDate = d3.max(allData, d => d.date);
const cutoff = dateRange != null ? d3.utcDay.offset(maxDate, -dateRange) : null;
const data = cutoff ? allData.filter(d => d.date >= cutoff) : allData;
const xDomain = [cutoff ?? d3.min(allData, d => d.date), maxDate];
const xDays = (xDomain[1] - xDomain[0]) / (1000 * 60 * 60 * 24);
const xTicks = xDays <= 14 ? d3.utcDay : xDays <= 60 ? d3.utcWeek : d3.utcMonth;
const xTickFormat = xDays <= 14 ? d3.utcFormat("%b %-d") : xDays <= 60 ? d3.utcFormat("%b %-d") : d3.utcFormat("%b %Y");

// compute daily totals for percentage chart
const dailyTotals = d3.rollup(data, v => d3.sum(v, metricValue), d => +d.date);
```

```js
// shared color scale
const color = Plot.scale({
  color: {
    type: "categorical",
    domain: serviceConfig.map(d => d.id),
    range: d3.schemeTableau10
  }
});
```

<!-- Summary cards -->

```js
// latest date in the data
const latestDate = d3.max(data, d => d.date);
const latest = data.filter(d => +d.date === +latestDate);
const totalCount = d3.sum(latest, d => d.count);
```

<div class="grid grid-cols-4">
  <div class="card">
    <h2>Total Items</h2>
    <span class="big">${totalCount.toLocaleString("en-US")}</span>
  </div>
  <div class="card">
    <h2>Services Tracked</h2>
    <span class="big">${latest.length}</span>
  </div>
  <div class="card">
    <h2>Days Tracked</h2>
    <span class="big">${new Set(data.map(d => +d.date)).size}</span>
  </div>
  <div class="card">
    <h2>Latest Data</h2>
    <span class="big">${d3.utcFormat("%b %-d, %Y")(latestDate)}</span>
  </div>
</div>

<!-- Topline totals chart -->

```js
// color scale using clean names for the total chart legends
const namedColor = Plot.scale({
  color: {
    type: "categorical",
    domain: serviceConfig.map(d => d.name),
    range: d3.schemeTableau10
  }
});
const serviceOrder = serviceConfig.map(d => d.name);
const TOPLINE_BASE_HEIGHT = 345;
const TOPLINE_LEGEND_SPACE = 38;

function toplineHeight(mode) {
  // In overall mode there is no in-chart legend, so reserve equivalent
  // space to keep the x-axis baseline aligned with the % chart.
  return mode === "overall" ? TOPLINE_BASE_HEIGHT + TOPLINE_LEGEND_SPACE : TOPLINE_BASE_HEIGHT;
}

function totalChart(data, {width, mode = "overall"} = {}) {
  const named = data.map(d => ({...d, name: serviceNames[d.service]}));
  const overall = Array.from(
    d3.rollup(data, values => d3.sum(values, metricValue), d => +d.date),
    ([dateMs, total]) => ({date: new Date(+dateMs), total})
  ).sort((a, b) => d3.ascending(a.date, b.date));

  if (mode === "overall") {
    return Plot.plot({
      width,
      height: toplineHeight(mode),
      y: {grid: true, label: "Count"},
      x: {type: "utc", label: null, domain: xDomain, ticks: xTicks, tickFormat: xTickFormat},
      marks: [
        Plot.areaY(overall, {
          x: "date",
          y: "total",
          fill: "#4e79a7",
          fillOpacity: 0.25
        }),
        Plot.lineY(overall, {
          x: "date",
          y: "total",
          stroke: "#4e79a7",
          strokeWidth: 2
        }),
        Plot.dot(overall, {
          x: "date",
          y: "total",
          r: 3,
          fill: "#4e79a7",
          tip: true,
          title: (d) => `${d3.utcFormat("%b %-d, %Y")(d.date)}: ${d.total.toLocaleString("en-US")}`
        }),
        Plot.ruleY([0])
      ]
    });
  }

  return Plot.plot({
    width,
    height: toplineHeight(mode),
    y: {grid: true, label: "Count"},
    x: {type: "utc", label: null, domain: xDomain, ticks: xTicks, tickFormat: xTickFormat},
    color: {...namedColor, legend: true},
    marks: [
      Plot.areaY(named, Plot.stackY({
        x: "date",
        y: metricValue,
        fill: "name",
        fillOpacity: 0.4,
        order: serviceOrder,
      })),
      Plot.lineY(named, Plot.stackY2({
        x: "date",
        y: metricValue,
        stroke: "name",
        strokeWidth: 2,
        order: serviceOrder,
      })),
      Plot.dot(named, Plot.stackY2({
        x: "date",
        y: metricValue,
        fill: "name",
        order: serviceOrder,
        r: 3,
        tip: true,
        title: (d) => `${d.name}: ${metricValue(d).toLocaleString("en-US")}`
      })),
      Plot.ruleY([0])
    ]
  });
}

function totalChartCard(data) {
  const card = document.createElement("div");
  card.className = "card";

  const header = document.createElement("div");
  header.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:0.5rem; margin-bottom:0.5rem;";
  const title = document.createElement("h2");
  title.style.margin = "0";
  title.textContent = "Total counts over time";
  header.append(title);

  const chartContainer = document.createElement("div");
  let mode = "overall";
  let currentWidth = 0;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.style.cssText = "font-size:0.75rem; padding:0.15rem 0.45rem; border:1px solid #ccc; border-radius:4px; background:var(--theme-background); color:var(--theme-foreground); cursor:pointer;";

  function updateToggleLabel() {
    toggle.textContent = mode === "overall" ? "Split?" : "Total?";
  }
  updateToggleLabel();
  header.append(toggle);

  function renderChart() {
    if (!currentWidth) return;
    chartContainer.innerHTML = "";
    chartContainer.append(totalChart(data, {width: currentWidth, mode}));
  }

  toggle.onclick = () => {
    mode = mode === "overall" ? "split" : "overall";
    updateToggleLabel();
    renderChart();
  };

  card.append(header);
  card.append(chartContainer);
  card.append(resize((width) => {
    currentWidth = width;
    renderChart();
    return html``;
  }));

  return card;
}
```

<div class="grid grid-cols-2">
  ${totalChartCard(data)}
  ${percentChartCard(data)}
</div>

```js
function percentChart(data, {width} = {}) {
  const pctData = data.map(d => {
    const metric = serviceConfig.find(s => s.id === d.service)?.mainMetric || "count";
    const total = dailyTotals.get(+d.date) || 1;
    return {...d, name: serviceNames[d.service], pct: (d[metric] / total) * 100};
  });

  return Plot.plot({
    width,
    height: 350,
    y: {grid: true, label: "% of Total", domain: [0, 100]},
    x: {type: "utc", label: null, domain: xDomain, ticks: xTicks, tickFormat: xTickFormat},
    color: {...namedColor, legend: true},
    marks: [
      Plot.areaY(pctData, Plot.stackY({
        x: "date",
        y: "pct",
        fill: "name",
        fillOpacity: 0.4,
        order: serviceOrder,
      })),
      Plot.lineY(pctData, Plot.stackY2({
        x: "date",
        y: "pct",
        stroke: "name",
        strokeWidth: 2,
        order: serviceOrder,
      })),
      Plot.dot(pctData, Plot.stackY2({
        x: "date",
        y: "pct",
        fill: "name",
        order: serviceOrder,
        r: 3,
        tip: true,
        title: (d) => `${d.name}: ${d.pct.toFixed(1)}%`
      })),
      Plot.ruleY([0])
    ]
  });
}

function percentChartCard(data) {
  const card = document.createElement("div");
  card.className = "card";

  const title = document.createElement("h2");
  title.style.margin = "0 0 0.5rem 0";
  title.textContent = "Share of total over time";
  card.append(title);

  card.append(resize((width) => percentChart(data, {width})));
  return card;
}
```

<!-- Per-service detail charts -->

```js
function serviceChart(serviceData, config, metricInfo, {width} = {}) {
  const metric = metricInfo.metric;
  const yLabel = metricInfo.label;
  const decimals = metricInfo.decimals ?? 2;

  return Plot.plot({
    width,
    height: 200,
    y: {grid: true, label: yLabel},
    x: {type: "utc", label: null, domain: xDomain},
    marks: [
      Plot.lineY(serviceData, {
        x: "date",
        y: metric,
        stroke: color.apply(config.id),
        strokeWidth: 2,
        tip: true,
        title: (d) => `${config.name}\n${d3.utcFormat("%b %-d, %Y")(d.date)}: ${d[metric]?.toLocaleString("en-US", {minimumFractionDigits: decimals, maximumFractionDigits: decimals})}`
      }),
      Plot.dot(serviceData, {
        x: "date",
        y: metric,
        fill: color.apply(config.id),
        r: 3
      }),
      Plot.ruleY([0])
    ]
  });
}
```

```js
function serviceCard(config) {
  const serviceData = data.filter(d => d.service === config.id);

  // build full list of metric options: main + additional
  const mainLabel = config.mainMetric === "count" ? "Count" : config.mainMetric;
  const allMetrics = [
    {metric: config.mainMetric, label: mainLabel, decimals: 0},
    ...config.additionalMetrics
  ];
  const hasMultiple = allMetrics.length > 1;

  let selectedIdx = 0;

  const chartContainer = document.createElement("div");
  const card = document.createElement("div");
  card.className = "card";

  // header row: title on the left, dropdown on the right
  const header = document.createElement("div");
  header.style.cssText = "display:flex; justify-content:space-between; align-items:baseline; margin-bottom:0.25rem;";
  const title = document.createElement("h2");
  title.style.margin = "0";
  header.append(title);

  function updateTitle() {
    const m = allMetrics[selectedIdx];
    const latestRow = serviceData.filter(d => +d.date === +latestDate)[0];
    const latestVal = latestRow
      ? latestRow[m.metric]?.toLocaleString("en-US", {minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals})
      : "—";
    title.textContent = `${config.name}: ${latestVal}`;
  }
  updateTitle();

  if (hasMultiple) {
    const select = document.createElement("select");
    select.style.cssText = "font-size:0.75rem; padding:0.1rem 0.3rem; border:1px solid #ccc; border-radius:4px; background:var(--theme-background); color:var(--theme-foreground);";
    for (let i = 0; i < allMetrics.length; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = allMetrics[i].label;
      if (i === selectedIdx) opt.selected = true;
      select.append(opt);
    }
    select.onchange = () => {
      selectedIdx = +select.value;
      updateTitle();
      const width = chartContainer.clientWidth;
      chartContainer.innerHTML = "";
      chartContainer.append(serviceChart(serviceData, config, allMetrics[selectedIdx], {width}));
    };
    header.append(select);
  }

  card.append(header);
  card.append(chartContainer);
  card.append(resize((width) => {
    chartContainer.innerHTML = "";
    chartContainer.append(serviceChart(serviceData, config, allMetrics[selectedIdx], {width}));
    return html``;
  }));

  return card;
}
```

```js
const serviceGrid = html`<div class="grid grid-cols-3">
  ${serviceConfig.map(config => serviceCard(config))}
</div>`;

display(serviceGrid);
```

```js
const sourceRows = Array.from(
  d3.rollup(
    raw.filter(d => d.source_url),
    (values) => values[0],
    (d) => d.source_url
  ),
  ([sourceUrl, row]) => {
    const editedAt = row.last_edited ? new Date(row.last_edited) : null;
    const fileName = sourceUrl.split("/").pop() ?? sourceUrl;
    return {
      sourceFile: {label: fileName, url: sourceUrl},
      lastEdited: editedAt ? d3.utcFormat("%Y-%m-%d %H:%M UTC")(editedAt) : "—",
      _editedAt: editedAt ? +editedAt : -Infinity
    };
  }
).sort((a, b) => d3.descending(a._editedAt, b._editedAt));

const sourceTable = Inputs.table(
  sourceRows.map(({_editedAt, ...row}) => row),
  {
    columns: ["sourceFile", "lastEdited"],
    header: {sourceFile: "Source File", lastEdited: "Last Edited"},
    format: {
      sourceFile: (d) => html`<a href="${d.url}" target="_blank" rel="noopener noreferrer">${d.label}</a>`
    }
  }
);
```

<details>
  <summary>View all data sources</summary>

  ${sourceTable}
</details>
