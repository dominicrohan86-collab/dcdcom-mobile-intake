import { readFile } from "node:fs/promises";

const files = {
  app: await readFile("src/client/App.jsx", "utf8"),
  shell: await readFile("src/client/components/Shell.jsx", "utf8"),
  ui: await readFile("src/client/components/ui.jsx", "utf8"),
  add: await readFile("src/client/screens/AddInquiry.jsx", "utf8"),
  detail: await readFile("src/client/screens/InquiryDetail.jsx", "utf8"),
  docs: await readFile("src/client/screens/Library.jsx", "utf8"),
  pipeline: await readFile("src/client/screens/Queues.jsx", "utf8"),
  today: await readFile("src/client/screens/Today.jsx", "utf8"),
  composers: await readFile("src/client/screens/Composers.jsx", "utf8"),
  api: await readFile("src/client/lib/api.js", "utf8"),
  css: await readFile("src/client/styles.css", "utf8")
};

for (const screen of ["today", "pipeline", "add", "docs", "more", "detail", "email", "proposal"]) {
  assert(files.app.includes(`"${screen}"`), `App should route the ${screen} screen`);
}

for (const nav of ["Today", "Inquiries", "Add", "Docs", "More"]) {
  assert(files.shell.includes(nav), `Mobile shell should expose ${nav} navigation`);
}

assert(files.shell.includes("h-dvh") && files.shell.includes("max-w-[430px]"), "Mobile shell should constrain to a phone viewport");
assert(files.shell.includes("h-[72px]") && files.shell.includes("grid-cols-5"), "Bottom navigation should keep five stable touch targets");
assert(files.ui.includes("min-h-9") && files.ui.includes("focus-visible:ring"), "Shared buttons should preserve touch height and focus visibility");
assert(files.ui.includes("warning") && files.app.includes("useOnlineStatus"), "App should expose offline warning state");
assert(files.app.includes("You are offline") && files.app.includes("Drafts are saved"), "Offline state should explain local draft behavior");
assert(files.api.includes("inquiries:") && files.pipeline.includes("client.inquiries"), "Client should expose server-backed inquiry listing");
assert(files.add.includes("MAX_PHOTO_BYTES") && files.add.includes("accept=\"image/*\""), "Intake screen should constrain photo selection");
assert(files.add.includes("localStorage") && files.add.includes("dcdcom:intake-draft"), "Intake screen should persist local drafts");
assert(files.detail.includes("useDropzone") && files.detail.includes("maxSize: 12 * 1024 * 1024"), "Detail screen should constrain drag/drop uploads");
assert(files.detail.includes("FileEvidence") && files.detail.includes("/api/files/"), "Detail screen should render linked file evidence");
assert(files.docs.includes("DocumentViewer") && files.docs.includes("isPdf(file)") && files.docs.includes("downloadUrl"), "Docs screen should preview and download durable files");
assert(files.docs.includes("document_export") || files.docs.includes("PDFs"), "Docs screen should have a PDF/document-export lane");
assert(files.today.includes("CalendarStatus") && files.today.includes("Ready to move"), "Today screen should show calendar state and actionable work");
assert(files.composers.includes("saveDocument") && files.composers.includes("submitReview") && files.composers.includes("sendFollowUp"), "Composers should save, review, and queue work");
assert(files.composers.includes("dcdcom:email-draft") && files.composers.includes("dcdcom:proposal-draft"), "Composers should persist local drafts per inquiry");

for (const endpoint of ["today", "inquiries/from-source", "inquiries/${id}/files", "inquiries/${id}/send-follow-up", "inquiries/${id}/proposal-review"]) {
  assert(files.api.includes(endpoint), `Client API should expose ${endpoint}`);
}

assert(!files.css.includes("font-size: clamp"), "Mobile typography should not scale directly with viewport width");
assert(files.css.includes("--color-brand") && files.css.includes("--color-blue-600"), "Brand and interaction colors should be centralized");

console.log("Mobile UI source regression checks passed.");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
