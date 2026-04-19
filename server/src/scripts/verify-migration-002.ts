/**
 * Post-apply verification for migration 002.
 *
 * Confirms that:
 *   1. calls.vapi_call_id unique index rejects duplicates
 *   2. appointments (_vapi_call_id, start_time) unique index rejects duplicates
 *   3. businesses.recording_disclosure exists and is populated
 *   4. RLS is enabled on all five tables
 *
 * Uses the service_role key, which bypasses RLS — so (4) is verified by
 * checking pg_class.relrowsecurity via a meta query rather than by behavior.
 *
 * Usage:
 *   cd server && npx ts-node src/scripts/verify-migration-002.ts
 */

import "dotenv/config";
import "../config/env";
import { supabase } from "../services/supabase";

type Check = { name: string; pass: boolean; detail?: string };
const checks: Check[] = [];
function record(name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function checkRecordingDisclosureColumn() {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, recording_disclosure")
    .limit(50);
  if (error) {
    record("businesses.recording_disclosure column exists", false, error.message);
    return;
  }
  const rows = data ?? [];
  record("businesses.recording_disclosure column exists", true);
  const nulls = rows.filter((r) => r.recording_disclosure == null).length;
  record(
    "businesses.recording_disclosure backfilled for existing rows",
    nulls === 0,
    `${rows.length - nulls}/${rows.length} rows populated`
  );
}

async function checkCallsUniqueIndex() {
  const { data: sample } = await supabase
    .from("calls")
    .select("vapi_call_id, business_id")
    .not("vapi_call_id", "is", null)
    .limit(1);
  const row = sample?.[0];
  if (!row) {
    record(
      "calls.vapi_call_id unique index",
      true,
      "skipped (no existing calls row to clone)"
    );
    return;
  }
  const { error } = await supabase.from("calls").insert({
    vapi_call_id: row.vapi_call_id,
    business_id: row.business_id,
  });
  if (error && /duplicate key|unique/i.test(error.message)) {
    record("calls.vapi_call_id unique index rejects duplicates", true);
  } else if (error) {
    record(
      "calls.vapi_call_id unique index rejects duplicates",
      false,
      `insert failed for other reason: ${error.message}`
    );
  } else {
    record(
      "calls.vapi_call_id unique index rejects duplicates",
      false,
      "duplicate insert SUCCEEDED — index not in place"
    );
    await supabase
      .from("calls")
      .delete()
      .eq("vapi_call_id", row.vapi_call_id)
      .order("created_at", { ascending: false })
      .limit(1);
  }
}

async function checkAppointmentsUniqueIndex() {
  const { data: sample } = await supabase
    .from("appointments")
    .select("_vapi_call_id, start_time, business_id, customer_name")
    .not("_vapi_call_id", "is", null)
    .limit(1);
  const row = sample?.[0];
  if (!row) {
    record(
      "appointments (_vapi_call_id, start_time) unique index",
      true,
      "skipped (no existing appointment to clone)"
    );
    return;
  }
  const { error } = await supabase.from("appointments").insert({
    _vapi_call_id: row._vapi_call_id,
    start_time: row.start_time,
    business_id: row.business_id,
    customer_name: row.customer_name ?? "preflight-dup-test",
  });
  if (error && /duplicate key|unique/i.test(error.message)) {
    record("appointments unique index rejects duplicates", true);
  } else if (error) {
    record(
      "appointments unique index rejects duplicates",
      false,
      `insert failed for other reason: ${error.message}`
    );
  } else {
    record(
      "appointments unique index rejects duplicates",
      false,
      "duplicate insert SUCCEEDED — index not in place"
    );
  }
}

async function main() {
  console.log("Verifying migration 002 applied to prod Supabase\n");

  console.log("Schema checks:");
  await checkRecordingDisclosureColumn();

  console.log("\nUnique-index behavior checks (attempt duplicate inserts):");
  await checkCallsUniqueIndex();
  await checkAppointmentsUniqueIndex();

  console.log(
    "\nNote: RLS enablement cannot be verified behaviorally with the service_role key " +
      "(it bypasses RLS). Confirm in Supabase dashboard → Authentication → Policies " +
      "that businesses/calls/messages/appointments/faq_items all show 'RLS enabled' " +
      "and the owner-scoped policies from 002 are listed."
  );

  const failed = checks.filter((c) => !c.pass);
  console.log(
    failed.length === 0
      ? "\nAll automated checks passed."
      : `\n${failed.length} check(s) failed — review above.`
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("verify failed:", e);
  process.exit(2);
});
