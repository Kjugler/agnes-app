This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/pages/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.ts`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/pages/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn-pages-router) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/pages/building-your-application/deploying) for more details.

## Development Notes

### Prisma Studio & Database Connection

When debugging database issues, ensure Prisma Studio and the Next.js app are using the same database:

1. **Always run Prisma Studio from the project root:**
   ```bash
   cd agnes-next
   npx prisma studio
   ```

2. **Verify DATABASE_URL matches:**
   - Check `.env.local` or `.env` for `DATABASE_URL`
   - Confirm the Next.js app is reading from the same file
   - The app logs DB connection info in development mode (check console when creating reviews)

3. **If counts don't match:**
   - Stop both Next.js dev server and Prisma Studio
   - Verify `DATABASE_URL` in `.env.local` matches what Prisma expects
   - Restart both from the same directory (`agnes-next/`)

This ensures you're viewing the same database that the app is writing to.

### Secret Management & Security

**⚠️ IMPORTANT: agnes-next must NOT contain Stripe/Mailchimp secrets in `.env.local`**

1. **Prebuild Script**: A prebuild script (`scripts/check-secrets.js`) automatically runs before builds to detect any `sk_` or `whsec_` patterns in the codebase. This prevents accidentally committing secrets.

2. **Where Secrets Should Live**:
   - ✅ **deepquill/.env** - All Stripe/Mailchimp secrets belong here
   - ❌ **agnes-next/.env.local** - Should NOT contain secrets

3. **Server-Side API Routes**: 
   - Some API routes in agnes-next still use secrets (marked with `⚠️ SECURITY NOTE` comments)
   - These are server-side only and will not expose secrets to clients
   - Future refactor: Proxy these operations to deepquill instead

4. **Frontend Configuration Checks**:
   - Frontend should check backend readiness via: `GET http://localhost:5055/api/debug/env`
   - Or use `NEXT_PUBLIC_EMAIL_ENABLED` if you need a simple boolean flag

5. **Verification**:
   ```bash
   npm run prebuild  # Runs secret detection
   ```