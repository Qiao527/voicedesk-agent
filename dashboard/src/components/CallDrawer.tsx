import { CalendarCheck, CheckCircle2, Clock, DollarSign, Flag, MessageSquare, Phone, X } from "lucide-react";
import { useEffect } from "react";
import { api } from "../lib/api";
import { useBusiness } from "../lib/business";
import { formatCurrency, formatDateTime, formatDuration, formatPhone, OUTCOME_META, SENTIMENT_META, URGENCY_META } from "../lib/format";
import type { Call } from "../lib/types";
import { useAsync } from "../lib/use-async";
import { useToast } from "./Toast";
import { Transcript } from "./Transcript";
import { Avatar, Badge, Button, Skeleton } from "./ui";

export function CallDrawer({ callId, onClose, onChange }: { callId: string; onClose: () => void; onChange?: (call: Call) => void }) {
  const { timeZone } = useBusiness();
  const toast = useToast();
  const { data: call, loading, error, setData } = useAsync(() => api.getCall(callId), [callId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function toggleFollowUp() {
    if (!call) return;
    const next = !call.follow_up_required;
    setData({ ...call, follow_up_required: next });
    try {
      const updated = await api.setFollowUp(call.id, next);
      onChange?.(updated);
      toast(next ? "Marked for follow-up" : "Follow-up resolved");
    } catch (err) {
      setData({ ...call });
      toast((err as Error).message, "error");
    }
  }

  const outcome = call?.outcome ? OUTCOME_META[call.outcome] : null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Call details">
      <div className="animate-fade-in absolute inset-0 bg-slate-950/40" onClick={onClose} />
      <aside className="animate-slide-in shadow-pop absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          {call ? (
            <div className="flex items-center gap-3">
              <Avatar name={call.caller_name} className="size-10 text-sm" />
              <div>
                <p className="font-semibold text-slate-900">{call.caller_name ?? formatPhone(call.caller_number)}</p>
                <p className="text-xs text-slate-500">
                  {call.caller_name && `${formatPhone(call.caller_number)} · `}
                  {formatDateTime(call.created_at, timeZone)}
                </p>
              </div>
            </div>
          ) : (
            <Skeleton className="h-10 w-48" />
          )}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && !call && (
            <div className="space-y-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-40" />
            </div>
          )}
          {error && <p className="text-sm text-rose-600">{error.message}</p>}

          {call && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                {outcome && (
                  <Badge tone={outcome.tone} dot>
                    {outcome.label}
                  </Badge>
                )}
                {call.sentiment && <Badge tone={SENTIMENT_META[call.sentiment].tone}>{SENTIMENT_META[call.sentiment].label}</Badge>}
                {call.analysis?.topics.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>

              {call.follow_up_required && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <Flag className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div className="flex-1 text-sm">
                    <p className="font-medium text-amber-900">Needs follow-up</p>
                    {call.analysis?.follow_up_reason && <p className="mt-0.5 text-amber-800">{call.analysis.follow_up_reason}</p>}
                  </div>
                  {call.caller_number && (
                    <a href={`tel:${call.caller_number}`} className="text-sm font-medium text-amber-900 underline underline-offset-2">
                      Call back
                    </a>
                  )}
                </div>
              )}

              {call.summary && (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Summary</h3>
                  <p className="text-sm leading-relaxed text-slate-700">{call.summary}</p>
                </section>
              )}

              <dl className="grid grid-cols-3 gap-3">
                {[
                  { icon: Clock, label: "Duration", value: formatDuration(call.duration_seconds) },
                  { icon: DollarSign, label: "Cost", value: call.cost_cents != null ? formatCurrency(call.cost_cents) : "n/a" },
                  { icon: Phone, label: "Intent", value: call.analysis?.intent ?? "n/a" },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                    <dt className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                      <item.icon className="size-3" />
                      {item.label}
                    </dt>
                    <dd className="mt-0.5 truncate text-sm font-medium text-slate-900 capitalize">{item.value}</dd>
                  </div>
                ))}
              </dl>

              {(call.appointments.length > 0 || call.messages.length > 0) && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Created during this call</h3>
                  {call.appointments.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-sm"
                    >
                      <CalendarCheck className="size-4 text-emerald-600" />
                      <span className="flex-1 text-emerald-900">
                        {a.reason ?? "Appointment"} · {formatDateTime(a.start_time, timeZone)}
                      </span>
                      <Badge tone="green">{a.duration_min} min</Badge>
                    </div>
                  ))}
                  {call.messages.map((m) => (
                    <div key={m.id} className="flex items-start gap-3 rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2.5 text-sm">
                      <MessageSquare className="mt-0.5 size-4 text-sky-600" />
                      <span className="flex-1 text-sky-950">{m.content}</span>
                      <Badge tone={URGENCY_META[m.urgency].tone}>{URGENCY_META[m.urgency].label}</Badge>
                    </div>
                  ))}
                </section>
              )}

              {call.recording_url && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Recording</h3>
                  <audio controls src={call.recording_url} className="w-full" preload="none" />
                </section>
              )}

              <section>
                <h3 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">Transcript</h3>
                <Transcript text={call.transcript} callerName={call.caller_name} />
              </section>
            </div>
          )}
        </div>

        {call && (
          <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
            <p className="text-xs text-slate-400">{call.ended_reason?.replace(/-/g, " ")}</p>
            <Button
              variant={call.follow_up_required ? "primary" : "secondary"}
              icon={call.follow_up_required ? CheckCircle2 : Flag}
              onClick={toggleFollowUp}
            >
              {call.follow_up_required ? "Mark resolved" : "Flag for follow-up"}
            </Button>
          </footer>
        )}
      </aside>
    </div>
  );
}
