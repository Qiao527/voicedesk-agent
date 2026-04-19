/**
 * Interactive setup fixer.
 * Run: npx ts-node src/scripts/fix-setup.ts
 */

import "dotenv/config";
import "../config/env";
import * as readline from "readline";
import { supabase } from "../services/supabase";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>(r => rl.question(q, a => r(a.trim())));

async function main() {
  console.log("\n─── VoiceDesk Setup Checker ───\n");

  // 1. Check businesses
  const { data: businesses, error } = await supabase
    .from("businesses")
    .select("id, name, vapi_phone_number, vapi_phone_id, owner_phone, google_calendar_tokens");

  if (error || !businesses) {
    console.error("❌ Cannot connect to database:", error?.message);
    process.exit(1);
  }

  if (businesses.length === 0) {
    console.log("❌ No businesses found. Run: npx ts-node src/scripts/setup-business.ts");
    process.exit(1);
  }

  console.log(`Found ${businesses.length} business record(s):\n`);
  businesses.forEach((b, i) => {
    console.log(`  [${i + 1}] ${b.name} (ID: ${b.id})`);
    console.log(`       phone_number : ${b.vapi_phone_number || "❌ NOT SET"}`);
    console.log(`       vapi_phone_id: ${b.vapi_phone_id || "❌ NOT SET"}`);
    console.log(`       owner_phone  : ${b.owner_phone || "❌ NOT SET"}`);
    console.log(`       google cal   : ${b.google_calendar_tokens ? "✅ connected" : "❌ not connected"}`);
    console.log();
  });

  // 2. Pick the one to keep
  let keepIdx = 0;
  if (businesses.length > 1) {
    const ans = await ask(`Which record do you want to keep? (enter number 1-${businesses.length}): `);
    keepIdx = parseInt(ans) - 1;
    if (isNaN(keepIdx) || keepIdx < 0 || keepIdx >= businesses.length) {
      console.error("Invalid choice"); process.exit(1);
    }
  }

  const biz = businesses[keepIdx];
  console.log(`\nUsing: ${biz.name} (${biz.id})\n`);

  // 3. Delete duplicates
  const toDelete = businesses.filter((_, i) => i !== keepIdx);
  if (toDelete.length > 0) {
    const confirm = await ask(`Delete the other ${toDelete.length} duplicate record(s)? (y/n): `);
    if (confirm.toLowerCase() === "y") {
      const { error: delErr } = await supabase
        .from("businesses")
        .delete()
        .in("id", toDelete.map(b => b.id));
      if (delErr) console.error("  Warning:", delErr.message);
      else console.log(`  ✅ Deleted ${toDelete.length} duplicate(s)`);
    }
  }

  // 4. Fix vapi_phone_id
  if (!biz.vapi_phone_id) {
    console.log("\nYour Vapi Phone Number ID is in the Vapi dashboard:");
    console.log("  → Go to app.vapi.ai → Phone Numbers → click your number → copy the ID\n");
    const vapiId = await ask("Paste your Vapi Phone Number ID here: ");
    if (vapiId) {
      const vapiNumber = await ask("Paste the actual phone number (e.g. +16175551234): ");
      const { error: updErr } = await supabase
        .from("businesses")
        .update({ vapi_phone_id: vapiId, vapi_phone_number: vapiNumber || biz.vapi_phone_number })
        .eq("id", biz.id);
      if (updErr) console.error("  ❌ Failed:", updErr.message);
      else console.log("  ✅ vapi_phone_id saved");
    }
  } else {
    console.log(`  ✅ vapi_phone_id already set: ${biz.vapi_phone_id}`);
  }

  // 5. Fix owner_phone
  if (!biz.owner_phone) {
    console.log("\nOwner phone is needed to receive SMS notifications.");
    const phone = await ask("Your phone number for notifications (e.g. +16175551234): ");
    if (phone) {
      const { error: updErr } = await supabase
        .from("businesses")
        .update({ owner_phone: phone })
        .eq("id", biz.id);
      if (updErr) console.error("  ❌ Failed:", updErr.message);
      else console.log("  ✅ owner_phone saved");
    }
  } else {
    console.log(`  ✅ owner_phone already set: ${biz.owner_phone}`);
  }

  // 6. Final status
  console.log("\n─── Final Check ───\n");
  const { data: final } = await supabase
    .from("businesses")
    .select("id, name, vapi_phone_number, vapi_phone_id, owner_phone, google_calendar_tokens")
    .eq("id", biz.id)
    .single();

  if (final) {
    console.log(`Business    : ${final.name}`);
    console.log(`vapi_phone  : ${final.vapi_phone_number || "❌ missing"}`);
    console.log(`vapi_id     : ${final.vapi_phone_id || "❌ missing — calls won't route to this business"}`);
    console.log(`owner_phone : ${final.owner_phone || "⚠️  missing — no SMS notifications"}`);
    console.log(`google cal  : ${final.google_calendar_tokens ? "✅ connected" : "⚠️  not connected — booking won't work"}`);

    if (!final.google_calendar_tokens) {
      // The old direct URL (/api/auth/google/start?businessId=…) was removed
      // when the OAuth flow was hardened — it now requires an authenticated
      // session and an HMAC-signed state token. Owners connect from the UI.
      console.log(`\nTo connect Google Calendar:`);
      console.log(`  1. Log into the dashboard as this business's owner`);
      console.log(`  2. Settings → "Connect Google Calendar"`);
    }
  }

  console.log("\n─── Done ───\n");
  rl.close();
}

main().catch(err => { console.error(err); process.exit(1); });
