"use client";

import { FormEvent, useState } from "react";

type ChatInputProps = {
  disabled?: boolean;
  onSend: (text: string) => void;
};

export function ChatInput({ disabled, onSend }: ChatInputProps) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = value.trim();
    if (!text || disabled) {
      return;
    }
    onSend(text);
    setValue("");
  }

  return (
    <form className="chat-input" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="agent-question">
        向 Cris.Z Agent 提问
      </label>
      <textarea
        id="agent-question"
        rows={2}
        value={value}
        disabled={disabled}
        placeholder="问资料、问概念，或两者结合"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <button type="submit" disabled={disabled || value.trim().length === 0}>
        提问
      </button>
    </form>
  );
}
