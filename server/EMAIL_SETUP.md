# Email Verification Setup

The app now uses passwordless authentication via email verification codes.

## Environment Variables

Add these to your `.env` file in the `server` directory:

### Option 1: Using SMTP (Gmail, etc.)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=intrview.io <noreply@intrview.io>
```

**For Gmail:**
1. Enable 2-factor authentication
2. Generate an "App Password" at https://myaccount.google.com/apppasswords
3. Use that app password (not your regular password)

### Option 2: Using Resend (Recommended for production)

```env
RESEND_API_KEY=re_xxxxx
```

Get your API key at https://resend.com

## Development Mode

If SMTP is not configured, the app will log verification codes to the console instead of sending emails. This is useful for development.

## How It Works

1. User enters email (and optional name)
2. System generates a 6-digit code
3. Code is sent via email (or logged to console in dev)
4. User enters code to verify
5. Session is created (no password stored)
6. User stays logged in via cookies

## Database

The `email_verification_codes` table is automatically created on server startup.


