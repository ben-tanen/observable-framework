---
theme: dashboard
title: Media Counts
toc: false
---

# Media Counts

This is a page I use to help monitor my plethora of "to read", "to watch", "to *consume*" lists and try to keep up with it all! More items is not necessarily a bad thing (nothing wrong with watching more films!), but I generally try to keep these lists "manageable within reason".

For a bit more context on this dashboard, the data, and my feelings on it all, see the [*Updates* section](#updates) at the bottom of this page.

```js
const json = FileAttachment("data/media-counts.json").json();
```

```js
const raw = json.rows;
const sources = json.sources;
```

```js
// service display config (optional `url` links the service name in parens in the card title)
const serviceConfig = [
  { id: "youtube", name: "Videos (YouTube)", color: "#4e79a7", mainMetric: "count", url: "https://www.youtube.com/playlist?list=WL", additionalMetrics: [
    { metric: "total_length_min", label: "Total Duration (hrs)", unit: "min" },
  ]},
  { id: "letterboxd", name: "Movies (Letterboxd)", color: "#f28e2c", mainMetric: "count", url: "https://letterboxd.com/btanen/watchlist/", additionalMetrics: [] },
  { id: "miniflux", name: "Articles (Miniflux)", color: "#e15759", mainMetric: "count", url: "https://rss.ben-tanen.com/unread/", additionalMetrics: [] },
  { id: "feedly", name: "Articles (Feedly)", color: "#bab0ab", mainMetric: "count", additionalMetrics: [] },
  { id: "goodreads", name: "Books (Goodreads)", color: "#76b7b2", mainMetric: "count", url: "https://www.goodreads.com/review/list/171721734?shelf=to-read", additionalMetrics: [] },
  { id: "spotify", name: "Podcasts (Spotify)", color: "#59a14f", mainMetric: "count", url: "https://open.spotify.com/collection/your-episodes", additionalMetrics: [
    { metric: "total_duration_hrs", label: "Total Duration (hrs)", unit: "hrs" },
    { metric: "remaining_duration_hrs", label: "Remaining Duration (hrs)", unit: "hrs" },
  ]},
  { id: "sequel_shows", name: "Shows (Sequel)", color: "#edc949", mainMetric: "count", additionalMetrics: [
    { metric: "to_watch_runtime_hrs", label: "Remaining Duration (hrs)", unit: "hrs" },
    { metric: "total_eps", label: "Episodes (Total)", decimals: 0 },
    { metric: "count_want_to_watch", label: "Count (Want to Watch)", decimals: 0 },
    { metric: "total_eps_wtw_shows", label: "Episodes (Want to Watch)", decimals: 0 },
  ]},
  { id: "sequel_games", name: "Games (Sequel)", color: "#af7aa1", mainMetric: "count", additionalMetrics: [] },
  { id: "musicbox", name: "Music (MusicBox)", color: "#ff9da7", mainMetric: "count", additionalMetrics: [
    { metric: "count_new", label: "Count (New)", decimals: 0 },
    { metric: "total_duration_min", label: "Total Duration (hrs)", unit: "min" }
  ]},
  { id: "raindrop", name: "Links (Raindrop)", color: "#9c755f", mainMetric: "count", url: "https://app.raindrop.io/my/0", additionalMetrics: [] },
];

const serviceIds = serviceConfig.map(d => d.id);
const serviceNames = Object.fromEntries(serviceConfig.map(d => [d.id, d.name]));
const serviceMainMetric = Object.fromEntries(serviceConfig.map(d => [d.id, d.mainMetric]));

function metricValue(d) {
  return d[serviceMainMetric[d.service] || "count"] ?? 0;
}

// duration metrics (`unit: "min" | "hrs"`) are displayed in hours: decimal hours on
// axes, "12h 28m" in titles/tooltips; other metrics use `decimals`
function toDisplayValue(value, metricInfo) {
  if (value == null) return value;
  return metricInfo.unit === "min" ? value / 60 : value;
}

// "28m" / "12h 28m", switching to "57d 2h 24m" at 100+ hours
function formatDuration(hours) {
  const totalMin = Math.round(hours * 60);
  const m = totalMin % 60;
  const totalH = Math.floor(totalMin / 60);
  if (totalH >= 100) return `${Math.floor(totalH / 24).toLocaleString("en-US")}d ${totalH % 24}h ${m}m`;
  return totalH ? `${totalH}h ${m}m` : `${m}m`;
}

function formatMetric(value, metricInfo) {
  if (value == null) return "—";
  if (metricInfo.unit) return formatDuration(value);
  const decimals = metricInfo.decimals ?? 0;
  return value.toLocaleString("en-US", {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
}

// copy of rows with the metric converted to its display value (hours for durations)
function displayRows(rows, metricInfo) {
  if (!metricInfo.unit) return rows;
  return rows.map(d => ({...d, [metricInfo.metric]: toDisplayValue(d[metricInfo.metric], metricInfo)}));
}
```

```js
// parse dates and filter to configured services
const allData = raw
  .filter(d => serviceIds.includes(d.service))
  .map(d => ({...d, date: d3.utcParse("%Y-%m-%d")(d.date), stale: !!d.stale}));
```

```js
const dateRange = view(Inputs.radio(
  new Map([["7d", 7], ["14d", 14], ["30d", 30], ["60d", 60], ["90d", 90], ["All", null]]),
  {value: 30, label: "Date range"}
));
```

```js
const maxDate = d3.max(allData, d => d.date);
const cutoff = dateRange != null ? d3.utcDay.offset(maxDate, -dateRange) : null;
const data = cutoff ? allData.filter(d => d.date >= cutoff) : allData;
const xDomain = [cutoff ?? d3.min(allData, d => d.date), maxDate];

// compute daily totals for "% of total" in the by-service tooltip
const dailyTotals = d3.rollup(data, v => d3.sum(v, metricValue), d => +d.date);

// only show services with non-stale data in the selected date range
const visibleServices = new Set(data.filter(d => !d.stale).map(d => d.service));
const visibleConfig = serviceConfig.filter(d => visibleServices.has(d.id));
```

```js
// shared color scale
const color = Plot.scale({
  color: {
    type: "categorical",
    domain: serviceConfig.map(d => d.id),
    range: serviceConfig.map(d => d.color)
  }
});
```

```js
// change-over-period subtitle: DELTA_MODE is "raw", "pct", or "both"
const DELTA_MODE = "both";

function deltaPeriodLabel() {
  return dateRange != null ? `over last ${dateRange}d` : `since ${d3.utcFormat("%b %-d, %Y")(xDomain[0])}`;
}

// rows: [{date, value}]; compares first vs last non-null value in the range
function deltaStats(rows) {
  const valid = rows.filter(d => d.value != null).sort((a, b) => d3.ascending(a.date, b.date));
  if (valid.length < 2) return null;
  const first = valid[0].value;
  const last = valid[valid.length - 1].value;
  return {diff: last - first, pct: first ? ((last - first) / first) * 100 : null};
}

// label: include the period label (e.g. "over last 30d"); off for KPI cards whose title already says it
function deltaText(rows, {decimals = 0, format, mode = DELTA_MODE, label = true} = {}) {
  const stats = deltaStats(rows);
  if (!stats) return "";
  const sign = (v) => v > 0 ? "+" : v < 0 ? "−" : "±";
  const period = label ? ` ${deltaPeriodLabel()}` : "";

  const absDiff = Math.abs(stats.diff);
  const rawStr = `${sign(stats.diff)}${format ? format(absDiff) : absDiff.toLocaleString("en-US", {minimumFractionDigits: decimals, maximumFractionDigits: decimals})}`;
  const pctStr = stats.pct != null ? `${sign(stats.pct)}${Math.round(Math.abs(stats.pct))}%` : null;

  if (mode === "pct") return pctStr ? `${pctStr}${period}` : "";
  if (mode === "both" && pctStr) return `${rawStr}${period} (${pctStr})`;
  return `${rawStr}${period}`;
}

// main-metric series for one service, skipping stale points
function serviceSeries(serviceId) {
  return data
    .filter(d => d.service === serviceId && !d.stale)
    .map(d => ({date: d.date, value: metricValue(d)}));
}

function subtitleEl() {
  const el = document.createElement("div");
  el.style.cssText = "font-size:0.8rem; color:var(--theme-foreground-muted); margin-top:0.1rem;";
  return el;
}
```

<!-- Summary cards -->

```js
// latest date in the data
const latestDate = d3.max(data, d => d.date);
const latest = data.filter(d => +d.date === +latestDate);
const totalCount = d3.sum(latest, d => d.count);

// daily total across services, used for the net change KPI
const overallSeries = Array.from(
  d3.rollup(data, values => d3.sum(values, metricValue), d => +d.date),
  ([dateMs, value]) => ({date: new Date(dateMs), value})
);

// service with the largest absolute raw change over the range (the longest bar in the net change chart)
const fastest = d3.greatest(
  visibleConfig
    .map(config => ({config, series: serviceSeries(config.id), stats: deltaStats(serviceSeries(config.id))}))
    .filter(d => d.stats),
  d => Math.abs(d.stats.diff)
);
```

<div class="grid grid-cols-4">
  <div class="card">
    <h2>Latest date</h2>
    <span class="big">${d3.utcFormat("%b %-d, %Y")(latestDate)}</span>
  </div>
  <div class="card">
    <h2>Total items</h2>
    <span class="big">${totalCount.toLocaleString("en-US")}</span>
  </div>
  <div class="card">
    <h2>Net change ${deltaPeriodLabel()}</h2>
    <span class="big">${deltaText(overallSeries, {label: false}) || "—"}</span>
  </div>
  <div class="card">
    <h2>Most changed list</h2>
    <span class="big">${fastest ? fastest.config.name : "—"}</span>
    ${fastest ? html`<div class="muted">${deltaText(fastest.series)}</div>` : ""}
  </div>
</div>

<!-- Topline totals chart -->

```js
// UI state that should persist across date range changes (this cell has no dependencies, so it never re-runs)
const toplineState = {mode: "overall"};
const serviceMetricState = new Map(); // service id -> selected metric index
```

```js
// color scale using clean names for the total chart legends
const namedColor = Plot.scale({
  color: {
    type: "categorical",
    domain: visibleConfig.map(d => d.name),
    range: visibleConfig.map(d => d.color)
  }
});
const serviceOrder = visibleConfig.map(d => d.name);
const TOPLINE_BASE_HEIGHT = 365;
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
      ariaLabel: "Total items across all lists over time",
      height: toplineHeight(mode),
      y: {grid: true, label: "Count"},
      x: {type: "utc", label: null, domain: xDomain},
      marks: [
        Plot.areaY(overall, {
          x: "date",
          y: "total",
          fill: d3.schemeTableau10[0],
          fillOpacity: 0.25
        }),
        Plot.lineY(overall, {
          x: "date",
          y: "total",
          stroke: d3.schemeTableau10[0],
          strokeWidth: 2
        }),
        Plot.dot(overall, {
          x: "date",
          y: "total",
          r: 3,
          fill: d3.schemeTableau10[0],
          tip: true,
          title: (d) => `${d3.utcFormat("%b %-d, %Y")(d.date)}: ${d.total.toLocaleString("en-US")}`
        }),
        Plot.ruleY([0])
      ]
    });
  }

  return Plot.plot({
    width,
    ariaLabel: "Items over time, stacked by list",
    height: toplineHeight(mode),
    y: {grid: true, label: "Count"},
    x: {type: "utc", label: null, domain: xDomain},
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
        title: (d) => `${d.name}: ${metricValue(d).toLocaleString("en-US")} (${Math.round((metricValue(d) / (dailyTotals.get(+d.date) || 1)) * 100)}% of total)`
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
  let currentWidth = 0;
  // mode lives in toplineState so it survives date range changes (which rebuild this card)
  const toggle = Inputs.radio(new Map([["Total", "overall"], ["By service", "split"]]), {value: toplineState.mode});
  toggle.setAttribute("aria-label", "Total chart view");
  toggle.style.cssText = "width:auto; margin:0; font-size:0.75rem;";
  header.append(toggle);

  function renderChart() {
    if (!currentWidth) return;
    chartContainer.innerHTML = "";
    chartContainer.append(totalChart(data, {width: currentWidth, mode: toplineState.mode}));
  }

  toggle.addEventListener("input", () => {
    toplineState.mode = toggle.value;
    renderChart();
  });

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
  ${changeChartCard(data)}
</div>

```js
// net change by list: one bar per service for the selected range (last minus first
// non-stale value, same as the card subtitles), growth right / shrinkage left, sorted
function changeChart(data, {width} = {}) {
  const changes = visibleConfig
    .map(config => {
      const series = serviceSeries(config.id);
      const stats = deltaStats(series);
      return stats && {name: config.name, diff: stats.diff, label: deltaText(series, {label: false, mode: "raw"})};
    })
    .filter(Boolean)
    .sort((a, b) => d3.descending(a.diff, b.diff));
  const fmtChange = (v) => v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v).toLocaleString("en-US")}`;
  // pad each side only as far as the data goes, leaving room for end labels
  const [minDiff, maxDiff] = [d3.min(changes, d => d.diff) ?? 0, d3.max(changes, d => d.diff) ?? 0];
  const pad = (maxDiff - minDiff || 1) * 0.12;

  return Plot.plot({
    width,
    ariaLabel: `Net change in items by list ${deltaPeriodLabel()}`,
    ariaDescription: changes.map(d => `${d.name}: ${d.label}`).join("; "),
    // taller than 350 to fill the card, which stretches to match the total chart beside it
    height: 380,
    marginLeft: 115,
    marginRight: 10,
    x: {grid: true, label: "Net change", tickFormat: fmtChange, domain: [Math.min(0, minDiff) - pad, Math.max(0, maxDiff) + pad]},
    y: {label: null, domain: changes.map(d => d.name), tickSize: 0},
    color: namedColor,
    marks: [
      Plot.barX(changes, {x: "diff", y: "name", fill: "name"}),
      // labels just past each bar's end (textAnchor is constant per mark, so split by sign)
      Plot.text(changes.filter(d => d.diff >= 0), {x: "diff", y: "name", text: "label", textAnchor: "start", dx: 4, fill: "currentColor", fontSize: 11}),
      Plot.text(changes.filter(d => d.diff < 0), {x: "diff", y: "name", text: "label", textAnchor: "end", dx: -4, fill: "currentColor", fontSize: 11}),
      Plot.ruleX([0], {stroke: "var(--theme-foreground-muted)"})
    ]
  });
}

function changeChartCard(data) {
  const card = document.createElement("div");
  card.className = "card";

  const title = document.createElement("h2");
  title.style.margin = "0";
  title.textContent = "Net change by list";
  const period = deltaPeriodLabel();
  const subtitle = subtitleEl();
  subtitle.style.marginBottom = "0.5rem";
  subtitle.textContent = period[0].toUpperCase() + period.slice(1);
  card.append(title, subtitle);

  card.append(resize((width) => changeChart(data, {width})));
  return card;
}
```

