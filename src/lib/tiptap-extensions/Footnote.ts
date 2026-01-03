import { Node, mergeAttributes } from '@tiptap/core'

export interface FootnoteOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      setFootnote: (attributes?: { id?: string; text?: string }) => ReturnType
    }
  }
}

export const Footnote = Node.create<FootnoteOptions>({
  name: 'footnote',

  group: 'inline',

  inline: true,

  selectable: true,

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-footnote-id'),
        renderHTML: attributes => {
          if (!attributes.id) {
            return {}
          }
          return {
            'data-footnote-id': attributes.id,
          }
        },
      },
      text: {
        default: '',
        parseHTML: element => element.getAttribute('data-footnote-text'),
        renderHTML: attributes => {
          if (!attributes.text) {
            return {}
          }
          return {
            'data-footnote-text': attributes.text,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'sup[data-footnote-id]',
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: 'footnote-ref',
      }),
      [
        'a',
        {
          href: `#fn-${node.attrs.id}`,
          class: 'text-[var(--accent)] hover:underline',
        },
        `[${node.attrs.id}]`,
      ],
    ]
  },

  addCommands() {
    return {
      setFootnote:
        attributes =>
        ({ commands }) => {
          const id = attributes?.id || Date.now().toString()
          return commands.insertContent({
            type: this.name,
            attrs: {
              id,
              text: attributes?.text || '',
            },
          })
        },
    }
  },
})
