import AuditionChatClient from "./client";

export function generateStaticParams() {
  return [{ sessionId: "_" }];
}

export default function AuditionChatPage() {
  return <AuditionChatClient />;
}
