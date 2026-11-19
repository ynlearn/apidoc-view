import type { RequestHandler } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { AppError } from './AppError.js';

/** 生成校验 body 的中间件；校验通过后把解析结果写回 req.body */
export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.issues[0];
        const field = first.path.join('.') || 'body';
        next(new AppError(400, 'INVALID_PARAMS', `参数 ${field} 无效：${first.message}`));
      } else {
        next(err);
      }
    }
  };
}

/** 校验 query（Express 的 req.query 只读，结果挂到 res.locals.query） */
export function validateQuery(schema: ZodTypeAny): RequestHandler {
  return (req, res, next) => {
    try {
      res.locals.query = schema.parse(req.query);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.issues[0];
        const field = first.path.join('.') || 'query';
        next(new AppError(400, 'INVALID_PARAMS', `参数 ${field} 无效：${first.message}`));
      } else {
        next(err);
      }
    }
  };
}
