---
title: SQL Data Test
theme: [deep-space]
toc: true
description: this page is a test of using SQL data
sql:
    test: ../data/gsheet.csv
---

Introduced client-side SQL queries in [v1.4.0](https://github.com/observablehq/framework/releases/tag/v1.4.0)

```js
const z = view(
    Inputs.range(
        [5, 8], 
        {label: "z-limit", step: 1, value: 8}
    )
);
```

```sql id=test2 display
SELECT 
    * 
FROM test
WHERE z <= ${z}
```

```js
const xyzPlot = Plot.plot({
    title: "Title",
    width,
    height: 300,
    x: {grid: true, label: "X-Axis", domain: [0, 10]},
    y: {grid: true, label: "Y-Axis", domain: [0, 10]},
    r: {domain: [10, 13], range: [5, 20]},
    marks: [
      Plot.dot(test2, {x: "y", y: "z", tip: true, fill: "x", r: "w"})
    ]
});

display(xyzPlot);
```

