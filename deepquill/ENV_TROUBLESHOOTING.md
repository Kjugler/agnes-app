# Environment Variable Troubleshooting

## Common Issues After Adding Env Vars

### 1. Syntax Errors in .env Files

**Check for:**
- Missing quotes around values with spaces
- Trailing spaces after values
- Special characters not escaped
- Missing `=` signs

**Correct format:**
```env
VARIABLE_NAME=value
VARIABLE_NAME="value with spaces"
VARIABLE_NAME='value with special chars'
```

**Incorrect format:**
```env
VARIABLE_NAME = value  # spaces around =
VARIABLE_NAME=value with spaces  # missing quotes
VARIABLE_NAME="value" extra text  # text after closing quote
```

### 2. Client-Side Access Issues

**In Vite/React (DeepQuill frontend):**
- Only variables prefixed with `VITE_` are exposed to the client
- Server-side variables (like `DATABASE_URL`, `SMTP_*`) should NOT be accessed in client code
- Accessing server-side vars in client code will cause errors

**Correct:**
```javascript
// In client code (React components)
const apiUrl = import.meta.env.VITE_API_URL; // ✅ Works
```

**Incorrect:**
```javascript
// In client code
const dbUrl = import.meta.env.DATABASE_URL; // ❌ Undefined/Error
const smtpHost = import.meta.env.HELP_SMTP_HOST; // ❌ Undefined/Error
```

### 3. Server-Side Only Variables

These should ONLY be in `deepquill/.env` (server) or `agnes-next/.env.local` (server):
- `DATABASE_URL`
- `HELP_SMTP_HOST`
- `HELP_SMTP_USER`
- `HELP_SMTP_PASS`
- `DEEPQUILL_API_TOKEN`
- `STRIPE_SECRET_KEY`

### 4. Quick Fix Steps

1. **Check browser console** for errors:
   - Open DevTools (F12)
   - Look for red error messages
   - Check Network tab for failed requests

2. **Verify .env file syntax:**
   ```bash
   # Check for common issues
   grep -E "=.*[^\"']$|^[^=]*$" .env
   ```

3. **Restart dev server** after changing .env:
   ```bash
   # Stop the server (Ctrl+C)
   # Then restart
   npm run dev
   ```

4. **Check if variables are being accessed incorrectly:**
   - Search codebase for `process.env` in client code
   - Should use `import.meta.env` in Vite/React
   - Should use `process.env` only in server code (.cjs files)

### 5. LoadingScreen Issue

If "AGNES PROTOCOL" flashes briefly:
- Check browser console for JavaScript errors
- Verify Tailwind CSS is loading correctly
- Check if `onComplete` is being called too early
- Verify `isLoaded` state in App.jsx

### 6. Terminal Not Progressing

If stuck on first terminal:
- Check browser console for errors
- Verify API calls are working (Network tab)
- Check if `isAccessGranted` state is updating
- Verify input handler is working

