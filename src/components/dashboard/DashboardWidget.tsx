import type { ReactNode } from "react";

/**
 * Khung widget trên Dashboard. Chưa truyền `children` → hiển thị trạng thái rỗng
 * (placeholder) để gắn tính năng vào sau.
 */
export function DashboardWidget({
  id,
  title,
  icon,
  emptyText,
  className = "",
  children,
}: {
  id: string;
  title: string;
  icon: string;
  emptyText: string;
  className?: string;
  children?: ReactNode;
}) {
  const headingId = `${id}-title`;
  return (
    <section
      aria-labelledby={headingId}
      data-widget={id}
      className={`flex flex-col gap-3 rounded-2xl bg-zinc-900 p-4 ${className}`}
    >
      <h2 id={headingId} className="flex items-center gap-2 text-base font-semibold text-zinc-100">
        <span aria-hidden>{icon}</span>
        {title}
      </h2>
      {children ?? (
        <div className="flex min-h-24 flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-700 p-4 text-center text-sm text-zinc-500">
          {emptyText}
        </div>
      )}
    </section>
  );
}
