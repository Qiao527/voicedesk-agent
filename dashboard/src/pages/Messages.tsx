import { useEffect, useState } from "react";
import { MessageSquare, Phone, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { fetchMessages, markMessageRead, type Message } from "../lib/api";

const URGENCY_STYLES: Record<
  string,
  { border: string; badge: string; label: string }
> = {
  high: {
    border: "border-l-ruby",
    badge: "bg-red-50 text-ruby",
    label: "Urgent",
  },
  medium: {
    border: "border-l-amber-400",
    badge: "bg-amber-50 text-amber-700",
    label: "Normal",
  },
  low: {
    border: "border-l-gray-200",
    badge: "bg-gray-100 text-gray-500",
    label: "Low",
  },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Messages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchMessages()
      .then(setMessages)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const unreadCount = messages.filter((m) => !m.is_read).length;

  async function handleExpand(msg: Message) {
    const isExpanding = expandedId !== msg.id;
    setExpandedId(isExpanding ? msg.id : null);

    if (isExpanding && !msg.is_read) {
      try {
        await markMessageRead(msg.id);
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, is_read: true } : m)),
        );
      } catch {
        // non-critical — ignore
      }
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-heading">
              Messages
            </h1>
            {unreadCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-surface text-purple-deep">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="text-sm text-body mt-1">
            {messages.length} total message{messages.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-body">Loading messages...</div>
      ) : messages.length === 0 ? (
        <div className="bg-white rounded-lg border border-border shadow-elevated text-center py-16 px-8">
          <MessageSquare className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-heading font-medium">No messages yet</p>
          <p className="text-sm text-body mt-1">
            Messages left by callers will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => {
            const isExpanded = expandedId === msg.id;
            const urgency = URGENCY_STYLES[msg.urgency] ?? URGENCY_STYLES.medium;

            return (
              <div
                key={msg.id}
                className={`bg-white rounded-lg border border-border shadow-elevated border-l-4 ${urgency.border} ${
                  !msg.is_read ? "ring-1 ring-purple/10" : ""
                }`}
              >
                {/* Header row */}
                <button
                  onClick={() => handleExpand(msg)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Unread dot */}
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        msg.is_read ? "bg-transparent" : "bg-purple"
                      }`}
                    />

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-heading">
                          {msg.caller_name}
                        </span>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${urgency.badge}`}
                        >
                          {urgency.label}
                        </span>
                      </div>
                      {msg.caller_phone && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-muted" />
                          <span className="text-xs text-muted">
                            {msg.caller_phone}
                          </span>
                        </div>
                      )}
                    </div>

                    <p className="text-sm text-body truncate ml-2 hidden sm:block">
                      {msg.content}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className="text-xs text-muted whitespace-nowrap">
                      {formatDate(msg.created_at)}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted" />
                    )}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border">
                    <div className="flex items-start gap-2 mt-3">
                      <AlertCircle className="w-4 h-4 text-muted mt-0.5 shrink-0" />
                      <p className="text-sm text-body leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
