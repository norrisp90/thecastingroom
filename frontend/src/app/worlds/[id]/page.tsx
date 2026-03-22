import WorldDetailClient from "./client";

export async function generateStaticParams() {
  return [];
}

export default function WorldDetailPage() {
  return <WorldDetailClient />;
}
