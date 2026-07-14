import type { RequestHandler } from 'express';
import { paymentMiddleware } from '@x402/express';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { registerExactEvmScheme } from '@x402/evm/exact/server';

const DEFAULT_FACILITATOR_URL = 'https://x402.org/facilitator';
const DEFAULT_NETWORK = 'eip155:84532';

export interface X402RouteSummary {
  route: string;
  price: string;
  description: string;
}

type X402PaymentOption = {
  scheme: string;
  payTo: string;
  price: string;
  network: string;
  maxTimeoutSeconds?: number;
};

type X402RouteConfig = {
  accepts: X402PaymentOption[];
  resource: string;
  description: string;
  mimeType: string;
  serviceName: string;
  tags: string[];
  unpaidResponseBody: () => {
    contentType: string;
    body: Record<string, unknown>;
  };
};

type X402RoutesConfig = Record<string, X402RouteConfig>;

export const X402_ROUTE_PRICES: Record<string, { price: string; description: string; tags: string[] }> = {
  'POST /x402/classify-url': {
    price: '$0.001',
    description: 'Classify a URL into article, listing, data file, API endpoint, social, or generic web page.',
    tags: ['url-classification', 'no-fetch', 'agent-tool'],
  },
  'POST /x402/fetch/http': {
    price: '$0.003',
    description: 'Bounded HTTP fetch with status, final URL, content hash, and optional body.',
    tags: ['http-fetch', 'bounded', 'agent-tool'],
  },
  'POST /x402/extract/links': {
    price: '$0.003',
    description: 'Fetch a page and return normalized outbound links with anchor text.',
    tags: ['link-extraction', 'http-fetch', 'agent-tool'],
  },
  'POST /x402/extract/article': {
    price: '$0.005',
    description: 'HTTP-only article extraction with title, description, text, links, hashes, and retrieval metadata.',
    tags: ['article-extraction', 'evidence', 'agent-tool'],
  },
  'POST /x402/extract/article/browser': {
    price: '$0.018',
    description: 'Cheap browser-rendered article extraction for JavaScript-heavy pages through Cloudflare Browser Run.',
    tags: ['article-extraction', 'browser-rendering', 'cloudflare', 'premium'],
  },
  'POST /x402/extract/article/browser/long': {
    price: '$0.075',
    description: 'Long-running local browser article extraction for slow or complex pages.',
    tags: ['article-extraction', 'browser-rendering', 'local-puppeteer', 'long-running'],
  },
  'POST /x402/fetch/browser': {
    price: '$0.015',
    description: 'Cheap browser-rendered fetch through Cloudflare Browser Run.',
    tags: ['browser-rendering', 'javascript', 'cloudflare', 'premium'],
  },
  'POST /x402/fetch/browser/long': {
    price: '$0.060',
    description: 'Long-running local browser fetch for slow or complex pages.',
    tags: ['browser-rendering', 'javascript', 'local-puppeteer', 'long-running'],
  },
};

export function isX402Enabled(): boolean {
  return String(process.env.X402_ENABLED || '').toLowerCase() === 'true';
}

export function getX402PaymentSummary(): {
  enabled: boolean;
  network: string;
  facilitatorUrl: string;
  payToConfigured: boolean;
  routes: X402RouteSummary[];
} {
  return {
    enabled: isX402Enabled(),
    network: process.env.X402_NETWORK || DEFAULT_NETWORK,
    facilitatorUrl: process.env.X402_FACILITATOR_URL || DEFAULT_FACILITATOR_URL,
    payToConfigured: Boolean(process.env.X402_PAY_TO),
    routes: Object.entries(X402_ROUTE_PRICES).map(([route, config]) => ({
      route,
      price: config.price,
      description: config.description,
    })),
  };
}

function unpaidResponseBody(route: string, description: string) {
  return () => ({
    contentType: 'application/json',
    body: {
      error: 'payment_required',
      protocol: 'x402',
      version: 2,
      route,
      price: X402_ROUTE_PRICES[route]?.price,
      description,
      headers: {
        paymentSignature: 'PAYMENT-SIGNATURE',
        paymentResponse: 'PAYMENT-RESPONSE',
        paymentRequired: 'PAYMENT-REQUIRED',
      },
      hint: 'Retry this request with a valid x402 PAYMENT-SIGNATURE header.',
    },
  });
}

export function buildX402Routes(): X402RoutesConfig {
  const payTo = process.env.X402_PAY_TO;
  if (!payTo) {
    throw new Error('X402_PAY_TO must be configured when X402_ENABLED=true');
  }

  const network = process.env.X402_NETWORK || DEFAULT_NETWORK;
  const maxTimeoutSeconds = Math.max(5, Number(process.env.X402_MAX_TIMEOUT_SECONDS ?? 120));
  const serviceName = process.env.X402_SERVICE_NAME || 'Sapu Extract API';
  const resourceBaseUrl = String(process.env.X402_RESOURCE_BASE_URL || 'https://sapu.rekursa.id').replace(/\/$/, '');

  const routes: X402RoutesConfig = {};
  for (const [route, config] of Object.entries(X402_ROUTE_PRICES)) {
    const [, path] = route.split(' ');
    routes[route] = {
      accepts: [{
        scheme: 'exact',
        network,
        payTo,
        price: config.price,
        maxTimeoutSeconds,
      }],
      resource: `${resourceBaseUrl}${path}`,
      description: config.description,
      mimeType: 'application/json',
      serviceName,
      tags: config.tags,
      unpaidResponseBody: unpaidResponseBody(route, config.description),
    };
  }

  return routes;
}

export function createX402PaymentMiddleware(): RequestHandler | null {
  if (!isX402Enabled()) return null;

  const facilitatorUrl = process.env.X402_FACILITATOR_URL || DEFAULT_FACILITATOR_URL;
  const network = process.env.X402_NETWORK || DEFAULT_NETWORK;
  const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
  const server = new x402ResourceServer(facilitatorClient);
  registerExactEvmScheme(server, { networks: [network] });

  return paymentMiddleware(buildX402Routes(), server);
}
