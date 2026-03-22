import { Suspense } from "react";
import NewAuditionClient from "./client";

export async function generateStaticParams() {
  return [];
}

export default function NewAuditionPage() {
  return (
    <Suspense>
      <NewAuditionClient />
    </Suspense>
  );
}
