import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChat } from '@/hooks/use-chat';

function ChatMessages({ messages, isPending }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isPending]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ scrollbarWidth: 'thin' }}>
      {messages.map((msg, i) => (
        <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
          <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            msg.role === 'user'
              ? 'bg-red-600 text-white rounded-br-sm'
              : 'bg-gray-100 text-gray-900 rounded-bl-sm'
          }`}>
            {msg.content}
          </div>

          {/* Action buttons */}
          {msg.actions?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2 max-w-[85%]">
              {msg.actions.map((action, j) => (
                <a
                  key={j}
                  href={action.href}
                  className="text-xs bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-full hover:bg-red-50 transition font-medium"
                >
                  {action.label} →
                </a>
              ))}
            </div>
          )}

          {/* Sources */}
          {msg.sources?.length > 0 && (
            <div className="mt-1 max-w-[85%] space-y-0.5">
              {msg.sources.map((s, j) => (
                <p key={j} className="text-xs text-gray-400">
                  📍 {s.episodeTitle}{s.timeRef ? ` @ ${s.timeRef}` : ''}{s.topic ? ` — ${s.topic}` : ''}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}

      {isPending && (
        <div className="flex items-start">
          <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function ChatInput({ onSend, isPending }) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim() || isPending) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <div className="p-3 border-t border-gray-100 flex gap-2">
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSend()}
        placeholder="Ask me anything..."
        disabled={isPending}
        className="flex-1 text-sm border border-gray-200 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
      />
      <button
        onClick={handleSend}
        disabled={!input.trim() || isPending}
        className="w-9 h-9 bg-red-600 text-white rounded-full flex items-center justify-center hover:bg-red-700 transition disabled:opacity-40 flex-shrink-0 text-sm"
      >
        ➤
      </button>
    </div>
  );
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, sendMessage, isPending, clearChat } = useChat();

  return (
    <>
      {/* Floating button + thought bubble */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        <AnimatePresence>
          {!isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="mb-2 bg-white border border-gray-200 shadow-md rounded-2xl px-3 py-1.5 text-xs font-medium text-gray-700 whitespace-nowrap"
            >
              Ask me anything ✨
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative">
          {/* Pulse ring — only when closed */}
          {!isOpen && (
            <span className="absolute inset-0 rounded-full bg-red-500 opacity-30 animate-ping" />
          )}

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(prev => !prev)}
            className="w-14 h-14 bg-red-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-red-700 transition relative z-10 text-2xl"
            aria-label={isOpen ? 'Close chat' : 'Open chat'}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isOpen ? 'close' : 'open'}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {isOpen ? '✕' : '💬'}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-24 right-6 z-50 w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
            style={{ height: '520px' }}
          >
            {/* Header */}
            <div className="bg-red-600 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="font-semibold text-sm">MAKEIT OR BREAKIT</p>
                <p className="text-xs text-red-200">Ask me about episodes or the show</p>
              </div>
              <div className="flex gap-3 items-center">
                <button
                  onClick={clearChat}
                  className="text-red-200 hover:text-white text-xs transition"
                >
                  Clear
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-red-200 hover:text-white transition text-lg leading-none"
                >
                  ✕
                </button>
              </div>
            </div>

            <ChatMessages messages={messages} isPending={isPending} />
            <ChatInput onSend={sendMessage} isPending={isPending} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
