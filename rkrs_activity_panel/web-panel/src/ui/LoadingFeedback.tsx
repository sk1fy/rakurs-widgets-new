export function LoadingFeedback({ loading, refreshing }: { loading: boolean; refreshing: boolean }) {
  if (!loading && !refreshing) return null;
  return (
    <div className={loading ? "data-loading-overlay" : "data-refresh-indicator"} role="status" aria-live="polite">
      <span className="spin" />
      <span>{loading ? "Загрузка данных..." : "Обновление данных..."}</span>
    </div>
  );
}
