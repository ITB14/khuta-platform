'use client';
import { useRouter } from 'next/navigation';

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button className="linkbtn" onClick={async () => {
      await fetch('/api/auth/signout', { method: 'POST' });
      router.push('/signin');
      router.refresh();
    }}>تسجيل الخروج</button>
  );
}
