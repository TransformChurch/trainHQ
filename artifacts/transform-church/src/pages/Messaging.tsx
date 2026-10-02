import { useEffect, useState } from "react";
import { Loader2, Mail, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? import.meta.env.BASE_URL.replace(/\/$/, "");

type BroadcastGroupOption = { id: string; name: string };
type BroadcastSources = { groups: BroadcastGroupOption[]; groupsError?: string; smsConfigured: boolean };
type BroadcastCsvRow = { name: string; phone: string; email: string };
type BroadcastRecipientPreview = { name: string; contact: string; valid: boolean; reason?: string };
type BroadcastCostEstimate = { segments: number; pricePerSegment: number; currency: string; estimatedTotal: number };
type BroadcastPreview = {
  recipientCount: number;
  validCount: number;
  invalidCount: number;
  recipients: BroadcastRecipientPreview[];
  cost: BroadcastCostEstimate | null;
};
type BroadcastRecipientResult = { name: string; contact: string; status: "sent" | "failed" | "skipped"; error?: string };
type GroupBroadcast = {
  id: number;
  name: string;
  channel: "sms" | "email";
  subject: string | null;
  message: string;
  sourceType: "pco_group" | "csv";
  sourceGroupIds: string[];
  recipientCount: number;
  successCount: number;
  failureCount: number;
  recipients: BroadcastRecipientResult[];
  estimatedCostUsd: string | null;
  sentByUserId: string;
  sentAt: string;
};

async function api(path: string, options?: RequestInit): Promise<Response> {
  const token = sessionStorage.getItem("auth_bearer_token");
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed." }));
    throw new Error(body.error || "Request failed.");
  }
  return response;
}

