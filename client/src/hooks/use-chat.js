import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLanguage } from '@/hooks/use-language';

const API_BASE = import.meta.env.VITE_API_URL || '';

export function useChat() {
  const { t } = useLanguage();

  const [messages, setMessages] = useState(() => [{
    role: 'assistant',
    content: t('chat.welcome'),
    actions: [
      { label: t('chat.browse_episodes'), href: '/episodes' },
      { label: t('chat.contact_us'), href: '/contact' },
    ],
  }]);

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
        content: t('chat.error'),
      }]);
    },
  });

  const clearChat = () => setMessages([{
    role: 'assistant',
    content: t('chat.clear_welcome'),
  }]);

  return { messages, sendMessage, isPending, clearChat };
}
