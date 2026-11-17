export function LoadingView() {
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-silver" />
      <p className="text-sm text-mute">読み込み中…</p>
    </div>
  );
}
