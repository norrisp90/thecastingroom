import ActorDetailClient from "./client";

export function generateStaticParams() {
  return [{ actorId: "_" }];
}

export default function ActorDetailPage() {
  return <ActorDetailClient />;
}
