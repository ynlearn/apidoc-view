import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.js';
import { requireAdmin, requireView } from '../middleware/auth.js';
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

globalsRouter.get('/', requireView, (_req, res) => {
  res.json(listGlobals());
});

globalsRouter.put('/', requireAdmin, validateBody(replaceSchema), (req, res) => {
  replaceGlobals(req.body.variables);
  res.json(listGlobals());
});
