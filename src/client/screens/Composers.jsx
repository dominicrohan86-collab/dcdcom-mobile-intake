import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { AlertTriangle, Bot, Calculator, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, FileCheck, FileImage, FileText, ListChecks, MailCheck, MessageSquareText, RefreshCw, Send, Sparkles, Upload, X } from "lucide-react";
import { client } from "../lib/api";
import { AccordionSection, Badge, Button, Dialog, Field, Select, Textarea } from "../components/ui";
import { cn, moneyRange } from "../lib/utils";

const responseGoals = [
  { value: "info_request", label: "Request info", tone: "Professional", icon: MessageSquareText, description: "Ask for missing details and source documents." },
  { value: "schedule_visit", label: "Schedule visit", tone: "Warm", icon: ClipboardCheck, description: "Move the client toward a site walk." },
  { value: "proposal_ready", label: "Proposal-ready", tone: "Concise", icon: MailCheck, description: "Confirm scope and next steps clearly." }
];
const fileCategoryOptions = [["other", "General document"], ["floor_plan", "Floor plan"], ["equipment_list", "Equipment list"], ["contract", "Contract"], ["email_attachment", "Email attachment"]];
const uploadShortcuts = [["floor_plan", "Floor plan"], ["equipment_list", "Equipment list"], ["contract", "Contract"], ["email_attachment", "Email attachment"]];

