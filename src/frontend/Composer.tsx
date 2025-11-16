export default function Composer() {
  return (
    <div className="border-t border-white/10 p-4">
      <div className="flex items-center gap-3 @container">
        <div
          className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 shrink-0"
          data-alt="User avatar with an abstract purple and blue gradient"
          style={{
            backgroundImage:
              'url("https://lh3.googleusercontent.com/aida-public/AB6AXuCxUDq0y0ZrvF7pkH2IeSnf0M3GRIJiFKs3juwp-3NSy6VaFbAABAc3KmJvKpxEAbLL7nQXYLe3wNtnOs5X7g29N7JhLDLlA8mFE_kAD5jyzYLDPlTcwLD3wfZ1RKtsHx8uhCpb_GSovxGuufdTYHG__kXnk4a0o-vclzh5I0M8R97ZPl3ox38kFZV7qOkdiDhSETDf5oxRpcOhY0rh-xqypcHrV1Shxc_8cVLiadwNVZuHuemzCVDYG1KnzX7DTBkFnmSDMTNtWcFj")',
          }}
        ></div>
        <label className="flex flex-col min-w-40 h-12 flex-1">
          <div className="flex w-full flex-1 items-stretch rounded-lg h-full">
            <input
              className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-white focus:outline-0 focus:ring-0 border-none bg-[#232f48] focus:border-none h-full placeholder:text-[#92a4c9] px-4 rounded-r-none border-r-0 pr-2 text-base font-normal leading-normal"
              placeholder="Define a new automation..."
              value=""
            />
            <div className="flex border-none bg-[#232f48] items-center justify-center pr-4 rounded-r-lg border-l-0 !pr-2">
              <div className="flex items-center gap-4 justify-end">
                <div className="flex items-center gap-1">
                  <button className="flex items-center justify-center p-1.5 rounded-full hover:bg-white/10 transition-colors">
                    <span className="material-symbols-outlined text-[#92a4c9] text-[20px]">
                      attach_file
                    </span>
                  </button>
                </div>
                <button className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-8 px-4 bg-primary text-white text-sm font-medium leading-normal hover:bg-primary/90 transition-colors">
                  <span className="truncate">Send</span>
                </button>
              </div>
            </div>
          </div>
        </label>
      </div>
    </div>
  )
}
