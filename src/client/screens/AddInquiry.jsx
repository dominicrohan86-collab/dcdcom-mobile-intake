import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Camera, Mail, Phone, Sparkles, Upload } from "lucide-react";
import { Badge, Button, Card, Field, Notice, Tabs, Textarea } from "../components/ui";

const intakeSchema = z.object({ notes: z.string().trim().min(20, "Add at least 20 characters of customer context.").max(40_000) });
const channels = ["Call Notes", "Email", "Manual", "Photo"];
const icons = { "Call Notes": Phone, Email: Mail, Manual: Sparkles, Photo: Camera };

export function AddInquiryScreen({ analyze, create, busy, result, error }) {
  const [channel, setChannel] = React.useState("Call Notes");
  const [file, setFile] = React.useState(null);
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(intakeSchema),
    defaultValues: { notes: "" }
  });
  const notes = watch("notes");
  const payload = (values) => ({ rawText: values.notes, sourceChannel: sourceFor(channel), subject: `${channel} intake`, sender: "Customer", file });

  return <>
    <Tabs value={channel} onValueChange={setChannel} options={channels} />
    <form className="mt-4 grid gap-3" onSubmit={handleSubmit((values) => create(payload(values)))}>
      {channel === "Photo" && <Card className="p-3"><label className="flex min-h-14 cursor-pointer items-center gap-3 text-sm text-slate-600"><Upload className="text-blue-600" /><span className="min-w-0 truncate">{file?.name || "Choose a photo, floor plan, or equipment list"}</span><input className="sr-only" type="file" accept="image/*,.pdf,.csv,.xlsx,.doc,.docx" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label></Card>}
      <Field label={channel === "Email" ? "Paste customer email" : channel === "Photo" ? "Photo notes or OCR text" : "Customer notes"} error={errors.notes?.message}><Textarea {...register("notes")} placeholder="Paste or type the customer request, project location, timing, scope, and contact details." /></Field>
      <div className="flex justify-between text-xs text-slate-500"><span>AI will structure the information before saving.</span><span>{notes.length}/40,000</span></div>
      <Button type="button" variant="outline" disabled={busy || notes.trim().length < 20} onClick={handleSubmit((values) => analyze(payload(values)))}><Sparkles size={17} />{busy ? "Analyzing..." : "Analyze details"}</Button>
      <Button type="submit" disabled={busy || notes.trim().length < 20}>{busy ? "Saving..." : "Save inquiry"}</Button>
    </form>
    {result?.preview && <Card className="mt-4 p-3"><div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Extraction preview</h3><Badge tone={result.preview.confidence > 80 ? "green" : "amber"}>{result.preview.confidence}% confidence</Badge></div><dl className="grid gap-2">{result.preview.rows.map((row) => <div key={row.label} className="grid grid-cols-[100px_1fr] gap-2 border-t border-slate-100 pt-2 text-sm"><dt className="font-semibold text-slate-500">{row.label}</dt><dd>{row.value}</dd></div>)}</dl></Card>}
    {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
  </>;
}

function sourceFor(channel) {
  return { "Call Notes": "phone", Email: "email", Manual: "manual", Photo: "photo" }[channel];
}