export function EmailScreen({ detail, setNotice, draftScope = "workspace:user", navigate }) {
  const queryClient = useQueryClient();
  const existing = detail.documents?.find((document) => document.document_type === "follow_up_email");
  const draftKey = `dcdcom:${draftScope}:email-draft:${detail.inquiry.id}`;
  const draft = readDraft(draftKey);
  const [goal, setGoal] = React.useState(draft.goal || "info_request");
  const [body, setBody] = React.useState(draft.body || existing?.body || "");
  const [subject, setSubject] = React.useState(draft.subject || existing?.subject || `Follow-up on ${detail.inquiry.title}`);
  const goalConfig = responseGoals.find((item) => item.value === goal) || responseGoals[0];
  const missingCount = detail.missing?.filter((entry) => ["open", "requested"].includes(entry.status)).length || 0;
  const fileCount = detail.files?.length || 0;
  const documentCount = detail.documents?.length || 0;
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["inquiry", detail.inquiry.id] }),
    queryClient.invalidateQueries({ queryKey: ["notifications"] })
  ]);
  const generate = useMutation({ mutationFn: () => client.generate(detail.inquiry.id, { type: "follow_up_email", tone: goalConfig.tone, responseGoal: goal }), onSuccess: (result) => { setBody(result.product.body); setSubject(result.product.subject || subject); setNotice("Response draft generated and saved."); refresh(); } });
  const save = useMutation({ mutationFn: () => client.saveDocument(detail.inquiry.id, { documentId: existing?.id, documentType: "follow_up_email", title: `Follow-up Email - ${detail.inquiry.title}`, subject, body, expectedVersion: existing?.current_version, metadata: { goal, tone: goalConfig.tone } }), onSuccess: () => { removeDraft(draftKey); setNotice("Response saved as a new version."); refresh(); } });
  const send = useMutation({ mutationFn: () => client.sendFollowUp(detail.inquiry.id, { documentId: existing?.id, title: `Follow-up Email - ${detail.inquiry.title}`, subject, body, channel: "email", expectedVersion: existing?.current_version, metadata: { goal, tone: goalConfig.tone } }), onSuccess: (result) => { removeDraft(draftKey); setNotice(result.communication.status === "sent" ? "Response sent and logged." : "Response queued and logged."); refresh(); } });
  const busy = generate.isPending || save.isPending || send.isPending;
  const emailErrorMessage = (generate.error || save.error || send.error)?.message ? String((generate.error || save.error || send.error).message) : "";
  React.useEffect(() => writeDraft(draftKey, { goal, body, subject }), [draftKey, goal, body, subject]);
  React.useEffect(() => {
    if (emailErrorMessage) setNotice?.({ tone: "error", message: emailErrorMessage });
  }, [emailErrorMessage, setNotice]);

  return <div className="-mx-4 -my-4 min-h-[calc(100dvh-136px)] bg-background">
    <header className="border-b border-border bg-card px-4 pb-4 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex min-h-6 items-center gap-1.5 rounded-md border border-brand/25 bg-brand-muted px-2 text-xs font-semibold text-brand-muted-foreground"><Sparkles size={13} />Response generator</span>
          <h2 className="mt-3 text-2xl font-bold leading-tight text-foreground">Build a client follow-up</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">{detail.inquiry.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/15" onClick={() => navigate?.("assistant", { inquiry: true })}><Bot size={15} />Ask</Button>
          <Badge tone={body.trim() ? "green" : "amber"}>{body.trim() ? "Draft ready" : "Needs draft"}</Badge>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniMetric label="Missing" value={missingCount} />
        <MiniMetric label="Files" value={fileCount} />
        <MiniMetric label="Work" value={documentCount} />
      </div>
    </header>

    <main className="px-4 pb-0 pt-4">
      <section className="rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Response goal</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Pick what this email should accomplish.</p>
          </div>
          <Badge tone="brand">{goalConfig.tone}</Badge>
        </div>
        <div className="mt-3 grid gap-2">
          {responseGoals.map(({ value, label, description, icon: Icon }) => {
            const active = goal === value;
            return <button key={value} type="button" onClick={() => setGoal(value)} className={cn("grid min-h-[74px] grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-lg border p-3 text-left transition-colors", active ? "border-brand/40 bg-brand-muted text-brand-muted-foreground shadow-sm" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <span className={cn("grid size-9 place-items-center rounded-md", active ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground")}><Icon size={19} /></span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{label}</span>
                <span className={cn("mt-1 block text-xs leading-4", active ? "text-brand-muted-foreground/80" : "text-muted-foreground")}>{description}</span>
              </span>
            </button>;
          })}
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-foreground">Draft workspace</h3>
            <span className="text-xs font-medium text-muted-foreground">{body.length.toLocaleString()} chars</span>
          </div>
        </div>
        <div className="grid gap-3 p-4">
          <Field label="Subject">
            <input className="min-h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-brand focus:ring-2 focus:ring-ring/25" value={subject} onChange={(event) => setSubject(event.target.value)} />
          </Field>
          <Field label="Message">
            <Textarea className="min-h-[320px] bg-background leading-6" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Generate a polished response or write your own follow-up here." />
          </Field>
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 mt-0 border-t border-border bg-background/95 px-4 py-2 backdrop-blur">
        <div className="grid grid-cols-[minmax(0,1fr)_44px_44px] gap-2">
          <Button disabled={busy} onClick={() => generate.mutate()}><Sparkles size={16} />{generate.isPending ? "Generating..." : "Generate response"}</Button>
          <Button size="icon" variant="outline" disabled={busy || !body.trim()} onClick={() => save.mutate()} aria-label="Save response draft" title="Save response draft"><FileCheck size={16} /></Button>
          <Button size="icon" disabled={busy || !body.trim()} onClick={() => send.mutate()} aria-label="Queue response email" title="Queue response email"><Send size={16} /></Button>
        </div>
      </div>
    </main>
  </div>;
}

function MiniMetric({ label, value }) {
  return <div className="rounded-lg border border-border bg-background px-3 py-2 text-center">
    <strong className="block text-lg leading-5 text-foreground">{value}</strong>
    <span className="mt-1 block text-[11px] font-semibold uppercase text-muted-foreground">{label}</span>
  </div>;
}

export function ProposalScreen({ detail, setNotice, navigate }) {
  const queryClient = useQueryClient();
  const documents = detail.documents || [];
  const files = detail.files || [];
  const sourceOptions = React.useMemo(() => sourceDocumentOptions(files), [files]);
  const [selectedType, setSelectedType] = React.useState("proposal");
  const [selectedSourceIds, setSelectedSourceIds] = React.useState(() => sourceOptions.map((file) => file.id));
  const [sourceSelectionTouched, setSourceSelectionTouched] = React.useState(false);
  const [newSourceIds, setNewSourceIds] = React.useState([]);
  const [additionalContext, setAdditionalContext] = React.useState("");
  const [draftBodies, setDraftBodies] = React.useState({});
  const [draftTitles, setDraftTitles] = React.useState({});
  const [generatedIds, setGeneratedIds] = React.useState({});
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [uploadPreset, setUploadPreset] = React.useState("other");
  const [activeStep, setActiveStep] = React.useState(0);
  const [completedSteps, setCompletedSteps] = React.useState([]);
  const selectedConfig = documentConfigs.find((item) => item.value === selectedType) || documentConfigs[0];
  const selectedDocument = documents.find((document) => document.document_type === selectedType);
  const proposal = documents.find((document) => document.document_type === "proposal");
  const body = draftBodies[selectedType] || "";
  const title = draftTitles[selectedType] || `${selectedConfig.label} - ${detail.inquiry.title}`;
  const readiness = documentReadiness(detail, selectedType);
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["inquiry", detail.inquiry.id] }),
    queryClient.invalidateQueries({ queryKey: ["notifications"] })
  ]);
  const openUpload = (category = "other") => { setUploadPreset(category); setUploadOpen(true); };
  const selectedSourceDocuments = sourceOptions.filter((file) => selectedSourceIds.includes(file.id));
  const toggleSourceDocument = (id) => {
    setSourceSelectionTouched(true);
    setCompletedSteps((items) => items.filter((step) => step < 1));
    setSelectedSourceIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  };
  const generate = useMutation({
    mutationFn: () => client.generate(detail.inquiry.id, {
      type: selectedType,
      tone: "Professional",
      sourceDocumentIds: selectedSourceIds,
      additionalContext
    }),
    onSuccess: (result) => {
      setDraftBodies((items) => ({ ...items, [selectedType]: result.product.body }));
      setDraftTitles((items) => ({ ...items, [selectedType]: result.product.title || title }));
      setGeneratedIds((items) => ({ ...items, [selectedType]: result.documentId }));
      setNotice(result.error ? `${selectedConfig.label} generated and saved with a local fallback. ${providerFallbackMessage(result.error)}` : `${selectedConfig.label} generated and saved.`);
      setActiveStep(3);
      setCompletedSteps((items) => completeStep(items, 3));
      refresh();
    }
  });
  const save = useMutation({
    mutationFn: () => client.saveDocument(detail.inquiry.id, {
      documentId: generatedIds[selectedType] || selectedDocument?.id,
      documentType: selectedType,
      title,
      body,
      status: "draft",
      expectedVersion: selectedDocument?.current_version,
      metadata: {
        approvalRequired: selectedType === "proposal",
        documentReference: selectedConfig.reference,
        dataReadiness: readiness,
        selectedSourceDocumentIds: selectedSourceIds,
        additionalContext
      }
    }),
    onSuccess: () => {
      setNotice(`${selectedConfig.label} saved as a new version.`);
      refresh();
    }
  });
  const review = useMutation({
    mutationFn: async () => {
      let documentId = generatedIds.proposal || proposal?.id;
      if (!documentId) documentId = (await client.generate(detail.inquiry.id, "proposal")).documentId;
      return client.submitReview(detail.inquiry.id, documentId, proposal?.current_version);
    },
    onSuccess: () => {
      setNotice("Proposal sent to internal review.");
      refresh();
    }
  });
  const upload = useMutation({
    mutationFn: (queuedFiles) => Promise.all(queuedFiles.map(({ file, category }) => client.upload(detail.inquiry.id, file, category))),
    onSuccess: async (results) => {
      setUploadOpen(false);
      setSourceSelectionTouched(true);
      const uploadedIds = results.map((result) => result.file.id).filter(Boolean);
      setNewSourceIds((items) => [...new Set([...items, ...uploadedIds])]);
      setSelectedSourceIds((items) => [...new Set([...items, ...uploadedIds])]);
      setCompletedSteps((items) => items.filter((step) => step < 1));
      setNotice(`${results.length} ${results.length === 1 ? "file" : "files"} uploaded and linked.`);
      await refresh();
    }
  });
  const proposalErrorMessage = generate.error ? generationErrorMessage(generate.error) : (save.error || review.error || upload.error)?.message ? String((save.error || review.error || upload.error).message) : "";
  React.useEffect(() => {
    if (proposalErrorMessage) setNotice?.({ tone: "error", message: proposalErrorMessage });
  }, [proposalErrorMessage, setNotice]);
  React.useEffect(() => {
    const availableIds = sourceOptions.map((file) => file.id);
    const keepableIds = new Set([...availableIds, ...newSourceIds]);
    setSelectedSourceIds((items) => {
      const kept = items.filter((id) => keepableIds.has(id));
      if (sourceSelectionTouched) return kept;
      return availableIds;
    });
  }, [sourceOptions, sourceSelectionTouched, newSourceIds]);
  React.useEffect(() => {
    const unlockedStep = nextUnlockedStep(completedSteps);
    if (activeStep > unlockedStep) setActiveStep(unlockedStep);
  }, [activeStep, completedSteps]);
  React.useEffect(() => {
    if (!selectedSourceDocuments.length) setCompletedSteps((items) => items.filter((step) => step < 1));
  }, [selectedSourceDocuments.length]);
  const steps = [
    { title: "Select document type", description: "Choose the output", summary: selectedConfig.label, ready: Boolean(selectedType), done: completedSteps.includes(0) },
    { title: "Select source documents", description: "Use project files", summary: selectedSourceDocuments.length ? `${selectedSourceDocuments.length} selected` : "No sources", ready: selectedSourceDocuments.length > 0, done: completedSteps.includes(1) },
    { title: "Add additional context", description: "Guide the draft", summary: additionalContext.trim() ? "Context added" : "Optional", ready: true, done: completedSteps.includes(2) },
    { title: "Generate document", description: "Review and create", summary: body ? "Draft ready" : "Ready", ready: completedSteps.includes(0) && completedSteps.includes(1) && completedSteps.includes(2), done: completedSteps.includes(3) }
  ];
  const currentStep = steps[activeStep] || steps[0];
  const isLastStep = activeStep === steps.length - 1;
  const unlockedStep = nextUnlockedStep(completedSteps);
  const canGenerate = isLastStep && currentStep.ready && !generate.isPending;
  const goBack = () => setActiveStep((step) => Math.max(0, step - 1));
  const goNext = () => {
    if (!currentStep.ready || isLastStep) return;
    setCompletedSteps((items) => completeStep(items, activeStep));
    setActiveStep((step) => Math.min(steps.length - 1, step + 1));
  };
  const changeDocumentType = (value) => {
    setSelectedType(value);
    setCompletedSteps([]);
  };
  const changeAdditionalContext = (value) => {
    setAdditionalContext(value);
    setCompletedSteps((items) => items.filter((step) => step < 2));
  };

  return <div className="-mx-4 -my-4 min-h-[calc(100dvh-136px)] bg-background">
    <header className="border-b border-[#2f4826] bg-[linear-gradient(135deg,#173315_0%,#102411_58%,#0d1b0d_100%)] px-4 pb-5 pt-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex min-h-6 items-center gap-1.5 rounded-md border border-[#dbe7d2]/35 bg-[#f4f8ef]/[0.12] px-2 text-xs font-semibold text-brand-100"><Sparkles size={13} />AI document builder</span>
          <h2 className="mt-3 text-2xl font-bold leading-tight">Create project documents</h2>
          <p className="mt-1 truncate text-sm leading-5 text-white/72">{detail.inquiry.title}</p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <Button type="button" size="sm" variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/15" onClick={() => navigate?.("assistant", { inquiry: true })}><Bot size={15} />Ask</Button>
          <strong className="rounded-md border border-[#dbe7d2]/25 bg-[#f4f8ef]/[0.1] px-2 py-1 text-right text-sm">{moneyRange(detail.inquiry.estimated_low_cents, detail.inquiry.estimated_high_cents)}<span className="block text-xs font-normal text-white/68">Range</span></strong>
        </div>
      </div>
    </header>

    <main className="px-4 pb-0 pt-4">
      <section className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
        <WizardProgress steps={steps} activeStep={activeStep} unlockedStep={unlockedStep} setActiveStep={setActiveStep} />
        <div className="border-t border-border bg-card">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-brand-muted-foreground">Step {activeStep + 1} of {steps.length}</p>
              <h3 className="mt-1 text-xl font-bold leading-tight text-foreground">{currentStep.title}</h3>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{currentStep.description}</p>
            </div>
            <Badge tone={currentStep.done ? "green" : currentStep.ready ? "blue" : "amber"} className="shrink-0 lg:hidden">{currentStep.summary}</Badge>
            <div className="hidden shrink-0 flex-col items-end gap-2 lg:flex">
              <Badge tone={currentStep.done ? "green" : currentStep.ready ? "blue" : "amber"} className="shrink-0">{currentStep.summary}</Badge>
              <div className="flex items-center justify-between gap-2">
                <Button size="sm" variant="outline" onClick={goBack} disabled={activeStep === 0}><ChevronLeft size={15} />Back</Button>
                {isLastStep ? <Button size="sm" onClick={() => generate.mutate()} disabled={!canGenerate}><RefreshCw size={15} />{generate.isPending ? "Generating..." : `Generate ${selectedConfig.label}`}</Button> : <Button size="sm" onClick={goNext} disabled={!currentStep.ready}>Next<ChevronRight size={15} /></Button>}
              </div>
            </div>
          </div>
          <div className="min-h-[430px] px-4 py-4">
            {activeStep === 0 && <DocumentTypeStep selectedType={selectedType} setSelectedType={changeDocumentType} documents={documents} selectedConfig={selectedConfig} />}
            {activeStep === 1 && <SourceDocuments options={sourceOptions} selectedIds={selectedSourceIds} newSourceIds={newSourceIds} onToggle={toggleSourceDocument} upload={openUpload} />}
            {activeStep === 2 && <ContextStep value={additionalContext} onChange={changeAdditionalContext} selectedConfig={selectedConfig} selectedSourceDocuments={selectedSourceDocuments} />}
            {activeStep === 3 && <GenerateStep selectedConfig={selectedConfig} selectedSourceDocuments={selectedSourceDocuments} additionalContext={additionalContext} readiness={readiness} body={body} title={title} selectedDocument={body ? selectedDocument : null} />}
          </div>
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 mt-0 border-t border-border bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
          <Button variant="outline" onClick={goBack} disabled={activeStep === 0}><ChevronLeft size={16} />Back</Button>
          {isLastStep ? <Button onClick={() => generate.mutate()} disabled={!canGenerate}><RefreshCw size={16} />{generate.isPending ? "Generating..." : `Generate ${selectedConfig.label}`}</Button> : <Button onClick={goNext} disabled={!currentStep.ready}>Next<ChevronRight size={16} /></Button>}
        </div>
      </div>
    </main>
    <Dialog open={uploadOpen} onOpenChange={setUploadOpen} title="Upload source documents" description="Add the files AI should reference before generating this document."><UploadFiles busy={upload.isPending} initialCategory={uploadPreset} notify={setNotice} submit={(queuedFiles) => upload.mutate(queuedFiles)} /></Dialog>
  </div>;
}

