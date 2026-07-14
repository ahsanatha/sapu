declare module '@x402/express' {
  import type { RequestHandler } from 'express';

  export function paymentMiddleware(
    routes: unknown,
    server: unknown,
    paywallConfig?: unknown,
    paywall?: unknown,
    syncFacilitatorOnStart?: boolean,
  ): RequestHandler;
}

declare module '@x402/core/server' {
  export class HTTPFacilitatorClient {
    constructor(config: { url: string });
  }

  export class x402ResourceServer {
    constructor(facilitatorClient: unknown);
  }
}

declare module '@x402/evm/exact/server' {
  export function registerExactEvmScheme(
    server: unknown,
    config?: { networks?: string[] },
  ): unknown;
}
