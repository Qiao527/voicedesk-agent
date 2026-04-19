import { useEffect, useState } from "react";
import { Calendar, Phone, Clock, ExternalLink } from "lucide-react";
import { fetchAppointments, type Appointment } from "../lib/api";

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  confirmed: { bg: "bg-green-50", text: "text-success-text" },
  cancelled: { bg: "bg-red-50", text: "text-ruby" },
  completed: { bg: "bg-gray-100", text: "text-gray-500" },
  rescheduled: { bg: "bg-amber-50", text: "text-amber-700" },
};

function localDateKey(iso: string) {
  // Group by the viewer's local calendar date (YYYY-MM-DD) so appointments
  // don't drift into the next UTC day just because it's late in the evening.
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateKey(key: string) {
  // `key` is YYYY-MM-DD in the viewer's local calendar. Parse as local date,
  // not ISO (ISO with no time is interpreted as UTC, which can shift a day).
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function isUpcoming(iso: string) {
  return new Date(iso) >= new Date();
}

function groupByDate(appointments: Appointment[]) {
  const groups = new Map<string, Appointment[]>();
  for (const appt of appointments) {
    const key = localDateKey(appt.start_time);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(appt);
  }
  return groups;
}

export default function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  useEffect(() => {
    fetchAppointments()
      .then(setAppointments)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = appointments.filter((a) =>
    tab === "upcoming" ? isUpcoming(a.start_time) : !isUpcoming(a.start_time),
  );

  const upcomingCount = appointments.filter((a) => isUpcoming(a.start_time)).length;
  const grouped = groupByDate(filtered);
  const sortedDates = Array.from(grouped.keys()).sort((a, b) =>
    tab === "upcoming" ? a.localeCompare(b) : b.localeCompare(a),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-heading">
              Appointments
            </h1>
            {upcomingCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-success-text">
                {upcomingCount} upcoming
              </span>
            )}
          </div>
          <p className="text-sm text-body mt-1">
            {appointments.length} total appointment{appointments.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-surface rounded-md p-1 w-fit border border-border">
        {(["upcoming", "past"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm rounded transition-colors capitalize ${
              tab === t
                ? "bg-white text-heading font-medium shadow-sm border border-border"
                : "text-body hover:text-heading"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-body">Loading appointments...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-border shadow-elevated text-center py-16 px-8">
          <Calendar className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-heading font-medium">
            No {tab} appointments
          </p>
          <p className="text-sm text-body mt-1">
            {tab === "upcoming"
              ? "New bookings from calls will appear here."
              : "Past appointments will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((dateKey) => (
            <div key={dateKey}>
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 px-1">
                {formatDateKey(dateKey)}
              </h2>
              <div className="bg-white rounded-lg border border-border shadow-elevated divide-y divide-border overflow-hidden">
                {grouped.get(dateKey)!.map((appt) => {
                  const statusStyle =
                    STATUS_STYLES[appt.status] ?? STATUS_STYLES.confirmed;

                  return (
                    <div key={appt.id} className="px-4 py-3 flex items-center gap-4">
                      {/* Time block */}
                      <div className="w-16 shrink-0 text-center">
                        <p className="text-sm font-semibold text-heading">
                          {new Date(appt.start_time).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </p>
                        <p className="text-xs text-muted flex items-center justify-center gap-0.5 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {appt.duration_min}m
                        </p>
                      </div>

                      {/* Divider */}
                      <div className="w-px h-10 bg-border shrink-0" />

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-heading truncate">
                            {appt.caller_name}
                          </p>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${statusStyle.bg} ${statusStyle.text} shrink-0`}
                          >
                            {appt.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {appt.reason && (
                            <span className="text-xs text-body capitalize">
                              {appt.reason}
                            </span>
                          )}
                          {appt.caller_phone && (
                            <span className="flex items-center gap-1 text-xs text-muted">
                              <Phone className="w-3 h-3" />
                              {appt.caller_phone}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Google Calendar link */}
                      {appt.google_event_id && (
                        <a
                          href={`https://calendar.google.com/calendar/r/eventedit/${appt.google_event_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted hover:text-purple transition-colors"
                          title="View in Google Calendar"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
