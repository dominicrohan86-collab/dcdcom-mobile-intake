const iconPaths = {
  home: "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10.5z",
  briefcase: "M10 6V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v1m-9 0h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm0 5h14",
  chart: "M4 19V9m8 10V5m8 14v-8M3 21h18",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  plus: "M12 5v14M5 12h14",
  bag: "M6 8h12l-1 12H7L6 8zm3 0a3 3 0 0 1 6 0",
  help: "M9.1 9a3 3 0 1 1 4.5 2.6c-.9.5-1.6 1.1-1.6 2.4M12 18h.01",
  calendar: "M7 2v4m10-4v4M4 9h16M5 4h14a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z",
  dollar: "M12 2v20m4-16.5c-1-.9-2.2-1.5-4-1.5-2.1 0-3.5 1-3.5 2.6 0 4.3 7 2 7 6.8 0 1.7-1.5 2.8-3.7 2.8-1.8 0-3.3-.6-4.4-1.8",
  building: "M4 21V7l8-4 8 4v14M9 21v-8h6v8M8 9h.01M12 9h.01M16 9h.01",
  alert: "M12 3 2 21h20L12 3zm0 6v5m0 4h.01",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1z",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm18 3-10 7L2 7",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  camera: "M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm8 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  user: "M20 21a8 8 0 0 0-16 0m8-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  pin: "M12 21s7-4.4 7-11a7 7 0 1 0-14 0c0 6.6 7 11 7 11zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  spark: "M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z",
  refresh: "M21 12a9 9 0 0 1-15.4 6.4L3 16m0 0v5h5m-5-5a9 9 0 0 1 15.4-6.4L21 8m0 0V3h-5",
  check: "M20 6 9 17l-5-5",
  copy: "M8 8h12v12H8z M4 4h12v12",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"
};

export function icon(name, cls = "") {
  const path = iconPaths[name] || iconPaths.more;
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
}

export function logo() {
  return `<div class="brand-mark">${icon("building")}</div><strong>DCDcom</strong>`;
}

export function avatar() {
  return `<div class="avatar" aria-label="Alex profile"><span></span></div>`;
}
