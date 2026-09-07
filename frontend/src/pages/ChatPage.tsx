import { useEffect, useRef, useState, FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export default function ChatPage() {
  const { channelId = "general" } = useParams();
  const socket = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;
    socket.emit("channel:join", channelId);

    const onMessage = (msg: Message) => setMessages((prev) => [...prev, msg]);
    const onTyping = () => {
      setTypingUser("Someone");
      setTimeout(() => setTypingUser(null), 2000);
    };

    socket.on("message:new", onMessage);
    socket.on("chat:typing", onTyping);
    return () => {
      socket.emit("channel:leave", channelId);
      socket.off("message:new", onMessage);
      socket.off("chat:typing", onTyping);
    };
  }, [socket, channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !socket) return;
    socket.emit("message:send", { channelId, content: draft });
    setDraft("");
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="px-6 py-4 border-b border-slate-200 bg-white">
        <h2 className="font-semibold text-slate-800"># {channelId}</h2>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className="bg-white border border-slate-200 rounded-lg px-3 py-2 max-w-lg">
            <p className="text-sm text-slate-800">{m.content}</p>
            <p className="text-[11px] text-slate-400 mt-1">{new Date(m.created_at).toLocaleTimeString()}</p>
          </div>
        ))}
        {typingUser && <p className="text-xs text-slate-400 italic">{typingUser} is typing...</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-slate-200 bg-white flex gap-2">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            socket?.emit("chat:typing", { channelId });
          }}
          placeholder="Message the team..."
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm">
          Send
        </button>
      </form>
    </div>
  );
}
