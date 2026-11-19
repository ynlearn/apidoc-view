import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { documentsRouter } from './routes/documents.js';
import { environmentsRouter } from './routes/environments.js';
import { globalsRouter } from './routes/globals.js';
import { historyRouter, proxyRouter } from './routes/proxy.js';
export function createApp() {
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '5mb' }));
    app.get('/api/health', (_req, res) => {
        res.json({ status: 'ok' });
    });
    app.use('/api/documents', documentsRouter);
    app.use('/api/environments', environmentsRouter);
    app.use('/api/globals', globalsRouter);
    app.use('/api/history', historyRouter);
    app.use('/api/proxy', proxyRouter);
    // 生产环境：托管前端静态资源（同源访问）
    if (fs.existsSync(config.webDistPath)) {
        app.use(express.static(config.webDistPath));
        app.get('*', (req, res, next) => {
            if (req.path.startsWith('/api/'))
                return next();
            res.sendFile(path.join(config.webDistPath, 'index.html'));
        });
    }
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map