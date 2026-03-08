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
  { id: "youtube",       name: "YouTube",       metric: "count", secondary: "total_length_min",    secondaryLabel: "Total Length (min)", secondaryDecimals: 1 },
  { id: "letterboxd",    name: "Letterboxd",     metric: "count", secondary: null },
  { id: "feedly",        name: "Feedly",         metric: "count", secondary: null },
  { id: "goodreads",     name: "Goodreads",      metric: "count", secondary: null },
  { id: "spotify",       name: "Spotify",        metric: "count", secondary: "total_duration_hrs",  secondaryLabel: "Duration (hrs)",    secondaryDecimals: 2 },
  { id: "sequel_shows",  name: "TV Shows",       metric: "count", secondary: "total_runtime_hrs",   secondaryLabel: "Runtime (hrs)",     secondaryDecimals: 2 },
  { id: "sequel_games",  name: "Video Games",    metric: "count", secondary: null },
  { id: "musicbox",      name: "MusicBox",       metric: "count", secondary: "count_new",           secondaryLabel: "New Albums",        secondaryDecimals: 0 },
  { id: "raindrop",      name: "Raindrop",       metric: "count", secondary: null },
];

const serviceIds = serviceConfig.map(d => d.id);
const serviceNames = Object.fromEntries(serviceConfig.map(d => [d.id, d.name]));
```

```js
// parse dates and filter to configured services
const data = raw
  .filter(d => serviceIds.includes(d.service))
  .map(d => ({...d, date: new Date(d.date)}));

// compute daily totals for percentage chart
const dailyTotals = d3.rollup(data, v => d3.sum(v, d => d[serviceConfig.find(s => s.id === d.service)?.metric || "count"]), d => +d.date);
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
    <h2>Latest Data</h2>
    <span class="big">${latestDate.toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"})}</span>
  </div>
  <div class="card">
    <h2>Days Tracked</h2>
    <span class="big">${new Set(data.map(d => +d.date)).size}</span>
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
    x: {type: "utc", label: null},
    color: {...color, legend: true},
    marks: [
      Plot.areaY(data, Plot.stackY({
        x: "date",
        y: (d) => d[serviceConfig.find(s => s.id === d.service)?.metric || "count"],
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
    const metric = serviceConfig.find(s => s.id === d.service)?.metric || "count";
    const total = dailyTotals.get(+d.date) || 1;
    return {...d, pct: (d[metric] / total) * 100};
  });

  return Plot.plot({
    title: "Share of total over time",
    width,
    height: 350,
    y: {grid: true, label: "% of Total", domain: [0, 100]},
    x: {type: "utc", label: null},
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

## By Service

```js
function serviceChart(serviceData, config, {width} = {}) {
  const latestRow = serviceData.filter(d => +d.date === +latestDate)[0];
  const latestCount = latestRow ? Math.round(latestRow[config.metric])?.toLocaleString("en-US") : "—";
  const subtitle = config.secondary && latestRow
    ? `${config.secondaryLabel}: ${latestRow[config.secondary]?.toLocaleString("en-US", {minimumFractionDigits: config.secondaryDecimals ?? 0, maximumFractionDigits: config.secondaryDecimals ?? 0})}`
    : undefined;

  return Plot.plot({
    title: `${config.name}: ${latestCount}`,
    subtitle,
    width,
    height: 200,
    y: {grid: true, label: config.metric === "count" ? "Count" : config.metric},
    x: {type: "utc", label: null},
    marks: [
      Plot.lineY(serviceData, {
        x: "date",
        y: config.metric,
        stroke: color.apply(config.id),
        strokeWidth: 2,
        tip: true,
        title: (d) => `${config.name}\n${d.date.toLocaleDateString()}: ${d[config.metric]}`
      }),
      Plot.dot(serviceData, {
        x: "date",
        y: config.metric,
        fill: color.apply(config.id),
        r: 3
      }),
      Plot.ruleY([0])
    ]
  });
}
```

```js
const serviceGrid = html`<div class="grid grid-cols-3">
  ${serviceConfig.map(config => {
    const serviceData = data.filter(d => d.service === config.id);
    return html`<div class="card">${resize((width) => serviceChart(serviceData, config, {width}))}</div>`;
  })}
</div>`;

display(serviceGrid);
```
