import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { query } from "../config/db";
import { AiService } from "../services/ai.service";
import { NotificationService } from "../services/notification.service";
import { getIo } from "../server";
import { ApiError } from "../middleware/errorHandler";

const router = Router();

/**
 * GitHub sends webhooks with a raw JSON body and an HMAC-SHA256 signature
 * derived from a per-repo secret. This route needs the *raw* body to verify
 * the signature, so it's mounted with express.raw() in app.ts rather than
 * the global express.json() parser.
 */
function verifySignature(req: Request): boolean {
  const signature = req.header("x-hub-signature-256");
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!signature || !secret) return false;

  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(req.body).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

router.post("/github", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!verifySignature(req)) {
      throw new ApiError(401, "Invalid webhook signature");
    }

    const event = req.header("x-github-event");
    const payload = JSON.parse(req.body.toString("utf8"));

    if (event === "pull_request" && ["opened", "synchronize", "ready_for_review"].includes(payload.action)) {
      await handlePullRequestEvent(payload);
    }

    // Always 200 quickly — GitHub retries aggressively on non-2xx responses.
    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
});

async function handlePullRequestEvent(payload: any) {
  const pr = payload.pull_request;
  const repoFullName: string = payload.repository.full_name;

  // Map the incoming repo to a DevFlow project via its stored repo_url.
  const projects = await query<{ id: string; created_by: string }>(
    "SELECT id, created_by FROM projects WHERE repo_url ILIKE $1",
    [`%${repoFullName}%`]
  );
  const project = projects[0];
  if (!project) return; // repo isn't linked to a DevFlow project — nothing to do

  // In production this diff would come from the GitHub REST/GraphQL API
  // (GET /repos/{owner}/{repo}/pulls/{number}/files) using an installation
  // token. Kept as a placeholder call here to keep the webhook handler
  // focused on orchestration rather than GitHub API plumbing.
  const diff = await fetchPullRequestDiff(repoFullName, pr.number);

  const { result } = await AiService.summarizePr(diff, project.created_by, project.id);

  await query(
    `INSERT INTO messages (channel_id, sender_id, content, is_ai_generated)
     SELECT id, NULL, $2, true FROM channels WHERE project_id = $1 LIMIT 1`,
    [project.id, `**PR #${pr.number}: ${pr.title}**\n\n${result}`]
  );

  const io = getIo();
  io.to(`project:${project.id}`).emit("pr:summary_ready", { prNumber: pr.number, summary: result });
  await NotificationService.prSummaryReady(io, project.created_by, pr.title, project.id);
}

async function fetchPullRequestDiff(repoFullName: string, prNumber: number): Promise<string> {
  const token = process.env.GITHUB_APP_TOKEN;
  if (!token) throw new Error("GITHUB_APP_TOKEN not configured");

  const res = await fetch(
    `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3.diff" } }
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.text();
}

export default router;
