import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileCheck, RefreshCw, Send } from "lucide-react";
import { client } from "../lib/api";
import { AccordionSection, Badge, Button, Checkbox, Notice, Tabs, TabsContent, Textarea } from "../components/ui";
import { moneyRange } from "../lib/utils";

const tones = ["Professional", "Concise", "Warm", "Formal"];

export function EmailScreen({ detail, notice, setNotice }) {
  const queryClient = useQueryClient();
  const existing = detail.documents?.find((document) => document.document_type === "follow_up_email");
  const [tone, setTone] = React.useState("Professional");
  const [body, setBody] = React.useState(existing?.body || "");
  const [subject, setSubject] = React.useState(existing?.subject || `Follow-up on ${detail.inquiry.title}`);
  const [include, setInclude] = React.useState({ missing: true, visit: true, overview: true, photos: true });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["inquiry", detail.inquiry.id] });
  const generate = useMutation({ mutationFn: () => client.generate(detail.inquiry.id, "follow_up_email", tone), onSuccess: (result) => { setBody(result.product.body); setSubject(result.product.subject || subject); setNotice("Follow-up email generated and saved."); refresh(); } });
  const save = useMutation({ mutationFn: () => client.saveDocument(detail.inquiry.id, { documentId: existing?.id, documentType: "follow_up_email", title: `Follow-up Email - ${detail.inquiry.title}`, subject, body, metadata: { include, tone } }), onSuccess: () => { setNotice("Draft saved as a new version."); refresh(); } });
  const send = useMutation({ mutationFn: () => client.sendFollowUp(detail.inquiry.id, { documentId: existing?.id, title: `Follow-up Email - ${detail.inquiry.title}`, subject, body, channel: "email", metadata: { include, tone } }), onSuccess: (result) => { setNotice(result.communication.status === "sent" ? "Follow-up sent and logged." : "Follow-up queued and logged."); refresh(); } });
  const busy = generate.isPending || save.isPending || send.isPending;

  return <>
    <h2 className="text-xl font-bold">Follow-up Email</h2>
    <div className="mt-4"><Tabs value={tone} onValueChange={setTone} options={tones} /></div>
    <div className="mt-4"><AccordionSection value="include" title="Include in draft" meta={`${Object.values(include).filter(Boolean).length} selected`}>{Object.entries({ missing: "Missing questions", visit: "Site visit suggestion", overview: "Service overview", photos: "Request for photos" }).map(([key, label]) => <Checkbox key={key} label={label} checked={include[key]} onCheckedChange={(checked) => setInclude({ ...include, [key]: Boolean(checked) })} />)}</AccordionSection></div>
    <div className="mt-4"><label className="text-xs font-semibold text-slate-500">Subject<input className="mt-1 min-h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100" value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label className="mt-3 block text-xs font-semibold text-slate-500">Message<Textarea className="mt-1 min-h-64" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Generate a draft or write a follow-up." /></label></div>
    <div className="mt-4 grid grid-cols-3 gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => generate.mutate()}><RefreshCw size={15} />Generate</Button><Button size="sm" variant="outline" disabled={busy || !body.trim()} onClick={() => save.mutate()}><FileCheck size={15} />Save</Button><Button size="sm" disabled={busy || !body.trim()} onClick={() => send.mutate()}><Send size={15} />Queue</Button></div>
    {notice && <div className="mt-3"><Notice>{notice}</Notice></div>}
    {(generate.error || save.error || send.error) && <div className="mt-3"><Notice tone="error">{String((generate.error || save.error || send.error).message)}</Notice></div>}
  </>;
}

export function ProposalScreen({ detail, notice, setNotice }) {
  const queryClient = useQueryClient();
  const proposal = detail.documents?.find((document) => document.document_type === "proposal");
  const [tab, setTab] = React.useState("Scope");
  const [body, setBody] = React.useState(proposal?.body || "");
  const [editing, setEditing] = React.useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["inquiry", detail.inquiry.id] });
  const generate = useMutation({ mutationFn: () => client.generate(detail.inquiry.id, "proposal"), onSuccess: (result) => { setBody(result.product.body); setNotice("Proposal generated and saved."); refresh(); } });
  const save = useMutation({ mutationFn: () => client.saveDocument(detail.inquiry.id, { documentId: proposal?.id, documentType: "proposal", title: proposal?.title || `${detail.inquiry.title} Proposal`, body, status: "draft", metadata: { approvalRequired: true } }), onSuccess: () => { setEditing(false); setNotice("Proposal saved as a new version."); refresh(); } });
  const review = useMutation({ mutationFn: async () => { let documentId = proposal?.id; if (!documentId) documentId = (await client.generate(detail.inquiry.id, "proposal")).documentId; return client.submitReview(detail.inquiry.id, documentId); }, onSuccess: () => { setNotice("Proposal sent to internal review."); refresh(); } });
  const tabs = ["Scope", "Assumptions", "Deliverables", "Terms"];
  const section = proposalSection(body, tab);

  return <>
    <div><div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4"><div><Badge tone="amber">Draft</Badge><h2 className="mt-2 text-xl font-bold">{proposal?.title || `${detail.inquiry.title} Proposal`}</h2><p className="mt-1 text-sm capitalize text-slate-500">{detail.inquiry.service_type?.replaceAll("_", " ")}</p></div><strong className="shrink-0 text-right text-sm">{moneyRange(detail.inquiry.estimated_low_cents, detail.inquiry.estimated_high_cents)}<span className="block text-xs font-normal text-slate-500">Price range</span></strong></div>
      <div className="mt-4"><Tabs value={tab} onValueChange={setTab} options={tabs}>{tabs.map((name) => <TabsContent key={name} value={name} className="pt-4"><div className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{section || "Generate the proposal to populate this section."}</div></TabsContent>)}</Tabs></div>
    </div>
    {editing && <div className="mt-3"><Textarea className="min-h-72" value={body} onChange={(event) => setBody(event.target.value)} /><Button className="mt-2 w-full" onClick={() => save.mutate()}>Save proposal</Button></div>}
    <div className="mt-4 grid grid-cols-3 gap-2"><Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>{editing ? "Cancel" : "Edit"}</Button><Button size="sm" variant="outline" onClick={() => generate.mutate()} disabled={generate.isPending}><RefreshCw size={15} />Generate</Button><Button size="sm" onClick={() => review.mutate()} disabled={review.isPending}><Send size={15} />Review</Button></div>
    {notice && <div className="mt-3"><Notice>{notice}</Notice></div>}
    {(generate.error || save.error || review.error) && <div className="mt-3"><Notice tone="error">{String((generate.error || save.error || review.error).message)}</Notice></div>}
  </>;
}

function proposalSection(body, title) {
  const chunks = String(body || "").split(/\n{2,}/);
  return chunks.find((chunk) => chunk.toLowerCase().startsWith(title.toLowerCase()))?.replace(new RegExp(`^${title}\\s*`, "i"), "") || body;
}
