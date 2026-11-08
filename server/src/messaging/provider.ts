export interface OutgoingMessage {
  channel: 'SMS' | 'EMAIL';
  to: string;
  subject: string | null;
  body: string;
}

/** ספק שליחה. בהדגמה אין שליחה אמיתית: ההודעה נשמרת בתיבת היוצאות בלבד */
export interface MessageProvider {
  name: string;
  send(msg: OutgoingMessage): Promise<void>;
}

export const demoProvider: MessageProvider = {
  name: 'demo-outbox',
  async send() {
    /* אין שליחה בפועל. כאן יתחבר ספק SMS / מייל אמיתי */
  },
};

let current: MessageProvider = demoProvider;
export const getProvider = () => current;
/** להחלפת ספק (חיבור ספק אמיתי בעתיד, או בבדיקות) */
export const setProvider = (p: MessageProvider) => {
  current = p;
};
