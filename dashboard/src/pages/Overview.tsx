import { ArrowUpRight, CalendarCheck, CircleCheck, DollarSign, Flag, Moon, PhoneIncoming, Timer } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CallDrawer } from "../components/CallDrawer";
import { Avatar, Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Segmented, Skeleton, StatCard } from "../components/ui";
import { api } from "../lib/api";
import { useBusiness } from "../lib/business";
import { formatCurrency, formatDuration, formatPercent, formatPhone, formatRelative, OUTCOME_META } from "../lib/format";
import type { AnalyticsSummary, CallOutcome } from "../lib/types";
import { useAsync } from "../lib/use-async";

function greeting(timeZone: string) {
  const hour = Number(new Date().toLocaleString("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** "Dr. Maya Chen" -> "Dr. Chen"; "Maya Chen" -> "Maya". */
function shortName(full: string) {
  const parts = full.trim().split(/\s+/);
  return /^dr\.?$/i.test(parts[0]) && parts.length > 1 ? `Dr. ${parts.at(-1)}` : parts[0];
}

function OutcomeBreakdown({ summary }: { summary: AnalyticsSummary }) {
  const rows = (Object.keys(OUTCOME_META) as CallOutcome[])
    .map((key) => ({ key, count: summary.outcomes[key] ?? 0, ...OUTCOME_META[key] }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <ul className="space-y-3 px-5 py-4">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-slate-700">{r.label}</span>
            <span className="tabular text-slate-500">
              {r.count} <span className="text-slate-400">· {formatPercent(r.count / Math.max(1, summary.totalCalls))}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full" style={{ width: `${(r.count / max) * 100}%`, backgroundColor: r.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Overview() {
  const { business, timeZone } = useBusiness();
  const [days, setDays] = useState<"7" | "30">("30");
  const [openCall, setOpenCall] = useState<string | null>(null);
  const summary = useAsync(() => api.getAnalytics(Number(days)), [days]);
  const calls = useAsync(() => api.listCalls());

  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />;
  const s = summary.data;
  const followUps = (calls.data ?? []).filter((c) => c.follow_up_required).slice(0, 5);
  const recent = (calls.data ?? []).slice(0, 6);

  const chartData =
    s?.daily.map((d) => {
      const [y, m, day] = d.date.split("-").map(Number);
      return {
        label: new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }),
        Booked: d.booked,
        Other: d.calls - d.booked,
      };
    }) ?? [];

  return (
    <div>
      <PageHeader
        title={`${greeting(timeZone)}${business?.owner_name ? `, ${shortName(business.owner_name)}` : ""}`}
        description="Here's how your AI receptionist has been doing."
        actions={
          <Segmented
            value={days}
            onChange={setDays}
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {!s ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[118px] rounded-xl" />)
        ) : (
          <>
            <StatCard
              label="Calls answered"
              icon={PhoneIncoming}
              value={s.answeredCalls}
              hint={`${s.totalCalls} total · avg ${formatDuration(s.avgDurationSeconds)}`}
            />
            <StatCard
              label="Appointments booked"
              icon={CalendarCheck}
              accent="text-emerald-600 bg-emerald-50"
              value={s.appointmentsBooked}
              hint={`${formatPercent(s.answeredCalls ? s.appointmentsBooked / s.answeredCalls : 0)} of answered calls`}
            />
            <StatCard
              label="Resolved without staff"
              icon={CircleCheck}
              accent="text-sky-600 bg-sky-50"
              value={formatPercent(s.resolutionRate)}
              hint="Booked, answered, or message taken"
            />
            <StatCard
              label="After-hours calls"
              icon={Moon}
              accent="text-violet-600 bg-violet-50"
              value={s.afterHoursCalls}
              hint="Would have gone to voicemail"
            />
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Calls per day" description={`Last ${days} days, in ${timeZone.replace(/_/g, " ")}`} />
          <div className="h-64 px-2 py-4">
            {!s ? (
              <Skeleton className="mx-3 h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barCategoryGap={days === "7" ? "35%" : "20%"}>
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip
                    cursor={{ fill: "#f8fafc" }}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #e2e8f0",
                      fontSize: 12,
                      boxShadow: "0 10px 30px -10px rgb(15 23 42 / .25)",
                    }}
                  />
                  <Bar dataKey="Booked" stackId="a" fill="#10b981" />
                  <Bar dataKey="Other" stackId="a" fill="#a5b4fc" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Outcomes" description="What callers needed" />
          {s ? <OutcomeBreakdown summary={s} /> : <Skeleton className="m-5 h-48" />}
          {s && (
            <div className="grid grid-cols-2 border-t border-slate-100 text-center">
              <div className="border-r border-slate-100 px-4 py-3">
                <p className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
                  <DollarSign className="size-3" /> AI cost
                </p>
                <p className="tabular text-sm font-semibold text-slate-900">{formatCurrency(s.totalCostCents)}</p>
              </div>
              <div className="px-4 py-3">
                <p className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
                  <Timer className="size-3" /> Talk time
                </p>
                <p className="tabular text-sm font-semibold text-slate-900">{Math.round(s.totalDurationSeconds / 60)} min</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Needs follow-up"
            description="Flagged by call analysis"
            action={s && s.followUpsOpen > 0 ? <Badge tone="amber">{s.followUpsOpen} open</Badge> : undefined}
          />
          {calls.loading && !calls.data ? (
            <Skeleton className="m-5 h-32" />
          ) : followUps.length === 0 ? (
            <EmptyState icon={Flag} title="You're all caught up" body="Calls that need a human will show up here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {followUps.map((c) => (
                <li key={c.id}>
                  <button onClick={() => setOpenCall(c.id)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-slate-50">
                    <Flag className="mt-0.5 size-4 shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{c.caller_name ?? formatPhone(c.caller_number)}</p>
                      <p className="truncate text-xs text-slate-500">{c.analysis?.follow_up_reason ?? c.summary}</p>
                    </div>
                    <span className="text-xs whitespace-nowrap text-slate-400">{formatRelative(c.created_at, new Date(), timeZone)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent calls"
            action={
              <Link to="/calls" className="text-brand-600 hover:text-brand-700 flex items-center gap-0.5 text-xs font-medium">
                View all <ArrowUpRight className="size-3.5" />
              </Link>
            }
          />
          {calls.loading && !calls.data ? (
            <Skeleton className="m-5 h-32" />
          ) : recent.length === 0 ? (
            <EmptyState icon={PhoneIncoming} title="No calls yet" body="Calls appear here as soon as your number starts ringing." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((c) => {
                const meta = OUTCOME_META[c.outcome ?? "other"];
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setOpenCall(c.id)}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50"
                    >
                      <Avatar name={c.caller_name} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{c.caller_name ?? formatPhone(c.caller_number)}</p>
                        <p className="truncate text-xs text-slate-500">{c.summary}</p>
                      </div>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {openCall && (
        <CallDrawer
          callId={openCall}
          onClose={() => setOpenCall(null)}
          onChange={(updated) => {
            calls.setData((prev) => (prev ?? []).map((c) => (c.id === updated.id ? updated : c)));
            void summary.reload();
          }}
        />
      )}
    </div>
  );
}