function WizardProgress({ steps, activeStep, unlockedStep, setActiveStep }) {
  return <div className="bg-muted/50 px-3 py-3">
    <div className="grid grid-cols-4 gap-1.5">
      {steps.map((step, index) => {
        const active = index === activeStep;
        const done = step.done;
        const locked = index > unlockedStep;
        return <button key={step.title} type="button" onClick={() => !locked && setActiveStep(index)} disabled={locked} aria-current={active ? "step" : undefined} className={cn("min-w-0 rounded-md border px-2 py-2 text-left transition-colors disabled:pointer-events-none", active ? "border-brand bg-card shadow-sm" : "border-transparent hover:bg-muted", done && !active ? "text-brand-muted-foreground" : locked ? "text-muted-foreground/45" : "text-muted-foreground")}>
          <span className={cn("mx-auto flex size-7 items-center justify-center rounded-full text-xs font-bold", active ? "bg-brand text-brand-foreground" : done ? "bg-brand-muted text-brand-muted-foreground" : locked ? "bg-muted text-muted-foreground/45" : "bg-muted text-muted-foreground")}>{done ? <CheckCircle2 size={15} /> : index + 1}</span>
          <span className={cn("mt-1 block truncate text-center text-[11px] font-bold", active ? "text-brand-muted-foreground" : "")}>{step.title.replace("Select ", "").replace("Add ", "").replace("Generate ", "")}</span>
        </button>;
      })}
    </div>
  </div>;
}

