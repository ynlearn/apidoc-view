import { AppError } from './AppError.js';
export const notFoundHandler = (req, res) => {
    res.status(404).json({ code: 'NOT_FOUND', message: `接口不存在：${req.method} ${req.path}` });
};
export const errorHandler = (err, _req, res, _next) => {
    // 请求体过大（express json limit）
    if (err?.type === 'entity.too.large') {
        res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: '请求体超过大小限制' });
        return;
    }
    if (err instanceof AppError) {
        res.status(err.status).json({ code: err.code, message: err.message });
        return;
    }
    console.error('[UnhandledError]', err);
    res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : '服务器内部错误',
    });
};
//# sourceMappingURL=errorHandler.js.map