<!-- Per-service detail charts -->

```js
// Determine y-axis domain: include zero if the data range is large relative to
// the minimum value (min - 3 * range <= 0), otherwise pad around min/max by 50%
// of the range to better reveal variation in high-baseline series.
function yDomain(serviceData, metric) {
  const values = serviceData.filter(d => !d.stale).map(d => d[metric]).filter(v => v != null);
  if (!values.length) return undefined;
  const min = d3.min(values);
  const max = d3.max(values);
  const range = max - min;
  if (min - 3 * range <= 0) return undefined; // let Plot default (includes 0)
  const pad = range * 0.5 || 1;
  return [min - pad, max + pad];
}

function serviceChart(rawServiceData, config, metricInfo, {width} = {}) {
  const serviceData = displayRows(rawServiceData, metricInfo);
  const metric = metricInfo.metric;
  const yLabel = metricInfo.label;
  const yDom = yDomain(serviceData, metric);

  return Plot.plot({
    width,
    ariaLabel: `${config.name}: ${yLabel} over time`,
    height: 200,
    y: {grid: true, label: yLabel, ...(yDom ? {domain: yDom} : {})},
    x: {type: "utc", label: null, domain: xDomain},
    marks: [
      // faded line connecting fresh points directly (bridges across stale gaps)
      Plot.lineY(serviceData.filter(d => !d.stale), {
        x: "date",
        y: metric,
        stroke: color.apply(config.id),
        strokeWidth: 2,
        strokeOpacity: 0.25
      }),
      // solid line that breaks at stale points (overdraws faded line for consecutive fresh segments)
      Plot.lineY(serviceData, {
        x: "date",
        y: d => d.stale ? undefined : d[metric],
        stroke: color.apply(config.id),
        strokeWidth: 2
      }),
      Plot.dot(serviceData.filter(d => !d.stale), {
        x: "date",
        y: metric,
        fill: color.apply(config.id),
        r: 3,
        tip: true,
        title: (d) => `${config.name}\n${d3.utcFormat("%b %-d, %Y")(d.date)}: ${formatMetric(d[metric], metricInfo)}`
      }),
      ...(yDom ? [] : [Plot.ruleY([0])])
    ]
  });
}
```

