# פריסה ל-Dokploy (או כל Docker): שרת ולקוח באימג' אחד, בפורט 3001.
# בסיס הנתונים הוא קובץ SQLite, ולכן חובה לחבר Volume ל-/data (ראו docs/deploy-dokploy.md).
FROM node:22-slim

# Prisma צריך OpenSSL; curl משמש לבדיקת תקינות
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# התקנת תלויות בנפרד כדי לנצל מטמון בבנייה חוזרת
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY server/prisma server/prisma
RUN npm ci --include=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    SERVER_PORT=3001 \
    DATABASE_URL=file:/data/crm.db \
    SEED_DEMO=1

VOLUME ["/data"]
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3001/api/health || exit 1

# מיגרציות בכל עלייה (בטוח, מוסיף טבלאות חסרות בלבד). SEED_DEMO=0 מבטל את נתוני ההדגמה.
CMD ["sh", "-c", "cd server && npx prisma migrate deploy && ([ \"$SEED_DEMO\" = \"0\" ] || npx tsx prisma/seed.ts) && node dist/index.js"]
