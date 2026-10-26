import { Request, Response, NextFunction } from "express";
import { supabase } from "../services/supabase";

/**
 * Attached by requireAuth so downstream handlers can scope queries to the
 * authenticated user's business.
 */
export interface AuthContext {
  userId: string;
  userEmail: string | null;
  businessId: string;
}

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthContext;
  }
}

/**
 * Verify a Supabase access token from the Authorization header and resolve the
 * caller's business. Rejects with 401 if the token is missing/invalid, and 403
 * if the authenticated user does not own a business.
 *
 * Business resolution order:
 *   1. businesses.owner_user_id == user.id  (preferred, explicit)
 *   2. businesses.owner_email == user.email (backfill path for older rows)
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  const token =
    header && header.toLowerCase().startsWith("bearer ")
      ? header.slice(7).trim()
      : null;

  if (!token) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }

  const { data: userResult, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userResult?.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const user = userResult.user;

  // Try explicit ownership link first.
  let businessId: string | null = null;
  {
    const { data, error } = await supabase
      .from("businesses")
      .select("id")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("[requireAuth] owner_user_id lookup failed:", error.message);
    }
    if (data?.id) businessId = data.id;
  }

  // Fallback: email match (for businesses seeded before owner_user_id existed).
  if (!businessId && user.email) {
    const { data, error } = await supabase
      .from("businesses")
      .select("id")
      .ilike("owner_email", user.email)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("[requireAuth] owner_email lookup failed:", error.message);
    }
    if (data?.id) {
      businessId = data.id;
      // Opportunistically backfill the explicit link so future lookups are O(1).
      await supabase
        .from("businesses")
        .update({ owner_user_id: user.id })
        .eq("id", businessId);
    }
  }

  if (!businessId) {
    res
      .status(403)
      .json({ error: "No business is associated with this account" });
    return;
  }

  req.auth = {
    userId: user.id,
    userEmail: user.email ?? null,
    businessId,
  };

  next();
}
