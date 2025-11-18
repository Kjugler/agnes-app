# Agnes App - Setup Guide

This repository contains both the frontend (agnes-next) and backend (deepquill) for the Agnes Protocol web application.

## Repository Structure

```
agnes-app/
├── agnes-next/      # Next.js frontend (port 3002)
└── deepquill/       # Express backend API (port 5055)
```

## Quick Start - After Cloning on Laptop

### 1. Clone the Repository

```bash
cd C:\Users\YourUsername\path\to\projects
git clone https://github.com/Kjugler/agnes-app.git
cd agnes-app
```

### 2. Set Up Environment Variables

#### For agnes-next (Frontend):
```bash
cd agnes-next
cp .env.local.example .env.local
```

Then edit `.env.local` and add your actual values:
- `STRIPE_SECRET_KEY` - Your Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Your Stripe webhook secret (from Stripe CLI or dashboard)
- `DATABASE_URL` - Leave as `"file:./prisma/dev.db"` for local development
- `NEXT_PUBLIC_SITE_URL` - Change to your production URL when deploying

#### For deepquill (Backend):
```bash
cd ../deepquill
cp .env.example .env
```

Then edit `.env` and add your actual values:
- `STRIPE_SECRET_KEY` - Same Stripe secret key as agnes-next
- `STRIPE_PRICE_ID` - Your Stripe Price ID for the book product
- `VITE_API_BASE_URL` - Should be `http://localhost:5055` for local dev

### 3. Install Dependencies

#### agnes-next:
```bash
cd agnes-next
npm install
```

#### deepquill:
```bash
cd ../deepquill
npm install
```

### 4. Set Up the Database

```bash
cd ../agnes-next
npx prisma generate
npx prisma migrate dev
```

This will:
- Generate the Prisma client
- Create the SQLite database at `prisma/dev.db`
- Run all migrations

### 5. Start the Development Servers

**Terminal 1 - Backend (deepquill):**
```bash
cd deepquill
npm run dev
# or: node server/index.cjs
```
Server will start on http://localhost:5055

**Terminal 2 - Frontend (agnes-next):**
```bash
cd agnes-next
npm run dev
```
Application will start on http://localhost:3002

## Environment Variables Reference

### agnes-next Required Variables:
| Variable | Description | Example |
|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | Stripe secret key for payments | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook endpoint secret | `whsec_...` |
| `DATABASE_URL` | SQLite database file path | `"file:./prisma/dev.db"` |
| `NEXT_PUBLIC_SITE_URL` | Public site URL for social sharing | `https://agnes-dev.ngrok-free.app` |

### deepquill Required Variables:
| Variable | Description | Example |
|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | Same Stripe secret key | `sk_test_...` |
| `STRIPE_PRICE_ID` | Stripe Price ID for book | `price_...` |
| `VITE_API_BASE_URL` | Backend API URL | `http://localhost:5055` |

## Testing the Setup

1. Visit http://localhost:3002 (local) or https://agnes-dev.ngrok-free.app (via ngrok)
2. Navigate to the contest page
3. Try purchasing the book (use Stripe test card: 4242 4242 4242 4242)
4. Check that points are awarded correctly
5. Test social sharing buttons

## Database Management

### View/Edit Database:
```bash
cd agnes-next
npx prisma studio
```
This opens a web interface at http://localhost:5555

### Create New Migration:
```bash
cd agnes-next
npx prisma migrate dev --name your_migration_name
```

### Reset Database (WARNING: deletes all data):
```bash
cd agnes-next
npx prisma migrate reset
```

## Common Issues

### Port Already in Use
If port 3002 or 5055 is already in use:
- Find and kill the process using the port
- Or change the port in the respective config files

### Database Locked
If you get database locked errors:
- Close Prisma Studio if it's running
- Check that no other processes have the database file open
- Restart the dev server

### Module Not Found
If you see module not found errors:
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again
- Make sure you're in the correct directory

## Git Workflow

### Before Making Changes:
```bash
git pull origin main
```

### After Making Changes:
```bash
git status
git add .
git commit -m "descriptive message"
git push origin main
```

### If You Need to Force Push (CAUTION):
```bash
git push --force origin main
```
Only use force push when you're certain the remote is corrupted and needs to be overwritten.

## Notes

- The database file (`prisma/dev.db`) is gitignored and will not be pushed to GitHub
- Environment files (`.env`, `.env.local`) are gitignored for security
- Always copy from `.env.example` files when setting up on a new machine
- The backend (deepquill) must be running for checkout and API features to work
- Social sharing features require proper environment variables to be set

## Support

For issues or questions, refer to:
- Next.js docs: https://nextjs.org/docs
- Prisma docs: https://www.prisma.io/docs
- Stripe docs: https://stripe.com/docs

