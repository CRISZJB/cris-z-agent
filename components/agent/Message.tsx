import { SourcesList } from "./SourceCard";
import type { Source } from "@/lib/agent/types";

export type ChatMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  error?: boolean;
};

export function Message({ message }: { message: ChatMessageView }) {
  return (
    <article className={`message message-${message.role}`} data-error={message.error || undefined}>
      <p className="message-role">{message.role === "user" ? "你" : "Cris.Z Agent"}</p>
      <div className="message-body">
        {message.content.split("\n").map((paragraph, index) =>
          paragraph.trim() ? <p key={`${message.id}-${index}`}>{paragraph}</p> : <br key={`${message.id}-${index}`} />,
        )}
      </div>
      {message.sources && message.sources.length > 0 ? (
        <footer className="message-sources">
          <SourcesList sources={message.sources} />
        </footer>
      ) : null}
    </article>
  );
}
