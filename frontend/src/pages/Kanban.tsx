import { useState } from 'react'
import { Columns3, Plus, X, Clock, MessageSquare } from 'lucide-react'
import { cn } from '../lib/utils'

interface Card { id: string; title: string; description: string; priority: 'low' | 'medium' | 'high' | 'urgent'; assigned_name: string; due_date: string | null; tags: string[]; card_order?: number; comments?: Comment[] }
interface Column { id: string; name: string; color: string; cards: Card[] }
interface Comment { id: string; content: string; user_name: string; created_at: string }

const priorityConfig = {
  low: { bg: 'bg-gray-100 dark:bg-gray-500/20', text: 'text-gray-600 dark:text-gray-400', label: 'Baja' },
  medium: { bg: 'bg-blue-100 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', label: 'Media' },
  high: { bg: 'bg-amber-100 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', label: 'Alta' },
  urgent: { bg: 'bg-rose-100 dark:bg-rose-500/20', text: 'text-rose-600 dark:text-rose-400', label: 'Urgente' }
}

export default function Kanban() {
  const [columns, setColumns] = useState<Column[]>([
    { id: '1', name: 'Por Hacer', color: '#6b7280', cards: [] },
    { id: '2', name: 'En Progreso', color: '#3b82f6', cards: [] },
    { id: '3', name: 'Revisión', color: '#f59e0b', cards: [] },
    { id: '4', name: 'Completado', color: '#10b981', cards: [] },
  ])
  const [showModal, setShowModal] = useState(false)
  const [selectedColumn, setSelectedColumn] = useState<string>('')
  const [newCard, setNewCard] = useState({ title: '', description: '', priority: 'medium' as const, assigned_name: '', due_date: '' })

  const addCard = () => {
    if (!newCard.title || !selectedColumn) return
    const card: Card = { id: Date.now().toString(), ...newCard, tags: [] }
    setColumns(cols => cols.map(col => col.id === selectedColumn ? { ...col, cards: [...col.cards, card] } : col))
    setShowModal(false)
    setNewCard({ title: '', description: '', priority: 'medium', assigned_name: '', due_date: '' })
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
              <Columns3 className="w-5 h-5 text-white" />
            </div>
            Kanban
          </h1>
          <p className="text-[var(--text-muted)] mt-1">Gestiona tareas con tableros visuales</p>
        </div>
        <button onClick={() => { setSelectedColumn(columns[0].id); setShowModal(true) }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium shadow-md hover:shadow-lg">
          <Plus className="w-4 h-4" /> Nueva Tarea
        </button>
      </div>

      {/* Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div key={column.id} className="flex-shrink-0 w-80">
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
              <div className="p-4 border-b" style={{ borderColor: column.color + '30' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color }} />
                    <h3 className="font-semibold text-[var(--text-primary)]">{column.name}</h3>
                    <span className="px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-xs text-[var(--text-muted)]">{column.cards.length}</span>
                  </div>
                </div>
              </div>
              <div className="p-2 space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                {column.cards.map((card) => (
                  <div key={card.id} className="bg-[var(--bg-secondary)] rounded-xl p-3 border border-[var(--border-color)] hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-[var(--text-primary)] text-sm">{card.title}</h4>
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium', priorityConfig[card.priority].bg, priorityConfig[card.priority].text)}>
                        {priorityConfig[card.priority].label}
                      </span>
                    </div>
                    {card.description && <p className="text-xs text-[var(--text-muted)] mt-2 line-clamp-2">{card.description}</p>}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-color)]">
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        {card.due_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(card.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>}
                        {card.comments && card.comments.length > 0 && <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{card.comments.length}</span>}
                      </div>
                      {card.assigned_name && (
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-white text-[10px] font-bold">
                          {card.assigned_name.split(' ').map((n: string) => n[0]).join('')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <button onClick={() => { setSelectedColumn(column.id); setShowModal(true) }} className="w-full p-3 rounded-xl border-2 border-dashed border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-teal-400/50 transition-colors flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> Agregar tarjeta
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Card Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-md border border-[var(--border-color)] shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Nueva Tarea</h2>
              <button onClick={() => setShowModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Título *</label>
                <input type="text" value={newCard.title} onChange={e => setNewCard({...newCard, title: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500" placeholder="Nombre de la tarea" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Descripción</label>
                <textarea value={newCard.description} onChange={e => setNewCard({...newCard, description: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] h-24 resize-none focus:outline-none focus:border-teal-500" placeholder="Describe la tarea..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Prioridad</label>
                  <select value={newCard.priority} onChange={e => setNewCard({...newCard, priority: e.target.value as any})} className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500">
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Fecha límite</label>
                  <input type="date" value={newCard.due_date} onChange={e => setNewCard({...newCard, due_date: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Asignar a</label>
                <input type="text" value={newCard.assigned_name} onChange={e => setNewCard({...newCard, assigned_name: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500" placeholder="Nombre del asignado" />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] font-medium hover:bg-[var(--bg-hover)]">Cancelar</button>
                <button onClick={addCard} disabled={!newCard.title} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium shadow-md disabled:opacity-50">Crear Tarea</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
