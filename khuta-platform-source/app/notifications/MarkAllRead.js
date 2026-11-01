'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MarkAllRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button className="linkbtn" disabled={busy} data-testid="read-all"
            onClick={async () => {
              setBusy(true);
              await fetch('/api/notifications/read', { method: 'POST' }).catch(() => {});
              setBusy(false);
              router.refresh();
            }}>
      {busy ? 'جارٍ…' : 'تعليم الكلّ مقروءًا'}
    </button>
  );
}
