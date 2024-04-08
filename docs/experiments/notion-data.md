---
title: Notion Test
description: this page is a test of using data from Notion's API
---

# Experiment: Using data from Notion

Similar to [the Google Sheet data experiment](../experiments/gsheet-data), this page is simply set up to test getting data from my own Notion database. In this case, I'm simply pulling data from [my database where I track the vinyl records I own](https://btnotion.notion.site/4e61be4d03ce487b857c60681029c3d9?v=9a4eb9452a984763b46455fc8c867d54).

See [here](https://github.com/ben-tanen/observable-framework/blob/master/docs/data/notion-vinyl.json.py) for the data loader for getting the data from Notion via their API (written in Python).

---

```js
const vinyl = FileAttachment("../data/notion-vinyl.json").json({typed: true});
```

```js
const most_recent_vinyl = vinyl[vinyl.length - 1],
      vinyls_by_artist = Array.from(d3.rollup(
        vinyl,
        (group) => group.length,
        (d) => d.properties.Artist.rich_text[0].plain_text
      ));
vinyls_by_artist.sort((a, b) => d3.descending(a[1], b[1]));
```



Here is some information on the **${vinyl.length}** records I currently have:

- The most recent record is *${most_recent_vinyl.properties.Name.title[0].plain_text}* from **${most_recent_vinyl.properties.Artist.rich_text[0].plain_text}**.
- I have records from *${vinyls_by_artist.length}* distinct artists.
- I have *${vinyls_by_artist[0][1]}* records from **${vinyls_by_artist[0][0]}** (my most represented artist).

```js
function vinylTimeline(data, {width} = {}) {
  return Plot.plot({
    title: "Vinyl over the years",
    width,
    height: 300,
    x: {grid: true, label: "Year", tickFormat: Plot.formatWeekday()},
    y: {grid: true, label: "Vinyls added to Notion DB"},
    // color: {...color, legend: true},
    marks: [
      Plot.rectY(data, Plot.binX({y: "count"}, {x: "date_added", interval: "year", fill: "var(--theme-blue)", tip: true})),
      Plot.ruleY([0]),
      Plot.axisX({ticks: "1 year", tickFormat: "%Y"}),
    ]
  });
}
```

<div class="grid grid-cols-1">
  <div class="card">
    ${resize((width) => vinylTimeline(vinyl.map((d, i) => ({
        date_added: new Date(d.properties.Added.created_time),
        count: 1
    })), {width}))}
  </div>
</div>