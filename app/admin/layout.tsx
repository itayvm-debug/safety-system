import { redirect } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { requirePlatformAdmin } from '@/lib/auth/api';
import AdminSubNav from '@/components/AdminSubNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Defense in depth; each server page also re-checks, since layouts are not re-run on client navigation
  const { error } = await requirePlatformAdmin();
  if (error) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 py-6">
        <AdminSubNav />
        <main>{children}</main>
      </div>
    </div>
  );
}
