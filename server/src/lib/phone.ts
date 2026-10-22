/** מנרמל מספר טלפון לספרות בלבד, עם קידומת 972 מומרת ל-0. */
export const normalizePhone = (raw: string): string => {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('972')) digits = `0${digits.slice(3)}`;
  return digits;
};
