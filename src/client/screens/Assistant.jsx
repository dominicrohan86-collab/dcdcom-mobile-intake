import React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, ChevronDown, Copy, ExternalLink, FilePlus2, History, MessageCircle, Paperclip, Plus, Save, Search, Send, Sparkles, Square, Upload, X } from "lucide-react";
import { Badge, Button, Dialog, Select } from "../components/ui";
import { client } from "../lib/api";
import { cn } from "../lib/utils";

const categories = [
  ["photo", "Photo"],
  ["floor_plan", "Floor plan"],
  ["equipment_list", "Equipment list"],
  ["contract", "Contract"],
  ["email_attachment", "Email attachment"],
  ["other", "Other"]
];

const responseModes = [
  ["answer", "Answer"],
  ["draft", "Draft"],
  ["extract", "Extract"],
  ["compare", "Compare"]
];

export function AssistantScreen({ inquiryId = null, detail = null, user, setNotice }) {
  const queryClient = useQueryClient();
  const scope = inquiryId ? "inquiry" : "workspace";
  const [activeSessionId, setActiveSessionId] = React.useState(null);
  const [transientSession, setTransientSession] = React.useState(null);
  const [startingFresh, setStartingFresh] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historySearch, setHistorySearch] = React.useState("");
  const [uploadMenuOpen, setUploadMenuOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [responseMode, setResponseMode] = React.useState("answer");
  const [fileCategory, setFileCategory] = React.useState("photo");
  const fileInputRef = React.useRef(null);
  const textareaRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const abortRef = React.useRef(null);
  const config = useQuery({
    queryKey: ["chatConfig"],
    queryFn: client.chatConfig,
    staleTime: 60_000
  });
  const assistantDisabled = config.data && (!config.data.enabled || (scope === "workspace" && !config.data.workspaceEnabled));

  const sessions = useQuery({
    queryKey: ["chatSessions", scope, inquiryId || ""],
    queryFn: () => client.chatSessions({ scope, inquiryId }),
    staleTime: 10_000,
    enabled: !assistantDisabled
  });
  const sessionItems = sessions.data?.sessions || [];
  const activeSession = React.useMemo(() => {
    if (startingFresh) return null;
    const selected = sessionItems.find((session) => session.id === activeSessionId);
    if (selected) return selected;
    if (activeSessionId) return transientSession?.id === activeSessionId ? transientSession : null;
    return sessionItems[0] || null;
  }, [activeSessionId, sessionItems, startingFresh, transientSession]);
  const sessionId = activeSession?.id || null;
  const messages = useQuery({
    queryKey: ["chatMessages", sessionId],
    queryFn: () => client.chatMessages(sessionId),
    enabled: Boolean(sessionId)
  });
  const chatFiles = useQuery({
    queryKey: ["chatFiles", sessionId],
    queryFn: () => client.chatFiles(sessionId),
    enabled: Boolean(sessionId)
  });

  React.useEffect(() => {
    if (!startingFresh && !activeSessionId && sessionItems[0]?.id) setActiveSessionId(sessionItems[0].id);
  }, [activeSessionId, sessionItems, startingFresh]);

  const sendMessage = useMutation({
    mutationFn: async ({ session, message }) => {
      const target = session || (await client.createChatSession({ scope, inquiryId, title: firstTitle(message) })).session;
      setTransientSession(target);
      setActiveSessionId(target.id);
      setStartingFresh(false);
      const controller = new AbortController();
      abortRef.current = controller;
      return client.sendChatMessage(target.id, { message, scope, inquiryId, responseMode }, { signal: controller.signal });
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chatSessions", scope, inquiryId || ""] }),
        queryClient.invalidateQueries({ queryKey: ["chatMessages", result.session.id] })
      ]);
      setTransientSession(null);
    },
    onError: (error, variables) => {
      setDraft((current) => current.trim() ? current : variables?.message || "");
      if (error?.name === "AbortError") setNotice("Assistant response stopped.", "warning");
      else setNotice(error.message, "error");
    },
    onSettled: () => {
      abortRef.current = null;
    }
  });

  const uploadFile = useMutation({
    mutationFn: async (file) => {
      const target = activeSession || (await client.createChatSession({ scope, inquiryId, title: scope === "inquiry" ? "Inquiry upload chat" : "Workspace upload chat" })).session;
      setTransientSession(target);
      setActiveSessionId(target.id);
      setStartingFresh(false);
      return client.uploadChatFile(target.id, file, { category: fileCategory, linkToInquiry: scope === "inquiry" });
    },
    onSuccess: async (result) => {
      setUploadMenuOpen(false);
      setNotice(result.linkedFileId ? "File uploaded and linked to the inquiry." : "File uploaded to the assistant.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chatFiles"] }),
        queryClient.invalidateQueries({ queryKey: ["chatSessions", scope, inquiryId || ""] }),
        queryClient.invalidateQueries({ queryKey: ["inquiry", inquiryId] })
      ]);
      setTransientSession(null);
    },
    onError: (error) => setNotice(error.message, "error")
  });

  React.useEffect(() => {
    const stream = streamRef.current;
    if (!stream || (!(messages.data?.messages?.length) && !sendMessage.isPending)) return;
    stream.scrollTo({ top: stream.scrollHeight, behavior: "smooth" });
  }, [messages.data?.messages?.length, sendMessage.isPending]);

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [draft]);

  const saveNote = useMutation({
    mutationFn: ({ messageId, body }) => client.saveChatNote(sessionId, { inquiryId, messageId, body }),
    onSuccess: async () => {
      setNotice("Assistant answer saved as an internal note.");
      await queryClient.invalidateQueries({ queryKey: ["inquiry", inquiryId] });
    },
    onError: (error) => setNotice(error.message, "error")
  });

  const createDraft = useMutation({
    mutationFn: ({ messageId, body }) => client.createChatDraft(sessionId, { inquiryId, messageId, body, documentType: "other", title: "Assistant Draft" }),
    onSuccess: async () => {
      setNotice("Draft created from assistant answer.");
      await queryClient.invalidateQueries({ queryKey: ["inquiry", inquiryId] });
    },
    onError: (error) => setNotice(error.message, "error")
  });

  const allMessages = messages.data?.messages || [];
  const suggested = scope === "inquiry" ? inquiryPrompts(detail) : workspacePrompts();
  const chatTitle = startingFresh ? "New chat" : activeSession?.title || "New chat";
  const latestMessage = allMessages[allMessages.length - 1];
  const pendingMessageAlreadyPersisted = sendMessage.isPending && latestMessage?.role === "user" && latestMessage.body === sendMessage.variables?.message;

  function submit(next = draft) {
    const message = String(next || "").trim();
    if (!message || sendMessage.isPending || assistantDisabled) return;
    sendMessage.mutate({ session: activeSession, message });
    setDraft("");
  }

  function stopGeneration() {
    abortRef.current?.abort();
  }

  function startNewChat() {
    if (sendMessage.isPending) stopGeneration();
    setStartingFresh(true);
    setActiveSessionId(null);
    setTransientSession(null);
    setDraft("");
    setHistoryOpen(false);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function openChat(id) {
    setStartingFresh(false);
    setActiveSessionId(id);
    setTransientSession(null);
    setHistoryOpen(false);
  }

  function handleComposerKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    submit();
  }

  return <section className="flex h-full min-h-[calc(100dvh-9rem)] flex-col overflow-hidden bg-card lg:min-h-0">
    <header className="relative z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/80 bg-card/90 px-3 backdrop-blur sm:px-5">
      <Button type="button" variant="ghost" size="icon" onClick={() => setHistoryOpen(true)} aria-label="Open chat history" title="Chat history" className="rounded-full">
        <History size={19} />
      </Button>
      <button type="button" onClick={() => setHistoryOpen(true)} className="group flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/70" aria-label={`Current chat: ${chatTitle}. Open chat history`}>
        <span className="max-w-[52vw] truncate text-sm font-semibold sm:max-w-md">{chatTitle}</span>
        <ChevronDown size={14} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-y-0.5" />
      </button>
      <Button type="button" variant="ghost" size="icon" onClick={startNewChat} aria-label="Start a new chat" title="New chat" className="rounded-full">
        <Plus size={20} />
      </Button>
    </header>

    <div ref={streamRef} className="min-h-0 flex-1 overflow-y-auto bg-card" aria-live="polite">
      {assistantDisabled ? <UnavailableState scope={scope} /> : messages.isLoading && sessionId && !sendMessage.isPending ? <ConversationSkeleton /> : allMessages.length === 0 && !sendMessage.isPending ? <WelcomeState scope={scope} detail={detail} user={user} prompts={suggested} submit={submit} /> : <div className="mx-auto w-full max-w-3xl px-4 py-7 sm:px-6 sm:py-10">
        <div className="grid gap-8 sm:gap-10">
          {allMessages.map((message) => <MessageBubble key={message.id} message={message} canSave={scope === "inquiry" && message.role === "assistant"} saving={saveNote.isPending || createDraft.isPending} onSaveNote={() => saveNote.mutate({ messageId: message.id })} onCreateDraft={() => createDraft.mutate({ messageId: message.id })} />)}
          {sendMessage.isPending && !pendingMessageAlreadyPersisted && <PendingUserMessage body={sendMessage.variables?.message} />}
          {sendMessage.isPending && <ThinkingMessage stop={stopGeneration} />}
        </div>
      </div>}
    </div>

    <Composer
      draft={draft}
      setDraft={setDraft}
      submit={submit}
      stop={stopGeneration}
      textareaRef={textareaRef}
      handleKeyDown={handleComposerKeyDown}
      responseMode={responseMode}
      setResponseMode={setResponseMode}
      fileCategory={fileCategory}
      setFileCategory={setFileCategory}
      fileInputRef={fileInputRef}
      uploadMenuOpen={uploadMenuOpen}
      setUploadMenuOpen={setUploadMenuOpen}
      uploadFile={uploadFile}
      files={chatFiles.data?.files || []}
      sending={sendMessage.isPending}
      disabled={Boolean(assistantDisabled)}
      scope={scope}
    />

    <ChatHistoryDialog
      open={historyOpen}
      onOpenChange={setHistoryOpen}
      sessions={sessionItems}
      activeSessionId={sessionId}
      loading={sessions.isLoading}
      search={historySearch}
      setSearch={setHistorySearch}
      openChat={openChat}
      startNewChat={startNewChat}
    />
  </section>;
}

