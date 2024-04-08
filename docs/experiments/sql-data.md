---
title: SQL Data Test
description: this page is a test of using SQL data
sql:
    test: ../data/gsheet.csv
---

# Experiment: Using the built-in SQL functionality

Observable introduced client-side SQL queries in [v1.4.0](https://github.com/observablehq/framework/releases/tag/v1.4.0), which allows you to use SQL for data queries and transformation.

In the frontmatter of this page, I've defined a SQL source table `test` that is just set based on the `gsheet.csv` data used on [this page](../experiments/gsheet-data).

```yaml
sql:
    test: ../data/gsheet.csv
```

Now that `test` is set, we can write simple queries to look at that data.

```sql display echo
SELECT * FROM test
```

We can also use Observable's pre-defined Inputs library to make more dynamic on-page SQL queries.

```js
const z = view(
    Inputs.range(
        [5, 8], 
        {label: "Set upper limit for `z`", step: 1, value: 8}
    )
);
```

```sql id=test2 display echo
SELECT 
    * 
FROM test
WHERE z <= ${z}
```

For this second query, we can also export the results as a new table by defining `id=test2` in the code block's meta. This way, we can use the query's result in the plot below.

```js echo
Plot.plot({
    title: "An incredibly useful chart",
    width,
    height: 300,
    x: {grid: true, label: "X-Axis", domain: [0, 10]},
    y: {grid: true, label: "Y-Axis", domain: [0, 10]},
    r: {domain: [10, 13], range: [5, 20]},
    marks: [
      Plot.dot(test2, {x: "y", y: "z", tip: true, fill: "x", r: "w"})
    ]
})
```

