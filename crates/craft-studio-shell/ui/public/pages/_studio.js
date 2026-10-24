// Shared module switcher for the embedded mockup pages.
// The studio shell wires every `a[data-path]` inside the iframe to its own tabs.
(function () {
  const MODULES = [
    ["photocraft", "Photo"],
    ["vectorcraft", "Vector"],
    ["filmcraft", "Film"],
    ["wordcraft", "Word"],
    ["deckcraft", "Deck"],
    ["designcraft", "Design"],
    ["effectcraft", "Effect"],
    ["lightcraft", "Light"],
    ["gridcraft", "Grid"],
    ["pdfcraft", "PDF"],
  ];

  const current = (location.pathname.match(/pages\/([^/]+)\//) || [])[1] || "";

  const style = document.createElement("style");
  style.textContent = `
    body.has-modnav { padding-top: 30px; }
    body.has-modnav .shell { height: calc(100vh - 30px); }
    .modnav {
      position: fixed; top: 0; left: 0; right: 0; height: 30px; z-index: 2147483000;
      display: flex; align-items: center; gap: 2px;
      padding: 0 10px; overflow-x: auto; overflow-y: hidden;
      background: #0d1016; border-bottom: 1px solid #232833;
      font-family: "Inter", "Segoe UI", system-ui, sans-serif;
      scrollbar-width: none;
    }
    .modnav::-webkit-scrollbar { display: none; }
    .modnav a {
      flex: 0 0 auto; padding: 3px 7px; border-radius: 5px;
      color: #8b97a8; font-size: 10.5px; line-height: 1.4;
      text-decoration: none; white-space: nowrap;
      transition: background .15s, color .15s;
    }
    .modnav a:hover { background: #1a1f2a; color: #e5eaf2; }
    .modnav a.active {
      background: rgba(34, 211, 238, .14); color: #a5f3fc;
      box-shadow: inset 0 0 0 1px rgba(34, 211, 238, .35);
    }
    .modnav .sep { flex: 0 0 1px; height: 13px; background: #232833; margin: 0 4px; }
  `;
  document.head.appendChild(style);

  const nav = document.createElement("nav");
  nav.className = "modnav";
  nav.setAttribute("aria-label", "ArtCraft modules");
  nav.innerHTML =
    `<a href="#" data-path="dashboard-launcher"${current ? "" : ' class="active"'}>Dashboard</a>` +
    `<span class="sep"></span>` +
    MODULES.map(([id, label]) =>
      `<a href="#" data-path="${id}"${id === current ? ' class="active"' : ""}>${label}</a>`
    ).join("");

  document.body.classList.add("has-modnav");
  document.body.appendChild(nav);
})();
