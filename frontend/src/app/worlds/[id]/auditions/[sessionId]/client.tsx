"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authFetch, getUser, logout } from "@/lib/auth";

interface Turn {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface Session {
  id: string;
  worldId: string;
  actorId: string;
  sceneSetup: string;
  model: string;
  turns: Turn[];
  createdAt: string;
}

interface ActorInfo {
  id: string;
  name: string;
}

export default function AuditionChatClient() {
  const params = useParams();
  const worldId = params.id as string;
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<Session | null>(null);
  const [actorName, setActorName] = useState("Character");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [coldStart, setColdStart] = useState(false);
  const [error, setError] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const user = getUser();

  useEffect(() => {
    async function load() {
      const opts = { onColdStart: () => setColdStart(true) };
      try {
        const res = await authFetch(
          `/api/worlds/${worldId}/auditions/${sessionId}`,
          {},
          opts
        );
        if (!res.ok) {
          setError("Session not found or access denied.");
          return;
        }
        const data = await res.json();
        setSession(data);
        setTurns(data.turns || []);

        // Load actor name
        try {
          const actorRes = await authFetch(`/api/worlds/${worldId}/actors/${data.actorId}`);
          if (actorRes.ok) {
            const actor: ActorInfo = await actorRes.json();
            setActorName(actor.name);
          }
        } catch {
          // fallback to "Character"
        }
      } catch {
        setError("Unable to connect to server.");
      } finally {
        setLoading(false);
        setColdStart(false);
      }
    }
    load();
  }, [worldId, sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const content = message.trim();
    if (!content || sending) return;

    setMessage("");
    setSending(true);
    setColdStart(false);

    // Optimistically add user message
    const userTurn: Turn = { role: "user", content, timestamp: new Date().toISOString() };
    setTurns((prev) => [...prev, userTurn]);

    try {
      const res = await authFetch(
        `/api/worlds/${worldId}/auditions/${sessionId}/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
        { onColdStart: () => setColdStart(true) }
      );

      if (!res.ok) {
        const data = await res.json();
        setError(typeof data.error === "string" ? data.error : "Failed to send message");
        // Remove optimistic user message
        setTurns((prev) => prev.slice(0, -1));
        setMessage(content);
        return;
      }

      const data = await res.json();
      // Replace optimistic user turn + add assistant turn
      setTurns((prev) => [
        ...prev.slice(0, -1),
        data.userMessage,
        data.assistantMessage,
      ]);
    } catch {
      setError("Unable to connect to server.");
      setTurns((prev) => prev.slice(0, -1));
      setMessage(content);
    } finally {
      setSending(false);
      setColdStart(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col">
        <HeaderBar user={user} worldId={worldId} />
        <div className="flex-1 flex items-center justify-center">
          {coldStart && <p className="text-sm text-muted-foreground animate-pulse">Waking up the server…</p>}
          {!coldStart && <p className="text-muted-foreground">Loading conversation…</p>}
        </div>
      </main>
    );
  }

  if (error && !session) {
    return (
      <main className="min-h-screen flex flex-col">
        <HeaderBar user={user} worldId={worldId} />
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <p className="text-destructive">{error}</p>
          <Button asChild><a href={`/worlds/${worldId}`}>Back to World</a></Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      <HeaderBar user={user} worldId={worldId} />

      {/* Session info bar */}
      <div className="border-b border-border px-6 py-3 flex items-center justify-between bg-muted/30">
        <div>
          <h2 className="text-lg font-semibold text-secondary">{actorName}</h2>
          {session?.sceneSetup && (
            <p className="text-xs text-muted-foreground line-clamp-1 max-w-xl">{session.sceneSetup}</p>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {turns.length} {turns.length === 1 ? "message" : "messages"} · {session?.model}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {turns.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            <p>Begin the audition. Send a message to start the conversation.</p>
            {session?.sceneSetup && (
              <Card className="mt-4 max-w-xl mx-auto text-left">
                <CardHeader>
                  <CardTitle className="text-sm">Scene</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{session.sceneSetup}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        {turns.map((turn, i) => (
          <div
            key={i}
            className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-lg px-4 py-3 ${
                turn.role === "user"
                  ? "bg-primary/20 text-foreground"
                  : "bg-muted border border-border"
              }`}
            >
              <p className="text-xs font-medium mb-1 text-muted-foreground">
                {turn.role === "user" ? "You" : actorName}
              </p>
              <p className="text-sm whitespace-pre-wrap">{turn.content}</p>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-muted border border-border rounded-lg px-4 py-3 max-w-[75%]">
              <p className="text-xs font-medium mb-1 text-muted-foreground">{actorName}</p>
              <p className="text-sm text-muted-foreground animate-pulse">
                {coldStart ? "Waking up the server…" : "Thinking…"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && session && (
        <div className="px-6 py-2 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border px-4 py-4">
        <form onSubmit={handleSend} className="flex gap-3 max-w-4xl mx-auto">
          <textarea
            ref={inputRef}
            className="flex-1 min-h-[48px] max-h-[200px] rounded-md border border-input bg-transparent px-3 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            placeholder={`Speak to ${actorName}…`}
            value={message}
            onChange={(e) => { setMessage(e.target.value); setError(""); }}
            onKeyDown={handleKeyDown}
            maxLength={10000}
            disabled={sending}
            rows={1}
          />
          <Button type="submit" disabled={sending || !message.trim()} className="self-end">
            {sending ? "…" : "Send"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </main>
  );
}

function HeaderBar({ user, worldId }: { user: { displayName: string; role: string } | null; worldId: string }) {
  return (
    <header className="border-b border-border px-6 py-3 flex items-center justify-between">
      <a href={`/worlds/${worldId}`} className="text-xl text-secondary hover:opacity-80 transition-opacity">
        The Casting Room
      </a>
      <div className="flex items-center gap-4">
        {user && (
          <span className="text-sm text-muted-foreground">
            {user.displayName}
            {user.role === "admin" && (
              <span className="ml-2 text-xs bg-secondary/20 text-secondary px-2 py-0.5 rounded">Admin</span>
            )}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={logout}>Sign Out</Button>
      </div>
    </header>
  );
}