function DocumentTypeStep({ selectedType, setSelectedType, documents, selectedConfig }) {
  return <div>
    <div className="grid grid-cols-2 gap-2">
      {documentConfigs.map(({ value, label, short, icon: Icon }) => {
        const active = selectedType === value;
        const saved = documents.some((document) => document.document_type === value);
        return <button key={value} type="button" onClick={() => setSelectedType(value)} className={cn("min-h-[104px] rounded-md border bg-card p-3 text-left transition-colors", active ? "border-brand bg-brand-muted text-brand-muted-foreground shadow-sm" : "border-border text-foreground hover:bg-muted")}>
          <span className="flex items-start justify-between gap-2"><Icon size={22} className={active ? "text-brand-muted-foreground" : "text-muted-foreground"} />{saved && <CheckCircle2 size={17} className="text-emerald-600" />}</span>
          <span className="mt-2 block text-sm font-bold leading-5">{label}</span>
          <span className={cn("mt-1 block text-xs leading-4", active ? "text-brand-muted-foreground/80" : "text-muted-foreground")}>{short}</span>
        </button>;
      })}
    </div>
    <DocumentExample config={selectedConfig} />
  </div>;
}

function ContextStep({ value, onChange, selectedConfig, selectedSourceDocuments }) {
  return <div className="grid gap-3">
    <Textarea className="min-h-44" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Example: Make this client-facing, focus on cable abatement and HVAC removal, and mention that the lease ends July 15." />
    <div className="rounded-md border border-brand/25 bg-brand-muted/60 p-3">
      <p className="text-xs font-bold uppercase text-brand-muted-foreground">AI will combine</p>
      <div className="mt-2 grid gap-2 text-sm">
        <SummaryRow label="Type" value={selectedConfig.label} />
        <SummaryRow label="Sources" value={selectedSourceDocuments.length ? `${selectedSourceDocuments.length} selected` : "None selected"} />
      </div>
    </div>
  </div>;
}

