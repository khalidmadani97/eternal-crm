import { useEditorState, type Editor } from '@tiptap/react'

function ToolBtn({
  onPress,
  active,
  title,
  children,
}: {
  onPress: () => void
  active?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onPress() }}
      title={title}
      className={`flex h-7 min-w-[1.75rem] items-center justify-center rounded px-1 text-xs transition-colors ${
        active ? 'bg-amber-100 text-amber-800' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'
      }`}
    >
      {children}
    </button>
  )
}

export function RichToolbar({ editor }: { editor: Editor | null }) {
  const raw = useEditorState({
    editor,
    selector: (ctx) => ({
      bold: ctx.editor?.isActive('bold') ?? false,
      italic: ctx.editor?.isActive('italic') ?? false,
      underline: ctx.editor?.isActive('underline') ?? false,
      strike: ctx.editor?.isActive('strike') ?? false,
      bulletList: ctx.editor?.isActive('bulletList') ?? false,
      orderedList: ctx.editor?.isActive('orderedList') ?? false,
      h1: ctx.editor?.isActive('heading', { level: 1 }) ?? false,
      h2: ctx.editor?.isActive('heading', { level: 2 }) ?? false,
      codeBlock: ctx.editor?.isActive('codeBlock') ?? false,
    }),
  })
  const s = raw ?? { bold: false, italic: false, underline: false, strike: false, bulletList: false, orderedList: false, h1: false, h2: false, codeBlock: false }

  if (!editor) return null
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-stone-100 px-2 py-1.5">
      <ToolBtn onPress={() => editor.chain().focus().toggleBold().run()} active={s.bold} title="Bold (⌘B)">
        <strong>B</strong>
      </ToolBtn>
      <ToolBtn onPress={() => editor.chain().focus().toggleItalic().run()} active={s.italic} title="Italic (⌘I)">
        <em>I</em>
      </ToolBtn>
      <ToolBtn onPress={() => editor.chain().focus().toggleUnderline().run()} active={s.underline} title="Underline">
        <span className="underline">U</span>
      </ToolBtn>
      <ToolBtn onPress={() => editor.chain().focus().toggleStrike().run()} active={s.strike} title="Strikethrough">
        <span className="line-through">S</span>
      </ToolBtn>

      <span className="mx-1 h-4 w-px shrink-0 bg-stone-200" />

      <ToolBtn onPress={() => editor.chain().focus().toggleBulletList().run()} active={s.bulletList} title="Bullet list">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="2" cy="3.5" r="1.2" fill="currentColor"/>
          <line x1="5" y1="3.5" x2="13" y2="3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <circle cx="2" cy="7" r="1.2" fill="currentColor"/>
          <line x1="5" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <circle cx="2" cy="10.5" r="1.2" fill="currentColor"/>
          <line x1="5" y1="10.5" x2="11" y2="10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </ToolBtn>
      <ToolBtn onPress={() => editor.chain().focus().toggleOrderedList().run()} active={s.orderedList} title="Numbered list">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <text x="0.5" y="5.5" fontSize="5.5" fill="currentColor" fontFamily="system-ui, sans-serif">1.</text>
          <line x1="5.5" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <text x="0.5" y="10" fontSize="5.5" fill="currentColor" fontFamily="system-ui, sans-serif">2.</text>
          <line x1="5.5" y1="8.5" x2="13" y2="8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </ToolBtn>

      <span className="mx-1 h-4 w-px shrink-0 bg-stone-200" />

      <ToolBtn onPress={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={s.h1} title="Heading 1">
        <span className="text-[11px] font-bold">H1</span>
      </ToolBtn>
      <ToolBtn onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={s.h2} title="Heading 2">
        <span className="text-[11px] font-semibold">H2</span>
      </ToolBtn>

      <span className="mx-1 h-4 w-px shrink-0 bg-stone-200" />

      <ToolBtn onPress={() => editor.chain().focus().toggleCodeBlock().run()} active={s.codeBlock} title="Code block">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4,3 1,7 4,11"/>
          <polyline points="10,3 13,7 10,11"/>
        </svg>
      </ToolBtn>
    </div>
  )
}
