import { useEffect, useState, useCallback } from "react";
import {
  Save,
  Plus,
  Trash2,
  MessageSquare,
  Building2,
  CalendarDays,
  ExternalLink,
} from "lucide-react";
import {
  fetchBusiness,
  updateBusiness,
  fetchFaqs,
  createFaq,
  deleteFaq,
  startGoogleCalendarConnect,
  type Business,
  type FaqItem,
} from "../lib/api";

export default function Settings() {
  const [biz, setBiz] = useState<Business | null>(null);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [greeting, setGreeting] = useState("");
  const [recordingDisclosure, setRecordingDisclosure] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");
  const [newCat, setNewCat] = useState("");

  const [connectingCalendar, setConnectingCalendar] = useState(false);

  const handleConnectCalendar = async () => {
    setConnectingCalendar(true);
    try {
      await startGoogleCalendarConnect();
    } catch (err) {
      setConnectingCalendar(false);
      setToast(
        err instanceof Error
          ? `Could not start Google Calendar: ${err.message}`
          : "Could not start Google Calendar",
      );
    }
  };

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("google_calendar");
    const detail = url.searchParams.get("google_calendar_detail");

    if (!status) return;

    if (status === "connected") {
      showToast("Google Calendar connected");
    } else {
      showToast(
        detail ? `Google Calendar connection failed: ${detail}` : "Google Calendar connection failed",
      );
    }

    url.searchParams.delete("google_calendar");
    url.searchParams.delete("google_calendar_detail");
    const next = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""}${url.hash}`;
    window.history.replaceState({}, "", next);
  }, [showToast]);

  useEffect(() => {
    Promise.all([fetchBusiness(), fetchFaqs()])
      .then(([b, f]) => {
        setBiz(b);
        setFaqs(f);
        setGreeting(b.greeting_message || "");
        setRecordingDisclosure(b.recording_disclosure || "");
        setName(b.name);
        setAddress(b.address || "");
        setTimezone(b.timezone);
        setOwnerPhone(b.owner_phone || "");
        setOwnerEmail(b.owner_email || "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const saveBusiness = async () => {
    setSaving(true);
    try {
      const updated = await updateBusiness({
        name,
        address,
        timezone,
        owner_phone: ownerPhone || null,
        owner_email: ownerEmail || null,
        greeting_message: greeting || null,
        recording_disclosure: recordingDisclosure || null,
      });
      setBiz(updated);
      showToast("Settings saved");
    } catch (err) {
      console.error(err);
      showToast(
        err instanceof Error ? `Failed to save: ${err.message}` : "Failed to save",
      );
    }
    setSaving(false);
  };

  const addFaq = async () => {
    if (!newQ.trim() || !newA.trim()) return;
    try {
      const created = await createFaq({
        question: newQ,
        answer: newA,
        category: newCat || undefined,
      });
      setFaqs((prev) => [...prev, created]);
      setNewQ("");
      setNewA("");
      setNewCat("");
      showToast("FAQ added");
    } catch (err) {
      console.error(err);
      showToast(
        err instanceof Error
          ? `Failed to add FAQ: ${err.message}`
          : "Failed to add FAQ",
      );
    }
  };

  const removeFaq = async (id: string) => {
    try {
      await deleteFaq(id);
      setFaqs((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <div className="text-center py-16 text-body">Loading settings...</div>;
  }

  const calendarConnected = Boolean(biz?.google_calendar_connected_at);

  return (
    <div className="max-w-2xl">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-navy text-white text-sm px-4 py-2.5 rounded-lg shadow-elevated-lg animate-fade-in">
          {toast}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-heading">
          Settings
        </h1>
        <p className="text-sm text-body mt-1">
          Configure your AI receptionist
        </p>
      </div>

      {/* Business Info */}
      <section className="bg-white rounded-lg border border-border shadow-elevated p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-4 h-4 text-purple" />
          <h2 className="text-sm font-semibold text-heading">
            Business Information
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-label mb-1">
              Business name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-purple/20 focus:border-purple"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-label mb-1">
              Timezone
            </label>
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-purple/20 focus:border-purple"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-label mb-1">
              Address
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-purple/20 focus:border-purple"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-label mb-1">
              Owner phone (for notifications)
            </label>
            <input
              value={ownerPhone}
              onChange={(e) => setOwnerPhone(e.target.value)}
              placeholder="+16175551234"
              className="w-full px-3 py-2 text-sm bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-purple/20 focus:border-purple"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-label mb-1">
              Owner email
            </label>
            <input
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-purple/20 focus:border-purple"
            />
          </div>
        </div>

        {biz?.vapi_phone_number && (
          <div className="mt-4 px-3 py-2 bg-purple-surface rounded-md">
            <p className="text-xs text-purple-deep">
              AI phone number:{" "}
              <span className="font-mono font-medium">{biz.vapi_phone_number}</span>
            </p>
          </div>
        )}
      </section>

      {/* Google Calendar */}
      <section className="bg-white rounded-lg border border-border shadow-elevated p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="w-4 h-4 text-purple" />
          <h2 className="text-sm font-semibold text-heading">
            Google Calendar
          </h2>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-heading font-medium">
              {calendarConnected ? "Calendar connected" : "Calendar not connected"}
            </p>
            <p className="text-sm text-body mt-1">
              {calendarConnected
                ? "Appointments can be checked and booked against this business's Google Calendar."
                : "Connect Google Calendar to enable live availability checks and appointment booking."}
            </p>
            {biz?.google_calendar_connected_at && (
              <p className="text-xs text-muted mt-2">
                Connected on{" "}
                {new Date(biz.google_calendar_connected_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleConnectCalendar}
            disabled={connectingCalendar}
            className="inline-flex shrink-0 items-center gap-2 px-4 py-2 bg-purple text-white text-sm font-medium rounded-md hover:bg-purple-hover transition-colors disabled:opacity-50"
          >
            {connectingCalendar
              ? "Starting..."
              : calendarConnected
                ? "Reconnect"
                : "Connect"}
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Greeting */}
      <section className="bg-white rounded-lg border border-border shadow-elevated p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-4 h-4 text-purple" />
          <h2 className="text-sm font-semibold text-heading">
            Greeting Message
          </h2>
        </div>

        <textarea
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 text-sm bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-purple/20 focus:border-purple resize-y"
        />
        <p className="text-xs text-muted mt-2">
          What the AI says when it first picks up the phone.
        </p>
      </section>

      {/* Recording disclosure (legal) */}
      <section className="bg-white rounded-lg border border-border shadow-elevated p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-4 h-4 text-purple" />
          <h2 className="text-sm font-semibold text-heading">
            Call Recording Disclosure
          </h2>
        </div>

        <textarea
          value={recordingDisclosure}
          onChange={(e) => setRecordingDisclosure(e.target.value)}
          rows={2}
          placeholder="This call may be recorded for quality and scheduling."
          className="w-full px-3 py-2 text-sm bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-purple/20 focus:border-purple resize-y"
        />
        <p className="text-xs text-muted mt-2">
          Spoken to the caller before the greeting. Two-party-consent states
          (CA, FL, IL, MD, MA, MT, NV, NH, PA, WA) legally require a
          disclosure before recording. Leave blank at your own risk.
        </p>
      </section>

      {/* Save button */}
      <div className="flex justify-end mb-8">
        <button
          onClick={saveBusiness}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple text-white text-sm font-medium rounded-md hover:bg-purple-hover transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>

      {/* FAQs */}
      <section className="bg-white rounded-lg border border-border shadow-elevated p-6">
        <h2 className="text-sm font-semibold text-heading mb-1">
          FAQ Knowledge Base
        </h2>
        <p className="text-xs text-muted mb-4">
          The AI uses these to answer common caller questions. Changes take
          effect immediately.
        </p>

        <div className="divide-y divide-border">
          {faqs.map((faq) => (
            <div key={faq.id} className="py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-heading">{faq.question}</p>
                <p className="text-sm text-body mt-0.5">{faq.answer}</p>
                {faq.category && (
                  <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-surface text-muted rounded">
                    {faq.category}
                  </span>
                )}
              </div>
              <button
                onClick={() => removeFaq(faq.id)}
                className="shrink-0 p-1 text-muted hover:text-ruby transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Add FAQ form */}
        <div className="mt-4 pt-4 border-t border-border space-y-2">
          <input
            value={newQ}
            onChange={(e) => setNewQ(e.target.value)}
            placeholder="Question — e.g. What are your business hours?"
            className="w-full px-3 py-2 text-sm bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-purple/20 focus:border-purple"
          />
          <input
            value={newA}
            onChange={(e) => setNewA(e.target.value)}
            placeholder="Answer — e.g. We're open Mon–Fri, 9am to 5pm."
            className="w-full px-3 py-2 text-sm bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-purple/20 focus:border-purple"
          />
          <div className="flex items-center gap-2">
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="Category (optional)"
              className="flex-1 px-3 py-2 text-sm bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-purple/20 focus:border-purple"
            />
            <button
              onClick={addFaq}
              disabled={!newQ.trim() || !newA.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-purple text-white text-sm font-medium rounded-md hover:bg-purple-hover transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
