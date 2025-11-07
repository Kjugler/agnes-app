# End-to-End Test Runbook

## Current Configuration
- **Frontend (agnes-next)**: Port 3002
- **Backend (deepquill)**: Port 5055
- **Ngrok URL**: https://simona-nonindictable-pseudoapoplectically.ngrok-free.dev

## Pre-Flight Checklist

### ✅ Environment Files Status
- `agnes-next/.env.local` - ✅ Has Stripe keys and ngrok URL
- `deepquill/.env` - ✅ Has Stripe secret key (copied from agnes-next)

### ⚠️ Still Need
- `STRIPE_PRICE_ID` in `deepquill/.env` (optional - checkout works without it)
- `STRIPE_WEBHOOK_SECRET` in `deepquill/.env` (only if testing webhooks)

## Step-by-Step Startup

### 1. Close All Prior Servers
```powershell
# Kill any existing node processes on ports 3002 and 5055
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
```

### 2. Start Backend (Terminal 1)
```powershell
cd C:\dev\agnes-app\deepquill
npm run start-server
```
**Expected output:**
```
🟢 Booting deepquill API…
🚀 Server is running on http://localhost:5055
```

### 3. Start Frontend (Terminal 2)
```powershell
cd C:\dev\agnes-app\agnes-next
npm run dev
```
**Expected output:**
```
ready - started server on 0.0.0.0:3002
```

### 4. Start Ngrok (Terminal 3)
```powershell
ngrok http 3002
```
**Copy the HTTPS Forwarding URL** (should be: `https://simona-nonindictable-pseudoapoplectically.ngrok-free.dev`)

**If URL changed:**
- Update `agnes-next/.env.local` → `NEXT_PUBLIC_SITE_URL=...`
- Update `deepquill/.env` → `SITE_URL=...`
- Restart both servers

### 5. Health Checks

**Backend:**
```powershell
# Test ping
curl http://localhost:5055/ping
# Should return: pong
```

**Frontend:**
- Open: http://localhost:3002/contest
- Should load without errors

## Test Flow

1. **Enter Terminal Emulator** → Navigate to terminal page
2. **Purchase Book** → Click "Buy the Book" → Complete Stripe checkout
3. **Share to Social Media** → Use share buttons (Facebook/X/LinkedIn)
4. **Enter Contest** → Click "Enter the Contest" → Complete signup

## Troubleshooting

### Stripe Key Error
```powershell
# Verify key is loaded
cd deepquill
node -e "require('dotenv').config({path:'.env'}); console.log('KEY?', !!process.env.STRIPE_SECRET_KEY)"
```

### Port Already in Use
```powershell
# Find process using port
netstat -ano | findstr :3002
netstat -ano | findstr :5055

# Kill process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

### Ngrok Connection Issues
- Ensure ngrok authtoken is set: `ngrok config add-authtoken <YOUR_TOKEN>`
- Free tier may show warning page on first visit - click "Visit Site"

