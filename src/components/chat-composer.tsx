"use client";

import { LoaderCircle, SendHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  id: string;
  name: string;
  placeholder: string;
  disabled?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onSubmit: (text: string) => void;
};

/**
 * Owns draft text locally so keystrokes do not re-render the message list
 * (and re-parse every ChatMarkdown) in the parent chat panel.
 */
export function ChatComposer({
  id,
  name,
  placeholder,
  disabled = false,
  textareaRef,
  onSubmit,
}: Props) {
  const [input, setInput] = useState("");

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || disabled) return;
    onSubmit(text);
    setInput("");
  }

  return (
    <form
      onSubmit={submit}
      className="border-t border-border px-6 py-4 md:px-10"
    >
      <div className="mx-auto flex max-w-6xl items-start gap-3">
        <Textarea
          id={id}
          name={name}
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="min-h-28 flex-1 resize-y text-base leading-relaxed md:min-h-32"
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button
          type="submit"
          size="lg"
          className="h-12 shrink-0 px-4"
          disabled={disabled || !input.trim()}
          aria-label="发送"
        >
          {disabled ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <SendHorizontal />
          )}
          发送
        </Button>
      </div>
    </form>
  );
}
