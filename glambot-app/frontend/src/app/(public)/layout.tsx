import '@/styles/public.css';

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="font-grotesk h-full bg-[url('/bg.webp')] bg-cover bg-center bg-fixed">
      <div className="max-w-360 mx-auto h-full overflow-y-auto relative">
        {children}
      </div>
    </div>
  );
}
