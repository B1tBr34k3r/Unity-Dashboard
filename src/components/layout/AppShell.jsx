import Sidebar from './Sidebar';

export default function AppShell({ api, children }) {
  return (
    <div className="flex min-h-screen relative z-10">
      <Sidebar api={api} />
      {/* Offset for fixed sidebar on desktop */}
      <div className="hidden md:block w-60 shrink-0" />
      <main className="flex-1 pt-16 md:pt-0 px-3 py-4 sm:p-6 lg:p-8 overflow-auto min-h-screen">
        <div className="max-w-5xl mx-auto pb-6">
          {children}
        </div>
      </main>
    </div>
  );
}
