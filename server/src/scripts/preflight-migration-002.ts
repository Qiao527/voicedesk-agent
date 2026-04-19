/**
 * Read-only preflight for migration 002.
 *
 * Checks for data that would make the new unique indexes fail to create:
 *   - duplicate calls.vapi_call_id
 *   - duplicate appointments (_vapi_call_id, start_time)
 *
 * Exits 0 if safe to apply the migration, 1 if duplicates exist.
 *
 * Usage:
 *   cd server && npx ts-node src/scripts/preflight-migration-002.ts
 */

import "dotenv/config";
import "../config/env";
import { supabase } from "../services/supabase";

async function findDuplicateCalls() {
  const { data, error } = await supabase
    .from("calls")
    .select("vapi_call_id")
    .not("vapi_call_id", "is", null);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const id = (row as { vapi_call_id: string }).vapi_call_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1);
}

async function findDuplicateAppointments() {
  const { data, error } = await supabase
    .from("appointments")
    .select("_vapi_call_id, start_time")
    .not("_vapi_call_id", "is", null);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const r = row as { _vapi_call_id: string; start_time: string };
    const key = `${r._vapi_call_id}|${r.start_time}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1);
}

async function countRows(table: string) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  console.log("Preflight for migration 002 (idempotency + RLS + consent)\n");

  console.log("Row counts (prod):");
  for (const t of ["businesses", "calls", "appointments", "messages", "faq_items"]) {
    try {
      console.log(`  ${t}: ${await countRows(t)}`);
    } catch (e) {
      console.log(`  ${t}: <error ${(e as Error).message}>`);
    }
  }

  console.log("\nChecking for duplicates that would break the new unique indexes...");

  const dupCalls = await findDuplicateCalls();
  const dupAppts = await findDuplicateAppointments();

  if (dupCalls.length === 0) {
    console.log("  calls.vapi_call_id: OK (no duplicates)");
  } else {
    console.log(`  calls.vapi_call_id: ${dupCalls.length} duplicate value(s):`);
    for (const [id, n] of dupCalls) console.log(`    - ${id} (x${n})`);
  }

  if (dupAppts.length === 0) {
    console.log("  appointments (_vapi_call_id, start_time): OK (no duplicates)");
  } else {
    console.log(
      `  appointments (_vapi_call_id, start_time): ${dupAppts.length} duplicate key(s):`
    );
    for (const [key, n] of dupAppts) console.log(`    - ${key} (x${n})`);
  }

  const safe = dupCalls.length === 0 && dupAppts.length === 0;
  console.log(
    safe
      ? "\nSafe to apply migration 002."
      : "\nDO NOT apply yet — clean up duplicates first."
  );
  process.exit(safe ? 0 : 1);
}

main().catch((e) => {
  console.error("preflight failed:", e);
  process.exit(2);
});
