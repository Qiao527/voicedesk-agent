import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Phone,
  Clock,
  CalendarCheck,
  MessageSquare,
} from "lucide-react";
import {
  fetchAnalyticsSummary,
  fetchDailyCalls,
  type AnalyticsSummary,
  type DailyCallCount,
} from "../lib/api";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: string;
}

function StatCard({ label, value, icon, accent = "text-purple" }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg border border-border shadow-elevated p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted uppercase tracking-wider">
          {label}
        </span>
        <span className={accent}>{icon}</span>
      </div>
      <p className="text-2xl font-semibold tracking-tight text-heading tabular-nums">
        {value}
      </p>
    </div>
  );
}

export default function Analytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [daily, setDaily] = useState<DailyCallCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchAnalyticsSummary(), fetchDailyCalls()])
      .then(([s, d]) => {
        setSummary(s);
        setDaily(d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center py-16 text-body">Loading analytics...</div>;
  }

  if (!summary) {
    return (
      <div className="text-center py-16 text-body">
        Failed to load analytics.
      </div>
    );
  }

  const chartData = daily.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    calls: d.count,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-heading">
          Analytics
        </h1>
        <p className="text-sm text-body mt-1">Last 30 days</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Calls"
          value={summary.totalCalls}
          icon={<Phone className="w-4 h-4" />}
        />
        <StatCard
          label="Avg Duration"
          value={formatDuration(summary.avgDurationSeconds)}
          icon={<Clock className="w-4 h-4" />}
          accent="text-purple-deep"
        />
        <StatCard
          label="Appointments"
          value={summary.appointmentCount}
          icon={<CalendarCheck className="w-4 h-4" />}
          accent="text-success-text"
        />
        <StatCard
          label="Messages"
          value={summary.unreadMessages}
          icon={<MessageSquare className="w-4 h-4" />}
          accent="text-warning"
        />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg border border-border shadow-elevated p-6">
        <h2 className="text-sm font-semibold text-heading mb-4">
          Calls per day
        </h2>

        {chartData.length === 0 ? (
          <div className="text-center py-12 text-body text-sm">
            No call data yet.
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5edf5" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e5edf5" }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e5edf5",
                    boxShadow:
                      "0 6px 12px -2px rgba(50,50,93,0.25), 0 3px 7px -3px rgba(0,0,0,0.1)",
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="calls" fill="#533afd" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
