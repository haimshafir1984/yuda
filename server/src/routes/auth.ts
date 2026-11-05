import { Router } from 'express';
import { z } from 'zod';
import { COOKIE_NAME } from '../auth/middleware';
import { currentUser } from '../auth/context';
import { AREA_LABEL, MATRIX, ROLES, ROLE_LABEL, permissionsOf } from '../auth/permissions';
import { listDemoUsers } from '../auth/users';
import { prisma } from '../db';
import { AppError } from '../errors';
import { asyncHandler } from '../http';

export const authRouter = Router();

const me = () => {
  const u = currentUser();
  if (!u) return { user: null, permissions: null, authDisabled: process.env.AUTH_DISABLED === '1' };
  return {
    user: { id: u.id, name: u.name, role: u.role, roleLabel: ROLE_LABEL[u.role] },
    permissions: permissionsOf(u.role),
    authDisabled: !!u.synthetic,
  };
};

/** רשימת משתמשי ההדגמה למסך הכניסה (ציבורי, אין בה מידע אישי) */
authRouter.get('/demo-users', asyncHandler(async (_req, res) => res.json(await listDemoUsers())));

authRouter.get('/me', (_req, res) => res.json(me()));

/** כניסה להדגמה בלי סיסמה: בוחרים משתמש קיים */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { userId } = z.object({ userId: z.number({ required_error: 'יש לבחור משתמש' }).int() }).parse(req.body);
    const user = await prisma.appUser.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new AppError(404, 'USER_NOT_FOUND', 'המשתמש לא נמצא');
    res.cookie(COOKIE_NAME, String(user.id), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 * 24 * 3600 * 1000 });
    res.json({
      user: { id: user.id, name: user.name, role: user.role, roleLabel: ROLE_LABEL[user.role as keyof typeof ROLE_LABEL] ?? user.role },
      permissions: permissionsOf(user.role as keyof typeof ROLE_LABEL),
      authDisabled: false,
    });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

/** מטריצת ההרשאות לתצוגה במסך ההגדרות (ציבורי: אין בה מידע אישי) */
authRouter.get('/roles', (_req, res) =>
  res.json({
    areas: AREA_LABEL,
    roles: ROLES.map((r) => ({ role: r, label: ROLE_LABEL[r], permissions: MATRIX[r] })),
  }),
);
