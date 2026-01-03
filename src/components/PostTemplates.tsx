'use client'

import { useState } from 'react'
import {
  FileText, Code, BookOpen, Newspaper, MessageSquare,
  Lightbulb, List, TrendingUp, Sparkles, Check
} from 'lucide-react'

interface Template {
  id: string
  name: string
  description: string
  icon: any
  color: string
  content: string
  category: string
}

interface PostTemplatesProps {
  onSelect: (content: string) => void
  onClose: () => void
}

export function PostTemplates({ onSelect, onClose }: PostTemplatesProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const templates: Template[] = [
    {
      id: 'tutorial',
      name: 'Technical Tutorial',
      description: 'Step-by-step guide with code examples',
      icon: Code,
      color: 'text-blue-500',
      category: 'technical',
      content: `
<h1>How to [Title]</h1>

<h2>Introduction</h2>
<p>Brief overview of what you'll learn and why it matters.</p>

<h2>Prerequisites</h2>
<ul>
  <li>Required knowledge or tools</li>
  <li>Recommended reading</li>
</ul>

<h2>Step 1: [First Step]</h2>
<p>Explanation of the first step...</p>
<pre><code>// Code example
function example() {
  return "Hello World"
}
</code></pre>

<h2>Step 2: [Second Step]</h2>
<p>Continue with subsequent steps...</p>

<h2>Conclusion</h2>
<p>Recap what was learned and next steps.</p>
      `.trim(),
    },
    {
      id: 'essay',
      name: 'Long-Form Essay',
      description: 'Thoughtful exploration of an idea',
      icon: FileText,
      color: 'text-purple-500',
      category: 'writing',
      content: `
<h1>[Your Compelling Title]</h1>

<p><em>Opening hook that draws readers in...</em></p>

<h2>The Problem</h2>
<p>Describe the issue or question you're exploring...</p>

<h2>Historical Context</h2>
<p>Provide background and context...</p>

<h2>Current Perspectives</h2>
<p>Discuss different viewpoints...</p>

<h2>My Take</h2>
<p>Share your unique perspective and insights...</p>

<h2>Implications</h2>
<p>What does this mean for the future?</p>

<h2>Conclusion</h2>
<p>Bring it all together with a memorable ending...</p>
      `.trim(),
    },
    {
      id: 'announcement',
      name: 'Product Announcement',
      description: 'Launch or update announcement',
      icon: Sparkles,
      color: 'text-orange-500',
      category: 'business',
      content: `
<h1>Introducing [Product Name]</h1>

<p><strong>TL;DR:</strong> Brief summary of what's new and why it matters.</p>

<h2>The Problem</h2>
<p>Describe the pain point this solves...</p>

<h2>The Solution</h2>
<p>How your product addresses the problem...</p>

<h2>Key Features</h2>
<ul>
  <li><strong>Feature 1:</strong> Description</li>
  <li><strong>Feature 2:</strong> Description</li>
  <li><strong>Feature 3:</strong> Description</li>
</ul>

<h2>How It Works</h2>
<p>Brief walkthrough...</p>

<h2>Get Started</h2>
<p>Call to action with links...</p>
      `.trim(),
    },
    {
      id: 'listicle',
      name: 'List Article',
      description: 'Numbered or bulleted list post',
      icon: List,
      color: 'text-green-500',
      category: 'writing',
      content: `
<h1>[Number] [Things] Every [Audience] Should Know</h1>

<p>Introduction explaining why this list matters...</p>

<h2>1. [First Item Title]</h2>
<p>Detailed explanation of the first point...</p>

<h2>2. [Second Item Title]</h2>
<p>Continue with each point...</p>

<h2>3. [Third Item Title]</h2>
<p>Keep the momentum going...</p>

<h2>Conclusion</h2>
<p>Tie it all together and provide next steps...</p>
      `.trim(),
    },
    {
      id: 'case-study',
      name: 'Case Study',
      description: 'Real-world example and analysis',
      icon: TrendingUp,
      color: 'text-pink-500',
      category: 'business',
      content: `
<h1>How [Company] Achieved [Result]</h1>

<h2>Overview</h2>
<ul>
  <li><strong>Company:</strong> [Name]</li>
  <li><strong>Challenge:</strong> [Problem]</li>
  <li><strong>Result:</strong> [Outcome]</li>
</ul>

<h2>Background</h2>
<p>Context about the company and situation...</p>

<h2>The Challenge</h2>
<p>Detailed description of the problem...</p>

<h2>The Solution</h2>
<p>What they did to solve it...</p>

<h2>Results</h2>
<ul>
  <li>Metric 1: [X% improvement]</li>
  <li>Metric 2: [Y increase]</li>
</ul>

<h2>Key Takeaways</h2>
<p>Lessons learned...</p>
      `.trim(),
    },
    {
      id: 'interview',
      name: 'Interview Q&A',
      description: 'Question and answer format',
      icon: MessageSquare,
      color: 'text-cyan-500',
      category: 'writing',
      content: `
<h1>Interview with [Name]</h1>

<p><em>Introduction to the interviewee and why they're interesting...</em></p>

<h2>Can you tell us about yourself?</h2>
<p><strong>[Name]:</strong> Response...</p>

<h2>[Question 2]</h2>
<p><strong>[Name]:</strong> Response...</p>

<h2>[Question 3]</h2>
<p><strong>[Name]:</strong> Response...</p>

<h2>What advice would you give to [audience]?</h2>
<p><strong>[Name]:</strong> Final thoughts...</p>

<p><em>Where to find [Name]: [Links]</em></p>
      `.trim(),
    },
    {
      id: 'review',
      name: 'Product Review',
      description: 'In-depth product or service review',
      icon: BookOpen,
      color: 'text-yellow-500',
      category: 'review',
      content: `
<h1>[Product Name] Review</h1>

<p><strong>Rating:</strong> ⭐⭐⭐⭐☆ (4/5)</p>

<h2>Overview</h2>
<p>Quick summary of what this product is and who it's for...</p>

<h2>What I Liked</h2>
<ul>
  <li>Positive point 1</li>
  <li>Positive point 2</li>
  <li>Positive point 3</li>
</ul>

<h2>What Could Be Better</h2>
<ul>
  <li>Criticism 1</li>
  <li>Criticism 2</li>
</ul>

<h2>Who Should Buy This</h2>
<p>Recommendations for ideal users...</p>

<h2>Final Verdict</h2>
<p>Overall assessment and recommendation...</p>
      `.trim(),
    },
    {
      id: 'thought-leadership',
      name: 'Thought Leadership',
      description: 'Opinion piece on industry trends',
      icon: Lightbulb,
      color: 'text-amber-500',
      category: 'business',
      content: `
<h1>The Future of [Topic]</h1>

<p><em>Bold opening statement or prediction...</em></p>

<h2>Where We Are Today</h2>
<p>Current state of affairs...</p>

<h2>Why Change Is Inevitable</h2>
<p>Forces driving transformation...</p>

<h2>What's Coming Next</h2>
<p>Your predictions and insights...</p>

<h2>How to Prepare</h2>
<p>Actionable advice for readers...</p>

<h2>Conclusion</h2>
<p>Final thoughts and call to action...</p>
      `.trim(),
    },
    {
      id: 'news',
      name: 'News Article',
      description: 'Breaking news or industry update',
      icon: Newspaper,
      color: 'text-red-500',
      category: 'news',
      content: `
<h1>[Headline]: [What Happened]</h1>

<p><strong>TL;DR:</strong> One sentence summary of the news.</p>

<h2>What Happened</h2>
<p>Core facts of the story...</p>

<h2>Background</h2>
<p>Context needed to understand the significance...</p>

<h2>Why It Matters</h2>
<p>Impact and implications...</p>

<h2>What's Next</h2>
<p>Expected developments...</p>

<h2>Expert Reactions</h2>
<p>Quotes or commentary from relevant voices...</p>
      `.trim(),
    },
  ]

  const categories = [
    { value: 'all', label: 'All Templates' },
    { value: 'technical', label: 'Technical' },
    { value: 'writing', label: 'Writing' },
    { value: 'business', label: 'Business' },
    { value: 'review', label: 'Review' },
    { value: 'news', label: 'News' },
  ]

  const filteredTemplates =
    selectedCategory === 'all'
      ? templates
      : templates.filter(t => t.category === selectedCategory)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold">Post Templates</h2>
        <button
          onClick={onClose}
          className="btn btn-secondary btn-sm"
        >
          Cancel
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 p-1 bg-[var(--bg-secondary)] rounded-lg overflow-x-auto">
        {categories.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setSelectedCategory(value)}
            className={`px-4 py-2 rounded whitespace-nowrap transition-all ${
              selectedCategory === value
                ? 'bg-[var(--bg-primary)] shadow-sm font-medium'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Templates grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map(template => {
          const Icon = template.icon
          return (
            <button
              key={template.id}
              onClick={() => {
                onSelect(template.content)
                onClose()
              }}
              className="group p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--accent)] hover:shadow-lg transition-all text-left"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-12 h-12 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <Icon size={24} className={template.color} />
                </div>
              </div>
              <h3 className="font-semibold mb-2">{template.name}</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                {template.description}
              </p>
            </button>
          )
        })}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-12 text-[var(--text-tertiary)]">
          <FileText size={48} className="mx-auto mb-4 opacity-50" />
          <p>No templates in this category</p>
        </div>
      )}
    </div>
  )
}
