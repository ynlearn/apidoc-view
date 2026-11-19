import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/AppError.js';
import { validateBody } from '../middleware/validate.js';
import { requireAdmin, requireView } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { isUniqueViolation } from '../db/index.js';
import { listGlobals, replaceGlobals } from '../db/repositories/globals.js';

export const globalsRouter = Router();

const replaceSchema = z.object({
  variables: z.array(
    z.object({
      key: z.string().min(1),
      value: z.string(),
      description: z.string().optional(),
    }),
  ),
});

globalsRouter.get('/', requireView, asyncHandler(async (_req, res) => {
  res.json(await listGlobals());
}));

globalsRouter.put('/', requireAdmin, validateBody(replaceSchema), asyncHandler(async (req, res) => {
  try {
    await replaceGlobals(req.body.variables);
  } catch (err) {
    // payload 内 key 重复会触发唯一约束，事务已回滚，这里统一映射 409
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'DUPLICATE_KEY', '全局变量 key 重复');
    }
    throw err;
  }
  res.json(await listGlobals());
}));