function GenerateStep({ selectedConfig, selectedSourceDocuments, additionalContext, readiness, body, title, selectedDocument }) {
  return <div>
    <div className="rounded-md border border-border bg-muted/50 p-3">
      <div className="grid gap-2 text-sm">
        <SummaryRow label="Document type" value={selectedConfig.label} />
        <SummaryRow label="Source documents" value={selectedSourceDocuments.length ? `${selectedSourceDocuments.length} selected` : "None selected"} />
        <SummaryRow label="Additional context" value={additionalContext.trim() || "No extra instructions"} />
      </div>
    </div>
    <div className="mt-3 rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-foreground"><Sparkles size={17} className="text-brand" />AI reference</span>
          <Badge tone={readiness.ready ? "green" : "amber"}>{readiness.available}/{readiness.total} inputs</Badge>
        </div>
        <p className="mt-2 text-sm leading-5 text-muted-foreground">{selectedConfig.reference}</p>
      </div>
      <div className="divide-y divide-border">
        {readiness.items.map((item) => <div key={item.label} className="grid min-h-11 grid-cols-[20px_minmax(0,1fr)] items-center gap-2 px-4 py-2 text-sm">
          {item.available ? <CheckCircle2 size={17} className="text-emerald-600" /> : <AlertTriangle size={17} className="text-amber-600" />}
          <span className={item.available ? "text-muted-foreground" : "font-medium text-foreground"}>{item.label}</span>
        </div>)}
      </div>
    </div>
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-foreground">{body ? title : "Generated draft"}</h3>
        {selectedDocument && <Badge tone={selectedDocument.status === "review" ? "orange" : "slate"} className="capitalize">{selectedDocument.status || "draft"}</Badge>}
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        {body ? <div className="max-h-[420px] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{body}</div> : <p className="text-sm leading-6 text-muted-foreground">Review the inputs, then generate an editable draft.</p>}
      </div>
    </section>
  </div>;
}

function SourceDocuments({ options, selectedIds, newSourceIds, onToggle, upload }) {
  const selectedCount = options.filter((file) => selectedIds.includes(file.id)).length;
  return <div>
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs leading-5 text-muted-foreground">{options.length ? `${selectedCount}/${options.length} source documents selected` : "No project documents are linked yet."}</p>
      <Button variant="outline" size="sm" onClick={() => upload("other")}><Upload size={15} />Add</Button>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      {uploadShortcuts.map(([category, label]) => <Button key={category} type="button" variant="outline" size="sm" className="justify-start" onClick={() => upload(category)}><Upload size={15} />{label}</Button>)}
    </div>
    {options.length ? <div className="mt-3 grid max-h-[320px] gap-2 overflow-y-auto pr-1">
      {options.map((file) => {
        const selected = selectedIds.includes(file.id);
        return <button key={file.id} type="button" onClick={() => onToggle(file.id)} className={cn("grid min-h-[76px] grid-cols-[22px_minmax(0,1fr)] gap-2 rounded-md border p-3 text-left transition-colors", selected ? "border-brand bg-brand-muted text-brand-muted-foreground shadow-sm" : "border-border bg-card text-foreground hover:bg-muted")}>
          {selected ? <CheckCircle2 size={18} className="mt-0.5 text-brand-muted-foreground" /> : <FileText size={18} className="mt-0.5 text-muted-foreground" />}
          <span className="min-w-0">
            <span className="flex items-center justify-between gap-2">
              <b className="truncate text-sm">{file.label}</b>
              <Badge tone={newSourceIds.includes(file.id) ? "green" : selected ? "blue" : "slate"} className="shrink-0">{newSourceIds.includes(file.id) ? "New upload" : file.sourceLabel}</Badge>
            </span>
            <span className={cn("mt-1 block truncate text-xs", selected ? "text-brand-muted-foreground/80" : "text-muted-foreground")}>{file.fileName}</span>
            <span className={cn("mt-1 block text-[11px]", selected ? "text-brand-muted-foreground/70" : "text-muted-foreground/70")}>{file.dateLabel}</span>
          </span>
        </button>;
      })}
    </div> : <div className="mt-3 rounded-md border border-dashed border-border-strong bg-muted/50 p-4 text-sm leading-5 text-muted-foreground">Upload a floor plan, equipment list, contract, email attachment, photo, PDF, spreadsheet, or other source file to make it available for AI generation.</div>}
  </div>;
}

function SummaryRow({ label, value }) {
  return <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
    <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
    <span className="min-w-0 truncate text-sm text-foreground">{value}</span>
  </div>;
}

function clampStep(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(3, Math.max(0, Math.round(numeric)));
}
function sanitizeSteps(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 3))].sort((a, b) => a - b);
}
function completeStep(items, step) {
  return sanitizeSteps([...items, step]);
}
function nextUnlockedStep(completedSteps) {
  for (let index = 0; index < 3; index += 1) {
    if (!completedSteps.includes(index)) return index;
  }
  return 3;
}

