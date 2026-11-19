import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/AppError.js';
import { validateBody } from '../middleware/validate.js';
import { activateEnvironment, createEnvironment, deleteEnvironment, listEnvironments, updateEnvironment, } from '../db/repositories/environments.js';
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
environmentsRouter.get('/', (_req, res) => {
    const items = listEnvironments();
    res.json({ items, activeId: items.find((e) => e.isActive)?.id ?? null });
});
environmentsRouter.post('/', validateBody(createSchema), (req, res) => {
    try {
        const env = createEnvironment(req.body.name, req.body.variables);
        res.status(201).json(env);
    }
    catch (err) {
        if (String(err?.message).includes('UNIQUE')) {
            throw new AppError(409, 'DUPLICATE_NAME', '环境名称已存在');
        }
        throw err;
    }
});
environmentsRouter.put('/:id', validateBody(updateSchema), (req, res) => {
    const env = updateEnvironment(req.params.id, req.body);
    if (!env)
        throw new AppError(404, 'NOT_FOUND', '环境不存在');
    res.json(env);
});
environmentsRouter.delete('/:id', (req, res) => {
    const ok = deleteEnvironment(req.params.id);
    if (!ok)
        throw new AppError(404, 'NOT_FOUND', '环境不存在');
    res.status(204).end();
});
environmentsRouter.post('/:id/activate', (req, res) => {
    const env = activateEnvironment(req.params.id);
    if (!env)
        throw new AppError(404, 'NOT_FOUND', '环境不存在');
    res.json(env);
});
//# sourceMappingURL=environments.js.map