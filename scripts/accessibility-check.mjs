import { readFile } from "node:fs/promises";

const files = {
  app: await readFile("src/client/App.jsx", "utf8"),
  shell: await readFile("src/client/components/Shell.jsx", "utf8"),
  ui: await readFile("src/client/components/ui.jsx", "utf8"),
  login: await readFile("src/client/screens/Login.jsx", "utf8"),
  detail: await readFile("src/client/screens/InquiryDetail.jsx", "utf8"),
  docs: await readFile("src/client/screens/Library.jsx", "utf8"),
  notifications: await readFile("src/client/components/NotificationBell.jsx", "utf8"),
  css: await readFile("src/client/styles.css", "utf8")
};

for (const token of ["aria-label", "aria-expanded", "aria-live"]) {
  assert(Object.values(files).some((body) => body.includes(token)), `UI should include ${token}`);
}

for (const token of ["focus-visible:ring", "min-h-9", "disabled:opacity"]) {
  assert(files.ui.includes(token) || files.css.includes(token), `Shared UI should preserve ${token}`);
}

for (const token of ["type=\"email\"", "type=\"password\"", "Forgot password?", "Continue with Google", "Create account"]) {
  assert(files.login.includes(token), `Login should include accessible ${token}`);
}

for (const token of ["aria-label={`Delete", "aria-label=\"Primary inquiry actions\"", "Add a comment"]) {
  assert(files.detail.includes(token), `Inquiry detail should include ${token}`);
}

for (const token of ["No notifications yet", "Could not load notifications", "aria-expanded"]) {
  assert(files.notifications.includes(token), `Notifications should include ${token}`);
}

assert(!files.css.includes("outline: none;"), "Global CSS should not remove focus outlines");
assert(files.app.includes("You are offline"), "App should announce offline state");

console.log("Accessibility static checks passed.");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
