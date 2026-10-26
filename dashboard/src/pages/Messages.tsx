import { clsx } from "clsx";
import { Inbox, Mail, MailOpen, Phone } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useToast } from "../components/Toast";
import { buttonClasses } from "../components/button-classes";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, PageHeader, Segmented, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { useBusiness } from "../lib/business";
import { formatPhone, formatRelative, URGENCY_META } from "../lib/format";
import type { Message } from "../lib/types";
import { useAsync } from "../lib/use-async";

const URGENCY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export default function Messages() {
  const { timeZone } = useBusiness();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, reload, setData } = useAsync(() => api.listMessages());
  const [filter, setFilter] = useState<"unread" | "all">("unread");

  const messages = (data ?? [])
    .filter((m) => filter === "all" || !m.is_read)
    .sort((a, b) =>
      filter === "unread"
        ? URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || b.created_at.localeCompare(a.created_at)
        : b.created_at.localeCompare(a.created_at),
    );
  const unread = data?.filter((m) => !m.is_read).length ?? 0;

  async function setRead(msg: Message, isRead: boolean) {
    setData((prev) => (prev ?? []).map((m) => (m.id === msg.id ? { ...m, is_read: isRead } : m)));
    try {
      await api.setMessageRead(msg.id, isRead);
    } catch (err) {
      setData((prev) => (prev ?? []).map((m) => (m.id === msg.id ? msg : m)));
      toast((err as Error).message, "error");
    }
  }

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Messages callers left for your team. Urgent ones are texted to you immediately."
        actions={
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "unread", label: `Unread${unread ? ` (${unread})` : ""}` },
              { value: "all", label: "All" },
            ]}
          />
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title={filter === "unread" ? "Inbox zero" : "No messages yet"}
            body={filter === "unread" ? "Every message has been read." : "Messages left by callers will appear here."}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li key={m.id}>
              <Card
                className={clsx(
                  "p-4 transition-colors sm:p-5",
                  !m.is_read && "border-l-4",
                  !m.is_read && (m.urgency === "high" ? "border-l-rose-500" : "border-l-brand-500"),
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <Avatar name={m.caller_name} className="hidden sm:grid" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={clsx("text-sm text-slate-900", !m.is_read && "font-semibold")}>{m.caller_name}</p>
                      <Badge tone={URGENCY_META[m.urgency].tone}>{URGENCY_META[m.urgency].label}</Badge>
                      <span className="text-xs text-slate-400">{formatRelative(m.created_at, new Date(), timeZone)}</span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{m.content}</p>
                    {m.caller_phone && <p className="mt-1.5 text-xs text-slate-500">{formatPhone(m.caller_phone)}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {m.caller_phone && (
                      <a
                        href={`tel:${m.caller_phone}`}
                        onClick={() => !m.is_read && void setRead(m, true)}
                        className={buttonClasses("primary", "sm")}
                      >
                        <Phone className="size-4" />
                        Call back
                      </a>
                    )}
                    {m.call_id && (
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/calls?call=${m.call_id}`)}>
                        View call
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={m.is_read ? Mail : MailOpen}
                      onClick={() => setRead(m, !m.is_read)}
                      title={m.is_read ? "Mark unread" : "Mark read"}
                      aria-label={m.is_read ? "Mark unread" : "Mark read"}
                    />
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
