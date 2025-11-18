# 🚨 Laptop Restore - Quick Steps

## What Just Happened
✅ Desktop `main` branch (commit 38fe246) was verified as the clean, working state  
✅ Corrupted `rescue/2025-11-07-laptop` branch was deleted from GitHub  
✅ Git remote URL fixed to point to `https://github.com/Kjugler/agnes-app.git`  
✅ Environment variable examples created for both projects  
✅ Everything pushed to GitHub successfully  

Latest commit: `58ec122` - "docs: add comprehensive setup guide for laptop deployment"

---

## 🔧 Steps to Restore on Your Laptop

### 1. Navigate to Your Project Directory
```powershell
cd C:\Users\YourUsername\path\to\projects
```

### 2. Backup Any Local Work (if needed)
```powershell
# If you have uncommitted changes you want to save:
cd agnes-app
git stash save "backup before clean restore"

# Or create a backup branch:
git branch backup-$(Get-Date -Format 'yyyy-MM-dd-HHmm')
```

### 3. Reset to Clean State
```powershell
cd agnes-app

# Discard all local changes and get clean state from GitHub:
git fetch origin
git reset --hard origin/main

# Remove any untracked files:
git clean -fd
```

### 4. Verify You're on the Right Commit
```powershell
git log --oneline -3
```

You should see:
```
58ec122 docs: add comprehensive setup guide for laptop deployment
5304b6d docs: add environment variable examples for both projects
38fe246 feat: score page polish + FB share OG page + progress bar tiers
```

### 5. Set Up Environment Variables

#### For agnes-next:
```powershell
cd agnes-next
cp .env.local.example .env.local
notepad .env.local
```

Add your actual Stripe keys:
```
STRIPE_SECRET_KEY=sk_test_YOUR_ACTUAL_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_ACTUAL_SECRET
DATABASE_URL="file:./prisma/dev.db"
NEXT_PUBLIC_SITE_URL=https://agnes-dev.ngrok-free.app
NEXT_PUBLIC_API_BASE=https://agnes-dev.ngrok-free.app
```

#### For deepquill:
```powershell
cd ..\deepquill
cp .env.example .env
notepad .env
```

Add your actual keys:
```
STRIPE_SECRET_KEY=sk_test_YOUR_ACTUAL_KEY
STRIPE_PRICE_ID=price_YOUR_ACTUAL_PRICE_ID
VITE_API_BASE_URL=http://localhost:5055
```

### 6. Install Dependencies

#### agnes-next:
```powershell
cd ..\agnes-next
npm install
```

#### deepquill:
```powershell
cd ..\deepquill
npm install
```

### 7. Set Up Database
```powershell
cd ..\agnes-next
npx prisma generate
npx prisma migrate dev
```

### 8. Start Development Servers

**Terminal 1 (Backend):**
```powershell
cd deepquill
npm run dev
```

**Terminal 2 (Frontend):**
```powershell
cd agnes-next
npm run dev
```

### 9. Test Everything Works
- Visit http://localhost:3002 (local) or https://agnes-dev.ngrok-free.app (via ngrok)
- Check the score page: https://agnes-dev.ngrok-free.app/contest/score?mockEmail=test@example.com
- Test social sharing buttons
- Verify points are displaying correctly

---

## 🔑 Critical Environment Variables

You'll need these Stripe values (find them in your Stripe Dashboard):

| Variable | Where to Find |
|----------|---------------|
| `STRIPE_SECRET_KEY` | Dashboard → Developers → API keys → Secret key |
| `STRIPE_PRICE_ID` | Dashboard → Products → Your book product → Pricing |
| `STRIPE_WEBHOOK_SECRET` | Dashboard → Developers → Webhooks → Your endpoint secret |

---

## ⚠️ Important Notes

- **Database**: The `dev.db` file is NOT in Git. You'll create a fresh one with the migrate command.
- **Lost Work**: The 36 hours of work on the laptop (commits e195d40 through 8edb4fe) is gone. Start fresh from 38fe246.
- **Rescue Branch**: Already deleted from GitHub. Don't try to recover it.
- **Clean Slate**: Your laptop will match your desktop exactly after these steps.

---

## 🆘 If Something Goes Wrong

### Can't reset because of local changes:
```powershell
git reset --hard HEAD
git clean -fd
git pull --force origin main
```

### Database errors:
```powershell
cd agnes-next
del prisma\dev.db
npx prisma migrate dev
```

### Module errors:
```powershell
# In agnes-next or deepquill:
rmdir node_modules -Recurse
del package-lock.json
npm install
```

### Still broken:
Delete the entire `agnes-app` folder and clone fresh:
```powershell
cd ..
rmdir agnes-app -Recurse -Force
git clone https://github.com/Kjugler/agnes-app.git
cd agnes-app
# Then follow steps 5-9 above
```

---

## ✅ Success Checklist

- [ ] Git shows commit `58ec122` as HEAD
- [ ] Both `.env.local` (agnes-next) and `.env` (deepquill) created with real values
- [ ] `npm install` completed in both directories
- [ ] `npx prisma migrate dev` completed successfully
- [ ] Backend running on port 5055
- [ ] Frontend running on port 3002
- [ ] Score page displays correctly with points
- [ ] Social sharing buttons work

---

**You're ready to work!** All changes from the desktop are now safely on your laptop.