function WelcomeState({ scope, detail, user, prompts, submit }) {
  const name = String(user?.fullName || "").trim().split(/\s+/)[0];
  return <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-start px-4 py-6 sm:justify-center sm:px-6 sm:py-12">
    <div className="mb-8 text-center">
      <span className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl bg-brand text-brand-foreground shadow-lg shadow-brand/20"><Sparkles size={24} /></span>
      <h2 className="text-balance text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{scope === "inquiry" ? "What would you like to know?" : `How can I help${name ? `, ${name}` : ""}?`}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{scope === "inquiry" ? <>I’m focused on <span className="font-semibold text-foreground">{detail?.inquiry?.title || "this inquiry"}</span> and can work from its records, files, and communications.</> : "Ask about inquiries, priorities, documents, and everything your team can see in the workspace."}</p>
    </div>
    <div className="grid gap-2.5 sm:grid-cols-2">
      {prompts.map((prompt) => <button key={prompt.title} type="button" onClick={() => submit(prompt.message)} className="group min-h-24 rounded-2xl border border-border bg-card p-4 text-left shadow-sm outline-none transition-[border-color,background,transform,box-shadow] hover:-translate-y-0.5 hover:border-border-strong hover:bg-muted/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/70">
        <span className="block text-sm font-semibold leading-5">{prompt.title}</span>
        <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{prompt.description}</span>
      </button>)}
    </div>
  </div>;
}

