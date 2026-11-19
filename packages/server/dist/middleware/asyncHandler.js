/** 包装 async 路由处理器，把 rejected Promise 转交给 Express 错误中间件 */
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
//# sourceMappingURL=asyncHandler.js.map