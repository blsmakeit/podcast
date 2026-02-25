import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_URL || '';

export function useChat() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm the MAKEIT OR BREAKIT assistant. Ask me anything about our episodes, the show, or how to get involved!",
      actions: [
        { label: 'Browse Episodes', href: '/episodes' },
        { label: 'Contact Us', href: '/contact' },
      ],
    },
  ]);

  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: async (userMessage) => {
      // Build clean messages array for API (no action/sources metadata)
      const apiMessages = [...messages, { role: 'user', content: userMessage }]
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }))
        .slice(-10);

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });
      if (!res.ok) throw new Error('Chat failed');
      return res.json();
    },
    onMutate: (userMessage) => {
      setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message,
        actions: data.actions,
        sources: data.sources,
      }]);
    },
    onError: () => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
      }]);
    },
  });

  const clearChat = () => setMessages([{
    role: 'assistant',
    content: "Hi! I'm the MAKEIT OR BREAKIT assistant. Ask me anything!",
  }]);

  return { messages, sendMessage, isPending, clearChat };
}
