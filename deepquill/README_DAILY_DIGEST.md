# Daily Referral Commission Email Digest

## Overview
This system sends daily email summaries to referrers showing their earnings from the previous day.

## Setup

### 1. Database Migration
Run the Prisma migration to add `lastDigestDate` column:
```bash
cd agnes-next
npx prisma migrate dev --name add_digest_date
```

### 2. Environment Variables
Ensure these are set in `deepquill/.env`:
```
DEEPQUILL_API_TOKEN=your-secret-token
HELP_SMTP_HOST=your-smtp-host
HELP_SMTP_USER=your-smtp-user
HELP_SMTP_PASS=your-smtp-password
HELP_SMTP_PORT=587
MAIL_FROM_EMAIL=hello@theagnesprotocol.com
MAIL_FROM_NAME=The Agnes Protocol
DATABASE_URL=file:./dev.db  # or your database connection string
```

## API Endpoint

### POST /admin/referrals/send-daily-digests

**Authentication:**
- Header: `Authorization: Bearer <DEEPQUILL_API_TOKEN>`

**Description:**
- Processes conversions from yesterday (America/Denver timezone)
- Groups conversions by referrer
- Sends email digest to each referrer
- Marks conversions as processed

**Response:**
```json
{
  "ok": true,
  "digestDate": "2025-11-27",
  "referrersProcessed": 5,
  "errors": 0,
  "totalConversions": 12
}
```

## Cron Job Setup

### Option 1: Linux Cron
Add to crontab (`crontab -e`):
```
# Run daily at 00:05 Mountain Time (07:05 UTC during standard time)
5 7 * * * curl -X POST https://your-server.com/admin/referrals/send-daily-digests -H "Authorization: Bearer YOUR_TOKEN"
```

### Option 2: Systemd Timer
Create `/etc/systemd/system/referral-digest.service`:
```ini
[Unit]
Description=Send daily referral digest emails

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -X POST http://localhost:5055/admin/referrals/send-daily-digests -H "Authorization: Bearer YOUR_TOKEN"
```

Create `/etc/systemd/system/referral-digest.timer`:
```ini
[Unit]
Description=Daily referral digest timer

[Timer]
OnCalendar=*-*-* 00:05:00
TimeZone=America/Denver

[Install]
WantedBy=timers.target
```

Enable: `systemctl enable --now referral-digest.timer`

### Option 3: Cloud Scheduler (GCP)
- Create HTTP target
- URL: `https://your-server.com/admin/referrals/send-daily-digests`
- Method: POST
- Headers: `Authorization: Bearer YOUR_TOKEN`
- Schedule: `0 7 * * *` (7 AM UTC = midnight Mountain Time)

### Option 4: Vercel Cron (if deployed on Vercel)
Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/admin/referrals/send-daily-digests",
    "schedule": "0 7 * * *"
  }]
}
```

## Testing

### Manual Test
```bash
curl -X POST http://localhost:5055/admin/referrals/send-daily-digests \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json"
```

### Expected Behavior
1. Queries conversions from yesterday (America/Denver timezone)
2. Groups by referrer
3. Sends email to each referrer with:
   - Total earnings for the day
   - List of friends who purchased
4. Marks conversions with `lastDigestDate` to prevent resending

## Email Format

**Subject:** `Your Agnes Protocol earnings for 2025-11-27: $4.00`

**Body:**
```
Here is your referral summary for 2025-11-27:

Total referral earnings: $4.00

Friends who purchased using your code:
- friend1@example.com – $2.00
- friend2@example.com – $2.00

Thank you for spreading The Agnes Protocol.
```

## Troubleshooting

### No emails sent
- Check SMTP configuration in `.env`
- Verify conversions exist for yesterday
- Check server logs for errors

### Duplicate emails
- Verify `lastDigestDate` is being set correctly
- Check that cron job isn't running multiple times

### Timezone issues
- The system uses America/Denver timezone
- Adjust cron schedule if needed for your timezone

