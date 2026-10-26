import type { NextFunction, Request, Response } from "express";
import type { Repository } from "../../repositories/repository";

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

/** Resolves a bearer token to a user. Supabase in production, a stub in tests. */
export type VerifyAccessToken = (
  token: string,
) => Promise<{ id: string; email: string | null; emailVerified: boolean } | null>;

/**
 * Authenticate a dashboard request and scope it to the caller's business.
 * 401 for a missing/invalid token, 403 for a valid user without a business.
 */
export function createRequireAuth(deps: { verifyToken: VerifyAccessToken; repo: Repository }) {
  return async function requireAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.get("authorization");
    const token = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
    if (!token) {
      res.status(401).json({ error: "Missing authorization token" });
      return;
    }

    const user = await deps.verifyToken(token);
    if (!user) {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }

    const businessId = await deps.repo.findBusinessIdForUser(user);
    if (!businessId) {
      res.status(403).json({ error: "No business is linked to this account yet" });
      return;
    }

    req.auth = { userId: user.id, userEmail: user.email, businessId };
    next();
  };
}

/** `req.auth` is guaranteed after `requireAuth`; this narrows the type. */
export function auth(req: Request): AuthContext {
  if (!req.auth) throw new Error("requireAuth middleware did not run");
  return req.auth;
}
