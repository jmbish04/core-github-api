export default function CodeDiffPanel() {
  return (
    <div className="flex flex-col bg-background-dark">
      {/* Tabs */}
      <div className="flex border-b border-white/10 px-4">
        <button className="px-4 py-3 text-sm font-medium border-b-2 border-primary text-white">
          Code Diff
        </button>
        <button className="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-[#92a4c9] hover:text-white transition-colors">
          Automation PRs
        </button>
      </div>
      {/* Code Diff View */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <p className="text-sm text-[#92a4c9] font-mono">
            src/routes/webhook-handler.ts
          </p>
        </div>
        <div className="flex-1 overflow-y-auto font-mono text-sm p-4 bg-[#0d1117]">
          <div className="whitespace-pre">
            <div className="flex">
              <span className="w-10 select-none text-right text-white/30">18</span>
              <span className="w-10 select-none text-right text-white/30">18</span>
              <span className="pl-4 text-white/70">
                router.post('/hooks', (req, res) =&gt; &#123;
              </span>
            </div>
            <div className="flex">
              <span className="w-10 select-none text-right text-white/30">19</span>
              <span className="w-10 select-none text-right text-white/30">19</span>
              <span className="pl-4 text-white/70">
                {' '}
                const &#123; action, issue, label &#125; = req.body;
              </span>
            </div>
            <div className="flex">
              <span className="w-10 select-none text-right text-white/30">20</span>
              <span className="w-10 select-none text-right text-white/30">20</span>
              <span className="pl-4 text-white/70"></span>
            </div>
            <div className="flex bg-green-500/10">
              <span className="w-10 select-none text-right text-green-400/50"></span>
              <span className="w-10 select-none text-right text-green-400/80">
                21
              </span>
              <span className="pl-3 text-green-400">
                <span className="text-green-500 font-bold pr-1">+</span> if (action ===
                'labeled' &amp;&amp; label.name === 'bug') &#123;
              </span>
            </div>
            <div className="flex bg-green-500/10">
              <span className="w-10 select-none text-right text-green-400/50"></span>
              <span className="w-10 select-none text-right text-green-400/80">
                22
              </span>
              <span className="pl-3 text-green-400">
                <span className="text-green-500 font-bold pr-1">+</span>{' '}
                reproduceBugAndComment(issue);
              </span>
            </div>
            <div className="flex bg-green-500/10">
              <span className="w-10 select-none text-right text-green-400/50"></span>
              <span className="w-10 select-none text-right text-green-400/80">
                23
              </span>
              <span className="pl-3 text-green-400">
                <span className="text-green-500 font-bold pr-1">+</span> return
                res.status(200).send('Bug reproduction started.');
              </span>
            </div>
            <div className="flex bg-green-500/10">
              <span className="w-10 select-none text-right text-green-400/50"></span>
              <span className="w-10 select-none text-right text-green-400/80">
                24
              </span>
              <span className="pl-3 text-green-400">
                <span className="text-green-500 font-bold pr-1">+</span> &#125;
              </span>
            </div>
            <div className="flex">
              <span className="w-10 select-none text-right text-white/30">21</span>
              <span className="w-10 select-none text-right text-white/30">25</span>
              <span className="pl-4 text-white/70"></span>
            </div>
            <div className="flex">
              <span className="w-10 select-none text-right text-white/30">22</span>
              <span className="w-10 select-none text-right text-white/30">26</span>
              <span className="pl-4 text-white/70">
                {' '}
                res.status(200).send('Webhook received.');
              </span>
            </div>
            <div className="flex">
              <span className="w-10 select-none text-right text-white/30">23</span>
              <span className="w-10 select-none text-right text-white/30">27</span>
              <span className="pl-4 text-white/70">&#125;);</span>
            </div>
          </div>
        </div>
      </div>
      {/* Action Bar */}
      <div className="flex items-center justify-between border-t border-white/10 p-4 bg-[#111722]">
        <div className="flex items-center gap-2">
          <button className="px-4 py-2 text-sm font-medium rounded-lg bg-[#232f48] text-white hover:bg-[#2d3a54] transition-colors">
            Discard Changes
          </button>
          <button className="px-4 py-2 text-sm font-medium rounded-lg bg-[#232f48] text-white hover:bg-[#2d3a54] transition-colors">
            Copy Code
          </button>
        </div>
        <button className="px-6 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors">
          Submit Changes as PR
        </button>
      </div>
    </div>
  )
}
