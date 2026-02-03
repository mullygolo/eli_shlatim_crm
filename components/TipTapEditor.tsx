import React, { useEffect, useCallback } from 'react';
import { useEditor, Tiptap, useTiptap } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

interface TipTapEditorProps {
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    placeholder?: string;
    className?: string;
    dir?: 'rtl' | 'ltr';
}

const Toolbar: React.FC = () => {
    const { editor, isReady } = useTiptap();

    if (!isReady || !editor) return null;

    const setLink = useCallback(() => {
        const previousUrl = editor.getAttributes('link').href;
        const url = window.prompt('קישור (URL):', previousUrl || 'https://');
        if (url === null) return;
        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }, [editor]);

    return (
        <div className="flex flex-wrap items-center gap-1 p-2 border border-slate-200 border-b-0 rounded-t-md bg-slate-50">
            <button
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={`px-2 py-1 rounded text-sm font-medium ${editor.isActive('bold') ? 'bg-indigo-100 text-indigo-800' : 'text-slate-600 hover:bg-slate-200'}`}
                title="מודגש"
            >
                ב'
            </button>
            <button
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={`px-2 py-1 rounded text-sm font-medium ${editor.isActive('italic') ? 'bg-indigo-100 text-indigo-800' : 'text-slate-600 hover:bg-slate-200'}`}
                title="נטוי"
            >
                <em>נ'</em>
            </button>
            <button
                type="button"
                onClick={() => editor.chain().focus().toggleStrike().run()}
                className={`px-2 py-1 rounded text-sm font-medium ${editor.isActive('strike') ? 'bg-indigo-100 text-indigo-800' : 'text-slate-600 hover:bg-slate-200'}`}
                title="קו חוצה"
            >
                <s>ס'</s>
            </button>
            <span className="w-px h-5 bg-slate-300 mx-0.5" aria-hidden />
            <button
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                className={`px-2 py-1 rounded text-sm ${editor.isActive('heading', { level: 1 }) ? 'bg-indigo-100 text-indigo-800' : 'text-slate-600 hover:bg-slate-200'}`}
                title="כותרת 1"
            >
                H1
            </button>
            <button
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                className={`px-2 py-1 rounded text-sm ${editor.isActive('heading', { level: 2 }) ? 'bg-indigo-100 text-indigo-800' : 'text-slate-600 hover:bg-slate-200'}`}
                title="כותרת 2"
            >
                H2
            </button>
            <button
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                className={`px-2 py-1 rounded text-sm ${editor.isActive('heading', { level: 3 }) ? 'bg-indigo-100 text-indigo-800' : 'text-slate-600 hover:bg-slate-200'}`}
                title="כותרת 3"
            >
                H3
            </button>
            <span className="w-px h-5 bg-slate-300 mx-0.5" aria-hidden />
            <button
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={`px-2 py-1 rounded text-sm ${editor.isActive('bulletList') ? 'bg-indigo-100 text-indigo-800' : 'text-slate-600 hover:bg-slate-200'}`}
                title="רשימת תבליטים"
            >
                •
            </button>
            <button
                type="button"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={`px-2 py-1 rounded text-sm ${editor.isActive('orderedList') ? 'bg-indigo-100 text-indigo-800' : 'text-slate-600 hover:bg-slate-200'}`}
                title="רשימה ממוספרת"
            >
                1.
            </button>
            <span className="w-px h-5 bg-slate-300 mx-0.5" aria-hidden />
            <button
                type="button"
                onClick={setLink}
                className={`px-2 py-1 rounded text-sm ${editor.isActive('link') ? 'bg-indigo-100 text-indigo-800' : 'text-slate-600 hover:bg-slate-200'}`}
                title="קישור"
            >
                🔗
            </button>
        </div>
    );
};

const TipTapEditor: React.FC<TipTapEditorProps> = ({
    value,
    onChange,
    onBlur,
    placeholder = '',
    className = '',
    dir = 'rtl',
}) => {
    const editor = useEditor({
        extensions: [StarterKit],
        content: value || '',
        editorProps: {
            attributes: {
                class: 'min-h-[120px] p-3 text-slate-800 focus:outline-none prose prose-sm max-w-none',
            },
        },
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        onBlur: () => {
            onBlur?.();
        },
    }, []);

    // Sync external value (e.g. when systemMessage loads from API) into editor
    useEffect(() => {
        if (!editor) return;
        const currentHtml = editor.getHTML();
        const normalizedValue = (value || '').trim() || '<p></p>';
        if (normalizedValue !== currentHtml) {
            editor.commands.setContent(normalizedValue, false);
        }
    }, [value, editor]);

    if (!editor) {
        return (
            <div className={`min-h-[120px] p-3 border border-slate-300 rounded-md bg-white ${className}`} dir={dir}>
                <p className="text-slate-400">{placeholder || 'טוען...'}</p>
            </div>
        );
    }

    return (
        <div className={`rounded-md border border-slate-300 bg-white ${className}`} dir={dir}>
            <Tiptap instance={editor}>
                <Toolbar />
                <Tiptap.Loading>
                    <div className="min-h-[120px] p-3 text-slate-400">{placeholder || 'טוען...'}</div>
                </Tiptap.Loading>
                <Tiptap.Content />
            </Tiptap>
        </div>
    );
};

export default TipTapEditor;