function Composer({ draft, setDraft, submit, stop, textareaRef, handleKeyDown, responseMode, setResponseMode, fileCategory, setFileCategory, fileInputRef, uploadMenuOpen, setUploadMenuOpen, uploadFile, files, sending, disabled, scope }) {
  return <footer className="shrink-0 bg-gradient-to-t from-card via-card to-card/0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:pb-4">
    <div className="mx-auto w-full max-w-3xl">
      {files.length > 0 && <div className="mb-2 flex gap-2 overflow-x-auto px-1 pb-0.5">
        {files.map((file) => <span key={file.id} className="inline-flex min-h-8 max-w-[240px] shrink-0 items-center gap-2 rounded-xl border border-border bg-muted/70 px-2.5 text-xs text-foreground">
          <Paperclip size={13} className="shrink-0 text-brand" /><span className="truncate">{file.fileName}</span><span className={cn("size-1.5 shrink-0 rounded-full", file.extractionStatus === "complete" ? "bg-emerald-500" : "bg-amber-500")} title={file.extractionStatus === "complete" ? "Ready" : "Processing"} />
        </span>)}
      </div>}
      <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="rounded-[26px] border border-border-strong bg-card p-2 shadow-[0_10px_35px_rgb(var(--shadow-color)/0.12)] transition-shadow focus-within:border-brand/60 focus-within:shadow-[0_12px_40px_rgb(var(--shadow-color)/0.16)]">
        <textarea ref={textareaRef} rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} placeholder={scope === "inquiry" ? "Ask about this inquiry" : "Message the assistant"} disabled={disabled} aria-label="Message the assistant" className="block max-h-40 min-h-11 w-full resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/75 disabled:cursor-not-allowed" />
        <div className="flex items-center justify-between gap-2 px-0.5">
          <div className="flex min-w-0 items-center gap-1">
            <PopoverPrimitive.Root open={uploadMenuOpen} onOpenChange={setUploadMenuOpen}>
              <PopoverPrimitive.Trigger asChild>
                <Button type="button" variant="ghost" size="icon" disabled={disabled || uploadFile.isPending} aria-label="Add a file" title="Add a file" className="size-9 min-h-9 shrink-0 rounded-full border border-border">
                  {uploadFile.isPending ? <span className="size-3.5 animate-spin rounded-full border-2 border-border-strong border-t-brand" /> : <Plus size={18} />}
                </Button>
              </PopoverPrimitive.Trigger>
              <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content align="start" side="top" sideOffset={10} aria-label="Add a source" className="z-[70] w-72 rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-2xl outline-none">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div><p className="text-sm font-semibold">Add a source</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">The assistant can read common images and documents.</p></div>
                    <PopoverPrimitive.Close asChild><Button type="button" variant="ghost" size="icon" className="size-8 min-h-8 rounded-full" aria-label="Close file menu"><X size={16} /></Button></PopoverPrimitive.Close>
                  </div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Document type</label>
                  <Select value={fileCategory} onValueChange={setFileCategory} label="Upload category" options={categories} />
                  <input ref={fileInputRef} type="file" className="hidden" tabIndex={-1} aria-hidden="true" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadFile.mutate(file); event.target.value = ""; }} accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xlsx" />
                  <Button type="button" className="mt-3 w-full" onClick={() => fileInputRef.current?.click()} disabled={uploadFile.isPending}><Upload size={16} />{uploadFile.isPending ? "Uploading..." : "Choose file"}</Button>
                </PopoverPrimitive.Content>
              </PopoverPrimitive.Portal>
            </PopoverPrimitive.Root>
            <Select value={responseMode} onValueChange={setResponseMode} label="Response mode" options={responseModes} className="min-h-9 w-auto border-0 bg-transparent px-2 text-xs font-semibold hover:bg-muted focus:ring-0" />
          </div>
          {sending ? <Button type="button" size="icon" onClick={stop} aria-label="Stop generating" title="Stop generating" className="size-9 min-h-9 shrink-0 rounded-full bg-foreground text-background shadow-none hover:bg-foreground/80"><Square size={14} fill="currentColor" /></Button> : <Button type="submit" size="icon" disabled={!draft.trim() || disabled} aria-label="Send message" title="Send message" className="size-9 min-h-9 shrink-0 rounded-full bg-foreground text-background shadow-none hover:bg-foreground/80"><Send size={17} /></Button>}
        </div>
      </form>
      <p className="mt-2 hidden text-center text-[11px] leading-4 text-muted-foreground sm:block">Assistant responses can be inaccurate. Verify important project details and source records.</p>
    </div>
  </footer>;
}

