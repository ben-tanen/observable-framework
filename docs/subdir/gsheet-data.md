---
title: Google Sheet Test
theme: [deep-space, wide]
toc: true
description: this page is a test of using Google Sheet data
---

# This is a custom page V2!!

This is a page I'm making as a test. It's pulling it's data from a [Google Sheet](https://docs.google.com/spreadsheets/d/1wediAtmyRAZgCCaB4Bj9VCvWcOA6Ep8_7jjhJrR51HI/edit) - you probably don't have access 🙃

```js
const gsheet = FileAttachment("../data/gsheet.csv").csv({typed: true});
```

Here's a table of that data!

<div class="grid grid-cols-2">
  <div class="card">
  ${Inputs.table(gsheet, {
    format: {
        y: sparkbar(d3.max(gsheet, d => d.y)),
        z: sparkbar(d3.max(gsheet, d => d.z)),
        w: sparkbar(d3.max(gsheet, d => d.w))
    }
  })}
  </div>
  <div class="card">
    <p>Length of data: ${gsheet.length}</p>
    <p>Here's a sparkbar plot of the data inline: ${Plot.plot({axis: null, margin: 0, width: 80, height: 17, x: {type: "band", round: false}, marks: [Plot.rectY(gsheet, {x: "x", y1: 0, y2: "y", fill: "var(--theme-blue)"})]})}</p>
  </div>
</div>

Here's the code to make the columns with sparkbars within the table.

```js echo
function sparkbar(max) {
  return (x) => htl.html`<div style="
    background: var(--theme-blue);
    color: black;
    font: 10px/1.6 var(--sans-serif);
    width: ${100 * x / max}%;
    float: right;
    padding-right: 3px;
    box-sizing: border-box;
    overflow: visible;
    display: flex;
    justify-content: end;">${x.toLocaleString("en-US")}`
}
```

---

Here's a chart of the data!

```js
function chart(data, {width} = {}) {
  return Plot.plot({
    title: "Title",
    width,
    height: 300,
    x: {grid: true, label: "X-Axis", domain: [0, 10]},
    y: {grid: true, label: "Y-Axis", domain: [0, 10]},
    r: {domain: [10, 13], range: [5, 20]},
    marks: [
      Plot.dot(gsheet, {x: "y", y: "z", tip: true, fill: "x", r: "w"})
    ]
  });
}
```

<div class="grid grid-cols-1">
  <div class="card">
    ${resize((width) => chart(gsheet, {width}))}
  </div>
</div>