function UploadFiles({ busy, initialCategory = "other", notify, submit }) {
  const [queue, setQueue] = React.useState([]);
  const [documentCategory, setDocumentCategory] = React.useState(initialCategory);
  const [error, setError] = React.useState("");
  const addFiles = React.useCallback((accepted, category) => { setError(""); setQueue((current) => [...current, ...accepted.map((file) => ({ file, category }))]); }, []);
  const rejectFiles = React.useCallback(() => setError("Some files could not be added. Each file must be an accepted type and under 12 MB."), []);
  const photos = useDropzone({ noClick: true, noKeyboard: true, multiple: true, maxSize: 12 * 1024 * 1024, accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".heic"] }, onDropAccepted: (files) => addFiles(files, photoCategoryForSelection(documentCategory)), onDropRejected: rejectFiles });
  const documents = useDropzone({ noClick: true, noKeyboard: true, multiple: true, maxSize: 12 * 1024 * 1024, accept: { "application/pdf": [".pdf"], "text/plain": [".txt"], "text/csv": [".csv"], "application/msword": [".doc"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] }, onDropAccepted: (files) => addFiles(files, documentCategory), onDropRejected: rejectFiles });

  function updateCategory(index, category) { setQueue((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, category } : item)); }
  function remove(index) { setQueue((items) => items.filter((_, itemIndex) => itemIndex !== index)); }
  React.useEffect(() => {
    if (error) notify?.({ tone: "error", message: error });
  }, [error, notify]);

  return <div>
    <Field label="Document category" className="mb-3">
      <Select value={documentCategory} onValueChange={setDocumentCategory} options={fileCategoryOptions} />
    </Field>
    <div className="grid grid-cols-2 gap-2">
      <div {...photos.getRootProps()}><input {...photos.getInputProps({ "aria-label": "Choose image files" })} /><Button type="button" variant="outline" className="w-full" onClick={photos.open}><FileImage size={17} />Image</Button></div>
      <div {...documents.getRootProps()}><input {...documents.getInputProps({ "aria-label": "Choose document files" })} /><Button type="button" variant="outline" className="w-full" onClick={documents.open}><FileText size={17} />Document</Button></div>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">Select multiple files at once. Maximum 12 MB per file.</p>
    {queue.length > 0 && <div className="mt-4 divide-y divide-border border-y border-border">{queue.map((entry, index) => <div key={`${entry.file.name}-${entry.file.lastModified}-${index}`} className="grid grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-2 py-2"><div className="min-w-0"><b className="block truncate text-xs text-foreground">{entry.file.name}</b><span className="text-[11px] text-muted-foreground">{formatBytes(entry.file.size)}</span></div>{entry.category === "photo" ? <Badge tone="cyan">Photo</Badge> : <Select label={`Category for ${entry.file.name}`} value={entry.category} onValueChange={(value) => updateCategory(index, value)} options={fileCategoryOptions} className="min-h-8 px-2 text-xs" />}<Button type="button" variant="ghost" size="icon" className="min-h-8 size-8" onClick={() => remove(index)} aria-label={`Remove ${entry.file.name}`}><X size={15} /></Button></div>)}</div>}
    <Button className="mt-4 w-full" disabled={busy || !queue.length} onClick={() => submit(queue)}><Upload size={17} />{busy ? "Uploading..." : `Upload ${queue.length || ""} ${queue.length === 1 ? "file" : "files"}`}</Button>
  </div>;
}

