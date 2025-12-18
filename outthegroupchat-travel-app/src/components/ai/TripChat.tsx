'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: SuggestedAction[];
  error?: boolean;
}

interface SuggestedAction {
  type: 'add_activity' | 'invite_member' | 'start_survey' | 'view_destination' | 'view_itinerary';
  label: string;
  payload?: Record<string, unknown>;
}

interface TripContext {
  tripId: string;
  tripTitle: string;
  destination: string;
  startDate: string;
  endDate: string;
  memberCount: number;
  budget?: number;
}

interface TripChatProps {
  tripContext?: TripContext;
  onAction?: (action: SuggestedAction) => void;
  className?: string;
}

// Storage key for chat history
const CHAT_STORAGE_KEY = 'otg_chat_history';

export function TripChat({ tripContext, onAction, className = '' }: TripChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [retryMessage, setRetryMessage] = useState<Message | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load chat history from storage
  useEffect(() => {
    if (typeof window !== 'undefined' && tripContext?.tripId) {
      const stored = localStorage.getItem(`${CHAT_STORAGE_KEY}_${tripContext.tripId}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setMessages(parsed.map((m: Message) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          })));
        } catch (e) {
          console.error('Failed to parse chat history:', e);
        }
      }
    }
  }, [tripContext?.tripId]);

  // Save chat history
  useEffect(() => {
    if (typeof window !== 'undefined' && tripContext?.tripId && messages.length > 1) {
      // Only save last 50 messages
      const toSave = messages.slice(-50);
      localStorage.setItem(
        `${CHAT_STORAGE_KEY}_${tripContext.tripId}`,
        JSON.stringify(toSave)
      );
    }
  }, [messages, tripContext?.tripId]);

  // Welcome message
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeContent = tripContext
        ? `Hey! I'm your AI trip assistant for **${tripContext.destination}**! 🌍

I can help you with:
• Local attractions & hidden gems
• Restaurant recommendations  
• Day-by-day itinerary planning
• Budget tips & cost optimization
• Weather & packing suggestions

What would you like to know about your trip?`
        : `Hey! I'm your AI travel assistant! ✈️

I'm here to help you plan amazing group trips. Ask me about:
• Destination recommendations
• Best places for group trips
• Budget planning tips
• Activity ideas for groups
• Travel logistics

Where are you thinking of going?`;

      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: welcomeContent,
        timestamp: new Date(),
      }]);
    }
  }, [tripContext, messages.length]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus();
    }
  }, [isOpen, isMinimized]);

  const sendMessage = useCallback(async (messageContent: string, isRetry = false) => {
    if (!messageContent.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageContent.trim(),
      timestamp: new Date(),
    };

    if (!isRetry) {
      setMessages(prev => [...prev, userMessage]);
      setInput('');
    }
    
    setIsLoading(true);
    setRetryMessage(null);

    const assistantMessageId = `assistant-${Date.now()}`;

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages.filter(m => !m.error), userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          tripContext,
        }),
      });

      // Handle rate limiting
      if (response.status === 429) {
        const errorMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: "I'm receiving too many messages right now. Please wait a moment and try again! 🙏",
          timestamp: new Date(),
          error: true,
        };
        setMessages(prev => [...prev, errorMessage]);
        setRetryMessage(userMessage);
        return;
      }

      if (!response.ok) {
        // Try to get error message from response
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to get response');
        }
        throw new Error('Failed to get response');
      }

      // Check if response is actually a stream
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        // API returned JSON instead of stream - likely an error
        const errorData = await response.json();
        throw new Error(errorData.error || 'Unexpected response format');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      // Add placeholder message
      setMessages(prev => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          assistantContent += chunk;

          // Update message with streaming content
          setMessages(prev => prev.map(m =>
            m.id === assistantMessageId
              ? { ...m, content: assistantContent }
              : m
          ));
        }
      }

      // Extract any action suggestions from the response
      const suggestedActions = extractActions(assistantContent, tripContext);
      if (suggestedActions.length > 0) {
        setMessages(prev => prev.map(m =>
          m.id === assistantMessageId
            ? { ...m, actions: suggestedActions }
            : m
        ));
      }

    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: "Sorry, I encountered an error. Please try again! 😅",
        timestamp: new Date(),
        error: true,
      };
      setMessages(prev => [...prev, errorMessage]);
      setRetryMessage(userMessage);
    } finally {
      setIsLoading(false);
    }
  }, [messages, tripContext, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
  };

  const handleRetry = () => {
    if (retryMessage) {
      // Remove the error message
      setMessages(prev => prev.filter(m => !m.error));
      sendMessage(retryMessage.content, true);
    }
  };

  const clearHistory = () => {
    if (tripContext?.tripId) {
      localStorage.removeItem(`${CHAT_STORAGE_KEY}_${tripContext.tripId}`);
    }
    setMessages([]);
  };

  const quickPrompts = tripContext
    ? [
        { text: "Must-see attractions", icon: "🎯" },
        { text: "Best local restaurants", icon: "🍽️" },
        { text: "Create a day itinerary", icon: "📋" },
        { text: "Budget tips", icon: "💰" },
      ]
    : [
        { text: "Best bachelor party destinations", icon: "🎉" },
        { text: "Budget-friendly group trips", icon: "💵" },
        { text: "Beach getaway suggestions", icon: "🏖️" },
        { text: "Adventure trip ideas", icon: "🏔️" },
      ];

  return (
    <>
      {/* Floating Chat Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg hover:shadow-xl flex items-center justify-center ${className}`}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label={isOpen ? 'Close chat' : 'Open AI assistant'}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.svg
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </motion.svg>
          ) : (
            <motion.div
              key="chat"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="relative"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              {/* AI Badge */}
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-emerald-500" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              height: isMinimized ? 56 : 512,
            }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3 flex items-center gap-3 flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-xl">🤖</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white">Trip Assistant</h3>
                <p className="text-xs text-emerald-100 truncate">
                  {tripContext ? tripContext.destination : 'AI-powered travel help'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                  aria-label={isMinimized ? 'Expand' : 'Minimize'}
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isMinimized ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                  </svg>
                </button>
                <button
                  onClick={clearHistory}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                  aria-label="Clear chat"
                  title="Clear chat history"
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Chat Content */}
            {!isMinimized && (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                          message.role === 'user'
                            ? 'bg-emerald-500 text-white rounded-br-sm'
                            : message.error
                            ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-bl-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm'
                        }`}
                      >
                        {/* Message Content */}
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          {message.content.split('\n').map((line, i) => (
                            <p key={i} className="mb-1 last:mb-0 text-sm leading-relaxed">
                              {line.split('**').map((part, j) =>
                                j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                              )}
                            </p>
                          ))}
                        </div>

                        {/* Suggested Actions */}
                        {message.actions && message.actions.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {message.actions.map((action, i) => (
                              <motion.button
                                key={i}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => onAction?.(action)}
                                className="text-xs bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-full hover:bg-emerald-500/30 transition-colors font-medium"
                              >
                                {action.label}
                              </motion.button>
                            ))}
                          </div>
                        )}

                        {/* Retry Button */}
                        {message.error && retryMessage && (
                          <button
                            onClick={handleRetry}
                            className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            Retry message →
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}

                  {/* Loading Indicator */}
                  {isLoading && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex justify-start"
                    >
                      <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3">
                        <div className="flex gap-1">
                          <motion.span
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                            className="w-2 h-2 bg-emerald-500 rounded-full"
                          />
                          <motion.span
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                            className="w-2 h-2 bg-emerald-500 rounded-full"
                          />
                          <motion.span
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                            className="w-2 h-2 bg-emerald-500 rounded-full"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Quick Prompts */}
                {messages.length <= 1 && (
                  <div className="px-4 pb-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Quick questions:</p>
                    <div className="flex flex-wrap gap-2">
                      {quickPrompts.map((prompt, i) => (
                        <motion.button
                          key={i}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => sendMessage(prompt.text)}
                          className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors flex items-center gap-1"
                        >
                          <span>{prompt.icon}</span>
                          <span>{prompt.text}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input */}
                <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
                  <div className="flex gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={tripContext ? `Ask about ${tripContext.destination}...` : 'Ask me anything about travel...'}
                      className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      disabled={isLoading}
                    />
                    <motion.button
                      type="submit"
                      disabled={!input.trim() || isLoading}
                      className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </motion.button>
                  </div>
                </form>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Helper function to extract suggested actions from AI response
function extractActions(content: string, tripContext?: TripContext): SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  const lowerContent = content.toLowerCase();

  // Detect intent and suggest relevant actions
  if (lowerContent.includes('itinerary') || lowerContent.includes('schedule') || lowerContent.includes('day ')) {
    actions.push({
      type: 'view_itinerary',
      label: '📋 View Itinerary',
      payload: { tripId: tripContext?.tripId },
    });
  }

  if (lowerContent.includes('restaurant') || lowerContent.includes('food') || lowerContent.includes('eat')) {
    actions.push({
      type: 'add_activity',
      label: '🍽️ Add Restaurant',
      payload: { category: 'FOOD' },
    });
  }

  if (lowerContent.includes('activity') || lowerContent.includes('attraction') || lowerContent.includes('visit')) {
    actions.push({
      type: 'add_activity',
      label: '➕ Add Activity',
      payload: {},
    });
  }

  if (lowerContent.includes('survey') || lowerContent.includes('preferences') || lowerContent.includes('vote')) {
    actions.push({
      type: 'start_survey',
      label: '📊 Start Survey',
      payload: { tripId: tripContext?.tripId },
    });
  }

  // Limit to 3 actions
  return actions.slice(0, 3);
}

export default TripChat;
