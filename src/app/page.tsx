import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  if (token) {
    const user = await verifyToken(token);
    if (user) {
      if ((user as any).role === 'admin' || (user as any).role === 'superadmin') {
        redirect('/admin');
      } else {
        const county = (user as any).county || '';
        redirect(`/batches?county=${encodeURIComponent(county)}`);
      }
    }
  }

  redirect('/login');
}
