# פריסה ל-Dokploy (שרת Contabo, דומיין ב-Cloudflare)

מתאים לשלב ההדגמה: אין התחברות במערכת, והנתונים בדויים. לפני נתונים אמיתיים יש להוסיף הגנת גישה (ראו בסוף).

## 1. יצירת האפליקציה ב-Dokploy
1. **Create Application** בפרויקט שלכם, ממקור **GitHub** (או Git): הריפו `haimshafir1984/yuda`, ענף `main`.
2. **Build Type: Dockerfile**, נתיב `./Dockerfile`, Context `.`
3. **Environment**: אין חובה להגדיר דבר. ברירות המחדל באימג':
   - `DATABASE_URL=file:/data/crm.db`
   - `HOST=0.0.0.0`, `SERVER_PORT=3001`
   - `SEED_DEMO=1` (טוען נתוני הדגמה בעלייה; בטוח להרצה חוזרת). `SEED_DEMO=0` מבטל.
4. **Volumes / Mounts**: הוסיפו Volume מסוג *Volume Mount* עם **Mount Path: `/data`**.
   **בלי זה הנתונים יימחקו בכל פריסה מחדש.**
5. **Domains**: דומיין `crm.flowsbiz.com` (או תת-דומיין אחר), **Container Port: 3001**, HTTPS (Let's Encrypt) פעיל.
6. **Deploy**. בדיקת תקינות: `https://<הדומיין>/api/health` מחזיר `{"ok":true}`.

אפשר להפעיל Auto Deploy ב-GitHub, כדי שדחיפה ל-`main` תפרוס אוטומטית.

## 2. Cloudflare (DNS)
- רשומת **A** לתת-הדומיין (`crm`) שמצביעה על `169.58.236.130`, עם Proxy (ענן כתום) פעיל.
- במצב **SSL/TLS: Full** (או Full strict אם התעודה תקינה). אם Let's Encrypt נכשל עם Proxy, כבו Proxy זמנית עד שהתעודה מונפקת.

## 3. גיבוי
- Dokploy: **Volume Backups** על ה-Volume `/data`, ליעד S3 או ל-Backups של השרת.
- ידני: `docker cp <קונטיינר>:/data/crm.db ./crm-backup.db` (הכי נקי כשהאפליקציה שקטה).

## 4. הערות
- **מופע אחד בלבד** (SQLite). אל תגדילו מספר רפליקות.
- עדכון גרסה: דחיפה ל-`main`. המיגרציות רצות בעלייה ומוסיפות טבלאות בלבד.
- איפוס נתוני הדגמה: מחיקת קובץ `crm.db` מה-Volume והפעלה מחדש.

## 5. לפני נתונים אמיתיים (לא נדרש בהדגמה)
- הגנת גישה: **Cloudflare Access** מול התת-דומיין (כניסה לפי מייל), ובהמשך התחברות והרשאות בתוך המערכת.
- `SEED_DEMO=0`.
- אין לעלות מידע רפואי או טיפולי אמיתי למערכת ללא התחברות, הרשאות וגיבויים מסודרים.
