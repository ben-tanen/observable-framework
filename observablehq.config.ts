export default {
  title: "BT Observable Framework",
  pages: [
    {name: "Test", path: "/test"},
    {name: "Experiments", open: false, pages: [
      {name: "Page Index Test", path: "/experiments/file-index"},
      {name: "Google Sheet Test", path: "/experiments/gsheet-data"},
      {name: "Notion Test", path: "/experiments/notion-data"}
    ]},
    {name: "Observable Default Examples", open: false, pages: [
      {name: "Home", path: "/observable-examples/index"},
      {name: "Dashboard", path: "/observable-examples/example-dashboard"},
      {name: "Report", path: "/observable-examples/example-report"},
    ]}
  ],
  search: true,
  pager: false,
  footer: `Built with <a href='https://github.com/ben-tanen/observable-framework'>Observable</a> by <a href="https://ben-tanen.com/">Ben Tanen</a>, updated ${new Date().toLocaleDateString('en-us', { month: '2-digit', day: '2-digit', year: 'numeric'})}`
  // Some additional configuration options and their defaults:
  // theme: "default", // try "light", "dark", "slate", etc.
  // header: "", // what to show in the header (HTML)
  // footer: "Built with Observable.", // what to show in the footer (HTML)
  // toc: true, // whether to show the table of contents
  // pager: true, // whether to show previous & next links in the footer
  // root: "docs", // path to the source root for preview
  // output: "dist", // path to the output root for build
};
