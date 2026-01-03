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
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  
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
  }

  const filteredTags = availableTags.filter(tag => 
    tag.name.toLowerCase().includes(search.toLowerCase()) &&
    !selectedTags.includes(tag.name)
  )

  const addTag = (tagName: string) => {
    if (selectedTags.length >= maxTags) return
    if (!selectedTags.includes(tagName)) {
      onChange([...selectedTags, tagName])
    }
    setSearch('')
    setShowDropdown(false)
  }

  const removeTag = (tagName: string) => {
    onChange(selectedTags.filter(t => t !== tagName))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && search.trim()) {
      e.preventDefault()
      addTag(search.trim())
    }
    if (e.key === 'Backspace' && !search && selectedTags.length > 0) {
      removeTag(selectedTags[selectedTags.length - 1])
    }
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium mb-2">
        Tags
        <span className="text-[var(--text-tertiary)] font-normal ml-2">
          ({selectedTags.length}/{maxTags})
        </span>
      </label>
      
      {/* Selected tags */}
      <div className="flex flex-wrap gap-2 mb-2">
        {selectedTags.map(tag => {
          const tagData = availableTags.find(t => t.name === tag)
          return (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm"
              style={{
                backgroundColor: `${tagData?.color || '#6b7280'}15`,
                color: tagData?.color || '#6b7280',
              }}
            >
              <Hash size={12} />
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="hover:opacity-70 transition-opacity"
              >
                <X size={14} />
              </button>
            </span>
          )
        })}
      </div>

      {/* Input */}
      {selectedTags.length < maxTags && (
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setShowDropdown(true)
            }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={handleKeyDown}
            placeholder="Add a tag..."
            className="input"
          />
          
          {/* Dropdown */}
          {showDropdown && (search || filteredTags.length > 0) && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowDropdown(false)} 
              />
              <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                {search && !availableTags.find(t => t.name.toLowerCase() === search.toLowerCase()) && (
                  <button
                    onClick={() => addTag(search.trim())}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--bg-secondary)] transition-colors text-left"
                  >
                    <Plus size={14} />
                    Create "{search}"
                  </button>
                )}
                
                {filteredTags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => addTag(tag.name)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--bg-secondary)] transition-colors text-left"
                  >
                    <Hash size={14} style={{ color: tag.color }} />
                    {tag.name}
                    <span className="text-[var(--text-tertiary)] text-xs ml-auto">
                      {tag.post_count} posts
                    </span>
                  </button>
                ))}
                
                {filteredTags.length === 0 && !search && (
                  <p className="px-3 py-2 text-sm text-[var(--text-tertiary)]">
                    Type to search or create tags
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Display-only tag pills
export function TagPills({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null
  
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map(tag => (
        <a
          key={tag}
          href={`/tag/${tag.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          <Hash size={10} />
          {tag}
        </a>
      ))}
    </div>
  )
}
