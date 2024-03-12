---
title: Notion Test
theme: [deep-space, wide]
toc: true
description: this page is a test of using Notion data
---

# This is a custom page V3!!

This page will render data on the ${vinyl.length} records I currently have.

```js
const vinyl = FileAttachment("../data/notion-vinyl.json").json({typed: true});
console.log(vinyl)
```

The most recent record is *${vinyl[vinyl.length - 1].properties.Name.title[0].plain_text}* from **${vinyl[vinyl.length - 1].properties.Artist.rich_text[0].plain_text}**.

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

## Test section

Sint sit esse cupidatat irure pariatur commodo fugiat dolore ullamco do non. Ad deserunt excepteur officia consectetur voluptate dolore qui irure dolor adipisicing. Ut aliqua qui cillum voluptate consequat consequat ut. Sint fugiat minim eu anim cupidatat voluptate non quis sint ad nulla do elit ullamco. Sunt reprehenderit commodo commodo eiusmod reprehenderit eiusmod non mollit dolore mollit do. Veniam duis esse esse velit.

Tempor reprehenderit consectetur incididunt proident enim. Laboris ex elit amet voluptate voluptate non ex officia aliqua. Ea ad eu nostrud irure consectetur. Veniam labore sit cupidatat enim ipsum commodo ad nostrud labore anim. Sint non laborum consectetur tempor amet cillum dolore culpa consequat. Laborum aute duis do irure id non consequat deserunt dolor irure do occaecat proident. Quis aliqua est anim sit esse officia laborum mollit commodo eu ipsum esse amet. Velit et nostrud consequat duis ullamco cillum nostrud in ex commodo do.

## Test section 2

Ad cillum aliqua minim labore ut cupidatat quis veniam. Duis ea Lorem culpa et eiusmod commodo voluptate reprehenderit in. Et duis fugiat eu. Voluptate reprehenderit eu nulla ad aute. Et esse nulla reprehenderit dolore nulla irure non aliqua dolore.

Dolor proident ut nostrud do duis ex sit eu culpa irure exercitation proident ut enim ullamco. Mollit officia nostrud magna ipsum laborum elit nisi nulla mollit consectetur do. Anim culpa aliqua eu id aliqua culpa. Aute in duis officia pariatur anim culpa irure consectetur ipsum ut. Elit id voluptate sunt cillum duis exercitation consectetur sunt commodo. Aliquip aliquip reprehenderit consequat aliquip sunt adipisicing. Eu nulla cillum excepteur dolor et cillum veniam aliquip reprehenderit commodo aute et. Occaecat ad nisi ea elit dolor velit irure cillum laboris reprehenderit irure nulla.

Exercitation do consectetur officia dolore. Dolore proident laboris velit proident amet veniam non adipisicing nulla ex duis aute veniam eiusmod. Nisi Lorem aliqua labore sit esse officia. Occaecat do magna nisi tempor officia ut Lorem irure. Ullamco excepteur dolore ea et incididunt ullamco sit nisi id occaecat ex cillum excepteur.

