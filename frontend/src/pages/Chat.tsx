import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Bot, User, Loader2, Copy, ThumbsUp, ThumbsDown, Maximize2, Minimize2, Plus, MessageSquare } from 'lucide-react'
import { cn } from '../lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isLoading?: boolean
}

interface Conversation {
  id: string
  title: string
  context: string
  created_at: string
  message_count: number
}

const getToken = () => localStorage.getItem('auth_token')

const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = getToken()
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  })
  return res.json()
}

const welcomeMessage: Message = {
  id: 'welcome',
  role: 'assistant',
  content: '# ¡Hola! Soy MiMo\n\nTu asistente de onboarding impulsado por IA. Estoy aquí para ayudarte a:\n\n- **Responder preguntas** sobre tus programas de onboarding\n- **Analizar contenido** de capacitación\n- **Generar ideas** para módulos y tutoriales\n- **Resolver dudas** sobre procesos de la empresa\n\n¿En qué puedo ayudarte hoy?',
  timestamp: new Date(),
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [showSidebar, setShowSidebar] = useState(true)
  const [loadingConversations, setLoadingConversations] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }
  useEffect(() => { scrollToBottom() }, [messages])

  // Load conversations
  useEffect(() => {
    fetchConversations()
  }, [])

  const fetchConversations = async () => {
    setLoadingConversations(true)
    try {
      const res = await apiFetch('/api/chat/conversations')
      if (res.success) {
        setConversations(res.data || [])
      }
    } catch (err) {
      console.error('Error loading conversations:', err)
    } finally {
      setLoadingConversations(false)
    }
  }

  const loadConversation = async (convId: string) => {
    try {
      const res = await apiFetch(`/api/chat/conversations/${convId}/messages`)
      if (res.success && res.data) {
        const loaded: Message[] = res.data.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at),
        }))
        setMessages(loaded.length > 0 ? loaded : [welcomeMessage])
        setConversationId(convId)
      }
    } catch (err) {
      console.error('Error loading conversation:', err)
    }
  }

  const startNewConversation = () => {
    setConversationId(null)
    setMessages([welcomeMessage])
    setCopiedId(null)
  }

  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMessage])

    const loadingMsg: Message = {
      id: 'loading',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    }
    setMessages(prev => [...prev, loadingMsg])

    const messageText = input.trim()
    setInput('')
    setIsLoading(true)

    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: messageText,
          conversation_id: conversationId,
        }),
      })

      setMessages(prev => prev.filter(m => m.id !== 'loading'))

      if (res.success) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: res.data.message,
          timestamp: new Date(),
        }
        setMessages(prev => [...prev, assistantMessage])

        if (res.data.conversation_id && !conversationId) {
          setConversationId(res.data.conversation_id)
          fetchConversations()
        }
      } else {
        throw new Error(res.error)
      }
    } catch (err: any) {
      setMessages(prev => prev.filter(m => m.id !== 'loading'))
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${err.message}. Verifica que la API de MiMo esté configurada correctamente.`,
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const formatTime = (date: Date) => date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={cn('animate-fade-in transition-all duration-300', isExpanded ? 'fixed inset-0 z-50 bg-surface-950 p-6' : '')}>
      <div className={cn('flex gap-4', isExpanded ? 'h-full' : 'h-[calc(100vh-180px)]')}>

        {/* Sidebar - Conversations */}
        {showSidebar && (
          <div className="w-64 glass rounded-2xl overflow-hidden noise-overlay flex flex-col shrink-0">
            <div className="p-3 border-b border-white/5">
              <button
                onClick={startNewConversation}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-teal-50 text-teal-500 text-sm font-medium hover:bg-violet-500/30 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nueva conversación
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loadingConversations ? (
                <div className="text-center py-4">
                  <Loader2 className="w-5 h-5 text-surface-500 animate-spin mx-auto" />
                </div>
              ) : conversations.length > 0 ? (
                conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 rounded-xl transition-colors text-sm',
                      conversationId === conv.id ? 'bg-violet-500/10 text-teal-500' : 'text-surface-400 hover:bg-white/5 hover:text-white'
                    )}
                  >
                    <p className="truncate font-medium">{conv.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-surface-500 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />{conv.message_count}
                      </span>
                      <span className="text-[10px] text-surface-600">
                        {new Date(conv.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-center text-xs text-surface-500 py-4">Sin conversaciones</p>
              )}
            </div>
          </div>
        )}

        {/* Main chat */}
        <div className="flex-1 glass rounded-2xl overflow-hidden noise-overlay flex flex-col">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors lg:hidden">
                <MessageSquare className="w-4 h-4" />
              </button>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-glow">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-white">MiMo AI</h2>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs text-surface-400">En línea • mimo-v2-omni</span>
                </div>
              </div>
            </div>
            <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors">
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={cn('flex gap-3 animate-slide-up', message.role === 'user' ? 'flex-row-reverse' : '')}>
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                  message.role === 'user' ? 'bg-gradient-to-br from-emerald-500 to-teal-500' : 'bg-gradient-to-br from-teal-500 to-cyan-500'
                )}>
                  {message.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
                </div>
                <div className={cn(
                  'max-w-[80%] rounded-2xl p-4',
                  message.role === 'user' ? 'bg-violet-500/10 border border-violet-500/20' : 'bg-white/[0.03] border border-white/5'
                )}>
                  {message.isLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-teal-500 animate-spin" />
                      <span className="text-sm text-surface-400">MiMo está pensando...</span>
                    </div>
                  ) : (
                    <>
                      <div className="prose prose-invert prose-sm max-w-none">
                        <div dangerouslySetInnerHTML={{
                          __html: message.content
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n\n/g, '<br/><br/>')
                            .replace(/## (.*?)\n/g, '<h3 class="text-white font-semibold mt-4 mb-2">$1</h3>')
                            .replace(/# (.*?)\n/g, '<h2 class="text-white font-bold text-lg mt-2 mb-3">$1</h2>')
                            .replace(/- (.*?)(?=\n|$)/g, '<li class="ml-4">$1</li>')
                            .replace(/\n/g, '<br/>')
                        }} />
                      </div>
                      {message.role === 'assistant' && message.id !== 'welcome' && (
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                          <button
                            onClick={() => copyToClipboard(message.content, message.id)}
                            className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-white/10 transition-colors"
                            title="Copiar"
                          >
                            {copiedId === message.id ? <span className="text-xs text-emerald-400">Copiado</span> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button className="p-1.5 rounded-lg text-surface-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button className="p-1.5 rounded-lg text-surface-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                          <span className="ml-auto text-[10px] text-surface-500">{formatTime(message.timestamp)}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-white/5">
            <form onSubmit={handleSubmit} className="flex items-end gap-3">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribe tu mensaje..."
                  rows={1}
                  className="w-full px-4 py-3 pr-12 rounded-xl bg-white/[0.03] border border-white/8 text-white placeholder-surface-500 resize-none focus:outline-none focus:border-teal-400/50 transition-all"
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                  disabled={isLoading}
                />
              </div>
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className={cn(
                  'p-3 rounded-xl transition-all',
                  input.trim() && !isLoading ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-glow' : 'bg-white/5 text-surface-500 cursor-not-allowed'
                )}
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
            <p className="text-[10px] text-surface-500 mt-2 text-center">MiMo v2 Omni • Las respuestas pueden contener errores</p>
          </div>
        </div>
      </div>
    </div>
  )
}
