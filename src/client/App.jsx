import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "./components/Shell";
import { ActionAlertViewport, Button, EmptyState, Notice } from "./components/ui";
import { client } from "./lib/api";
import { applyPwaUpdate, registerPwa } from "./lib/pwa";
import { adaptInquiry } from "./lib/utils";
import { AddInquiryScreen } from "./screens/AddInquiry";
import { EmailScreen, ProposalScreen } from "./screens/Composers";
import { InquiryDetailScreen, DetailLoading } from "./screens/InquiryDetail";
import { DocsScreen, MoreScreen } from "./screens/Library";
import { LoginScreen } from "./screens/Login";
import { PipelineScreen } from "./screens/Queues";
import { TodayScreen } from "./screens/Today";

const detailScreens = new Set(["detail", "docs", "email", "proposal"]);

export function App() {
  const queryClient = useQueryClient();
  const initialRoute = React.useMemo(() => routeFromLocation(), []);
  const routeInitialized = React.useRef(initialRoute.explicit);
  const [screen, setScreen] = React.useState(initialRoute.screen);
  const [history, setHistory] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(initialRoute.selectedId);
  const [documentToOpen, setDocumentToOpen] = React.useState(null);
  const [actionAlerts, setActionAlerts] = React.useState([]);
  const [analysis, setAnalysis] = React.useState(null);
  const [signedOut, setSignedOut] = React.useState(() => isAuthRoute());
  const [pwaUpdateAvailable, setPwaUpdateAvailable] = React.useState(false);
  const online = useOnlineStatus();
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: client.bootstrap, enabled: !signedOut });
  const inquiries = bootstrap.data?.inquiries || [];
  const draftScope = React.useMemo(() => workspaceDraftScope(bootstrap.data), [bootstrap.data?.accountId, bootstrap.data?.user?.id, bootstrap.data?.user?.email]);
  const dismissActionAlert = React.useCallback((id) => setActionAlerts((items) => items.filter((alert) => alert.id !== id)), []);
  const setNotice = React.useCallback((notice, tone = "success") => {
    const payload = typeof notice === "string" ? { message: notice, tone } : notice;
    const message = String(payload?.message || "").trim();
    if (!message) return;
    const alertTone = payload?.tone || tone;
    setActionAlerts((items) => [...items.slice(-3), {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      tone: alertTone,
      title: payload?.title || actionAlertTitle(message, alertTone),
      message,
      duration: payload?.duration || 10000
    }]);
  }, []);
  const login = useMutation({
    mutationFn: client.login,
    onSuccess: async () => {
      setNotice("");
      setSignedOut(false);
      setHistory([]);
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      replaceUrl("/today");
    }
  });
  const signup = useMutation({
    mutationFn: client.signup,
    onSuccess: async () => {
      setNotice("");
      setSignedOut(false);
      setHistory([]);
      setScreen("today");
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      replaceUrl("/today");
    }
  });
  const resetPassword = useMutation({
    mutationFn: client.resetPassword,
    onSuccess: async () => {
      setSignedOut(false);
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      replaceUrl("/today");
    }
  });
  const acceptInvite = useMutation({
    mutationFn: client.acceptInvite,
    onSuccess: async () => {
      setSignedOut(false);
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      replaceUrl("/today");
    }
  });
  const logout = useMutation({
    mutationFn: client.logout,
    onSuccess: async () => {
      setSelectedId(null);
      setHistory([]);
      setScreen("today");
      setSignedOut(true);
      queryClient.removeQueries();
      replaceUrl("/login");
    }
  });

  React.useEffect(() => {
    if (selectedId || !inquiries[0]?.id || !bootstrap.data?.user?.id) return;
    const savedId = readLocalValue(`dcdcom:${draftScope}:last-selected-inquiry`);
    setSelectedId(inquiries.some((inquiry) => inquiry.id === savedId) ? savedId : inquiries[0].id);
  }, [bootstrap.data?.user?.id, draftScope, inquiries, selectedId]);

  React.useEffect(() => {
    if (selectedId && bootstrap.data?.user?.id) writeLocalValue(`dcdcom:${draftScope}:last-selected-inquiry`, selectedId);
  }, [bootstrap.data?.user?.id, draftScope, selectedId]);

  React.useEffect(() => {
    registerPwa({ onUpdate: () => setPwaUpdateAvailable(true) });
  }, []);

  React.useEffect(() => {
    const defaultView = bootstrap.data?.preferences?.defaultView || bootstrap.data?.preferences?.default_view;
    if (!routeInitialized.current && defaultView && ["today", "pipeline", "docs", "more"].includes(defaultView)) {
      routeInitialized.current = true;
      setScreen(defaultView);
      replaceUrl(pathForScreen(defaultView, selectedId));
    }
  }, [bootstrap.data?.preferences?.defaultView, bootstrap.data?.preferences?.default_view]);

  React.useEffect(() => {
    const onPopState = () => {
      const route = routeFromLocation();
      setSignedOut(isAuthRoute());
      setScreen(route.screen);
      if (route.selectedId) setSelectedId(route.selectedId);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const detail = useQuery({
    queryKey: ["inquiry", selectedId],
    queryFn: () => client.inquiry(selectedId),
    enabled: Boolean(selectedId && detailScreens.has(screen))
  });

  const analyze = useMutation({ mutationFn: (payload) => client.analyze(payload), onSuccess: setAnalysis });
  const create = useMutation({
    mutationFn: async ({ photos = [], ...payload }) => {
      const result = await client.createInquiry(payload);
      const uploads = await Promise.allSettled(photos.map((photo) => client.upload(result.id, photo, "photo")));
      return {
        ...result,
        uploadedPhotoCount: uploads.filter((upload) => upload.status === "fulfilled").length,
        failedPhotoCount: uploads.filter((upload) => upload.status === "rejected").length
      };
    },
    onSuccess: async (result) => {
      setSelectedId(result.id);
      setAnalysis(result);
      const photoMessage = result.failedPhotoCount
        ? ` ${result.uploadedPhotoCount} attached; ${result.failedPhotoCount} could not be uploaded.`
        : result.uploadedPhotoCount ? ` ${result.uploadedPhotoCount} ${result.uploadedPhotoCount === 1 ? "photo" : "photos"} attached.` : "";
      setNotice(`Inquiry generated and added to the queue.${photoMessage}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] })
      ]);
      go("detail");
    }
  });

  function go(next, options = {}) {
    if (next !== screen && options.replace !== true) setHistory((items) => [...items.slice(-10), screen]);
    setNotice("");
    setScreen(next);
    const nextPath = pathForScreen(next, selectedId);
    if (options.replace) replaceUrl(nextPath);
    else pushUrl(nextPath);
  }

  function back() {
    setHistory((items) => {
      const copy = [...items];
      const previous = copy.pop() || "today";
      setScreen(previous);
      replaceUrl(pathForScreen(previous, selectedId));
      return copy;
    });
  }

  function open(id) {
    setSelectedId(id);
    navigateTo("detail", id);
  }

  function openWorkflow(id, target = "detail") {
    setSelectedId(id);
    navigateTo(target, id);
  }

  function openDocument(documentId) {
    setDocumentToOpen(documentId);
    navigateTo("docs", selectedId);
  }

  function openNotification(notification) {
    const relatedInquiryId = notification.relatedInquiryId;
    const target = ["today", "pipeline", "detail", "docs", "email", "proposal"].includes(notification.actionRoute) ? notification.actionRoute : (notification.relatedInquiryId ? "detail" : "today");
    if (relatedInquiryId) navigateTo(target, relatedInquiryId);
    else go(target);
  }

  async function handleInquiryDeleted(id, title) {
    queryClient.removeQueries({ queryKey: ["inquiry", id] });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      queryClient.invalidateQueries({ queryKey: ["today"] })
    ]);
    const remaining = queryClient.getQueryData(["bootstrap"])?.inquiries || [];
    setSelectedId(remaining[0]?.id || null);
    setHistory([]);
    setScreen("pipeline");
    replaceUrl("/inquiries");
    setNotice(`${title} and all linked data were deleted.`);
  }

  function navigateTo(next, id = selectedId, options = {}) {
    if (next !== screen && options.replace !== true) setHistory((items) => [...items.slice(-10), screen]);
    setNotice("");
    setScreen(next);
    if (id) setSelectedId(id);
    const nextPath = pathForScreen(next, id);
    if (options.replace) replaceUrl(nextPath);
    else pushUrl(nextPath);
  }

  if (signedOut || (bootstrap.error && isUnauthorized(bootstrap.error))) return <>
    <LoginScreen login={(payload) => login.mutate(payload)} signup={(payload) => signup.mutate(payload)} resetPassword={(payload) => resetPassword.mutate(payload)} acceptInvite={(payload) => acceptInvite.mutate(payload)} busy={login.isPending || signup.isPending || resetPassword.isPending || acceptInvite.isPending} error={login.error?.message || signup.error?.message || resetPassword.error?.message || acceptInvite.error?.message} notify={setNotice} />
    <ActionAlertViewport alerts={actionAlerts} dismiss={dismissActionAlert} />
  </>;
  if (bootstrap.isLoading) return <><main className="grid min-h-dvh place-items-center bg-background text-sm text-muted-foreground"><span className="flex items-center gap-2"><span className="size-4 animate-spin rounded-full border-2 border-border border-t-brand" />Loading workspace...</span></main><ActionAlertViewport alerts={actionAlerts} dismiss={dismissActionAlert} /></>;
  if (bootstrap.error) return <><main className="grid min-h-dvh place-items-center bg-background p-6"><EmptyState>Could not load the workspace: {bootstrap.error.message}</EmptyState></main><ActionAlertViewport alerts={actionAlerts} dismiss={dismissActionAlert} /></>;

  const titles = { add: "Add Inquiry", detail: "Inquiry", email: "Follow-up", proposal: "Documents" };
  const hasBack = ["add", "detail", "email", "proposal"].includes(screen);
  let content;

  if (screen === "today") content = <TodayScreen openWorkflow={openWorkflow} setNotice={setNotice} />;
  else if (screen === "pipeline") content = <PipelineScreen inquiries={inquiries} open={open} setNotice={setNotice} savedViews={bootstrap.data.personalization?.savedViews || []} />;
  else if (screen === "add") content = <AddInquiryScreen create={(payload) => create.mutate(payload)} busy={analyze.isPending || create.isPending} result={analysis} error={(analyze.error || create.error)?.message} setNotice={setNotice} draftScope={draftScope} />;
  else if (screen === "more") content = <MoreScreen user={bootstrap.data.user} preferences={bootstrap.data.preferences} personalization={bootstrap.data.personalization} integrations={bootstrap.data.integrations} selectedId={selectedId} setNotice={setNotice} />;
  else if (detail.isLoading || !detail.data) content = detail.error ? <EmptyState>Could not load this inquiry.</EmptyState> : <DetailLoading />;
  else if (screen === "detail") content = <InquiryDetailScreen detail={detail.data} user={bootstrap.data.user} navigate={go} openDocument={openDocument} setNotice={setNotice} onDeleted={handleInquiryDeleted} />;
  else if (screen === "email") content = <EmailScreen detail={detail.data} setNotice={setNotice} draftScope={draftScope} />;
  else if (screen === "proposal") content = <ProposalScreen detail={detail.data} setNotice={setNotice} draftScope={draftScope} />;
  else if (screen === "docs") content = <DocsScreen inquiries={inquiries} selectedId={selectedId} selectInquiry={(id) => { setSelectedId(id); replaceUrl(pathForScreen("docs", id)); }} detail={detail.data} navigate={go} initialDocumentId={documentToOpen} onDocumentOpened={() => setDocumentToOpen(null)} notify={setNotice} />;
  else content = <TodayScreen openWorkflow={openWorkflow} setNotice={setNotice} />;

  return <>
    <Shell screen={screen} navigate={go} title={titles[screen]} back={hasBack ? back : null} user={bootstrap.data.user} openNotification={openNotification} signOut={() => logout.mutate()} signingOut={logout.isPending}>
      {!online && <div aria-live="polite"><Notice tone="warning">You are offline. Drafts are saved on this device; network actions will resume when you reconnect.</Notice></div>}
      {pwaUpdateAvailable && <div aria-live="polite"><Notice tone="warning"><span className="flex flex-wrap items-center justify-between gap-3"><span className="min-w-0 flex-1">A new version of DCDcom Intake is ready.</span><Button type="button" size="sm" variant="outline" onClick={() => { setPwaUpdateAvailable(false); applyPwaUpdate(); }}>Reload</Button></span></Notice></div>}
      {content}
    </Shell>
    <ActionAlertViewport alerts={actionAlerts} dismiss={dismissActionAlert} />
  </>;
}

function useOnlineStatus() {
  const [online, setOnline] = React.useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

function isUnauthorized(error) {
  return error?.response?.status === 401 || String(error?.message || "").toLowerCase().includes("authentication required");
}

function actionAlertTitle(message, tone) {
  const text = String(message || "").toLowerCase();
  if (tone === "error") {
    if (text.includes("calendar")) return "Calendar action failed";
    if (text.includes("notification")) return "Notifications unavailable";
    if (text.includes("upload") || text.includes("file")) return "File action failed";
    if (text.includes("generate") || text.includes("draft")) return "Generation failed";
    if (text.includes("share") || text.includes("link")) return "Share action failed";
    if (text.includes("password") || text.includes("sign")) return "Authentication failed";
    return "Action failed";
  }
  if (text.includes("watch")) return "Watcher updated";
  if (text.includes("owner")) return "Owner updated";
  if (text.includes("detail")) return "Inquiry updated";
  if (text.includes("inquiry generated")) return "Inquiry generated";
  if (text.includes("inquiry") && text.includes("deleted")) return "Inquiry deleted";
  if (text.includes("upload") || text.includes("file") || text.includes("photo")) return "Files updated";
  if (text.includes("download")) return "Download started";
  if (text.includes("copied") || text.includes("share")) return "Link copied";
  if (text.includes("generated")) return "Draft generated";
  if (text.includes("saved")) return "Saved";
  if (text.includes("queued")) return "Response queued";
  if (text.includes("sent")) return "Response sent";
  if (text.includes("invite")) return "Invite created";
  if (text.includes("integration")) return "Integration connected";
  if (text.includes("profile")) return "Profile saved";
  if (text.includes("password")) return "Password updated";
  return tone === "warning" ? "Action needs attention" : "Action complete";
}

function isAuthRoute() {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return ["/login", "/signup", "/reset-password", "/accept-invite"].includes(path);
}

function routeFromLocation() {
  if (typeof window === "undefined") return { screen: "today", selectedId: null, explicit: false };
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/inquiries/new") return { screen: "add", selectedId: null, explicit: true };
  const inquiryMatch = path.match(/^\/inquiries\/([^/]+)(?:\/([^/]+))?$/);
  if (inquiryMatch) {
    const selectedId = decodeURIComponent(inquiryMatch[1]);
    const child = inquiryMatch[2];
    if (child === "follow-up") return { screen: "email", selectedId, explicit: true };
    if (child === "proposal") return { screen: "proposal", selectedId, explicit: true };
    if (child === "documents") return { screen: "docs", selectedId, explicit: true };
    return { screen: "detail", selectedId, explicit: true };
  }
  const routes = {
    "/": "today",
    "/today": "today",
    "/inquiries": "pipeline",
    "/docs": "docs",
    "/documents": "docs",
    "/profile": "more",
    "/settings": "more",
    "/notifications": "today"
  };
  return { screen: routes[path] || "today", selectedId: null, explicit: path !== "/" };
}

function pathForScreen(screen, selectedId) {
  if (screen === "pipeline") return "/inquiries";
  if (screen === "add") return "/inquiries/new";
  if (screen === "detail" && selectedId) return `/inquiries/${encodeURIComponent(selectedId)}`;
  if (screen === "email" && selectedId) return `/inquiries/${encodeURIComponent(selectedId)}/follow-up`;
  if (screen === "proposal" && selectedId) return `/inquiries/${encodeURIComponent(selectedId)}/proposal`;
  if (screen === "docs" && selectedId) return `/inquiries/${encodeURIComponent(selectedId)}/documents`;
  if (screen === "docs") return "/docs";
  if (screen === "more") return "/profile";
  return "/today";
}

function pushUrl(path) {
  if (typeof window === "undefined" || window.location.pathname === path) return;
  window.history.pushState({}, "", path);
}

function replaceUrl(path) {
  if (typeof window === "undefined" || window.location.pathname === path) return;
  window.history.replaceState({}, "", path);
}

function workspaceDraftScope(data) {
  const account = data?.accountId || "workspace";
  const user = data?.user?.id || data?.user?.email || "user";
  return [account, user].map(draftSegment).join(":");
}

function draftSegment(value) {
  return String(value || "unknown").toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function readLocalValue(key) {
  try { return window.localStorage.getItem(key) || ""; } catch { return ""; }
}

function writeLocalValue(key, value) {
  try { window.localStorage.setItem(key, value); } catch {}
}
