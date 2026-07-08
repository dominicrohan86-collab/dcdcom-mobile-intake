import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ImagePlus, Sparkles, X } from "lucide-react";
import { Badge, Button, Card, Field, Notice, Tabs, Textarea } from "../components/ui";

const intakeSchema = z.object({ notes: z.string().trim().min(20, "Add at least 20 characters of customer context.").max(40_000) });
const channels = ["Call Notes", "Email", "Manual"];
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

export function AddInquiryScreen({ analyze, create, busy, result, error, draftScope = "workspace:user" }) {
  const draftKey = `dcdcom:${draftScope}:intake-draft`;
  const savedDraft = readDraft(draftKey);
  const [channel, setChannel] = React.useState(savedDraft.channel || "Call Notes");
  const [photos, setPhotos] = React.useState([]);
  const [photoError, setPhotoError] = React.useState("");
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(intakeSchema),
    defaultValues: { notes: savedDraft.notes || "" }
  });
  const notes = watch("notes");
  const payload = (values) => ({ rawText: values.notes, sourceChannel: sourceFor(channel), subject: `${channel} intake`, sender: "Customer" });
  React.useEffect(() => writeDraft(draftKey, { channel, notes }), [draftKey, channel, notes]);
  React.useEffect(() => { if (result?.id) removeDraft(draftKey); }, [draftKey, result?.id]);

  function addPhotos(selectedFiles) {
    const selected = Array.from(selectedFiles || []);
    const accepted = selected.filter((file) => file.type.startsWith("image/") && file.size <= MAX_PHOTO_BYTES);
    setPhotoError(accepted.length === selected.length ? "" : "Photos must be image files smaller than 12 MB each.");
    setPhotos((current) => {
      const keys = new Set(current.map(fileKey));
      return [...current, ...accepted.filter((file) => !keys.has(fileKey(file)))];
    });
  }

  return <>
    <Tabs value={channel} onValueChange={setChannel} options={channels} />
    <form className="mt-4 grid gap-3" onSubmit={handleSubmit((values) => create({ ...payload(values), photos }))}>
      <Field label={channel === "Email" ? "Paste customer email" : "Customer notes"} error={errors.notes?.message}><Textarea {...register("notes")} placeholder="Paste or type the customer request, project location, timing, scope, and contact details." /></Field>
      <div className="flex justify-between text-xs text-slate-500"><span>AI will structure the information before saving.</span><span>{notes.length}/40,000</span></div>
      <PhotoPicker photos={photos} error={photoError} add={addPhotos} remove={(index) => setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
      <Button type="button" variant="outline" disabled={busy || notes.trim().length < 20} onClick={handleSubmit((values) => analyze(payload(values)))}><Sparkles size={17} />{busy ? "Analyzing..." : "Analyze details"}</Button>
      <Button type="submit" disabled={busy || notes.trim().length < 20}>{busy ? "Saving..." : "Save inquiry"}</Button>
    </form>
    {result?.preview && <Card className="mt-4 p-3"><div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Extraction preview</h3><Badge tone={result.preview.confidence > 80 ? "green" : "amber"}>{result.preview.confidence}% confidence</Badge></div><dl className="grid gap-2">{result.preview.rows.map((row) => <div key={row.label} className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 border-t border-slate-100 pt-2 text-sm"><dt className="font-semibold text-slate-500">{row.label}</dt><dd className="min-w-0 break-words">{row.value}</dd></div>)}</dl></Card>}
    {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
  </>;
}

function sourceFor(channel) {
  return { "Call Notes": "phone", Email: "email", Manual: "manual" }[channel];
}

function PhotoPicker({ photos, error, add, remove }) {
  const previews = React.useMemo(() => photos.map((file) => ({ file, url: URL.createObjectURL(file) })), [photos]);
  React.useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);

  return <section className="border-y border-slate-200 py-3" aria-labelledby="project-photos-label">
    <div className="flex items-center justify-between gap-3">
      <div><h3 id="project-photos-label" className="text-sm font-bold">Project photos <span className="font-normal text-slate-500">(optional)</span></h3>{photos.length > 0 && <p className="mt-0.5 text-xs text-slate-500">{photos.length} {photos.length === 1 ? "photo" : "photos"} selected</p>}</div>
      <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-blue-300 bg-white px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50">
        <ImagePlus size={16} />Add photos
        <input className="sr-only" type="file" accept="image/*" multiple onChange={(event) => { add(event.target.files); event.target.value = ""; }} />
      </label>
    </div>
    {previews.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2">{previews.map(({ file, url }, index) => <div key={fileKey(file)} className="relative overflow-hidden rounded-md border border-slate-200 bg-slate-100">
      <img src={url} alt={file.name} className="aspect-square w-full object-cover" />
      <button type="button" onClick={() => remove(index)} className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-slate-950/80 text-white shadow-sm" aria-label={`Remove ${file.name}`} title="Remove photo"><X size={14} /></button>
    </div>)}</div>}
    {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
  </section>;
}

function fileKey(file) { return `${file.name}-${file.size}-${file.lastModified}`; }
function readDraft(key) { try { return JSON.parse(window.localStorage.getItem(key) || "{}"); } catch { return {}; } }
function writeDraft(key, value) { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function removeDraft(key) { try { window.localStorage.removeItem(key); } catch {} }
