# ADR 002: Multi-Target Toolshop Architecture & Signed Stripe Webhooks

## Status
Accepted

## Context
Relying solely on third-party public test sandboxes in CI/CD introduces network flakiness and shared-state collisions, while relying solely on heavy Docker Compose stacks slows down PR feedback loops. Additionally, we need deterministic validation of incoming **Stripe payment webhooks** (`customer.subscription.created`) and **Creator Community** workflows.

## Decision
We architected a multi-target environment layer (`src/config/env.ts`) supporting four seamless execution modes:
1. `TARGET_ENV=local-sandbox` (default): Boots a zero-dependency Node/TypeScript replica of **Practice Software Testing (Testsmith Toolshop v5)** with identical `data-test` contracts and REST endpoints (`/users/login`, `/products`, `/carts`, `/payment/check`), extended with HMAC-SHA256 `/webhooks/stripe` verification and `/test/reset`.
2. `TARGET_ENV=docker`: Targets the official containerized `testsmith/practice-software-testing` stack (`docker-compose.yml`).
3. `TARGET_ENV=live`: Targets the hosted `https://practicesoftwaretesting.com` environment.
4. `TARGET_ENV=live-buggy`: Targets `https://with-bugs.practicesoftwaretesting.com` for defect detection validation.
