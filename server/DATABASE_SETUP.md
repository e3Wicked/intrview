# Database Setup Guide

This application uses PostgreSQL to cache company information and study plans, significantly reducing OpenAI API calls.

## Prerequisites

1. Install PostgreSQL (if not already installed):
   - macOS: `brew install postgresql@14`
   - Linux: `sudo apt-get install postgresql`
   - Windows: Download from https://www.postgresql.org/download/

2. Start PostgreSQL service:
   - macOS: `brew services start postgresql@14`
   - Linux: `sudo systemctl start postgresql`
   - Windows: PostgreSQL service should start automatically

## Setup Steps

1. **Create the database:**
   ```bash
   createdb interview_prepper
   ```

2. **Run the schema setup:**
   ```bash
   psql -U postgres -d interview_prepper -f setup-db.sql
   ```
   
   Or if you need to specify a password:
   ```bash
   PGPASSWORD=your_password psql -U postgres -d interview_prepper -f setup-db.sql
   ```

3. **Update `.env` file** in the `server/` directory:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=interview_prepper
   DB_USER=postgres
   DB_PASSWORD=your_password_here
   ```

## What Gets Cached

1. **Company Information** (permanent cache):
   - Company name, founded year, description
   - Founders and LinkedIn profiles
   - Funding rounds
   - Logo URLs

2. **Company Research** (7-day TTL):
   - Recent news
   - Culture, tech stack, team size
   - Interview tips and values

3. **Study Plans** (permanent cache):
   - Cached by job description hash
   - If two users analyze the same job posting, they get the same study plan

## Benefits

- **Reduced API costs**: Company info is cached permanently
- **Faster responses**: Database lookups are instant
- **Scalable**: PostgreSQL handles thousands of concurrent users
- **Smart caching**: Study plans reused for identical job postings

## Troubleshooting

If you see database connection errors:
1. Make sure PostgreSQL is running: `pg_isready`
2. Check your `.env` credentials
3. Verify database exists: `psql -U postgres -l | grep interview_prepper`
4. Check connection: `psql -U postgres -d interview_prepper -c "SELECT 1;"`

The app will gracefully fall back to OpenAI if the database is unavailable.

