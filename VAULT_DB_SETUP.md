# Single DB Vault Setup (Track 1)

## Canonical Database Location

**Single Source of Truth:**
```
C:\dev\agnes-app\deepquill\dev.db
```

## Configuration Files

### agnes-next/.env.local
```env
DATABASE_URL="file:C:/dev/agnes-app/deepquill/dev.db"
```

### deepquill/.env
```env
DATABASE_URL="file:./dev.db"
```

## Migration Rules

**Only agnes-next runs migrations:**
```bash
cd agnes-next
npx prisma migrate dev --name <migration_name>
npx prisma migrate deploy  # for production
```

**deepquill only generates client:**
```bash
cd deepquill
npx prisma generate
```

## Banned Practices

❌ **DO NOT:**
- Create `dev-next.db` or any other DB file
- Copy DBs between directories
- Run `prisma migrate` from deepquill
- Create new DB files with different names

✅ **DO:**
- Use the single vault DB: `deepquill/dev.db`
- Run migrations only from `agnes-next`
- Generate Prisma client in both apps

## Verification

After setup, verify:
```bash
# Check agnes-next points to vault
curl http://localhost:3000/api/debug/prisma

# Should show:
# resolved_path: "C:\\dev\\agnes-app\\deepquill\\dev.db"
# exists: true
# signal_table_exists: true
```
