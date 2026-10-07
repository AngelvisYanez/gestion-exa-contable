"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import {
  Bold,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PastedFile = { url: string; nombre: string; esImagen: boolean };

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minHeight?: string;
  /** Sube una imagen o documento pegado y devuelve la URL pública. */
  uploadFile?: (file: File) => Promise<PastedFile | null>;
};

function ToolbarBtn({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="sm"
      className="h-8 w-8 p-0"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Escribe la descripcion...",
  disabled,
  className,
  minHeight = "140px",
  uploadFile,
}: Props) {
  const uploadRef = useRef(uploadFile);
  uploadRef.current = uploadFile;

  const editorRef = useRef<Editor | null>(null);

  const insertFiles = async (files: File[], ed: Editor) => {
    const upload = uploadRef.current;
    if (!upload || !files.length) return false;
    for (const file of files) {
      const saved = await upload(file);
      if (!saved) continue;
      const safeName = saved.nombre.replace(/[<>"']/g, "");
      const html = saved.esImagen
        ? `<img src="${saved.url}" alt="${safeName}">`
        : `<a href="${saved.url}" target="_blank" rel="noreferrer">${safeName}</a>`;
      ed.chain().focus().insertContent(html).run();
    }
    return true;
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-sky-700 underline font-semibold" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files || []);
        if (!files.length || !uploadRef.current || !editorRef.current) return false;
        event.preventDefault();
        void insertFiles(files, editorRef.current);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files || []);
        if (!files.length || !uploadRef.current || !editorRef.current) return false;
        event.preventDefault();
        void insertFiles(files, editorRef.current);
        return true;
      },
      attributes: {
        class: cn(
          "tiptap prose prose-sm max-w-none px-3 py-2 focus:outline-none",
          "min-h-[120px] text-sm leading-relaxed text-foreground"
        ),
        style: `min-height:${minHeight}`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? "" : ed.getHTML();
      onChange(html);
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    const next = value || "";
    if (current === next) return;
    // Evitar bucles al teclear: solo sincronizar si el valor externo cambia de verdad
    editor.commands.setContent(next, { emitUpdate: false });
  }, [value, editor]);

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL del enlace", prev || "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const href = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-input bg-background shadow-sm",
        disabled && "opacity-60",
        className
      )}
    >
      <div className="flex flex-wrap gap-0.5 border-b border-border/70 bg-muted/30 p-1">
        <ToolbarBtn
          label="Negrita"
          disabled={disabled}
          active={editor?.isActive("bold")}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Cursiva"
          disabled={disabled}
          active={editor?.isActive("italic")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Subrayado"
          disabled={disabled}
          active={editor?.isActive("underline")}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Titulo"
          disabled={disabled}
          active={editor?.isActive("heading", { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Lista"
          disabled={disabled}
          active={editor?.isActive("bulletList")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Lista numerada"
          disabled={disabled}
          active={editor?.isActive("orderedList")}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn label="Enlace" disabled={disabled} active={editor?.isActive("link")} onClick={setLink}>
          <Link2 className="size-3.5" />
        </ToolbarBtn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
