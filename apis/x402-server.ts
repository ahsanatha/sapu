import 'dotenv/config';

import express, { Express } from 'express';

import {
  classifyUrl,
  estimateCost,
  extractArticle,
  extractLinksTool,
  fetchBrowser,
  fetchHttp,
} from '../core/x402-tools.js';
import {
  createX402PaymentMiddleware,
  getX402PaymentSummary,
} from '../core/x402-payment.js';

const app: Express = express();
app.disable('x-powered-by');
app.set('etag', false);
app.use(express.json({ limit: process.env.X402_JSON_LIMIT || '128kb' }));

app.use((req, res, next) => {
  res.setHeader('access-control-allow-origin', process.env.X402_CORS_ORIGIN || '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type, payment-signature, x-payment');
  res.setHeader('access-control-expose-headers', 'payment-required, payment-response, x-payment-response');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'Sapu Extract API',
    docs: '/x402/health',
  });
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'sapu-x402-api',
    payment: getX402PaymentSummary(),
    uptimeSec: Math.round(process.uptime()),
  });
});

app.post('/x402/extract/article', (req, res, next) => {
  if (req.body?.mode === 'browser') {
    return res.status(400).json({
      error: 'browser_mode_requires_dedicated_route',
      message: 'Use POST /x402/extract/article/browser for Cloudflare Browser Run or /x402/extract/article/browser/long for local Puppeteer.',
      routes: {
        cheap: 'POST /x402/extract/article/browser',
        long: 'POST /x402/extract/article/browser/long',
      },
    });
  }
  return next();
});

const x402PaymentMiddleware = createX402PaymentMiddleware();
if (x402PaymentMiddleware) {
  app.use(x402PaymentMiddleware);
  console.log('x402 payment middleware enabled', getX402PaymentSummary());
} else {
  console.log('x402 payment middleware disabled; set X402_ENABLED=true and X402_PAY_TO to charge paid routes');
}

app.get('/x402/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'Sapu Extract API',
    version: '0.2.0',
    mode: 'stateless',
    payment: getX402PaymentSummary(),
    endpoints: [
      'POST /x402/classify-url',
      'POST /x402/fetch/http',
      'POST /x402/fetch/browser',
      'POST /x402/fetch/browser/long',
      'POST /x402/extract/article',
      'POST /x402/extract/article/browser',
      'POST /x402/extract/article/browser/long',
      'POST /x402/extract/links',
      'GET /x402/cost/estimate',
    ],
  });
});

app.get('/x402/cost/estimate', (req, res) => {
  try {
    const endpoint = String(req.query.endpoint || 'extract-article');
    const seconds = req.query.seconds ? Number(req.query.seconds) : undefined;
    res.json(estimateCost(endpoint, { seconds }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/x402/classify-url', (req, res) => {
  try {
    res.json(classifyUrl(String(req.body?.url || '')));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/x402/fetch/http', async (req, res) => {
  try {
    const result = await fetchHttp({
      url: String(req.body?.url || ''),
      timeoutMs: req.body?.timeoutMs,
      userAgent: req.body?.userAgent,
    });
    if (req.body?.includeBody !== true) delete result.body;
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/x402/fetch/browser', async (req, res) => {
  try {
    const result = await fetchBrowser({
      url: String(req.body?.url || ''),
      timeoutMs: req.body?.timeoutMs,
      userAgent: req.body?.userAgent,
      browserBackend: 'cloudflare-browser-run',
    });
    if (req.body?.includeHtml !== true) delete result.html;
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/x402/fetch/browser/long', async (req, res) => {
  try {
    const result = await fetchBrowser({
      url: String(req.body?.url || ''),
      timeoutMs: req.body?.timeoutMs,
      userAgent: req.body?.userAgent,
      browserBackend: 'local-puppeteer',
    });
    if (req.body?.includeHtml !== true) delete result.html;
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/x402/extract/article', async (req, res) => {
  try {
    const result = await extractArticle({
      url: String(req.body?.url || ''),
      mode: 'http',
      timeoutMs: req.body?.timeoutMs,
      userAgent: req.body?.userAgent,
    });
    if (req.body?.includeText === false) delete result.text;
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/x402/extract/article/browser', async (req, res) => {
  try {
    const result = await extractArticle({
      url: String(req.body?.url || ''),
      mode: 'browser',
      timeoutMs: req.body?.timeoutMs,
      userAgent: req.body?.userAgent,
      browserBackend: 'cloudflare-browser-run',
    });
    if (req.body?.includeText === false) delete result.text;
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/x402/extract/article/browser/long', async (req, res) => {
  try {
    const result = await extractArticle({
      url: String(req.body?.url || ''),
      mode: 'browser',
      timeoutMs: req.body?.timeoutMs,
      userAgent: req.body?.userAgent,
      browserBackend: 'local-puppeteer',
    });
    if (req.body?.includeText === false) delete result.text;
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/x402/extract/links', async (req, res) => {
  try {
    res.json(await extractLinksTool({
      url: String(req.body?.url || ''),
      timeoutMs: req.body?.timeoutMs,
      userAgent: req.body?.userAgent,
    }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => {
  console.log(`Sapu x402 stateless API running on port ${port}`);
});
