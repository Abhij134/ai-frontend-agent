import { Navbar } from '@/components/Navbar';
import { Sidebar } from '@/components/Sidebar';
import { MainContent } from '@/components/MainContent';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <div className="flex flex-1 mt-14"> {/* margin-top to account for fixed Navbar height */}
        <Sidebar />
        <MainContent />
      </div>
    </div>
  );
}