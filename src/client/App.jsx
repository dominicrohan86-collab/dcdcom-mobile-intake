import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "./components/Shell";
import { EmptyState, Notice } from "./components/ui";
import { client } from "./lib/api";
import { adaptInquiry } from "./lib/utils";
import { AddInquiryScreen } from "./screens/AddInquiry";
import { EmailScreen, ProposalScreen } from "./screens/Composers";
import { InquiryDetailScreen, DetailLoading } from "./screens/InquiryDetail";
import { DocsScreen, MoreScreen } from "./screens/Library";
import { PipelineScreen } from "./screens/Queues";
import { TodayScreen } from "./screens/Today";

const detailScreens = new Set(["detail", "docs", "email", "proposal"]);

export function App() {
  const queryClient = useQueryClient();
  const [screen, setScreen] = React.useState("today");
  const [history, setHistory] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(null);
  const [documentToOpen, setDocumentToOpen] = React.useState(null);
  const [notice, setNotice] = React.useState("");
  const [analysis, setAnalysis] = React.useState(null);
  const online = useOnlineStatus();
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: client.bootstrap });
  const inquiries = bootstrap.data?.inquiries || [];

  React.useEffect(() => {
    if (!selectedId && inquiries[0]?.id) setSelectedId(inquiries[0].id);
  }, [inquiries, selectedId]);

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
      setNotice(`Inquiry saved and added to the queue.${photoMessage}`);
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      go("detail");
    }
  });

  function go(next, options = {}) {
    if (next !== screen && options.replace !== true) setHistory((items) => [...items.slice(-10), screen]);
    setNotice("");
    setScreen(next);
  }

  function back() {
    setHistory((items) => {
      const copy = [...items];
      setScreen(copy.pop() || "today");
      return copy;
    });
  }

  function open(id) {
    setSelectedId(id);
    go("detail");
  }

  function openWorkflow(id, target = "detail") {
    setSelectedId(id);
    go(target);
  }

  function openDocument(documentId) {
    setDocumentToOpen(documentId);
    go("docs");
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
    setNotice(`${title} and all linked data were deleted.`);
  }

  if (bootstrap.isLoading) return <main className="grid min-h-dvh place-items-center bg-slate-100 text-sm text-slate-500">Loading workspace...</main>;
  if (bootstrap.error) return <main className="grid min-h-dvh place-items-center bg-slate-100 p-6"><Notice tone="error">Could not load the workspace: {bootstrap.error.message}</Notice></main>;

  const titles = { add: "Add Inquiry", detail: "Inquiry", email: "Follow-up", proposal: "Proposal" };
  const hasBack = ["add", "detail", "email", "proposal"].includes(screen);
  let content;

  if (screen === "today") content = <TodayScreen openWorkflow={openWorkflow} />;
  else if (screen === "pipeline") content = <PipelineScreen inquiries={inquiries} open={open} notice={notice} />;
  else if (screen === "add") content = <AddInquiryScreen analyze={(payload) => analyze.mutate(payload)} create={(payload) => create.mutate(payload)} busy={analyze.isPending || create.isPending} result={analysis} error={(analyze.error || create.error)?.message} />;
  else if (screen === "more") content = <MoreScreen user={bootstrap.data.user} preferences={bootstrap.data.preferences} integrations={bootstrap.data.integrations} selectedId={selectedId} notice={notice} setNotice={setNotice} />;
  else if (detail.isLoading || !detail.data) content = detail.error ? <EmptyState>Could not load this inquiry.</EmptyState> : <DetailLoading />;
  else if (screen === "detail") content = <InquiryDetailScreen detail={detail.data} navigate={go} openDocument={openDocument} notice={notice} setNotice={setNotice} onDeleted={handleInquiryDeleted} />;
  else if (screen === "email") content = <EmailScreen detail={detail.data} notice={notice} setNotice={setNotice} />;
  else if (screen === "proposal") content = <ProposalScreen detail={detail.data} notice={notice} setNotice={setNotice} />;
  else if (screen === "docs") content = <DocsScreen inquiries={inquiries} selectedId={selectedId} selectInquiry={setSelectedId} detail={detail.data} navigate={go} initialDocumentId={documentToOpen} onDocumentOpened={() => setDocumentToOpen(null)} />;
  else content = <TodayScreen openWorkflow={openWorkflow} />;

  return <Shell screen={screen} navigate={go} title={titles[screen]} back={hasBack ? back : null} user={bootstrap.data.user}>{!online && <Notice tone="warning">You are offline. Drafts are saved on this device; network actions will resume when you reconnect.</Notice>}{content}</Shell>;
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
