import { Suspense } from "react";
import AdminRouterClient from "./client";

export function generateStaticParams() {
  return [{ slug: ["_"] }];
}

export default function AdminCatchAllPage() {
  return (
    <Suspense>
      <AdminRouterClient />
    </Suspense>
  );
}
