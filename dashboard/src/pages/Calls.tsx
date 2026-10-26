import { Flag, PhoneIncoming, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { CallDrawer } from "../components/CallDrawer";
import { Avatar, Badge, Card, EmptyState, ErrorState, Input, PageHeader, Segmented, Select, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { useBusiness } from "../lib/business";
import { formatDateTime, formatDuration, formatPhone, OUTCOME_META, SENTIMENT_META } from "../lib/format";
import type { CallOutcome } from "../lib/types";
import { useAsync } from "../lib/use-async";

export default function Calls() {
  const { timeZone } = useBusiness();
  const { data: calls, loading, error, reload, setData } = useAsync(() => api.listCalls());
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<CallOutcome | "all">("all");
  const [view, setView] = useState<"all" | "follow_up">("all");
  const openId = params.get("call");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (calls ?? []).filter((c) => {
      if (view === "follow_up" && !c.follow_up_required) return false;
      if (outcome !== "all" && c.outcome !== outcome) return false;
      if (!q) return true;
      return [c.caller_name, c.caller_number, c.summary, c.analysis?.intent, ...(c.analysis?.topics ?? [])]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [calls, query, outcome, view]);

  const followUpCount = calls?.filter((c) => c.follow_up_required).length ?? 0;
  const open = (id: string | null) => setParams(id ? { call: id } : {}, { replace: true });

  return (
    <div>
      <PageHeader
        title="Calls"
        description={calls ? `${calls.length} calls, newest first` : "Every call your receptionist handled"}
        actions={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "All" },
              { value: "follow_up", label: `Follow-up${followUpCount ? ` (${followUpCount})` : ""}` },
            ]}
          />
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, number, topic…"
            className="pl-9"
            aria-label="Search calls"
          />
        </div>
        <Select
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as CallOutcome | "all")}
          className="sm:w-44"
          aria-label="Filter by outcome"
        >
          <option value="all">All outcomes</option>
          {(Object.keys(OUTCOME_META) as CallOutcome[]).map((o) => (
            <option key={o} value={o}>
              {OUTCOME_META[o].label}
            </option>
          ))}
        </Select>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <Card className="overflow-hidden">
          {loading && !calls ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={PhoneIncoming}
              title={calls?.length ? "No calls match these filters" : "No calls yet"}
              body={calls?.length ? "Try a different search or outcome." : "Calls will appear here once your number starts receiving them."}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Caller</th>
                    <th className="px-4 py-2.5 font-medium">Outcome</th>
                    <th className="hidden px-4 py-2.5 font-medium md:table-cell">Summary</th>
                    <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Duration</th>
                    <th className="px-4 py-2.5 text-right font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((c) => {
                    const meta = OUTCOME_META[c.outcome ?? "other"];
                    return (
                      <tr key={c.id} onClick={() => open(c.id)} className="cursor-pointer hover:bg-slate-50/80">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={c.caller_name} />
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 font-medium text-slate-900">
                                {c.caller_name ?? formatPhone(c.caller_number)}
                                {c.follow_up_required && <Flag className="size-3.5 text-amber-500" aria-label="Needs follow-up" />}
                              </p>
                              {c.caller_name && <p className="text-xs text-slate-500">{formatPhone(c.caller_number)}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <Badge tone={meta.tone} dot>
                              {meta.label}
                            </Badge>
                            {c.sentiment === "negative" && <Badge tone={SENTIMENT_META.negative.tone}>Unhappy</Badge>}
                          </div>
                        </td>
                        <td className="hidden max-w-sm px-4 py-3 md:table-cell">
                          <p className="line-clamp-2 text-slate-600">{c.summary ?? "—"}</p>
                        </td>
                        <td className="tabular hidden px-4 py-3 text-slate-600 sm:table-cell">{formatDuration(c.duration_seconds)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-slate-500">{formatDateTime(c.created_at, timeZone)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {openId && (
        <CallDrawer
          callId={openId}
          onClose={() => open(null)}
          onChange={(updated) => setData((prev) => (prev ?? []).map((c) => (c.id === updated.id ? updated : c)))}
        />
      )}
    </div>
  );
}
