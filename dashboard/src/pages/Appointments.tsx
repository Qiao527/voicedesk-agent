import { CalendarDays, ExternalLink, Phone } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Badge, Card, EmptyState, ErrorState, PageHeader, Segmented, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { useBusiness } from "../lib/business";
import { formatLongDate, formatPhone, formatTime, type Tone } from "../lib/format";
import { localDateKey } from "../lib/time";
import type { Appointment } from "../lib/types";
import { useAsync } from "../lib/use-async";

const STATUS: Record<Appointment["status"], { label: string; tone: Tone }> = {
  confirmed: { label: "Confirmed", tone: "green" },
  completed: { label: "Completed", tone: "slate" },
  cancelled: { label: "Cancelled", tone: "rose" },
  no_show: { label: "No-show", tone: "amber" },
};

export default function Appointments() {
  const { timeZone } = useBusiness();
  const { data, loading, error, reload } = useAsync(() => api.listAppointments());
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [now] = useState(() => Date.now());

  const list = (data ?? [])
    .filter((a) => (tab === "upcoming" ? new Date(a.end_time).getTime() >= now : new Date(a.end_time).getTime() < now))
    .sort((a, b) => (tab === "upcoming" ? a.start_time.localeCompare(b.start_time) : b.start_time.localeCompare(a.start_time)));

  // Group by the business's calendar day, not the viewer's.
  const groups = new Map<string, Appointment[]>();
  for (const a of list) {
    const key = localDateKey(new Date(a.start_time), timeZone);
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const upcoming = data?.filter((a) => new Date(a.end_time).getTime() >= now).length ?? 0;
  const today = localDateKey(new Date(), timeZone);

  return (
    <div>
      <PageHeader
        title="Appointments"
        description={`Booked by your receptionist and synced to Google Calendar. Times shown in ${timeZone.replace(/_/g, " ")}.`}
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "upcoming", label: `Upcoming${upcoming ? ` (${upcoming})` : ""}` },
              { value: "past", label: "Past" },
            ]}
          />
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading && !data ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : groups.size === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title={`No ${tab} appointments`}
            body={tab === "upcoming" ? "New bookings from calls will appear here." : "Past appointments will appear here."}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {[...groups].map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                {formatLongDate(day)}
                {day === today && <Badge tone="indigo">Today</Badge>}
              </h2>
              <Card className="divide-y divide-slate-100">
                {items.map((a) => (
                  <div key={a.id} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                    <div className="w-20 shrink-0">
                      <p className="tabular text-sm font-semibold text-slate-900">{formatTime(a.start_time, timeZone)}</p>
                      <p className="text-xs text-slate-500">{a.duration_min} min</p>
                    </div>
                    <div className="h-9 w-px bg-slate-200" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-slate-900">{a.caller_name}</p>
                        <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                        {a.reason && <span>{a.reason}</span>}
                        {a.caller_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="size-3" />
                            {formatPhone(a.caller_phone)}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {a.call_id && (
                        <Link to={`/calls?call=${a.call_id}`} className="text-brand-600 hover:text-brand-700 hidden font-medium sm:inline">
                          View call
                        </Link>
                      )}
                      {a.google_event_id && (
                        <a
                          href="https://calendar.google.com/calendar/r"
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-brand-600 text-slate-400"
                          title="Open Google Calendar"
                        >
                          <ExternalLink className="size-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
