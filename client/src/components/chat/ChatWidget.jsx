import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChat } from '@/hooks/use-chat';
import { useLanguage } from '@/hooks/use-language';

const BUTTON_SIZE = 56;
const PANEL_GAP = 12;
const EDGE_MARGIN = 8;
const CHAT_WORD_LIMIT = 100;

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function loadPos() {
  try {
    const saved = localStorage.getItem('chatWidgetPos');
    return saved ? JSON.parse(saved) : { x: 24, y: 24 };
  } catch {
    return { x: 24, y: 24 };
  }
}

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

function ChatInput({ onSend, isPending, t }) {
  const [input, setInput] = useState('');
  const count = input.trim() ? wordCount(input) : 0;
  const isOverLimit = count > CHAT_WORD_LIMIT;

  const handleSend = () => {
    if (!input.trim() || isPending || isOverLimit) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <div className="border-t border-gray-100">
      <div className="p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={t('chat.placeholder')}
          disabled={isPending}
          className={`flex-1 text-sm border rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 transition-colors ${
            isOverLimit ? 'border-red-400' : 'border-gray-200'
          }`}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isPending || isOverLimit}
          className="w-9 h-9 bg-red-600 text-white rounded-full flex items-center justify-center hover:bg-red-700 transition disabled:opacity-40 flex-shrink-0 text-sm"
        >
          ➤
        </button>
      </div>
      {count > 0 && (
        <p className={`text-right text-xs px-4 pb-2 transition-colors ${isOverLimit ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
          {count}/{CHAT_WORD_LIMIT}{isOverLimit ? ` — ${t('chat.word_limit')}` : ''}
        </p>
      )}
    </div>
  );
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, sendMessage, isPending, clearChat } = useChat();
  const { t } = useLanguage();

  const [pos, setPos] = useState(loadPos);
  const isDragging = useRef(false);
  const hasDragged = useRef(false);
  const dragOrigin = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    hasDragged.current = false;
    dragOrigin.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: pos.x,
      posY: pos.y,
    };
  }, [pos]);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isDragging.current) return;

      const dx = e.clientX - dragOrigin.current.mouseX;
      const dy = e.clientY - dragOrigin.current.mouseY;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        hasDragged.current = true;
      }

      const newX = Math.max(
        EDGE_MARGIN,
        Math.min(window.innerWidth - BUTTON_SIZE - EDGE_MARGIN, dragOrigin.current.posX - dx)
      );
      const newY = Math.max(
        EDGE_MARGIN,
        Math.min(window.innerHeight - BUTTON_SIZE - EDGE_MARGIN, dragOrigin.current.posY - dy)
      );

      setPos({ x: newX, y: newY });
    };

    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      setPos(current => {
        localStorage.setItem('chatWidgetPos', JSON.stringify(current));
        return current;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const handleClick = () => {
    if (!hasDragged.current) {
      setIsOpen(prev => !prev);
    }
  };

  const panelBottom = pos.y + BUTTON_SIZE + PANEL_GAP;
  const panelRight = pos.x;

  return (
    <>
      <div
        style={{ position: 'fixed', bottom: pos.y, right: pos.x, zIndex: 50 }}
        className="flex flex-col items-end select-none"
      >
        <AnimatePresence>
          {!isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="mb-2 bg-white border border-gray-200 shadow-md rounded-2xl px-3 py-1.5 text-xs font-medium text-gray-700 whitespace-nowrap pointer-events-none"
            >
              {t('chat.bubble')}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative">
          {!isOpen && (
            <span className="absolute inset-0 rounded-full bg-red-500 opacity-30 animate-ping pointer-events-none" />
          )}

          <button
            onMouseDown={handleMouseDown}
            onClick={handleClick}
            className="w-14 h-14 bg-red-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-red-700 transition relative z-10 text-2xl cursor-grab active:cursor-grabbing"
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
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{
              position: 'fixed',
              bottom: panelBottom,
              right: panelRight,
              zIndex: 50,
              width: '24rem',
              height: '520px',
            }}
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-red-600 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="font-semibold text-sm">MAKEIT OR BREAKIT</p>
                <p className="text-xs text-red-200">{t('chat.header.subtitle')}</p>
              </div>
              <div className="flex gap-3 items-center">
                <button
                  onClick={clearChat}
                  className="text-red-200 hover:text-white text-xs transition"
                >
                  {t('chat.clear')}
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
            <ChatInput onSend={sendMessage} isPending={isPending} t={t} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
