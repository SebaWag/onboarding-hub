import { Play, Loader2, CheckCircle2, Reply, Trash2, Send, MessageSquare } from 'lucide-react'
import { cn } from '../../lib/utils'
import { formatTime, type VideoComment } from './video-types'

interface CommentsSectionProps {
  onReplySubmit: (parentId: string) => void | Promise<void>
  comments: VideoComment[]
  loadingComments: boolean
  seekTo: (seconds: number) => void
  replyingTo: string | null
  setReplyingTo: (id: string | null) => void
  replyInput: string
  setReplyInput: (v: string) => void
  onResolveComment: (id: string, resolved: boolean) => void
  onDeleteComment: (id: string) => void
  commentInput: string
  setCommentInput: (v: string) => void
  commentTimestamp: boolean
  setCommentTimestamp: (v: boolean) => void
  currentTime: number
  onSubmitComment: (e: React.FormEvent) => void
}

/** Lista de notas/comentarios con respuestas y formulario. */
export default function CommentsSection({
  comments, loadingComments, seekTo, replyingTo, setReplyingTo,
  replyInput, setReplyInput,
  onResolveComment: handleResolveComment,
  onDeleteComment: handleDeleteComment,
  commentInput, setCommentInput, commentTimestamp, setCommentTimestamp,
  currentTime,
  onSubmitComment: handleCommentSubmit,
  onReplySubmit: handleReplySubmit,
}: CommentsSectionProps) {
  return (
    <>
          <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingComments ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-6 h-6 text-teal-500 animate-spin mx-auto" />
                  </div>
                ) : comments.length > 0 ? (
                  comments.filter(c => !c.parent_id).map((comment) => {
                    const replies = comments.filter(c => c.parent_id === comment.id)
                    return (
                      <div key={comment.id} className={cn('rounded-xl p-3 border', comment.is_resolved ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/[0.02] border-white/5')}>
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {(comment.user_name || 'U')[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white">{comment.user_name || 'Usuario'}</span>
                              {comment.timestamp_seconds !== null && (
                                <button
                                  onClick={() => seekTo(comment.timestamp_seconds!)}
                                  className="flex items-center gap-1 text-xs text-teal-500 hover:text-violet-300"
                                >
                                  <Play className="w-3 h-3" />{formatTime(comment.timestamp_seconds)}
                                </button>
                              )}
                              {comment.is_resolved && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                            </div>
                            <p className="text-sm text-surface-300 mt-1">{comment.content}</p>
                            <div className="flex items-center gap-3 mt-2">
                              <button onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)} className="text-xs text-surface-500 hover:text-white flex items-center gap-1">
                                <Reply className="w-3 h-3" />Responder
                              </button>
                              <button onClick={() => handleResolveComment(comment.id, !comment.is_resolved)} className="text-xs text-surface-500 hover:text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />{comment.is_resolved ? 'Reabrir' : 'Resolver'}
                              </button>
                              <button onClick={() => handleDeleteComment(comment.id)} className="text-xs text-surface-500 hover:text-rose-400 flex items-center gap-1">
                                <Trash2 className="w-3 h-3" />
                              </button>
                              <span className="text-[10px] text-surface-600 ml-auto">
                                {new Date(comment.created_at).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            {/* Replies */}
                            {replies.length > 0 && (
                              <div className="mt-3 ml-2 pl-3 border-l border-white/10 space-y-3">
                                {replies.map(reply => (
                                  <div key={reply.id} className="flex items-start gap-2">
                                    <div className="w-6 h-6 rounded-md bg-surface-700 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                      {(reply.user_name || 'U')[0].toUpperCase()}
                                    </div>
                                    <div>
                                      <span className="text-xs font-medium text-white">{reply.user_name || 'Usuario'}</span>
                                      <p className="text-xs text-surface-300 mt-0.5">{reply.content}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Reply input */}
                            {replyingTo === comment.id && (
                              <div className="mt-3 flex gap-2">
                                <input
                                  type="text"
                                  value={replyInput}
                                  onChange={(e) => setReplyInput(e.target.value)}
                                  placeholder="Escribe una respuesta..."
                                  className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/8 text-white text-xs placeholder-surface-500 focus:outline-none focus:border-teal-400/50"
                                  autoFocus
                                  onKeyDown={(e) => e.key === 'Enter' && handleReplySubmit(comment.id)}
                                />
                                <button onClick={() => handleReplySubmit(comment.id)} className="p-1.5 rounded-lg bg-violet-500 text-white">
                                  <Send className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-12">
                    <MessageSquare className="w-10 h-10 text-surface-600 mx-auto mb-3" />
                    <p className="text-surface-400 text-sm">No hay notas aún</p>
                    <p className="text-surface-500 text-xs mt-1">Agrega notas en momentos clave del video</p>
                  </div>
                )}
              </div>

              {/* Comment input */}
              <div className="p-4 border-t border-white/5">
                <form onSubmit={handleCommentSubmit} className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      placeholder="Agregar una nota..."
                      className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/8 text-white text-sm placeholder-surface-500 focus:outline-none focus:border-teal-400/50"
                    />
                    <button
                      type="submit"
                      disabled={!commentInput.trim()}
                      className={cn('p-2.5 rounded-xl transition-all', commentInput.trim() ? 'bg-violet-500 text-white' : 'bg-white/5 text-surface-500')}
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-surface-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={commentTimestamp}
                      onChange={(e) => setCommentTimestamp(e.target.checked)}
                      className="rounded border-surface-600 bg-surface-800 text-violet-500 focus:ring-teal-500"
                    />
                    Vincular al momento actual ({formatTime(currentTime)})
                  </label>
                </form>
              </div>
            </>
    </>
  )
}
