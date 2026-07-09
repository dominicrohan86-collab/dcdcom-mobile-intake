import { readFile } from "node:fs/promises";

const files = {
  app: await readFile("src/client/App.jsx", "utf8"),
  shell: await readFile("src/client/components/Shell.jsx", "utf8"),
  notifications: await readFile("src/client/components/NotificationBell.jsx", "utf8"),
  ui: await readFile("src/client/components/ui.jsx", "utf8"),
  add: await readFile("src/client/screens/AddInquiry.jsx", "utf8"),
  detail: await readFile("src/client/screens/InquiryDetail.jsx", "utf8"),
  docs: await readFile("src/client/screens/Library.jsx", "utf8"),
  login: await readFile("src/client/screens/Login.jsx", "utf8"),
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

assert(files.app.includes("LoginScreen") && files.app.includes("isUnauthorized") && files.app.includes("replaceUrl(\"/login\")") && files.app.includes("isAuthRoute") && files.app.includes("enabled: !signedOut") && files.api.includes("login:"), "App should show a real signed-out login flow");
for (const path of ["/login", "/signup", "/reset-password", "/accept-invite"]) {
  assert(files.app.includes(path), `Signed-out state should survive refresh on ${path}`);
}
for (const path of ["/today", "/inquiries", "/inquiries/new", "/inquiries/${encodeURIComponent(selectedId)}", "/inquiries/${encodeURIComponent(selectedId)}/follow-up", "/inquiries/${encodeURIComponent(selectedId)}/proposal", "/inquiries/${encodeURIComponent(selectedId)}/documents", "/profile"]) {
  assert(files.app.includes(path), `App should support URL-backed route ${path}`);
}
assert(files.login.includes("Continue with Google") && files.login.includes("Forgot password?") && files.login.includes("Reset password") && files.login.includes("Accept invite") && files.login.includes("Create account") && files.login.includes("Already have an account? Sign in") && files.login.includes("DCDcom"), "Login screen should support password, Google, reset, invite, and signup entry points");
assert(files.api.includes("signup:") && files.app.includes("signup={(payload) => signup.mutate(payload)}") && files.login.includes("signup({ fullName, email, password })"), "Signup should be wired from login screen through client API");
assert(!files.login.includes("Dcdcom2026!") && !files.login.includes("alex@dcdcom.com"), "Login screen should not prefill demo credentials");
assert(!files.shell.includes("max-w-[430px]") && !files.shell.includes("rounded-[30px]") && files.shell.includes("lg:grid-cols-[240px_minmax(0,1fr)]"), "Production shell should remove the desktop phone-frame wrapper");
assert(files.shell.includes("lg:hidden") && files.shell.includes("h-[72px]") && files.shell.includes("grid-cols-5"), "Bottom navigation should keep five stable mobile touch targets");
assert(files.shell.includes("<aside") && files.shell.includes("Sign out") && files.shell.includes("Help") && files.shell.includes("roleLabel"), "Desktop shell should expose a signed-in side rail and profile menu");
assert(files.pipeline.includes("savedViews") && files.pipeline.includes("stageFromSavedView"), "Inquiry pipeline should expose user saved views");
assert(files.docs.includes("Security") && files.docs.includes("Change password") && files.docs.includes("Active sessions") && files.docs.includes("Google identity"), "More/Profile should expose signed-in security state");
assert(files.docs.includes("Admin users") && files.docs.includes("Invite teammate") && files.docs.includes("Create invite"), "More/Profile should expose admin user and invite management");
assert(files.docs.includes("Saved views") && files.docs.includes("Create saved view") && files.docs.includes("Audit history"), "More/Profile should expose saved-view management and audit visibility");
assert(files.api.includes("saveView") && files.api.includes("deleteView") && files.api.includes("auditLog"), "Client API should expose saved-view and audit endpoints");
assert(files.docs.includes("System health") && files.docs.includes("Readiness status") && files.api.includes("readiness"), "More/Profile should expose admin system health backed by readiness");
assert(files.docs.includes("Provider queue") && files.api.includes("providerQueue"), "System health should expose provider queue visibility");
assert(files.docs.includes("File retention") && files.docs.includes("Preview cleanup") && files.docs.includes("Legal hold") && files.api.includes("fileRetention") && files.api.includes("runFileRetention"), "More/Profile should expose file retention controls and cleanup previews");
assert(files.docs.includes("AI prompt registry") && files.docs.includes("Prompt version") && files.api.includes("aiPrompts"), "More/Profile and document preview should expose AI prompt registry and prompt version lineage");
assert(files.docs.includes("Help & support") && files.docs.includes("support@dcdcom.com"), "More/Profile should expose help and support context");
assert(files.docs.includes("Default screen") && files.docs.includes("Timezone") && files.docs.includes("Theme") && files.docs.includes("Save preferences"), "More/Profile should expose default view, timezone, and theme preferences");
assert(files.docs.includes("Recent work") && files.docs.includes("recentItems"), "More/Profile should surface personalized recent work");
assert(files.app.includes("default_view") && files.app.includes("defaultView"), "App should honor persisted default view from bootstrap");
assert(files.app.includes("last-selected-inquiry") && files.app.includes("workspaceDraftScope"), "App should remember the selected inquiry per signed-in user");
assert(files.shell.includes("NotificationBell") && files.app.includes("openNotification") && files.app.includes("navigateTo(target, relatedInquiryId)") && files.api.includes("notifications:"), "Shell should render a real notification bell wired to API data and deep-link navigation");
for (const token of ["unreadCount", "markAllNotificationsRead", "dismissNotification", "No notifications yet", "Could not load notifications", "aria-expanded"]) {
  assert(files.notifications.includes(token), `Notification panel should include ${token}`);
}
assert(files.ui.includes("min-h-9") && files.ui.includes("focus-visible:ring"), "Shared buttons should preserve touch height and focus visibility");
assert(files.ui.includes("warning") && files.app.includes("useOnlineStatus"), "App should expose offline warning state");
assert(files.app.includes("You are offline") && files.app.includes("Drafts are saved"), "Offline state should explain local draft behavior");
assert(files.api.includes("inquiries:") && files.pipeline.includes("client.inquiries"), "Client should expose server-backed inquiry listing");
assert(files.add.includes("MAX_PHOTO_BYTES") && files.add.includes("accept=\"image/*\""), "Intake screen should constrain photo selection");
assert(files.app.includes("workspaceDraftScope") && files.add.includes("localStorage") && files.add.includes("draftScope") && files.add.includes("intake-draft"), "Intake screen should persist user-scoped local drafts");
assert(files.detail.includes("useDropzone") && files.detail.includes("maxSize: 12 * 1024 * 1024"), "Detail screen should constrain drag/drop uploads");
assert(files.detail.includes("FileEvidence") && files.detail.includes("/api/files/"), "Detail screen should render linked file evidence");
assert(files.detail.includes("SHA-256") && files.detail.includes("shortHash") && files.detail.includes("content_hash"), "File evidence should expose integrity hashes");
assert(files.detail.includes("thumbnailUrl(file)") && files.docs.includes("/thumbnail") && files.docs.includes("thumbnail_status"), "File evidence and Docs should use generated thumbnails when available");
assert(files.detail.includes("OwnerPanel") && files.detail.includes("Assign inquiry owner") && files.api.includes("updateOwner"), "Detail screen should expose owner assignment for managers");
assert(files.api.includes("expectedUpdatedAt") && files.detail.includes("expectedUpdatedAt: item.updated_at") && files.composers.includes("expectedVersion"), "Critical edits should send optimistic concurrency guards");
assert(files.detail.includes("WatchersButton") && files.detail.includes("WatchersDialog") && files.detail.includes("watchMutation") && files.detail.includes("Add yourself as watcher"), "Detail screen should expose inquiry watch/unwatch controls");
assert(files.api.includes("watchInquiry") && files.api.includes("unwatchInquiry") && files.api.includes("inquiries/${id}/watchers"), "Client API should expose watcher endpoints");
assert(files.pipeline.includes("owner_name") && files.pipeline.includes("Unassigned"), "Inquiry queue should show owner state");
assert(files.detail.includes("Add internal note") && files.api.includes("logCommunication"), "Detail screen should support internal note capture");
assert(files.detail.includes("Comments & mentions") && files.detail.includes("CommentThread") && files.detail.includes("@email") && files.api.includes("addComment"), "Detail screen should support collaborative comments and mentions");
assert(!files.detail.includes("title=\"Files & site evidence\" meta={`${files.length} ${files.length === 1 ? \"file\" : \"files\"}`} icon={<Paperclip size={17} />} defaultOpen"), "Files & site evidence should not expand automatically when opening an inquiry");
assert(files.detail.includes("DeleteFileButton") && files.detail.includes("Delete file?") && files.detail.includes("absolute right-1.5 top-1.5"), "File evidence should expose a top-right delete control with confirmation");
assert(files.detail.includes("action.target !== \"docs\""), "Recommended next step should not show duplicate Docs actions when Docs is already primary");
for (const label of ["Floor plan", "Equipment list", "Contract", "Email attachment"]) {
  assert(files.detail.includes(label), `Detail workflow checklist should track ${label}`);
}
assert(files.detail.includes("photoCategoryForSelection"), "Photo uploads should honor selected source document categories");
assert(files.docs.includes("DocumentViewer") && files.docs.includes("isPdf(file)") && files.docs.includes("downloadUrl"), "Docs screen should preview and download durable files");
assert(files.docs.includes("client.shareFile") && files.docs.includes("Signed external link copied") && files.api.includes("shareFile") && files.api.includes("file-share-links"), "Docs screen should create signed external share links for files");
assert(files.docs.includes("document_export") || files.docs.includes("PDFs"), "Docs screen should have a PDF/document-export lane");
assert(files.docs.includes("Review status") && files.docs.includes("Source references") && files.docs.includes("Version history") && files.docs.includes("Version comparison"), "Docs screen should expose review status, sources, and version comparison");
assert(files.today.includes("CalendarStatus") && !files.today.includes("Ready to move"), "Today screen should show calendar state without the Ready to move section");
assert(files.today.includes("My Focus") && files.today.includes("FocusAction") && files.today.includes("agenda.data?.actions"), "Today screen should expose a personalized focus queue");
assert(files.today.includes("if (!broken) return null") && !files.today.includes("Google synced") && !files.today.includes("calendar.calendarName"), "Today schedule should stay quiet when Google Calendar is connected");
assert(files.composers.includes("saveDocument") && files.composers.includes("submitReview") && files.composers.includes("sendFollowUp"), "Composers should save, review, and queue work");
assert(files.composers.includes("draftScope") && files.composers.includes("email-draft") && !files.composers.includes("proposal-draft"), "Email can persist user-scoped drafts, but document generation should start a new workflow every time");
for (const label of ["Select document type", "Select source documents", "Add additional context", "Generate document"]) {
  assert(files.composers.includes(label), `Document generator should include the ${label} step`);
}
assert(files.composers.includes("sourceDocumentIds") && files.composers.includes("additionalContext"), "Document generator should send selected source files and user context to AI generation");
assert(files.composers.includes("sourceDocumentOptions") && files.composers.includes("New upload"), "Document generator should reuse and distinguish project source documents");
assert(files.composers.includes("activeStep") && files.composers.includes("WizardProgress") && files.composers.includes("Next"), "Document generator should use a focused step-by-step wizard instead of one long stacked workflow");
assert(files.composers.includes("completedSteps") && files.composers.includes("unlockedStep") && files.composers.includes("disabled={locked}"), "Document generator should lock future steps until the current step is completed");
assert(!files.composers.includes("copyText") && !files.composers.includes("Save draft") && !files.composers.includes(">Copy<"), "Document generator should not expose copy or manual save buttons inside the wizard");
assert(!files.composers.includes("selectedDocument?.body") && !files.composers.includes("dcdcom:proposal-draft"), "Document generator should not hydrate or persist the current workflow until resume is intentionally added");
assert(files.api.includes("GENERATION_TIMEOUT_MS") && files.api.includes("friendlyTimeoutError"), "Generation requests should use a longer timeout with a friendly failure message");
assert(files.api.includes("INTAKE_TIMEOUT_MS") && files.api.includes("Inquiry creation is taking longer"), "Inquiry creation should use a longer timeout with a friendly failure message");
assert(files.composers.includes("generationErrorMessage") && files.composers.includes("local fallback"), "Document generator should explain AI timeout fallback states");

for (const endpoint of ["today", "inquiries/from-source", "inquiries/${id}/files", "files/${id}", "inquiries/${id}/send-follow-up", "inquiries/${id}/proposal-review"]) {
  assert(files.api.includes(endpoint), `Client API should expose ${endpoint}`);
}

assert(!files.css.includes("font-size: clamp"), "Mobile typography should not scale directly with viewport width");
assert(files.css.includes("--color-brand") && files.css.includes("--color-blue-600"), "Brand and interaction colors should be centralized");

console.log("Mobile UI source regression checks passed.");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
