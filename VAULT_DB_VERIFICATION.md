# Vault DB Verification Steps

## ✅ Completed Steps

1. **Updated `.env` files:**
   - `agnes-next/.env` → `DATABASE_URL="file:../deepquill/dev.db"`
   - `agnes-next/.env.local` → `DATABASE_URL="file:../deepquill/dev.db"`

2. **Killed stale node processes:**
   - ✅ `taskkill /F /IM node.exe` executed

3. **Cleared Next cache:**
   - ✅ `.next` directory removed

4. **Regenerated Prisma client:**
   - ✅ `npx prisma generate` completed successfully

## Next Steps (Manual)

### 5) Start agnes-next and verify:

```powershell
cd C:\dev\agnes-app\agnes-next
npm run dev
```

### 6) Check debug endpoint:

Open in browser:
```
http://localhost:3000/api/debug/prisma
```

**Expected result:**
```json
{
  "database": {
    "url": "file:../deepquill/dev.db",
    "resolved_path": "C:\\dev\\agnes-app\\deepquill\\dev.db",
    "exists": true,
    "signal_table_exists": true,
    "tables": ["User", "Signal", "Review", "PointAward", ...]
  }
}
```

## Verification Checklist

- [ ] `database.url` shows `file:../deepquill/dev.db`
- [ ] `resolved_path` ends with `deepquill\dev.db`
- [ ] `exists: true`
- [ ] `signal_table_exists: true`
- [ ] `tables` array includes `User`, `Signal`, `Review`, `PointAward`

## Troubleshooting

If `resolved_path` doesn't match:
- Check that `.env` and `.env.local` both have `DATABASE_URL="file:../deepquill/dev.db"`
- Restart agnes-next dev server (env vars load on startup)
- Verify `deepquill/dev.db` exists

If tables are missing:
- Run migrations from `agnes-next`: `npx prisma migrate deploy`
- Check that migrations ran successfully
