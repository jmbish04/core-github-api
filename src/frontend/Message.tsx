interface MessageProps {
  author: string;
  avatarUrl: string;
  isUser?: boolean;
  children: React.ReactNode;
}

export default function Message({ author, avatarUrl, isUser = false, children }: MessageProps) {
  return (
    <div className={`flex items-end gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div
          className="bg-center bg-no-repeat aspect-square bg-cover rounded-full w-10 shrink-0"
          style={{ backgroundImage: `url("${avatarUrl}")` }}
        ></div>
      )}
      <div className={`flex flex-1 flex-col gap-1 items-${isUser ? 'end' : 'start'}`}>
        <p className="text-[#92a4c9] text-[13px] font-normal leading-normal max-w-[360px]">
          {author}
        </p>
        <p
          className={`text-base font-normal leading-normal flex max-w-sm rounded-lg px-4 py-3 text-white ${
            isUser ? 'rounded-br-none bg-primary' : 'rounded-bl-none bg-[#232f48]'
          }`}
        >
          {children}
        </p>
      </div>
      {isUser && (
        <div
          className="bg-center bg-no-repeat aspect-square bg-cover rounded-full w-10 shrink-0"
          style={{ backgroundImage: `url("${avatarUrl}")` }}
        ></div>
      )}
    </div>
  );
}