const documentConfigs = [
  {
    value: "follow_up_email",
    label: "Follow-up Email",
    short: "Client next-step note",
    icon: Send,
    reference: "Use the follow-up brief: project context, missing questions, requested source documents, suggested next step, and a concise professional close.",
    exampleTitle: "Email preview",
    example: ["Subject", "Quick follow-up on your data center project", "Message", "Thanks for the project details. To tighten the scope and pricing, could you send the floor plan, equipment list, and preferred access window?"],
    required: ["Contact name", "Project summary", "Missing requirements", "Timeline pressure", "Next step"]
  },
  {
    value: "proposal",
    label: "Proposal",
    short: "Client-ready offer",
    icon: FileText,
    reference: "Use the proposal brief: executive summary, scope, assumptions, commercial range, exclusions, customer responsibilities, and next steps.",
    exampleTitle: "Proposal preview",
    example: ["Executive Summary", "DC Decom will decommission the customer suite, coordinate removal logistics, recycle eligible materials, and provide closeout documentation.", "Commercial Range", "Preliminary pricing is shown as a range until access, equipment counts, and disconnect responsibility are confirmed."],
    required: ["Site address and access", "Service scope", "Equipment inventory", "Timeline", "Commercial range"]
  },
  {
    value: "scope_of_work",
    label: "Scope of Work",
    short: "Crew-ready work plan",
    icon: ClipboardCheck,
    reference: "Use the scope brief: in-scope work, out-of-scope work, site conditions, dependencies, deliverables, and acceptance criteria.",
    exampleTitle: "Scope preview",
    example: ["In Scope", "Remove racks, cabling, and related infrastructure from the identified rooms after customer approval.", "Acceptance", "Work area is broom-clean, materials are staged or removed, and photos/documentation are attached."],
    required: ["Work areas", "Assets or materials", "Access constraints", "Safety/electrical notes", "Completion criteria"]
  },
  {
    value: "estimate",
    label: "Estimate",
    short: "Price range and lines",
    icon: Calculator,
    reference: "Use the estimate brief: low/high range, line-item basis, quantities, units, assumptions, and risk notes that could move price.",
    exampleTitle: "Estimate preview",
    example: ["Preliminary Range", "$25,000 - $45,000", "Line Basis", "Labor, logistics, recycling, subcontractor support, and contingency are separated so review can focus on the cost drivers."],
    required: ["Known quantities", "Service type", "Logistics/access", "Subcontractor needs", "Risk assumptions"]
  },
  {
    value: "site_checklist",
    label: "Site Checklist",
    short: "Visit capture list",
    icon: ListChecks,
    reference: "Use the site checklist brief: what the field team must verify, photograph, count, ask, and flag before final pricing or execution.",
    exampleTitle: "Checklist preview",
    example: ["On Site", "Verify escort requirements, photograph racks and cable pathways, count equipment, capture floor-plan notes, and confirm data destruction needs.", "Before Leaving", "Record open risks and attach photos for estimator review."],
    required: ["Site/contact access", "Equipment focus", "Photo needs", "Open missing items", "Safety questions"]
  }
];

function DocumentExample({ config }) {
  const Icon = config.icon;
  return <section className="mt-5 rounded-lg border border-border bg-muted/50 p-4">
    <div className="flex items-center gap-2 text-sm font-bold text-foreground"><Icon size={18} className="text-brand" />{config.exampleTitle}</div>
    <div className="mt-3 rounded-md border border-border bg-card p-3">
      <p className="text-xs font-bold uppercase text-brand-muted-foreground">DC Decom</p>
      <div className="mt-3 space-y-3">{config.example.map((line, index) => index % 2 === 0 ? <h4 key={line} className="text-sm font-bold text-foreground">{line}</h4> : <p key={line} className="text-sm leading-5 text-muted-foreground">{line}</p>)}</div>
    </div>
  </section>;
}

