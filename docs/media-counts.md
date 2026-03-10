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
  { id: "youtube",      name: "YouTube",     mainMetric: "count", additionalMetrics: [
    { metric: "total_length_min", label: "Total Length (min)", decimals: 1 },
  ]},
  { id: "letterboxd",  name: "Letterboxd",  mainMetric: "count", additionalMetrics: [] },
  { id: "feedly",       name: "Feedly",      mainMetric: "count", additionalMetrics: [] },
  { id: "goodreads",    name: "Goodreads",   mainMetric: "count", additionalMetrics: [] },
  { id: "spotify",      name: "Spotify",     mainMetric: "count", additionalMetrics: [
    { metric: "total_duration_hrs",     label: "Total Duration (hrs)",     decimals: 2 },
    { metric: "remaining_duration_hrs", label: "Remaining Duration (hrs)", decimals: 2 },
  ]},
  { id: "sequel_shows", name: "TV Shows",    mainMetric: "count", additionalMetrics: [
    { metric: "total_runtime_hrs",   label: "Total Runtime (hrs)",      decimals: 2 },
    { metric: "total_eps",           label: "Episodes (Total)",         decimals: 0 },
    { metric: "count_want_to_watch", label: "Count (Want to Watch)",    decimals: 0 },
    { metric: "total_eps_wtw_shows", label: "Episodes (Want to Watch)", decimals: 0 },
  ]},
  { id: "sequel_games", name: "Video Games", mainMetric: "count", additionalMetrics: [] },
  { id: "musicbox",     name: "MusicBox",    mainMetric: "count", additionalMetrics: [
    { metric: "count_new", label: "Count (New)", decimals: 0 },
  ]},
  { id: "raindrop",     name: "Raindrop",    mainMetric: "count", additionalMetrics: [] },
];

const serviceIds = serviceConfig.map(d => d.id);
const serviceNames = Object.fromEntries(serviceConfig.map(d => [d.id, d.name]));
```

```js
// parse dates and filter to configured services
const allData = raw
  .filter(d => serviceIds.includes(d.service))
  .map(d => ({...d, date: new Date(d.date)}));
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
const dailyTotals = d3.rollup(data, v => d3.sum(v, d => d[serviceConfig.find(s => s.id === d.service)?.mainMetric || "count"]), d => +d.date);
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
    <span class="big">${latestDate.toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"})}</span>
  </div>
</div>

<!-- Stacked area: total counts over time -->

```js
function totalChart(data, {width} = {}) {
  return Plot.plot({
    title: "Total counts over time",
    width,
    height: 350,
    y: {grid: true, label: "Count"},
    x: {type: "utc", label: null, domain: xDomain, ticks: xTicks, tickFormat: xTickFormat},
    color: {...color, legend: true},
    marks: [
      Plot.areaY(data, Plot.stackY({
        x: "date",
        y: (d) => d[serviceConfig.find(s => s.id === d.service)?.mainMetric || "count"],
        fill: "service",
        order: serviceIds,
        tip: true,
        title: (d) => `${serviceNames[d.service]}: ${d.count}`
      })),
      Plot.ruleY([0])
    ]
  });
}
```

<div class="grid grid-cols-2">
  <div class="card">
    ${resize((width) => totalChart(data, {width}))}
  </div>
  <div class="card">
    ${resize((width) => percentChart(data, {width}))}
  </div>
</div>

```js
function percentChart(data, {width} = {}) {
  const pctData = data.map(d => {
    const metric = serviceConfig.find(s => s.id === d.service)?.mainMetric || "count";
    const total = dailyTotals.get(+d.date) || 1;
    return {...d, pct: (d[metric] / total) * 100};
  });

  return Plot.plot({
    title: "Share of total over time",
    width,
    height: 350,
    y: {grid: true, label: "% of Total", domain: [0, 100]},
    x: {type: "utc", label: null, domain: xDomain, ticks: xTicks, tickFormat: xTickFormat},
    color: {...color, legend: true},
    marks: [
      Plot.areaY(pctData, Plot.stackY({
        x: "date",
        y: "pct",
        fill: "service",
        order: serviceIds,
        tip: true,
        title: (d) => `${serviceNames[d.service]}: ${d.pct.toFixed(1)}%`
      })),
      Plot.ruleY([0])
    ]
  });
}
```

<!-- Per-service detail charts -->

```js
function serviceChart(serviceData, config, metricInfo, {width} = {}) {
  const metric = metricInfo.metric;
  const yLabel = metricInfo.label;

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
        title: (d) => `${config.name}\n${d.date.toLocaleDateString()}: ${d[metric]}`
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
