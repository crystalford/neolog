'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Plus, Hash } from 'lucide-react'

interface Tag {
  id: string
  name: string
  slug: string
  color: string
  post_count?: number
}

interface TagSelectProps {
  selectedTags: string[]
  onChange: (tags: string[]) => void
  maxTags?: number
}

export function TagSelect({ selectedTags, onChange, maxTags = 5 }: TagSelectProps) {
  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  
  const supabase = createClient()

  useEffect(() => {
    loadTags()
  }, [])

  const loadTags = async () => {
    const { data } = await supabase
      .from('tags')
      .select('*')
      .order('post_count', { ascending: false })
      .limit(50)
    
    if (data) {
      setAvailableTags(data)
    }
    setLoading(false)
  }

  const filteredTags = availableTags.filter(tag => 
    tag.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    !selectedTags.includes(tag.name)
  )

  const addTag = (tagName: string) => {
    if (selectedTags.length < maxTags && !selectedTags.includes(tagName)) {
      onChange([...selectedTags, tagName])
    }
    setSearchTerm('')
    setIsOpen(false)
  }

  const removeTag = (tagName: string) => {
    onChange(selectedTags.filter(t => t !== tagName))
  }

  const createTag = async () => {
    if (!searchTerm.trim() || selectedTags.length >= maxTags) return
    
    const newTagName = searchTerm.trim()
    
    // Check if tag already exists
    const existing = availableTags.find(t => 
      t.name.toLowerCase() === newTagName.toLowerCase()
    )
    
    if (existing) {
      addTag(existing.name)
      return
    }

    // Create new tag
    const slug = newTagName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const { data } = await supabase
      .from('tags')
      .insert({ name: newTagName, slug })
      .select()
      .single()

    if (data) {
      setAvailableTags([...availableTags, data])
      addTag(newTagName)
    }
  }

  return (
    <div className="relative">
      {/* Selected tags */}
      <div className="flex flex-wrap gap-2 mb-2">
        {selectedTags.map(tag => (
          <span 
            key={tag}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-sm"
          >
            <Hash size={12} />
            {tag}
            <button 
              onClick={() => removeTag(tag)}
              className="ml-1 hover:text-[var(--accent-hover)]"
              aria-label={`Remove ${tag}`}
            >
              <X size={14} />
            </button>
          </span>
        ))}
      </div>

      {/* Input */}
      {selectedTags.length < maxTags && (
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={`Add tags (${selectedTags.length}/${maxTags})`}
            className="w-full input"
            aria-label="Add tags"
          />

          {/* Dropdown */}
          {isOpen && (searchTerm || filteredTags.length > 0) && (
            <div className="absolute z-10 w-full mt-1 bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filteredTags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => addTag(tag.name)}
                  className="w-full px-4 py-2 text-left hover:bg-[var(--bg-secondary)] flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Hash size={14} className="text-[var(--text-tertiary)]" />
                    {tag.name}
                  </span>
                  <span className="text-[var(--text-tertiary)] text-xs">
                    {tag.post_count} posts
                  </span>
                </button>
              ))}
              
              {searchTerm && !filteredTags.find(t => t.name.toLowerCase() === searchTerm.toLowerCase()) && (
                <button
                  onClick={createTag}
                  className="w-full px-4 py-2 text-left hover:bg-[var(--bg-secondary)] flex items-center gap-2 text-[var(--accent)]"
                >
                  <Plus size={14} />
                  Create "{searchTerm}"
                </button>
              )}

              {!searchTerm && filteredTags.length === 0 && !loading && (
                <div className="px-4 py-2 text-[var(--text-tertiary)] text-sm">
                  No tags available
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}

// Display-only tag pills
export function TagPills({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map(tag => (
        <a
          key={tag}
          href={`/tag/${tag.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-xs hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          <Hash size={10} />
          {tag}
        </a>
      ))}
    </div>
  )
}
