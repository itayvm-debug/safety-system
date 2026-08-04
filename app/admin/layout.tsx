import NavBar from '@/components/NavBar';
import AdminSubNav from '@/components/AdminSubNav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
