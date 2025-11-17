export default function SideNav() {
  return (
    <aside className="flex w-64 flex-col border-r border-white/10 bg-[#111722] p-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div
            className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10"
            data-alt="User avatar with an abstract purple and blue gradient"
            style={{
              backgroundImage:
                'url("https://lh3.googleusercontent.com/aida-public/AB6AXuCQa8yHdS34QpekFy5ad26Td4pRvRzLygiD1y7mazf0GKCisYuXlpZN1AIX9X7rWwGZBlNxs0VkA4y6sAB2JBgMzm2AXwEwBYDdPVtNOndfAvNg8DTLlbK0gS7t6mXu1Pp7iwvG0-rWBdqcrVMK2Q_SGfCYVzfbRpLUaGySwhzmYL7lFRsYqYwaYEmTjSrqXgeC5lHOFh4JEhOO0LoTNTxnRoulfnC1cfbDMgW17F5-PD4UEx4typa1tKI8TLxZdFvS13-zF4NrCXNM")',
            }}
          ></div>
          <div className="flex flex-col">
            <h1 className="text-white text-base font-medium leading-normal">
              DevOps Manager
            </h1>
            <p className="text-[#92a4c9] text-sm font-normal leading-normal">
              solo.dev@email.com
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <a
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#232f48] transition-colors"
            href="#"
          >
            <span className="material-symbols-outlined text-white text-[24px]">
              dashboard
            </span>
            <p className="text-white text-sm font-medium leading-normal">
              Dashboard
            </p>
          </a>
          <a
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#232f48]"
            href="#"
          >
            <span className="material-symbols-outlined text-white text-[24px]">
              smart_toy
            </span>
            <p className="text-white text-sm font-medium leading-normal">
              Automations
            </p>
          </a>
          <a
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#232f48] transition-colors"
            href="#"
          >
            <span className="material-symbols-outlined text-white text-[24px]">
              settings
            </span>
            <p className="text-white text-sm font-medium leading-normal">
              Settings
            </p>
          </a>
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-1">
        <a
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#232f48] transition-colors"
          href="#"
        >
          <span className="material-symbols-outlined text-white text-[24px]">
            help
          </span>
          <p className="text-white text-sm font-medium leading-normal">
            Help &amp; Support
          </p>
        </a>
      </div>
    </aside>
  )
}
