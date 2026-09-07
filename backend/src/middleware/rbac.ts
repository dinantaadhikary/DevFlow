import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth";

export type Role = "owner" | "admin" | "developer" | "viewer";

// Roles are ordered from most to least privileged. Used for "at least X" checks.
const ROLE_RANK: Record<Role, number> = {
  owner: 4,
  admin: 3,
  developer: 2,
  viewer: 1,
};

/**
 * Restrict a route to users whose role rank meets or exceeds `minRole`.
 * Example: requireRole("admin") allows owner + admin, blocks developer + viewer.
 */
export function requireRole(minRole: Role) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });

    if (ROLE_RANK[req.user.role] < ROLE_RANK[minRole]) {
      return res.status(403).json({
        error: `Requires role '${minRole}' or higher. Current role: '${req.user.role}'.`,
      });
    }
    next();
  };
}

/**
 * Restrict to an explicit allow-list of roles, for cases that aren't
 * a simple hierarchy (e.g. only 'owner' and 'developer', but not 'admin').
 */
export function requireAnyRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires one of roles: ${roles.join(", ")}` });
    }
    next();
  };
}
