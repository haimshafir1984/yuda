import { prisma } from '../db';

/** הגדרות קבלת חברים. הערכים ניתנים לעריכה במסך הקבלה. ברירות המחדל הן הנחות עד שיוגדרו בפועל (האפיון לא מציין גילאים) */
export const SETTING_DEFAULTS = {
  'intake.minAge': '18',
  'intake.maxAge': '40',
  'intake.entryCode': '',
  'intake.whatsappLink': '',
  'intake.noReplyDays': '7', // כמה ימים בלי תגובה להזמנה עד "באוויר"
  'intake.fadeDays': '14', // שבועיים ב"באוויר" ואז "התנדף"
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;
export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: SETTING_KEYS } } });
  const out = { ...SETTING_DEFAULTS } as Record<SettingKey, string>;
  for (const r of rows) out[r.key as SettingKey] = r.value;
  return out;
}

export async function updateSettings(patch: Partial<Record<SettingKey, string>>) {
  for (const [key, value] of Object.entries(patch)) {
    if (!SETTING_KEYS.includes(key as SettingKey) || value === undefined) continue;
    await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  return getSettings();
}

export const numSetting = (s: Record<SettingKey, string>, key: SettingKey) => {
  const n = Number(s[key]);
  return Number.isFinite(n) ? n : Number(SETTING_DEFAULTS[key]);
};
