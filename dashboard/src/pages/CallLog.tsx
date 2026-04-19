import { useEffect, useState } from "react";
import { Phone, Clock, ChevronDown, ChevronUp, Search } from "lucide-react";
import { fetchCalls, type Call } from "../lib/api";

const OUTCOME_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  appointment_booked: { bg: "bg-green-50", text: "text-success-text", label: "Booked" },
  message_taken: { bg: "bg-blue-50", text: "text-blue-700", label: "Message" },
  question_answered: { bg: "bg-purple-surface", text: "text-purple-deep", label: "FAQ" },
  transferred: { bg: "bg-amber-50", text: "text-amber-700", label: "Transferred" },
  voicemail: { bg: "bg-gray-100", text: "text-gray-600", label: "Voicemail" },
  missed: { bg: "bg-red-50", text: "text-ruby", label: "Missed" },
};

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  const style = outcome
    ? OUTCOME_STYLES[outcome] ?? { bg: "bg-gray-100", text: "text-gray-600", label: outcome }
    : { bg: "bg-gray-100", text: "text-gray-500", label: "Unknown" };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CallLog() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");

  useEffect(() => {
    fetchCalls()
      .then(setCalls)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = calls.filter((c) => {
    if (outcomeFilter !== "all" && c.outcome !== outcomeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.caller_number?.toLowerCase().includes(q) ||
        c.caller_name?.toLowerCase().includes(q) ||
        c.summary?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-heading">
            Call Log
          </h1>
          <p className="text-sm text-body mt-1">
            {calls.length} total calls
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search calls..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-purple/20 focus:border-purple"
          />
        </div>

        <select
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-purple/20 focus:border-purple"
        >
          <option value="all">All outcomes</option>
          <option value="appointment_booked">Booked</option>
          <option value="question_answered">FAQ</option>
          <option value="message_taken">Message</option>
          <option value="transferred">Transferred</option>
          <option value="missed">Missed</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-body">Loading calls...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-border shadow-elevated text-center py-16 px-8">
          <Phone className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-heading font-medium">No calls yet</p>
          <p className="text-sm text-body mt-1">
            Calls will appear here once your Vapi number starts receiving them.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-border shadow-elevated overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-xs font-medium text-muted uppercase tracking-wider">
                  Caller
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted uppercase tracking-wider">
                  Outcome
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted uppercase tracking-wider">
                  Summary
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((call) => {
                const isExpanded = expandedId === call.id;
                return (
                  <tr key={call.id} className="group">
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          setExpandedId(isExpanded ? null : call.id)
                        }
                        className="text-left w-full"
                      >
                        <p className="text-sm font-medium text-heading">
                          {call.caller_name || call.caller_number}
                        </p>
                        {call.caller_name && (
                          <p className="text-xs text-muted">
                            {call.caller_number}
                          </p>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <OutcomeBadge outcome={call.outcome} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-sm text-body">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDuration(call.duration_seconds)}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-sm text-body truncate">
                        {call.summary || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-body whitespace-nowrap">
                      {formatDate(call.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          setExpandedId(isExpanded ? null : call.id)
                        }
                        className="text-muted hover:text-heading transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                    {isExpanded && (
                      <td colSpan={6} className="px-4 py-4 bg-surface">
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <h4 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                              Transcript
                            </h4>
                            <div className="text-sm text-body whitespace-pre-wrap bg-white rounded-md border border-border p-4 max-h-64 overflow-y-auto">
                              {call.transcript || "No transcript available."}
                            </div>
                          </div>
                          <div className="space-y-3">
                            {call.sentiment && (
                              <div>
                                <span className="text-xs font-medium text-muted uppercase tracking-wider">
                                  Sentiment
                                </span>
                                <p className="text-sm text-heading mt-1 capitalize">
                                  {call.sentiment}
                                </p>
                              </div>
                            )}
                            {call.recording_url && (
                              <div>
                                <span className="text-xs font-medium text-muted uppercase tracking-wider">
                                  Recording
                                </span>
                                <audio
                                  controls
                                  src={call.recording_url}
                                  className="mt-1 w-full"
                                />
                              </div>
                            )}
                            {call.cost_cents != null && (
                              <div>
                                <span className="text-xs font-medium text-muted uppercase tracking-wider">
                                  Cost
                                </span>
                                <p className="text-sm text-heading mt-1 font-mono">
                                  ${(call.cost_cents / 100).toFixed(2)}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
