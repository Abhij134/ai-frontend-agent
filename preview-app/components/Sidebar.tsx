import { Home, Zap, Rss, User, History, CircleUser, ShoppingBag, Music, Film, ChevronDown, Award, Flag } from 'lucide-react';

export function Sidebar() {
  const primaryLinks = [
    { icon: <Home className="h-5 w-5" />, text: 'Home', active: true },
    { icon: <Zap className="h-5 w-5" />, text: 'Shorts' },
    { icon: <Rss className="h-5 w-5" />, text: 'Subscriptions' },
    { icon: <User className="h-5 w-5" />, text: 'You' },
    { icon: <History className="h-5 w-5" />, text: 'History' },
  ];

  const exploreLinks = [
    { icon: <ShoppingBag className="h-5 w-5" />, text: 'Shopping' },
    { icon: <Music className="h-5 w-5" />, text: 'Music' },
    { icon: <Film className="h-5 w-5" />, text: 'Movies & TV' },
    { icon: <ChevronDown className="h-5 w-5" />, text: 'Show more' },
  ];

  const moreFromYoutubeLinks = [
    { icon: <Award className="h-5 w-5 text-[#FF0000]" />, text: 'Try Premium for $0' },
    { icon: <Music className="h-5 w-5 text-[#FF0000]" />, text: 'YouTube Music' }, // Using Music icon as a placeholder for YT Music logo
    { icon: <User className="h-5 w-5 text-[#FF0000]" />, text: 'YouTube Kids' }, // Using User icon as a placeholder for YT Kids logo
  ];

  const SidebarLink = ({ icon, text, active }: { icon: JSX.Element; text: string; active?: boolean }) => (
    <a
      href="#"
      className={`flex items-center px-6 py-2 rounded-lg ${
        active ? 'bg-gray-100 font-medium' : 'hover:bg-gray-100'
      } text-gray-700`}
    >
      {icon}
      <span className="ml-4">{text}</span>
    </a>
  );

  const Divider = () => <hr className="my-3 border-gray-200" />;

  return (
    <aside className="fixed top-14 left-0 bottom-0 w-60 bg-white border-r border-gray-200 overflow-y-auto z-40">
      <div className="py-2">
        {primaryLinks.map((link) => (
          <SidebarLink key={link.text} icon={link.icon} text={link.text} active={link.active} />
        ))}

        <Divider />

        <div className="px-6 py-2">
          <p className="text-sm text-gray-700 mb-2">Sign in to like videos, comment and subscribe.</p>
          <button className="flex items-center px-3 py-1.5 border border-blue-300 text-blue-600 rounded-full font-medium hover:bg-blue-50 transition-colors duration-200">
            <CircleUser className="h-5 w-5 mr-2" />
            Sign in
          </button>
        </div>

        <Divider />

        <h3 className="text-sm font-medium text-gray-700 px-6 py-2">Explore</h3>
        {exploreLinks.map((link) => (
          <SidebarLink key={link.text} icon={link.icon} text={link.text} />
        ))}

        <Divider />

        <h3 className="text-sm font-medium text-gray-700 px-6 py-2">More from YouTube</h3>
        {moreFromYoutubeLinks.map((link) => (
          <SidebarLink key={link.text} icon={link.icon} text={link.text} />
        ))}

        <Divider />

        <SidebarLink icon={<Flag className="h-5 w-5" />} text="Report history" />

        <Divider />

        <div className="text-xs text-gray-500 px-6 py-2">
          <div className="flex flex-wrap gap-x-1 gap-y-0.5 mb-2">
            <a href="#" className="hover:underline">About</a>
            <a href="#" className="hover:underline">Press</a>
            <a href="#" className="hover:underline">Copyright</a>
            {/* Add more links if needed to match width */}
          </div>
          <p>© 2024 Google LLC</p>
        </div>
      </div>
    </aside>
  );
}