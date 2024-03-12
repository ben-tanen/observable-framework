export default {
  title: "BT Observable Framework",
  pages: [
    {name: "Test", path: "/test"},
    {name: "Dashboard", path: "/example-dashboard"},
    {name: "Report", path: "/example-report"},
    {name: "Sub-Section", open: false, pages: [
      {name: "Google Sheet Test", path: "/subdir/gsheet-data"},
      {name: "Notion Test", path: "/subdir/notion-data"}
    ]}
  ],
  search: true,
  pager: false,
  // Some additional configuration options and their defaults:
  // theme: "default", // try "light", "dark", "slate", etc.
  // header: "", // what to show in the header (HTML)
  // footer: "Built with Observable.", // what to show in the footer (HTML)
  // toc: true, // whether to show the table of contents
  // pager: true, // whether to show previous & next links in the footer
  // root: "docs", // path to the source root for preview
  // output: "dist", // path to the output root for build
};
