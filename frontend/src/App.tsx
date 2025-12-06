import { useState } from 'react'
import { NumericKeypad } from '@/components/auth/numeric-keypad'
import { ChatInterface } from '@/components/chat/chat-interface'

function App() {
  const [apiKey, setApiKey] = useState<string | null>(null);

  if (!apiKey) {
    return (
      <NumericKeypad
        onComplete={(code) => setApiKey(code)}
      />
    );
  }

  return (
    <ChatInterface apiKey={apiKey} />
  );
}

export default App
