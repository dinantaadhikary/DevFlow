import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth";
import { AiService } from "../services/ai.service";

const codeInputSchema = z.object({ code: z.string().min(1), projectId: z.string().uuid().optional() });
const contextInputSchema = z.object({ context: z.string().min(1), projectId: z.string().uuid().optional() });
const diffInputSchema = z.object({ diff: z.string().min(1), projectId: z.string().uuid().optional() });

function makeHandler<T extends { projectId?: string }>(
  schema: z.ZodSchema<T>,
  extractInput: (body: T) => string,
  run: (input: string, userId: string, projectId?: string) => Promise<{ result: string; cached: boolean }>
) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const body = schema.parse(req.body);
      const { result, cached } = await run(extractInput(body), req.user!.userId, body.projectId);
      res.json({ result, cached });
    } catch (err) {
      next(err);
    }
  };
}

export const explainCode = makeHandler(codeInputSchema, (b) => b.code, AiService.explainCode);
export const generateReadme = makeHandler(contextInputSchema, (b) => b.context, AiService.generateReadme);
export const generateDocs = makeHandler(codeInputSchema, (b) => b.code, AiService.generateDocs);
export const generateTests = makeHandler(codeInputSchema, (b) => b.code, AiService.generateTests);
export const summarizePr = makeHandler(diffInputSchema, (b) => b.diff, AiService.summarizePr);
