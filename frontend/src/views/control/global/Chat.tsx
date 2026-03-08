import { ChatInterface } from '@/components/chat/chat-interface';
import { useAuth } from '@/context/auth-context';

export default function ChatPage() {
    const { apiKey } = useAuth();

    if (!apiKey) return <div>Error: Authentication required</div>;

    return <ChatInterface apiKey={apiKey} />;
}
