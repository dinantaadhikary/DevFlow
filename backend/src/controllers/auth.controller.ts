import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { UserModel } from "../models/User";
import { query } from "../config/db";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { ApiError } from "../middleware/errorHandler";

const registerSchema = z.object({
  organizationName: z.string().min(2),
  fullName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const body = registerSchema.parse(req.body);

    const existing = await UserModel.findByEmail(body.email);
    if (existing) throw new ApiError(409, "Email already registered");

    // First user in a new org is always the owner.
    const orgRows = await query(
      `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING *`,
      [body.organizationName, body.organizationName.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now()]
    );
    const org = orgRows[0];

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await UserModel.create({
      organizationId: org.id,
      email: body.email,
      passwordHash,
      fullName: body.fullName,
      role: "owner",
    });

    const accessToken = signAccessToken({ userId: user.id, organizationId: org.id, role: "owner" });
    const refreshToken = signRefreshToken({ userId: user.id });

    res.status(201).json({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const body = loginSchema.parse(req.body);
    const user = await UserModel.findByEmail(body.email);
    if (!user) throw new ApiError(401, "Invalid credentials");

    const valid = await bcrypt.compare(body.password, user.password_hash);
    if (!valid) throw new ApiError(401, "Invalid credentials");
    if (!user.is_active) throw new ApiError(403, "Account is deactivated");

    await UserModel.updateLastSeen(user.id);

    const accessToken = signAccessToken({
      userId: user.id,
      organizationId: user.organization_id,
      role: user.role,
    });
    const refreshToken = signRefreshToken({ userId: user.id });

    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new ApiError(400, "Missing refresh token");

    const payload = verifyRefreshToken(refreshToken);
    const user = await UserModel.findById(payload.userId);
    if (!user) throw new ApiError(401, "User not found");

    const accessToken = signAccessToken({
      userId: user.id,
      organizationId: user.organization_id,
      role: user.role,
    });

    res.json({ accessToken });
  } catch (err) {
    next(new ApiError(401, "Invalid or expired refresh token"));
  }
}
