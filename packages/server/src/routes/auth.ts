import { Router } from 'express';
import { z } from 'zod';
import type { AuthStatus, LoginResult } from '@openapi-view/shared';
import { AppError } from '../middleware/AppError.js';
import { validateBody } from '../middleware/validate.js';
import { readRole } from '../middleware/auth.js';
import {
  clearLoginFailures,
  isLoginBlocked,
  isViewGateEnabled,
  issueToken,
  recordLoginFailure,
  verifyAdminCredentials,
  verifyViewPassword,
} from '../services/authService.js';

export const authRouter = Router();

/** 前端用它判断要不要显示登录页 / 访问口令页，以及当前登录态 */
authRouter.get('/status', (req, res) => {
  const body: AuthStatus = {
    adminLoginRequired: true,
    viewGate: isViewGateEnabled(),
    role: readRole(req),
  };
  res.json(body);
});

const loginSchema = z.object({
  mode: z.enum(['admin', 'view']),
  username: z.string().optional(),
  password: z.string().min(1, '请输入密码'),
});

authRouter.post('/login', validateBody(loginSchema), (req, res) => {
  const { mode, username, password } = req.body as z.infer<typeof loginSchema>;
  const throttleKey = `${req.ip ?? 'unknown'}:${mode}`;

  if (isLoginBlocked(throttleKey)) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', '尝试过于频繁，请 10 分钟后再试');
  }

  if (mode === 'admin') {
    // 账号不存在与密码错误返回同一提示，不额外泄漏账号是否存在
    if (!username || !verifyAdminCredentials(username, password)) {
      recordLoginFailure(throttleKey);
      throw new AppError(401, 'INVALID_CREDENTIALS', '账号或密码错误');
    }
  } else {
    if (!isViewGateEnabled()) {
      throw new AppError(400, 'VIEW_GATE_DISABLED', '当前未开启访问口令');
    }
    if (!verifyViewPassword(password)) {
      recordLoginFailure(throttleKey);
      throw new AppError(401, 'INVALID_CREDENTIALS', '访问口令错误');
    }
  }

  clearLoginFailures(throttleKey);
  const role = mode === 'admin' ? 'admin' : 'view';
  const { token, expiresAt } = issueToken(role);
  const result: LoginResult = { token, role, expiresAt };
  res.json(result);
});
