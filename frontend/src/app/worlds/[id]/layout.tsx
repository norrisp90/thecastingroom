export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function WorldLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
