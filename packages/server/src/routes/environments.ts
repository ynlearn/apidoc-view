import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/AppError.js';
import { validateBody } from '../middleware/validate.js';
import { requireAdmin, requireView } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { isUniqueViolation } from '../db/index.js';
import {
  activateEnvironment,
  createEnvironment,
  deleteEnvironment,
  listEnvironments,
  updateEnvironment,
} from '../db/repositories/environments.js';

export const environmentsRouter = Router();

const variablesSchema = z.record(z.string());
const createSchema = z.object({
  name: z.string().min(1, '环境名称不能为空'),
  variables: variablesSchema,
});
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  variables: variablesSchema.optional(),
});

environmentsRouter.get('/', requireView, asyncHandler(async (_req, res) => {
  const items = await listEnvironments();
  res.json({ items, activeId: items.find((e) => e.isActive)?.id ?? null });
}));

environmentsRouter.post('/', requireAdmin, validateBody(createSchema), asyncHandler(async (req, res) => {
  try {
    const env = await createEnvironment(req.body.name, req.body.variables);
    res.status(201).json(env);
  } catch (err) {
    // 唯一冲突按方言识别（sqlite/mysql/pg 报错码不同），统一映射 409
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'DUPLICATE_NAME', '环境名称已存在');
    }
    throw err;
  }
}));

environmentsRouter.put('/:id', requireAdmin, validateBody(updateSchema), asyncHandler(async (req, res) => {
  const env = await updateEnvironment(req.params.id, req.body);
  if (!env) throw new AppError(404, 'NOT_FOUND', '环境不存在');
  res.json(env);
}));

environmentsRouter.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const ok = await deleteEnvironment(req.params.id);
  if (!ok) throw new AppError(404, 'NOT_FOUND', '环境不存在');
  res.status(204).end();
}));

environmentsRouter.post('/:id/activate', requireAdmin, asyncHandler(async (req, res) => {
  const env = await activateEnvironment(req.params.id);
  if (!env) throw new AppError(404, 'NOT_FOUND', '环境不存在');
  res.json(env);
}));
