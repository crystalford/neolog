'use client'

export const runtime = 'edge'

            return (
              <div
                key={entity.id}
                className={`group relative flex flex-col transition-all duration-300 rounded-2xl border ${
                  isExpanded
                  ? 'col-span-1 md:col-span-2 lg:col-span-3 bg-[var(--bg-secondary)] border-[var(--accent)]/40 shadow-2xl z-10'
                  : 'bg-[var(--bg-card)] border-[var(--border-light)] hover:border-[var(--border-medium)] hover:shadow-lg'
                }`}
              >
                {/* Entity Card Header */}
                <div
                  className={`flex items-center gap-4 p-5 cursor-pointer ${isExpanded ? 'border-b border-[var(--border-light)]' : ''}`}
                  onClick={() => toggleExpand(entity.id)}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    isExpanded ? 'bg-[var(--accent)] text-white' : 'bg-black/40 text-[var(--text-secondary)] group-hover:bg-[var(--accent)] group-hover:text-white'
                  }`}>
                    <config.icon size={18} strokeWidth={1.5} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                      {entity.name}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-tight">
                      <span className={isExpanded ? 'text-[var(--accent)] font-bold' : config.color}>{entity.type}</span>
                      <span>{entity.mention_count} mention{entity.mention_count !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  {entity.type === 'project' && (
                    <Link
                      href={`/dashboard/projects/${entity.slug}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] border border-[var(--border-light)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)] transition-all flex-shrink-0"
                      title="View project document"
                    >
                      <FileText size={9} />
                      Doc
                    </Link>
                  )}

                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-top-2">
                    {/* Left Column */}
                    <div className="space-y-6">
                      <div className="bg-black/20 p-5 rounded-2xl border border-white/5 space-y-4">
                        <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
                          Mentions
                        </h4>
                        <div className="flex items-end justify-between">
                          <span className="text-3xl font-bold">{entity.mention_count}</span>
                          <div className="text-right">
                            <p className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold">First seen</p>
                            <p className="text-xs font-medium">{formatRelativeTime(entity.first_mentioned_at)}</p>
                          </div>
                        </div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]"
                            style={{ width: `${Math.min(100, (entity.mention_count / 20) * 100)}%` }}
                          />
                        </div>
                      </div>

                      {entity.metadata && Object.keys(entity.metadata).length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Details</h4>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(entity.metadata).map(([key, value]) => (
                              <div key={key} className="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col">
                                <span className="text-[8px] uppercase tracking-tighter text-[var(--text-tertiary)]">{key}</span>
                                <span className="text-xs font-medium">{String(value)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Column: Appearances */}
                    <div className="lg:col-span-2 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Appearances</h4>
                        <span className="text-[10px] font-mono text-[var(--accent)]/60">{mentions.length} total</span>
                      </div>

                      {loadingMentions ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                          <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                          <span className="text-[10px] font-mono uppercase tracking-[0.2em]">Loading...</span>
                        </div>
                      ) : mentions.length === 0 ? (
                        <div className="p-12 text-center border border-dashed border-white/5 rounded-3xl">
                          <Clock size={32} className="mx-auto mb-3 opacity-20" />
                          <p className="text-sm text-[var(--text-tertiary)]">No appearances yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 no-scrollbar">
                          {mentions.map((mention) => {
                            const isVideo = mention.source_type === 'video' || !!mention.video_upload_id
                            const title = isVideo
                              ? (mention.video_uploads?.file_name || 'Unknown file')
                              : (mention.log_entries?.title || 'Log entry')

                            return (
                              <div
                                key={mention.id}
                                className="group/item flex gap-5 bg-black/20 p-5 rounded-2xl border border-white/[0.03] hover:border-[var(--accent)]/30 transition-all cursor-default"
                              >
                                <div className="flex flex-col items-center gap-2 pt-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
                                  <div className="w-0.5 flex-1 bg-white/5" />
                                </div>

                                <div className="flex-1 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">
                                      <Calendar size={12} className="text-[var(--accent)]" />
                                      <span>{new Date(mention.created_at).toLocaleDateString()}</span>
                                      <span className="opacity-20">·</span>
                                      <span>{new Date(mention.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    {mention.sentiment && (
                                      <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tighter ${
                                        mention.sentiment === 'positive' ? 'bg-emerald-500/10 text-emerald-400' :
                                        mention.sentiment === 'negative' ? 'bg-red-500/10 text-red-500' :
                                        'bg-white/5 text-[var(--text-tertiary)]'
                                      }`}>
                                        {mention.sentiment}
                                      </div>
                                    )}
                                  </div>

                                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed italic border-l-2 border-white/5 pl-4 py-1">
                                    "{mention.context}"
                                  </p>

                                  <div className="flex items-center justify-between pt-2">
                                    <div className="flex items-center gap-2 text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-tight">
                                      {isVideo ? <Film size={12} /> : <Inbox size={12} />}
                                      {title}
                                    </div>

                                    <Link
                                      href={isVideo ? `/dashboard/uploads` : `/dashboard/log`}
                                      className="text-[10px] font-mono text-[var(--accent)] uppercase font-bold tracking-widest flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                    >
                                      View source <ArrowRight size={12} />
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