// Extracted from the Reporting page's "Group Texting" card (2026-10-02) into
// its own admin-only page under Tools > Messaging. Logic is unchanged from
// that card -- see routes/groupBroadcasts.ts for the backend.
export default function Messaging() {
  const { toast } = useToast();

  const [broadcastSources, setBroadcastSources] = useState<BroadcastSources | null>(null);
  const [broadcastSourcesLoading, setBroadcastSourcesLoading] = useState(false);
  const [broadcastSourcesError, setBroadcastSourcesError] = useState("");
  const [broadcastChannel, setBroadcastChannel] = useState<"sms" | "email">("sms");
  const [broadcastSourceType, setBroadcastSourceType] = useState<"pco_group" | "csv">("pco_group");
  const [broadcastGroupIds, setBroadcastGroupIds] = useState<string[]>([]);
  const [broadcastCsvRows, setBroadcastCsvRows] = useState<BroadcastCsvRow[]>([]);
  const [broadcastCsvFileName, setBroadcastCsvFileName] = useState("");
  const [broadcastName, setBroadcastName] = useState("");
  const [broadcastSubject, setBroadcastSubject] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastPreview, setBroadcastPreview] = useState<BroadcastPreview | null>(null);
  const [broadcastPreviewing, setBroadcastPreviewing] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastHistory, setBroadcastHistory] = useState<GroupBroadcast[]>([]);
  const [broadcastHistoryLoading, setBroadcastHistoryLoading] = useState(false);
  const [expandedBroadcastId, setExpandedBroadcastId] = useState<number | null>(null);

  const reconnectUrl = (() => {
    const returnTo = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/messaging`;
    return `${BASE}/api/auth/planning-center/start?return_to=${encodeURIComponent(returnTo)}`;
  })();

  const loadBroadcastSources = async () => {
    setBroadcastSourcesLoading(true);
    setBroadcastSourcesError("");
    try {
      const response = await api("/api/group-broadcasts/sources");
      setBroadcastSources(await response.json() as BroadcastSources);
    } catch (error) {
      setBroadcastSourcesError(error instanceof Error ? error.message : "Could not load Planning Center groups.");
    } finally {
      setBroadcastSourcesLoading(false);
    }
  };

  const loadBroadcastHistory = async () => {
    setBroadcastHistoryLoading(true);
    try {
      const response = await api("/api/group-broadcasts/history");
      setBroadcastHistory(await response.json() as GroupBroadcast[]);
    } catch (error) {
      toast({ title: "Could not load broadcast history", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setBroadcastHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadBroadcastSources();
    loadBroadcastHistory();
  }, []);

  const toggleBroadcastGroup = (id: string, checked: boolean) => {
    setBroadcastGroupIds((current) => (checked ? [...current, id] : current.filter((value) => value !== id)));
    setBroadcastPreview(null); // stale once the selection changes
  };

  // Tolerant of either column order and of a name/phone/email CSV in any
  // arrangement: whichever cell looks like an email wins that slot, whichever
  // remaining cell has 7+ digits is the phone, and whatever's left is the
  // name. A header row is detected and dropped by checking whether the first
  // row actually resolved a phone or email at all.
  const parseBroadcastCsvRow = (cells: string[]): BroadcastCsvRow => {
    const emailIndex = cells.findIndex((cell) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell));
    const phoneIndex = cells.findIndex((cell, index) => index !== emailIndex && (cell.match(/\d/g)?.length ?? 0) >= 7);
    const used = new Set([emailIndex, phoneIndex].filter((index) => index !== -1));
    const name = cells.find((_, index) => !used.has(index)) ?? "";
    return {
      name,
      phone: phoneIndex !== -1 ? cells[phoneIndex] : "",
      email: emailIndex !== -1 ? cells[emailIndex] : "",
    };
  };

  const handleBroadcastCsvFile = async (file: File) => {
    setBroadcastCsvFileName(file.name);
    const content = await file.text();
    const rows = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
    const parsedRows = rows.map(parseBroadcastCsvRow);
    const looksLikeHeader = parsedRows.length > 0 && !parsedRows[0].phone && !parsedRows[0].email;
    const dataRows = looksLikeHeader ? parsedRows.slice(1) : parsedRows;
    setBroadcastCsvRows(dataRows.filter((row) => row.phone || row.email));
    setBroadcastPreview(null);
  };

  const previewBroadcastRecipients = async () => {
    if (broadcastSourceType === "pco_group" && !broadcastGroupIds.length) {
      toast({ title: "Select at least one group first", variant: "destructive" });
      return;
    }
    if (broadcastSourceType === "csv" && !broadcastCsvRows.length) {
      toast({ title: "Upload a CSV first", variant: "destructive" });
      return;
    }
    setBroadcastPreviewing(true);
    try {
      const response = await api("/api/group-broadcasts/send", {
        method: "POST",
        body: JSON.stringify({
          channel: broadcastChannel,
          message: broadcastMessage,
          sourceType: broadcastSourceType,
          groupIds: broadcastSourceType === "pco_group" ? broadcastGroupIds : undefined,
          recipients: broadcastSourceType === "csv" ? broadcastCsvRows : undefined,
          dryRun: true,
        }),
      });
      setBroadcastPreview(await response.json() as BroadcastPreview);
    } catch (error) {
      toast({ title: "Could not resolve recipients", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setBroadcastPreviewing(false);
    }
  };

  const sendBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      toast({ title: "Write a message first", variant: "destructive" });
      return;
    }
    if (broadcastChannel === "email" && !broadcastSubject.trim()) {
      toast({ title: "Write a subject line first", variant: "destructive" });
      return;
    }
    const hasRecipientSource = broadcastSourceType === "pco_group" ? broadcastGroupIds.length > 0 : broadcastCsvRows.length > 0;
    if (!hasRecipientSource) {
      toast({ title: broadcastSourceType === "pco_group" ? "Select at least one group first" : "Upload a CSV first", variant: "destructive" });
      return;
    }
    const costNote = broadcastChannel === "sms" && broadcastPreview?.cost
      ? ` (est. $${broadcastPreview.cost.estimatedTotal.toFixed(2)})`
      : "";
    const recipientNote = broadcastPreview ? broadcastPreview.validCount : "the selected";
    if (!window.confirm(`Send this ${broadcastChannel === "sms" ? "text" : "email"} to ${recipientNote} recipient(s)${costNote}? This can't be undone.`)) return;
    setBroadcastSending(true);
    try {
      const response = await api("/api/group-broadcasts/send", {
        method: "POST",
        body: JSON.stringify({
          name: broadcastName.trim(),
          channel: broadcastChannel,
          subject: broadcastChannel === "email" ? broadcastSubject.trim() : undefined,
          message: broadcastMessage.trim(),
          sourceType: broadcastSourceType,
          groupIds: broadcastSourceType === "pco_group" ? broadcastGroupIds : undefined,
          recipients: broadcastSourceType === "csv" ? broadcastCsvRows : undefined,
        }),
      });
      const broadcast = await response.json() as GroupBroadcast;
      toast({ title: `${broadcastChannel === "sms" ? "Text" : "Email"} sent`, description: `${broadcast.successCount} of ${broadcast.recipientCount} delivered.` });
      setBroadcastName("");
      setBroadcastSubject("");
      setBroadcastMessage("");
      setBroadcastGroupIds([]);
      setBroadcastCsvRows([]);
      setBroadcastCsvFileName("");
      setBroadcastPreview(null);
      await loadBroadcastHistory();
    } catch (error) {
      toast({ title: "Could not send", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setBroadcastSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          <MessageSquare className="h-8 w-8 text-primary" /> Messaging
        </h1>
        <p className="mt-2 text-muted-foreground">
          Send a one-way text (via Twilio) or email (via Resend) to everyone in a Planning Center Group or to a CSV
          list.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Group Texting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {broadcastChannel === "sms" && broadcastSources && !broadcastSources.smsConfigured && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
              Twilio isn&apos;t configured yet for this site -- texts can be composed and previewed below, but sending
              will fail until TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and a sender (TWILIO_MESSAGING_SERVICE_SID or
              TWILIO_FROM_NUMBER) are set as Worker secrets.
            </div>
          )}

          <div className="space-y-3">
            <Label>Channel</Label>
            <RadioGroup
              value={broadcastChannel}
              onValueChange={(value) => { setBroadcastChannel(value as "sms" | "email"); setBroadcastPreview(null); }}
              className="flex flex-wrap gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="sms" id="broadcast-channel-sms" />
                <Label htmlFor="broadcast-channel-sms" className="font-normal">Text (SMS)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="email" id="broadcast-channel-email" />
                <Label htmlFor="broadcast-channel-email" className="font-normal">Email</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="max-w-sm space-y-2">
            <Label htmlFor="broadcast-name">Label (optional)</Label>
            <Input
              id="broadcast-name"
              value={broadcastName}
              onChange={(event) => setBroadcastName(event.target.value)}
              placeholder="e.g. Wednesday night reminder"
            />
          </div>

          {broadcastChannel === "email" && (
            <div className="max-w-lg space-y-2">
              <Label htmlFor="broadcast-subject">Subject</Label>
              <Input
                id="broadcast-subject"
                value={broadcastSubject}
                onChange={(event) => setBroadcastSubject(event.target.value)}
                placeholder="This Wednesday at Transform Youth"
              />
            </div>
          )}

          <div className="max-w-lg space-y-2">
            <Label htmlFor="broadcast-message">Message</Label>
            <Textarea
              id="broadcast-message"
              value={broadcastMessage}
              onChange={(event) => { setBroadcastMessage(event.target.value); setBroadcastPreview(null); }}
              rows={3}
              placeholder="See you tonight at 7pm!"
            />
            {broadcastChannel === "sms" && (
              <p className="text-xs text-muted-foreground">
                {broadcastMessage.length} character{broadcastMessage.length === 1 ? "" : "s"}
                {broadcastMessage.length > 160 ? ` (${Math.ceil(broadcastMessage.length / 153)} SMS segments, roughly)` : ""}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label>Send to</Label>
            <RadioGroup
              value={broadcastSourceType}
              onValueChange={(value) => { setBroadcastSourceType(value as "pco_group" | "csv"); setBroadcastPreview(null); }}
              className="flex flex-wrap gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="pco_group" id="broadcast-source-group" />
                <Label htmlFor="broadcast-source-group" className="font-normal">A Planning Center Group</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="csv" id="broadcast-source-csv" />
                <Label htmlFor="broadcast-source-csv" className="font-normal">Upload a CSV</Label>
              </div>
            </RadioGroup>

            {broadcastSourceType === "pco_group" ? (
              <>
                {broadcastSourcesError && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <span>{broadcastSourcesError}</span>
                    <Button type="button" size="sm" variant="outline" onClick={loadBroadcastSources}>Try again</Button>
                  </div>
                )}
                {broadcastSourcesLoading && <p className="text-sm text-muted-foreground">Loading Planning Center groups…</p>}
                {broadcastSources?.groupsError ? (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                    <p>{broadcastSources.groupsError}</p>
                    <div className="mt-2 flex gap-2">
                      <Button type="button" size="sm" onClick={() => window.location.assign(reconnectUrl)}>Reconnect Church Center</Button>
                      <Button type="button" size="sm" variant="outline" onClick={loadBroadcastSources}>Retry</Button>
                    </div>
                  </div>
                ) : (
                  broadcastSources && !broadcastSources.groups.length && <p className="text-xs text-muted-foreground">No Planning Center groups found.</p>
                )}
                {broadcastSources && (
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                    {broadcastSources.groups.map((group) => (
                      <label key={group.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-background">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input"
                          checked={broadcastGroupIds.includes(group.id)}
                          onChange={(event) => toggleBroadcastGroup(group.id, event.target.checked)}
                        />
                        {group.name}
                      </label>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="max-w-md space-y-2">
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleBroadcastCsvFile(file);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  One row per person -- a name column plus a phone number and/or email column, in any order (a header
                  row is fine). Only the column the chosen channel needs has to be filled in for a given row.
                </p>
                {broadcastCsvFileName && (
                  <p className="text-xs text-muted-foreground">
                    {broadcastCsvFileName}: {broadcastCsvRows.length} row{broadcastCsvRows.length === 1 ? "" : "s"} read.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={previewBroadcastRecipients} disabled={broadcastPreviewing}>
              {broadcastPreviewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Preview recipients
            </Button>
            {broadcastPreview && (
              <span className="text-sm text-muted-foreground">
                {broadcastPreview.validCount} will receive this
                {broadcastPreview.invalidCount ? `, ${broadcastPreview.invalidCount} skipped (no usable ${broadcastChannel === "sms" ? "phone number" : "email address"})` : ""}.
                {broadcastChannel === "sms" && broadcastPreview.cost && (
                  <> Estimated cost: ~${broadcastPreview.cost.estimatedTotal.toFixed(2)} {broadcastPreview.cost.currency}
                    {" "}({broadcastPreview.cost.segments} segment{broadcastPreview.cost.segments === 1 ? "" : "s"} ×{" "}
                    {broadcastPreview.validCount} recipient{broadcastPreview.validCount === 1 ? "" : "s"} × ~$
                    {broadcastPreview.cost.pricePerSegment.toFixed(4)}/segment, Twilio's current baseline US rate --
                    the actual per-message price depends on each recipient's carrier).</>
                )}
                {broadcastChannel === "sms" && !broadcastPreview.cost && (
                  <> Cost estimate unavailable (Twilio pricing couldn&apos;t be read -- check that Twilio is configured).</>
                )}
              </span>
            )}
          </div>

          {broadcastPreview && broadcastPreview.invalidCount > 0 && (
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-amber-200 bg-amber-50/50 p-2 text-xs">
              {broadcastPreview.recipients.filter((recipient) => !recipient.valid).map((recipient, index) => (
                <p key={index} className="text-amber-900">
                  {recipient.name || "(no name)"}{recipient.contact ? ` -- ${recipient.contact}` : ""}: {recipient.reason}
                </p>
              ))}
            </div>
          )}

          <div>
            <Button
              onClick={sendBroadcast}
              disabled={
                broadcastSending ||
                !broadcastMessage.trim() ||
                (broadcastChannel === "email" && !broadcastSubject.trim()) ||
                (broadcastSourceType === "pco_group" ? !broadcastGroupIds.length : !broadcastCsvRows.length)
              }
            >
              {broadcastSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send{broadcastPreview ? ` to ${broadcastPreview.validCount}` : ""}
            </Button>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold">Recent sends</h3>
            {broadcastHistoryLoading && <p className="mt-2 text-sm text-muted-foreground">Loading…</p>}
            {!broadcastHistoryLoading && !broadcastHistory.length && (
              <p className="mt-2 text-sm text-muted-foreground">Nothing sent yet.</p>
            )}
            <div className="mt-2 divide-y rounded-lg border">
              {broadcastHistory.map((broadcast) => {
                const skippedCount = broadcast.recipientCount - broadcast.successCount - broadcast.failureCount;
                return (
                  <div key={broadcast.id} className="p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">
                          <span className="mr-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {broadcast.channel === "sms" ? "Text" : "Email"}
                          </span>
                          {broadcast.name || broadcast.subject || broadcast.message.slice(0, 60)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(broadcast.sentAt).toLocaleString()} · {broadcast.successCount} sent
                          {broadcast.failureCount ? `, ${broadcast.failureCount} failed` : ""}
                          {skippedCount > 0 ? `, ${skippedCount} skipped` : ""} of {broadcast.recipientCount}
                          {broadcast.estimatedCostUsd ? ` · est. $${Number(broadcast.estimatedCostUsd).toFixed(2)}` : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setExpandedBroadcastId((current) => (current === broadcast.id ? null : broadcast.id))}
                      >
                        {expandedBroadcastId === broadcast.id ? "Hide" : "Details"}
                      </Button>
                    </div>
                    {expandedBroadcastId === broadcast.id && (
                      <div className="mt-3 space-y-2">
                        {broadcast.subject && <p className="text-sm font-medium">{broadcast.subject}</p>}
                        <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm">{broadcast.message}</p>
                        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
                          {broadcast.recipients.map((recipient, index) => (
                            <p key={index} className={recipient.status === "sent" ? "text-foreground" : "text-destructive"}>
                              {recipient.name || "(no name)"} -- {recipient.contact || "—"}: {recipient.status}
                              {recipient.error ? ` (${recipient.error})` : ""}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
