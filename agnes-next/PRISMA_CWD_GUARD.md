# Prisma Working Directory Guard

## ⚠️ CRITICAL: Always Run Prisma from Root

**Always run Prisma commands from `agnes-next` root directory:**

```powershell
cd C:\dev\agnes-app\agnes-next
npx prisma migrate dev
npx prisma generate
npx prisma studio
```

## ❌ NEVER Run from `prisma/` Folder

**Wrong:**
```powershell
cd C:\dev\agnes-app\agnes-next\prisma
npx prisma migrate dev  # ❌ Creates prisma/dev-next.db (wrong location!)
```

## Why This Matters

- `DATABASE_URL="file:./dev-next.db"` is a relative path
- Running from `prisma/` folder creates the DB in `prisma/dev-next.db` instead of root
- This causes "table does not exist" errors because the app looks in root

## Guard Script

Before running Prisma commands, you can check:

```powershell
.\check-prisma-cwd.ps1
```

Or manually verify:
```powershell
# Should show: agnes-next
Split-Path -Leaf (Get-Location)
```

## If You See `prisma/dev-next.db`

If `prisma/dev-next.db` appears, it means Prisma was run from the wrong directory:

1. **Delete the wrong file:**
   ```powershell
   Remove-Item prisma\dev-next.db -ErrorAction SilentlyContinue
   ```

2. **Copy the correct DB to root (if needed):**
   ```powershell
   Copy-Item prisma\dev-next.db dev-next.db -Force
   ```

3. **Always run from root going forward**

## Database Location

- ✅ **Correct:** `C:\dev\agnes-app\agnes-next\dev-next.db`
- ❌ **Wrong:** `C:\dev\agnes-app\agnes-next\prisma\dev-next.db`
