export default function Loading() {
  return (
    <main className="flex flex-col items-center justify-center min-h-full">
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
        <div className="w-3 h-3 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
        <div className="w-3 h-3 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
      </div>
    </main>
  );
}
