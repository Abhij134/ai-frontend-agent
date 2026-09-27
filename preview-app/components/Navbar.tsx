import { Menu, Search, Mic, MoreVertical, CircleUser, MonitorPlay } from 'lucide-react';

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-14 px-4 bg-white border-b border-gray-200">
      {/* Left section */}
      <div className="flex items-center gap-4">
        <button className="p-2 rounded-full hover:bg-gray-100">
          <Menu className="h-6 w-6 text-gray-700" />
        </button>
        <a href="/" className="flex items-center gap-1">
          {/* Replaced 'Youtube' with 'MonitorPlay' as 'Youtube' is not exported by lucide-react in this context */}
          <MonitorPlay className="h-6 w-6 text-[#FF0000]" />
          <span className="font-bold text-xl tracking-tighter text-gray-900">YouTube</span>
          <span className="text-xs text-gray-500 ml-1">IN</span>
        </a>
      </div>

      {/* Center section - Search bar */}
      <div className="hidden md:flex items-center w-full max-w-xl mx-4">
        <div className="flex w-full border border-gray-300 rounded-l-full overflow-hidden">
          <input
            type="text"
            placeholder="Search"
            className="flex-1 px-4 py-2 text-base outline-none bg-white text-gray-900"
          />
          <button className="px-6 py-2 border-l border-gray-300 bg-gray-100 hover:bg-gray-200">
            <Search className="h-5 w-5 text-gray-700" />
          </button>
        </div>
        <button className="ml-2 p-2 rounded-full bg-gray-100 hover:bg-gray-200">
          <Mic className="h-5 w-5 text-gray-700" />
        </button>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        <button className="p-2 rounded-full hover:bg-gray-100 hidden md:block">
          <MoreVertical className="h-6 w-6 text-gray-700" />
        </button>
        <button className="flex items-center px-3 py-1.5 border border-blue-300 text-blue-600 rounded-full font-medium hover:bg-blue-50 transition-colors duration-200">
          <CircleUser className="h-5 w-5 mr-2" />
          Sign in
        </button>
      </div>
    </nav>
  );
}