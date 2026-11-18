import type { NextFunction, Request, Response } from 'express';

/**
 * One line per HTTP request.
 *
 * A game client's compatibility problems show up here first: a request for a
 * path we do not implement (`404`) or a response the SDK rejects is invisible
 * otherwise, because the client's own logs only say "login failed".
 *
 * Set SASR_HTTP_LOG=0 to silence it.
 */
export function requestLogger() {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (process.env.SASR_HTTP_LOG === '0') {
            next();
            return;
        }

        const started = Date.now();
        const originalUrl = req.originalUrl || req.url;

        // Capture what we answer for the SDK paths. A client that rejects our
        // response only says "login failed", so seeing our own payload is the
        // only way to tell a shape mismatch from a missing field.
        const isSdkPath = /^\/(account|common)\//.test(originalUrl);
        let responsePreview = '';
        if (isSdkPath) {
            const originalJson = res.json.bind(res);
            res.json = (payload: any) => {
                try {
                    responsePreview = JSON.stringify(payload).slice(0, 500);
                } catch {
                    responsePreview = '<unserialisable>';
                }
                return originalJson(payload);
            };
        }

        res.on('finish', () => {
            const ms = Date.now() - started;
            const status = res.statusCode;
            const marker = status >= 400 ? '!!' : '  ';

            // Request bodies carry the SDK parameters; keep it short but useful.
            let body = '';
            if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
                try {
                    body = `  body=${JSON.stringify(req.body).slice(0, 400)}`;
                } catch {
                    body = '  body=<unserialisable>';
                }
            }

            const reply = responsePreview ? `  -> ${responsePreview}` : '';
            console.log(`[http]${marker} ${req.method} ${originalUrl} -> ${status} (${ms}ms)${body}${reply}`);
        });

        next();
    };
}
