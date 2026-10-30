import { test as base, expect, APIResponse } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getEnvConfig } from '../config/env';

export interface StripeWebhookEventPayload {
  id?: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

type SentinelaFixtures = {
  authedApi: (endpoint: string, options?: Record<string, any>) => Promise<APIResponse>;
  checkA11y: (contextSelector?: string) => Promise<void>;
  sendStripeWebhook: (
    event: StripeWebhookEventPayload,
    options?: { invalidSignature?: boolean }
  ) => Promise<APIResponse>;
  networkLogs: Array<{ method: string; url: string; status: number }>;
};

function readStoredToken(): string {
  try {
    const authFile = path.resolve('.auth/customer.json');
    if (fs.existsSync(authFile)) {
      const state = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
      for (const origin of state.origins || []) {
        const entry = (origin.localStorage || []).find((item: any) => item.name === 'auth-token');
        if (entry?.value) return entry.value;
      }
    }
  } catch {
    // Ignore read errors and fall back to env token
  }
  return process.env.TEST_USER_TOKEN || 'mock-jwt-token';
}

export const test = base.extend<SentinelaFixtures>({
  networkLogs: [
    async ({ page }, use, testInfo) => {
      const logs: Array<{ method: string; url: string; status: number }> = [];
      const env = getEnvConfig();

      page.on('response', (res) => {
        if (res.url().includes('/api/') || res.status() >= 400) {
          logs.push({
            method: res.request().method(),
            url: res.url(),
            status: res.status(),
          });
        }
      });

      // Apply Chaos / Bug Injection hooks when CHAOS_MODE is enabled
      if (env.chaosMode === 'api_500') {
        await page.route('**/payment/check', async (route) => {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Internal Server Error',
              message: 'CHAOS_MODE: Upstream Stripe payment gateway returned HTTP 500',
            }),
          });
        });
      } else if (env.chaosMode === 'selector_drift') {
        page.on('domcontentloaded', async () => {
          await page
            .evaluate(() => {
              const btn = document.querySelector('[data-test="search-submit"]');
              if (btn) btn.setAttribute('data-test', 'search-button-v2-drifted');
            })
            .catch(() => {});
        });
      } else if (env.chaosMode === 'a11y_violation') {
        page.on('domcontentloaded', async () => {
          await page
            .evaluate(() => {
              const badBtn = document.createElement('button');
              badBtn.id = 'chaos-unlabeled-btn';
              badBtn.innerHTML = '<span aria-hidden="true"></span>';
              document.body.prepend(badBtn);
            })
            .catch(() => {});
        });
      }

      await use(logs);

      // Attach recent network logs to testInfo so AI Triage Reporter can inspect HAR-like context
      if (testInfo.status !== testInfo.expectedStatus && logs.length > 0) {
        await testInfo.attach('network-log.json', {
          body: JSON.stringify(logs.slice(-15), null, 2),
          contentType: 'application/json',
        });
      }
    },
    { auto: true },
  ],

  authedApi: async ({ request }, use) => {
    const env = getEnvConfig();
    const token = readStoredToken();
    const apiCaller = async (endpoint: string, options: Record<string, any> = {}) => {
      const normalized = endpoint.startsWith('http')
        ? endpoint
        : `${env.apiURL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
      return request.fetch(normalized, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
    };
    await use(apiCaller);
  },

  checkA11y: async ({ page }, use) => {
    const scanner = async (contextSelector?: string) => {
      let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']);
      if (contextSelector) {
        builder = builder.include(contextSelector);
      }
      const results = await builder.analyze();
      const criticalOrSerious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      expect(
        criticalOrSerious,
        `WCAG 2.1 AA Critical/Serious Violations Found:\n${JSON.stringify(
          criticalOrSerious.map((v) => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            nodes: v.nodes.map((n) => n.html),
          })),
          null,
          2
        )}`
      ).toHaveLength(0);
    };
    await use(scanner);
  },

  sendStripeWebhook: async ({ request }, use) => {
    const env = getEnvConfig();
    const secret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_sentinela_secret';
    const sender = async (
      event: StripeWebhookEventPayload,
      options?: { invalidSignature?: boolean }
    ) => {
      const payload = JSON.stringify({
        id: event.id || `evt_${crypto.randomUUID().slice(0, 10)}`,
        type: event.type,
        data: event.data,
      });
      const signature = options?.invalidSignature
        ? 't=1700000000,v1=invalid_signature_hash'
        : `t=1700000000,v1=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;

      return request.post(`${env.apiURL}/webhooks/stripe`, {
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': signature,
        },
        data: payload,
      });
    };
    await use(sender);
  },
});

export { expect } from '@playwright/test';
