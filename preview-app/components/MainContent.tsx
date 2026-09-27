export function MainContent() {
  return (
    <main className="flex-1 bg-white p-6 ml-60 mt-0"> {/* ml-60 to account for fixed Sidebar width */}
      <div className="flex items-center justify-center h-full">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md text-center border border-gray-100">
          <h2 className="text-xl font-medium text-gray-900 mb-2">Try searching to get started</h2>
          <p className="text-sm text-gray-600">
            Start watching videos to help us build a feed of videos that you'll love.
          </p>
        </div>
      </div>
    </main>
  );
}