function documentReadiness(detail, type) {
  const fields = detail.fields || [];
  const files = (detail.files || []).filter((file) => file.category !== "document_export");
  const missing = (detail.missing || []).filter((item) => ["open", "requested"].includes(item.status));
  const inquiry = detail.inquiry || {};
  const hasField = (...patterns) => fields.some((field) => patterns.some((pattern) => String(`${field.field_key} ${field.label} ${field.value_text}`).toLowerCase().includes(pattern)));
  const hasFile = (...categories) => files.some((file) => categories.includes(file.category));
  const missingHas = (...patterns) => missing.some((item) => patterns.some((pattern) => String(`${item.requirement_key} ${item.label} ${item.reason}`).toLowerCase().includes(pattern)));
  const checks = {
    follow_up_email: [
      ["Contact name", Boolean(inquiry.contact_name || hasField("contact"))],
      ["Project summary", Boolean(inquiry.title || summariesHave(detail, "summary"))],
      ["Missing requirements", missing.length > 0],
      ["Timeline pressure", Boolean(inquiry.lease_end_date || inquiry.requested_due_date || hasField("timeline", "lease", "deadline"))],
      ["Reference files", files.length > 0]
    ],
    proposal: [
      ["Site address and access", Boolean(inquiry.city || inquiry.region || hasField("address", "site")) && !missingHas("access")],
      ["Service scope", Boolean(inquiry.service_type || hasField("scope", "service"))],
      ["Equipment inventory", (hasField("equipment", "rack", "asset") || hasFile("equipment_list")) && !missingHas("equipment", "rack")],
      ["Timeline", Boolean(inquiry.lease_end_date || inquiry.requested_due_date || hasField("timeline", "lease", "deadline"))],
      ["Reference files", files.length > 0]
    ],
    scope_of_work: [
      ["Work areas", Boolean(inquiry.city || hasField("area", "room", "suite", "site")) || hasFile("floor_plan")],
      ["Assets or materials", (hasField("equipment", "asset", "rack", "cable") || hasFile("equipment_list")) && !missingHas("equipment")],
      ["Access constraints", hasField("access", "escort", "badge") || !missingHas("access")],
      ["Safety/electrical notes", hasField("electrical", "disconnect", "safety") || !missingHas("electrical", "safety")],
      ["Completion criteria", hasField("deliverable", "closeout", "completion") || Boolean(inquiry.service_type)]
    ],
    estimate: [
      ["Known quantities", (hasField("quantity", "rack", "equipment", "square") || hasFile("equipment_list")) && !missingHas("quantity", "rack", "square")],
      ["Service type", Boolean(inquiry.service_type)],
      ["Logistics/access", hasField("access", "dock", "loading", "parking") || !missingHas("access")],
      ["Subcontractor needs", hasField("electrical", "hvac", "subcontractor") || Boolean(inquiry.service_type)],
      ["Risk assumptions", missing.length > 0 || Boolean(inquiry.confidence_score)]
    ],
    site_checklist: [
      ["Site/contact access", Boolean(inquiry.contact_name || hasField("contact")) && !missingHas("access")],
      ["Equipment focus", hasField("equipment", "rack", "asset", "cable") || hasFile("equipment_list")],
      ["Photo needs", !missingHas("photo")],
      ["Open missing items", missing.length > 0],
      ["Safety questions", hasField("electrical", "safety", "disconnect") || !missingHas("electrical", "safety")]
    ]
  }[type] || [];
  const items = checks.map(([label, available]) => ({ label, available: Boolean(available) }));
  const available = items.filter((item) => item.available).length;
  return { available, total: items.length, ready: available === items.length, items };
}
function summariesHave(detail, pattern) { return (detail.summaries || []).some((summary) => String(summary.body || "").toLowerCase().includes(pattern)); }
function formatBytes(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function sourceDocumentOptions(files = []) {
  const seen = new Set();
  return files
    .filter((file) => file?.category !== "document_export")
    .map((file) => {
      const fileName = file.file_name || file.fileName || "Uploaded file";
      const category = file.category || "other";
      return {
        id: file.id,
        fileName,
        label: fileCategoryLabel(category),
        category,
        sourceLabel: category === "email_attachment" ? "Email attachment" : "Project file",
        dateLabel: file.uploaded_at || file.uploadedAt ? `Uploaded ${formatShortDate(file.uploaded_at || file.uploadedAt)}` : "Upload date unavailable",
        dedupeKey: `${category}:${fileName.toLowerCase()}:${file.size_bytes || file.sizeBytes || ""}`
      };
    })
    .filter((file) => {
      if (!file.id || seen.has(file.id) || seen.has(file.dedupeKey)) return false;
      seen.add(file.id);
      seen.add(file.dedupeKey);
      return true;
    });
}
function fileCategoryLabel(value) {
  if (value === "photo") return "Photo";
  if (value === "document_export") return "Generated document";
  return fileCategoryOptions.find(([category]) => category === value)?.[1] || "Document";
}
function formatShortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function photoCategoryForSelection(value) { return value === "other" ? "photo" : value; }
function generationErrorMessage(error) {
  const message = String(error?.message || error || "");
  if (/timed out/i.test(message)) return "Document generation is taking longer than expected. Please try again in a moment.";
  return message.replace(/\s*:\s*POST\s+\S+/i, "") || "Document generation failed. Please try again.";
}
function providerFallbackMessage(message) {
  if (/timed out/i.test(String(message || ""))) return "The live AI service took too long, so this draft used the saved project details instead.";
  return "Review it before sending because the live AI service was unavailable.";
}
function readDraft(key) { try { return JSON.parse(window.localStorage.getItem(key) || "{}"); } catch { return {}; } }
function writeDraft(key, value) { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function removeDraft(key) { try { window.localStorage.removeItem(key); } catch {} }
