import { useEditState } from '../lib/auth';
import { InlineAlert } from './ui';

/** מוצג בכרטיסים כשהמשתמש יכול רק לצפות. השרת חוסם שינויים בכל מקרה */
export default function ReadOnlyBanner() {
  const { readOnly, reason } = useEditState();
  if (!readOnly) return null;
  return (
    <div className="mb-4">
      <InlineAlert tone="blue">מצב צפייה בלבד. {reason}</InlineAlert>
    </div>
  );
}
