import { clsx } from "clsx";
import { BookOpen, Building2, CalendarDays, Check, Clock, Eye, Pencil, Phone, Plus, Plug, Save, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { useToast } from "../components/Toast";
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, Select, Skeleton, Textarea } from "../components/ui";
import { api } from "../lib/api";
import { useBusiness } from "../lib/business";
import { IS_DEMO } from "../lib/config";
import { formatPhone } from "../lib/format";
import { parseRange } from "../lib/time";
import { WEEKDAYS, type Business, type BusinessHours, type FaqItem, type Weekday } from "../lib/types";
import { useAsync } from "../lib/use-async";

type Tab = "business" | "hours" | "receptionist" | "knowledge" | "integrations";

const TABS: Array<{ id: Tab; label: string; icon: typeof Building2 }> = [
  { id: "business", label: "Business", icon: Building2 },
  { id: "hours", label: "Hours & booking", icon: Clock },
  { id: "receptionist", label: "Receptionist", icon: Sparkles },
  { id: "knowledge", label: "Knowledge base", icon: BookOpen },
  { id: "integrations", label: "Integrations", icon: Plug },
];

const DAY_LABELS: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const COMMON_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

function allTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  const rest = intl.supportedValuesOf?.("timeZone") ?? [];
  return [...COMMON_ZONES, ...rest.filter((z) => !COMMON_ZONES.includes(z))];
}

type Draft = Pick<
  Business,
  | "name"
  | "owner_name"
  | "owner_phone"
  | "owner_email"
  | "address"
  | "timezone"
  | "greeting_message"
  | "recording_disclosure"
  | "appointment_duration_min"
> & { business_hours: BusinessHours };

function toDraft(b: Business): Draft {
  return {
    name: b.name,
    owner_name: b.owner_name ?? "",
    owner_phone: b.owner_phone ?? "",
    owner_email: b.owner_email ?? "",
    address: b.address ?? "",
    timezone: b.timezone,
    greeting_message: b.greeting_message ?? "",
    recording_disclosure: b.recording_disclosure ?? "",
    appointment_duration_min: b.appointment_duration_min,
    business_hours: { ...(b.business_hours ?? {}) },
  };
}

// ─── Hours editor ────────────────────────────────────────────────────

