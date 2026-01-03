import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'

// Custom table extensions with better styling

export const CustomTable = Table.configure({
  HTMLAttributes: {
    class: 'table-auto w-full border-collapse my-6',
  },
})

export const CustomTableRow = TableRow.configure({
  HTMLAttributes: {
    class: 'border-b border-[var(--border-light)]',
  },
})

export const CustomTableHeader = TableHeader.configure({
  HTMLAttributes: {
    class: 'px-4 py-3 text-left font-semibold bg-[var(--bg-secondary)] border-b-2 border-[var(--border-medium)]',
  },
})

export const CustomTableCell = TableCell.configure({
  HTMLAttributes: {
    class: 'px-4 py-3 border-b border-[var(--border-light)]',
  },
})

export { Table, TableRow, TableHeader, TableCell }