```js
// title name, with the parenthesized service (or whole name) linked when config.url is set
function serviceNameEl(config) {
  if (!config.url) return config.name;
  const link = (text) => html`<a href="${config.url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  const match = config.name.match(/^(.*\()(.+)(\))$/);
  return match ? html`<span>${match[1]}${link(match[2])}${match[3]}</span>` : link(config.name);
}

function serviceCard(config) {
  const serviceData = data.filter(d => d.service === config.id);

  // build full list of metric options: main + additional
  const mainLabel = config.mainMetric === "count" ? "Count" : config.mainMetric;
  const allMetrics = [
    {metric: config.mainMetric, label: mainLabel, decimals: 0},
    ...config.additionalMetrics
  ];
  const hasMultiple = allMetrics.length > 1;

  // selected metric lives in serviceMetricState so it survives date range changes
  let selectedIdx = serviceMetricState.get(config.id) ?? 0;

  const chartContainer = document.createElement("div");
  const card = document.createElement("div");
  card.className = "card";

  // header row: title on the left, dropdown on the right
  const header = document.createElement("div");
  header.style.cssText = "display:flex; justify-content:space-between; align-items:baseline; margin-bottom:0.25rem;";
  const title = document.createElement("h2");
  title.style.margin = "0";
  const subtitle = subtitleEl();
  const titleBlock = document.createElement("div");
  titleBlock.append(title, subtitle);
  header.append(titleBlock);

  function updateTitle() {
    const m = allMetrics[selectedIdx];
    const latestRow = d3.greatest(serviceData, d => d.date);
    const latestVal = latestRow ? formatMetric(toDisplayValue(latestRow[m.metric], m), m) : "—";
    const staleMarker = latestRow && (latestRow.stale || +latestRow.date < +latestDate) ? "*" : "";
    title.replaceChildren(serviceNameEl(config), `: ${latestVal}${staleMarker}`);
    subtitle.textContent = deltaText(
      serviceData.filter(d => !d.stale).map(d => ({date: d.date, value: toDisplayValue(d[m.metric], m)})),
      {decimals: m.decimals ?? 0, format: m.unit ? formatDuration : undefined}
    );
  }
  updateTitle();

  if (hasMultiple) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", `${config.name} metric`);
    select.style.cssText = "font-size:0.75rem; padding:0.1rem 0.3rem; border:1px solid var(--theme-foreground-faint); border-radius:4px; background:var(--theme-background); color:var(--theme-foreground);";
    for (let i = 0; i < allMetrics.length; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = allMetrics[i].label;
      if (i === selectedIdx) opt.selected = true;
      select.append(opt);
    }
    select.onchange = () => {
      selectedIdx = +select.value;
      serviceMetricState.set(config.id, selectedIdx);
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
  ${visibleConfig.map(config => serviceCard(config))}
</div>`;

display(serviceGrid);
```

```js
const sourceRows = sources
  .map(d => {
    const editedAt = d.last_edited ? new Date(d.last_edited) : null;
    return {
      sourceFile: {label: d.file, url: d.url},
      lastEdited: editedAt ? d3.utcFormat("%Y-%m-%d %H:%M UTC")(editedAt) : "—",
      _editedAt: editedAt ? +editedAt : -Infinity
    };
  })
  .sort((a, b) => d3.descending(a._editedAt, b._editedAt));

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

<details id="data-sources">
  <summary>View all data sources from <a href="https://github.com/ben-tanen/media-count-automation/actions" target="_blank" rel="noopener noreferrer"><code>media-count-automation</code> GH Action</a></summary>

  ${sourceTable}
</details>

***

## Updates

```js
const updates = FileAttachment("data/media-counts-update-log.json").json();
```

<style>
  .update-body { font: 17px/1.5 var(--serif); }
  .update-body > div > :first-child { margin-top: 0.5rem; }
  .update-body > div > :last-child { margin-bottom: 0; }
</style>

```js
updates.sort((a, b) => d3.descending(a.date, b.date)).forEach(update => {
  const body = document.createElement("div");
  body.innerHTML = update.content;
  display(html`<details class="card update-body"><summary><b>${update.date}</b>: <i>${update.title}</i></summary>${body}</details>`);
});
```