function toHHMM(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function HoursEditor({ value, onChange }: { value: BusinessHours; onChange: (v: BusinessHours) => void }) {
  return (
    <div className="divide-y divide-slate-100">
      {WEEKDAYS.map((day) => {
        const range = parseRange(value[day]);
        const open = Boolean(range);
        const set = (o: string, c: string) =>
          onChange({ ...value, [day]: `${Number(o.slice(0, 2))}:${o.slice(3)}-${Number(c.slice(0, 2))}:${c.slice(3)}` });
        return (
          <div key={day} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <label className="flex w-36 items-center gap-2.5 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                className="accent-brand-600 size-4 rounded border-slate-300"
                checked={open}
                onChange={(e) => onChange({ ...value, [day]: e.target.checked ? "9:00-17:00" : "closed" })}
              />
              {DAY_LABELS[day]}
            </label>
            {open && range ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Input
                  type="time"
                  step={900}
                  className="w-32"
                  value={toHHMM(range.open)}
                  onChange={(e) => e.target.value && set(e.target.value, toHHMM(range.close))}
                  aria-label={`${DAY_LABELS[day]} opening time`}
                />
                to
                <Input
                  type="time"
                  step={900}
                  className="w-32"
                  value={toHHMM(range.close)}
                  onChange={(e) => e.target.value && set(toHHMM(range.open), e.target.value)}
                  aria-label={`${DAY_LABELS[day]} closing time`}
                />
              </div>
            ) : (
              <span className="text-sm text-slate-400">Closed</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Knowledge base ──────────────────────────────────────────────────

function FaqRow({
  faq,
  onSave,
  onDelete,
}: {
  faq: FaqItem;
  onSave: (patch: Partial<FaqItem>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState(faq.question);
  const [a, setA] = useState(faq.answer);
  const [busy, setBusy] = useState(false);

  if (editing) {
    return (
      <div className="space-y-2 bg-slate-50/60 px-5 py-4">
        <Input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Question" />
        <Textarea value={a} onChange={(e) => setA(e.target.value)} rows={3} aria-label="Answer" />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" icon={X} onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={Check}
            loading={busy}
            disabled={!q.trim() || !a.trim()}
            onClick={async () => {
              setBusy(true);
              await onSave({ question: q.trim(), answer: a.trim() });
              setBusy(false);
              setEditing(false);
            }}
          >
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{faq.question}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{faq.answer}</p>
        {faq.category && (
          <span className="mt-2 inline-block">
            <Badge>{faq.category}</Badge>
          </span>
        )}
      </div>
      <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)} aria-label="Edit FAQ" />
        <Button size="sm" variant="danger" icon={Trash2} onClick={onDelete} aria-label="Delete FAQ" />
      </div>
    </div>
  );
}

function KnowledgeBase() {
  const toast = useToast();
  const { data: faqs, loading, setData } = useAsync(() => api.listFaqs());
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [cat, setCat] = useState("");
  const [adding, setAdding] = useState(false);

  async function add() {
    setAdding(true);
    try {
      const created = await api.createFaq({ question: q.trim(), answer: a.trim(), category: cat.trim() || null });
      setData((prev) => [...(prev ?? []), created]);
      setQ("");
      setA("");
      setCat("");
      toast("FAQ added. The next call will use it.");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setAdding(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Knowledge base"
        description="The receptionist answers questions only from this list. Changes apply to the next call."
      />
      {loading && !faqs ? (
        <Skeleton className="m-5 h-40" />
      ) : (
        <div className="divide-y divide-slate-100">
          {(faqs ?? []).map((faq) => (
            <FaqRow
              key={faq.id}
              faq={faq}
              onSave={async (patch) => {
                try {
                  const updated = await api.updateFaq(faq.id, patch);
                  setData((prev) => (prev ?? []).map((f) => (f.id === faq.id ? updated : f)));
                  toast("FAQ updated");
                } catch (err) {
                  toast((err as Error).message, "error");
                }
              }}
              onDelete={async () => {
                const prev = faqs;
                setData((list) => (list ?? []).filter((f) => f.id !== faq.id));
                try {
                  await api.deleteFaq(faq.id);
                } catch (err) {
                  setData(prev ?? []);
                  toast((err as Error).message, "error");
                }
              }}
            />
          ))}
        </div>
      )}
      <div className="space-y-2 border-t border-slate-100 bg-slate-50/50 px-5 py-4">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Add a question</p>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Do you see children?" aria-label="New question" />
        <Textarea
          value={a}
          onChange={(e) => setA(e.target.value)}
          rows={2}
          placeholder="e.g. Yes, we see patients from age 3."
          aria-label="New answer"
        />
        <div className="flex gap-2">
          <Input
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            placeholder="Category (optional)"
            className="flex-1"
            aria-label="Category"
          />
          <Button variant="primary" icon={Plus} onClick={add} loading={adding} disabled={!q.trim() || !a.trim()}>
            Add
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Integrations ────────────────────────────────────────────────────

function Integration({
  icon: Icon,
  title,
  body,
  status,
  action,
}: {
  icon: typeof Phone;
  title: string;
  body: ReactNode;
  status: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {status}
        </div>
        <p className="mt-0.5 text-sm text-slate-500">{body}</p>
      </div>
      {action}
    </div>
  );
}

function Integrations({ business, onChange }: { business: Business; onChange: (b: Business) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const connected = Boolean(business.google_calendar_connected_at);

  return (
    <Card className="divide-y divide-slate-100">
      <Integration
        icon={Phone}
        title="Phone number"
        status={
          business.vapi_phone_number ? (
            <Badge tone="green" dot>
              Live
            </Badge>
          ) : (
            <Badge tone="amber">Not set</Badge>
          )
        }
        body={
          business.vapi_phone_number ? (
            <>
              Callers reach your receptionist at{" "}
              <span className="font-medium text-slate-700">{formatPhone(business.vapi_phone_number)}</span>. Forward your existing line here
              to cover missed calls.
            </>
          ) : (
            "Provision a number with the onboarding CLI (npm run setup)."
          )
        }
      />
      <Integration
        icon={CalendarDays}
        title="Google Calendar"
        status={
          connected ? (
            <Badge tone="green" dot>
              Connected
            </Badge>
          ) : (
            <Badge>Not connected</Badge>
          )
        }
        body={
          connected
            ? `Live availability and booking on the "${business.calendar_id ?? "primary"}" calendar since ${new Date(business.google_calendar_connected_at!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`
            : "Connect a calendar so the receptionist can check free/busy and book appointments."
        }
        action={
          connected ? (
            <Button
              variant="ghost"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await api.disconnectCalendar();
                onChange({ ...business, google_calendar_connected_at: null });
                setBusy(false);
                toast("Google Calendar disconnected");
              }}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  window.location.href = await api.startCalendarConnect();
                } catch (err) {
                  toast((err as Error).message, "error");
                  setBusy(false);
                }
              }}
            >
              Connect
            </Button>
          )
        }
      />
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

export default function Settings() {
  const { business, loading, error, setBusiness } = useBusiness();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "business") as Tab;
  // null = no unsaved edits; the form shows the saved business.
  const [edits, setEdits] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const preview = useAsync(() => (showPrompt ? api.getPromptPreview() : Promise.resolve(null)), [showPrompt]);
  const zones = useMemo(() => allTimeZones(), []);

  // Google redirects the browser back here (GOOGLE_REDIRECT_URI points at the
  // dashboard). Finish the connection with the owner's session, so the grant is
  // bound to the authenticated user and business, then strip the query.
  const oauthError = params.get("error");
  const oauthCode = params.get("code");
  const oauthState = params.get("state");
  useEffect(() => {
    if (!oauthCode && !oauthError) return;
    const clear = () => setParams({ tab: "integrations" }, { replace: true });
    if (oauthError || !oauthCode || !oauthState) {
      toast(`Google Calendar connection failed (${oauthError ?? "missing_code"})`, "error");
      clear();
      return;
    }
    let active = true;
    api
      .completeCalendarConnect(oauthCode, oauthState)
      .then(async () => {
        if (!active) return;
        toast("Google Calendar connected");
        setBusiness(await api.getBusiness());
      })
      .catch((err: unknown) => active && toast(`Google Calendar connection failed (${(err as Error).message})`, "error"))
      .finally(clear);
    return () => {
      active = false;
    };
  }, [oauthCode, oauthState, oauthError, setParams, setBusiness, toast]);

  if (error) return <ErrorState error={error} />;
  if (loading || !business) return <Skeleton className="h-96 rounded-xl" />;

  const original = toDraft(business);
  const draft = edits ?? original;
  const dirty = edits !== null && JSON.stringify(original) !== JSON.stringify(edits);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setEdits({ ...draft, [key]: value });

  async function save() {
    setSaving(true);
    try {
      const updated = await api.updateBusiness({
        ...draft,
        owner_name: draft.owner_name || null,
        owner_phone: draft.owner_phone || null,
        owner_email: draft.owner_email || null,
        address: draft.address || null,
        greeting_message: draft.greeting_message || null,
        recording_disclosure: draft.recording_disclosure || null,
      });
      setBusiness(updated);
      setEdits(null);
      toast("Settings saved");
      if (showPrompt) void preview.reload();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-20">
      <PageHeader title="Settings" description="Everything your receptionist knows about your business." />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={clsx(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
              tab === t.id ? "border-brand-600 text-brand-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-w-3xl space-y-6">
        {tab === "business" && (
          <Card>
            <CardHeader title="Business details" description="Used in the greeting, the system prompt, and owner notifications." />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Business name" htmlFor="name">
                <Input id="name" value={draft.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="Time zone" htmlFor="tz" hint="Bookings and reports use this zone.">
                <Select id="tz" value={draft.timezone} onChange={(e) => set("timezone", e.target.value)}>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, " ")}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Address" htmlFor="address" className="sm:col-span-2">
                <Input id="address" value={draft.address ?? ""} onChange={(e) => set("address", e.target.value)} />
              </Field>
              <Field label="Owner name" htmlFor="owner">
                <Input id="owner" value={draft.owner_name ?? ""} onChange={(e) => set("owner_name", e.target.value)} />
              </Field>
              <Field label="Owner email" htmlFor="email" hint="Receives a summary after every call.">
                <Input id="email" type="email" value={draft.owner_email ?? ""} onChange={(e) => set("owner_email", e.target.value)} />
              </Field>
              <Field label="Owner mobile" htmlFor="phone" hint="SMS alerts and live transfers go here. Leave empty to disable transfers.">
                <Input
                  id="phone"
                  type="tel"
                  value={draft.owner_phone ?? ""}
                  placeholder="+16175551234"
                  onChange={(e) => set("owner_phone", e.target.value)}
                />
              </Field>
            </div>
          </Card>
        )}

        {tab === "hours" && (
          <>
            <Card>
              <CardHeader title="Opening hours" description="The receptionist only offers appointments inside these hours." />
              <HoursEditor value={draft.business_hours} onChange={(v) => set("business_hours", v)} />
            </Card>
            <Card>
              <CardHeader title="Booking" />
              <div className="p-5">
                <Field
                  label="Default appointment length"
                  htmlFor="duration"
                  hint="Slots are offered on a 30-minute grid with at least one hour's notice."
                >
                  <Select
                    id="duration"
                    className="sm:w-48"
                    value={draft.appointment_duration_min}
                    onChange={(e) => set("appointment_duration_min", Number(e.target.value))}
                  >
                    {[15, 20, 30, 45, 60, 90, 120].map((m) => (
                      <option key={m} value={m}>
                        {m} minutes
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </Card>
          </>
        )}

        {tab === "receptionist" && (
          <>
            <Card>
              <CardHeader title="Greeting" description="The first thing callers hear." />
              <div className="space-y-4 p-5">
                <Field
                  label="Recording disclosure"
                  htmlFor="disclosure"
                  hint="Spoken before the greeting. Two-party-consent states (CA, FL, IL, MD, MA, MT, NV, NH, PA, WA) require one."
                >
                  <Textarea
                    id="disclosure"
                    rows={2}
                    value={draft.recording_disclosure ?? ""}
                    onChange={(e) => set("recording_disclosure", e.target.value)}
                  />
                </Field>
                <Field label="Greeting" htmlFor="greeting">
                  <Textarea
                    id="greeting"
                    rows={2}
                    value={draft.greeting_message ?? ""}
                    onChange={(e) => set("greeting_message", e.target.value)}
                  />
                </Field>
                <div className="border-brand-100 bg-brand-50/60 text-brand-900 rounded-lg border px-4 py-3 text-sm">
                  <span className="font-medium">Callers will hear: </span>
                  {[draft.recording_disclosure, draft.greeting_message || `Thanks for calling ${draft.name}, how can I help you today?`]
                    .filter(Boolean)
                    .join(" ")}
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader
                title="System prompt"
                description="The full instructions your receptionist receives on every call, generated from your settings."
                action={
                  <Button size="sm" icon={Eye} onClick={() => setShowPrompt((v) => !v)}>
                    {showPrompt ? "Hide" : "Preview"}
                  </Button>
                }
              />
              {showPrompt && (
                <div className="p-5">
                  {preview.loading ? (
                    <Skeleton className="h-64" />
                  ) : (
                    <pre className="max-h-[28rem] overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-200">
                      {preview.data?.systemPrompt}
                    </pre>
                  )}
                  {dirty && <p className="mt-2 text-xs text-amber-700">Save your changes to see them reflected here.</p>}
                </div>
              )}
            </Card>
          </>
        )}

        {tab === "knowledge" && <KnowledgeBase />}
        {tab === "integrations" && <Integrations business={business} onChange={setBusiness} />}
      </div>

      {dirty && tab !== "knowledge" && tab !== "integrations" && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:left-60">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <p className="text-sm text-slate-600">
              You have unsaved changes{IS_DEMO && <span className="text-slate-400"> (demo: saved for this session only)</span>}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEdits(null)}>
                Discard
              </Button>
              <Button variant="primary" icon={Save} loading={saving} onClick={save}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
