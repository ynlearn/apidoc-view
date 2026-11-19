import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.js';
import { listGlobals, replaceGlobals } from '../db/repositories/globals.js';
export const globalsRouter = Router();
const replaceSchema = z.object({
    variables: z.array(z.object({
        key: z.string().min(1),
        value: z.string(),
        description: z.string().optional(),
    })),
});
globalsRouter.get('/', (_req, res) => {
    res.json(listGlobals());
});
globalsRouter.put('/', validateBody(replaceSchema), (req, res) => {
    replaceGlobals(req.body.variables);
    res.json(listGlobals());
});
//# sourceMappingURL=globals.js.map