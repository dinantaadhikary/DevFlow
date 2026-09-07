import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth";
import {
  explainCode,
  generateReadme,
  generateDocs,
  generateTests,
  summarizePr,
} from "../controllers/ai.controller";

const router = Router();

// AI calls are expensive — tighter rate limit than the rest of the API.
const aiLimiter = rateLimit({ windowMs: 60_000, max: 20 });

router.use(requireAuth, aiLimiter);

router.post("/explain", explainCode);
router.post("/readme", generateReadme);
router.post("/docs", generateDocs);
router.post("/tests", generateTests);
router.post("/pr-summary", summarizePr);

export default router;