function MessageBubble({ message, canSave, saving, onSaveNote, onCreateDraft }) {
  const assistant = message.role === "assistant";
  const rawSources = message.sources || message.metadata?.sources || [];
  const sources = Array.from(new Map(rawSources.map((source) => [`${source.type}:${source.sourceId || source.id}`, source])).values());
  const [copied, setCopied] = React.useState(false);

  function copyMessage() {
    navigator.clipboard?.writeText(message.body);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (!assistant) return <article className="flex justify-end">
    <div className="max-w-[88%] rounded-[22px] bg-muted px-4 py-2.5 text-[15px] leading-6 text-foreground sm:max-w-[78%]">
      <p className="whitespace-pre-wrap break-words">{message.body}</p>
    </div>
  </article>;

  return <article className="group grid grid-cols-[28px_minmax(0,1fr)] gap-3">
    <span className="mt-0.5 grid size-7 place-items-center rounded-full bg-brand text-brand-foreground"><Sparkles size={14} /></span>
    <div className="min-w-0">
      <MessageBody body={message.body} />
      {sources.length > 0 && <div className="mt-4 flex flex-wrap gap-2">
        {sources.map((source) => <SourceChip key={`${source.type}:${source.sourceId || source.id}`} source={source} />)}
      </div>}
      <div className="mt-2.5 flex flex-wrap items-center gap-0.5 text-muted-foreground opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <Button type="button" size="xs" variant="ghost" onClick={copyMessage} aria-label="Copy response" className="rounded-full">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</Button>
        {canSave && <Button type="button" size="xs" variant="ghost" disabled={saving} onClick={onSaveNote} className="rounded-full"><Save size={14} />Save note</Button>}
        {canSave && <Button type="button" size="xs" variant="ghost" disabled={saving} onClick={onCreateDraft} className="rounded-full"><FilePlus2 size={14} />Create draft</Button>}
        {message.metadata?.fallback && <Badge tone="amber" className="ml-1">Fallback</Badge>}
      </div>
    </div>
  </article>;
}

function MessageBody({ body }) {
  const blocks = String(body || "").split(/(```[\s\S]*?```)/g).filter(Boolean);
  return <div className="break-words text-[15px] leading-7 text-foreground">
    {blocks.map((block, index) => {
      if (block.startsWith("```") && block.endsWith("```")) {
        const value = block.slice(3, -3).replace(/^[^\n]*\n/, "");
        return <pre key={index} className="my-3 overflow-x-auto rounded-xl bg-slate-950 p-4 text-[13px] leading-6 text-slate-100"><code>{value}</code></pre>;
      }
      return <TextBlock key={index} value={block} />;
    })}
  </div>;
}

function TextBlock({ value }) {
  const lines = value.split("\n");
  return <div className="grid gap-2">
    {lines.map((line, index) => {
      if (!line.trim()) return <span key={index} className="h-1" aria-hidden="true" />;
      const heading = line.match(/^(#{1,3})\s+(.+)/);
      if (heading) return <p key={index} className="mt-2 font-semibold">{inlineText(heading[2])}</p>;
      const bullet = line.match(/^\s*[-*]\s+(.+)/);
      if (bullet) return <div key={index} className="grid grid-cols-[12px_minmax(0,1fr)] gap-2 pl-1"><span className="pt-px text-muted-foreground">•</span><span>{inlineText(bullet[1])}</span></div>;
      const numbered = line.match(/^\s*(\d+)[.)]\s+(.+)/);
      if (numbered) return <div key={index} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 pl-1"><span className="text-muted-foreground">{numbered[1]}.</span><span>{inlineText(numbered[2])}</span></div>;
      return <p key={index}>{inlineText(line)}</p>;
    })}
  </div>;
}

function inlineText(value) {
  return String(value).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">{part.slice(1, -1)}</code>;
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function ThinkingMessage({ stop }) {
  return <article className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
    <span className="grid size-7 place-items-center rounded-full bg-brand text-brand-foreground"><Sparkles size={14} /></span>
    <div className="flex min-h-8 items-center gap-3 text-sm text-muted-foreground">
      <span className="flex items-center gap-1" aria-label="Assistant is thinking"><span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" /><span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" /><span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" /></span>
      <span>Checking your workspace…</span>
      <Button type="button" size="xs" variant="ghost" onClick={stop} className="rounded-full"><Square size={11} />Stop</Button>
    </div>
  </article>;
}

function PendingUserMessage({ body }) {
  if (!body) return null;
  return <article className="flex justify-end">
    <div className="max-w-[88%] rounded-[22px] bg-muted px-4 py-2.5 text-[15px] leading-6 text-foreground sm:max-w-[78%]">
      <p className="whitespace-pre-wrap break-words">{body}</p>
    </div>
  </article>;
}

function ChatHistoryDialog({ open, onOpenChange, sessions, activeSessionId, loading, search, setSearch, openChat, startNewChat }) {
  const normalized = search.trim().toLowerCase();
  const filtered = sessions.filter((session) => !normalized || session.title?.toLowerCase().includes(normalized));
  const groups = groupSessions(filtered);
  return <Dialog open={open} onOpenChange={onOpenChange} title="Chat history" description="Pick up a previous conversation or start something new.">
    <Button type="button" variant="outline" className="mb-3 w-full justify-start rounded-xl" onClick={startNewChat}><Plus size={17} />New chat</Button>
    <label className="relative block">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats" aria-label="Search chat history" className="min-h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-ring/25" />
    </label>
    <div className="mt-4 max-h-[52vh] overflow-y-auto pr-1">
      {loading ? <div className="grid gap-2">{[1, 2, 3].map((item) => <span key={item} className="h-14 animate-pulse rounded-xl bg-muted" />)}</div> : groups.length ? <div className="grid gap-4">
        {groups.map((group) => <section key={group.label}>
          <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{group.label}</p>
          <div className="grid gap-1">
            {group.sessions.map((session) => <button key={session.id} type="button" onClick={() => openChat(session.id)} className={cn("flex min-h-14 items-center gap-3 rounded-xl px-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/70", session.id === activeSessionId && "bg-brand-muted text-brand-muted-foreground")}>
              <MessageCircle size={17} className="shrink-0 opacity-70" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{session.title}</span><span className={cn("mt-0.5 block text-xs", session.id === activeSessionId ? "text-brand-muted-foreground/75" : "text-muted-foreground")}>{formatDate(session.updatedAt)}</span></span>
              {session.id === activeSessionId && <Check size={16} className="shrink-0" />}
            </button>)}
          </div>
        </section>)}
      </div> : <div className="rounded-xl border border-dashed border-border p-8 text-center"><MessageCircle size={22} className="mx-auto mb-2 text-muted-foreground" /><p className="text-sm font-semibold">{normalized ? "No matching chats" : "No chats yet"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{normalized ? "Try a different search." : "Your conversations will appear here."}</p></div>}
    </div>
  </Dialog>;
}

function SourceChip({ source }) {
  const route = source.metadata?.route || source.metadata?.url;
  const label = source.label || source.sourceId || "Source";
  const content = <><span className="max-w-[190px] truncate">{label}</span>{route && <ExternalLink size={12} className="shrink-0" />}</>;
  const className = "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground";
  if (route) return <a href={route} className={className} title={source.excerpt || label}>{content}</a>;
  return <span className={className} title={source.excerpt || label}>{content}</span>;
}

function UnavailableState({ scope }) {
  return <div className="grid min-h-full place-items-center p-6 text-center"><div><span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground"><Bot size={22} /></span><h2 className="text-lg font-semibold">Assistant unavailable</h2><p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{scope === "workspace" ? "Workspace assistant access is currently disabled." : "Assistant access is currently disabled for this inquiry."}</p></div></div>;
}

function ConversationSkeleton() {
  return <div className="mx-auto grid w-full max-w-3xl gap-10 px-6 py-10" aria-label="Loading conversation">
    <div className="ml-auto h-12 w-2/5 animate-pulse rounded-[22px] bg-muted" />
    <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3"><span className="size-7 animate-pulse rounded-full bg-muted" /><div className="grid gap-2 pt-1"><span className="h-3 w-full animate-pulse rounded bg-muted" /><span className="h-3 w-5/6 animate-pulse rounded bg-muted" /><span className="h-3 w-3/5 animate-pulse rounded bg-muted" /></div></div>
  </div>;
}

function inquiryPrompts(detail) {
  const title = detail?.inquiry?.title || "this inquiry";
  return [
    { title: "Check readiness", description: "Find what’s missing before estimating can begin.", message: `What is missing before ${title} is ready for estimating?` },
    { title: "Summarize the project", description: "Bring access, equipment, files, and communication together.", message: "Summarize access, equipment, files, and customer communication." },
    { title: "Draft follow-up questions", description: "Prepare the next questions to send to the customer.", message: "Draft follow-up questions for the customer." },
    { title: "Surface risky assumptions", description: "Flag uncertainty and unsupported project details.", message: "Which assumptions are risky based on the current record?" }
  ];
}

function workspacePrompts() {
  return [
    { title: "Find incomplete inquiries", description: "See which open projects still need photos or floor plans.", message: "Which open inquiries need site photos or floor plans?" },
    { title: "Review high-priority work", description: "Surface urgent projects with safety or access gaps.", message: "Find high-priority inquiries with missing safety or access information." },
    { title: "Check proposal status", description: "Identify proposals that are waiting for review.", message: "Which proposals need review?" },
    { title: "Plan my day", description: "Build a concise list of what deserves attention now.", message: "What needs my attention today?" }
  ];
}

function groupSessions(sessions) {
  const groups = new Map();
  for (const session of sessions) {
    const label = dateGroup(session.updatedAt);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(session);
  }
  return Array.from(groups, ([label, items]) => ({ label, sessions: items }));
}

function dateGroup(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Earlier";
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((start - target) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  return "Earlier";
}

function firstTitle(value) {
  return String(value || "Assistant chat").replace(/\s+/g, " ").trim().slice(0, 80) || "Assistant chat";
}

function formatDate(value) {
  if (!value) return "";
  try {
    const date = new Date(value);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return date.toLocaleDateString([], { month: "short", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  } catch { return ""; }
}
