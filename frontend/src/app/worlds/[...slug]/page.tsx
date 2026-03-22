import { Suspense } from "react";
import WorldRouterClient from "./client";

export function generateStaticParams() {
  return [{ slug: ["_"] }];
}

export default function WorldCatchAllPage() {
  return (
    <Suspense>
      <WorldRouterClient />
    </Suspense>
  );
}
