import SideNav from "./SideNav";
import ChatPanel from "./ChatPanel";
import CodeDiffPanel from "./CodeDiffPanel";

function App() {
  return (
    <div className="bg-background-dark font-display text-white">
      <div className="flex h-screen w-full">
        <SideNav />
        <main className="flex flex-1 flex-col">
          <div className="grid flex-1 grid-cols-1 lg:grid-cols-2">
            <ChatPanel />
            <CodeDiffPanel />
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
