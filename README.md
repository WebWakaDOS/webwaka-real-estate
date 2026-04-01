# webwaka-real-estate

**WebWaka Real Estate** — Property listings, transactions, and agent management vertical for the Nigerian real estate market.

Part of the [WebWaka OS v4](https://github.com/WebWakaDOS) platform.

## Modules

| Module | Description |
|---|---|
| **Listings** | Property search, CRUD, image management. Supports sale, rent, and shortlet. |
| **Transactions** | Sale/rent transaction lifecycle with Paystack payment integration. |
| **Agents** | ESVARBON-compliant estate agent profiles and listing assignments. |

## Architecture

- **Runtime**: Cloudflare Workers (Hono framework)
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2 (property images, documents)
- **Auth**: `@webwaka/core` `jwtAuthMiddleware` + `requireRole`
- **Payments**: Paystack (HMAC-SHA512 webhook verification)

## Monetary Integrity

All monetary values are stored as **integer kobo** (NGN × 100). No floats are stored in the database.

## Deployment

```bash
# Staging
wrangler deploy --env staging

# Production
wrangler deploy --env production
```

### Required Secrets

```bash
wrangler secret put JWT_SECRET --env production
wrangler secret put PAYSTACK_SECRET_KEY --env production
wrangler secret put INTER_SERVICE_SECRET --env production
```

### D1 Migrations

```bash
wrangler d1 migrations apply webwaka-real-estate-db-prod --env production
```
