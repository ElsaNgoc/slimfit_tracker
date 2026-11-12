/**
 * Class Tailwind dùng chung cho modal dạng bottom sheet (<dialog> native): trượt từ đáy lên trên mobile,
 * hiện giữa màn hình từ `sm`, nền tối mờ, animation bằng @starting-style. Dùng ở AddFoodModal, EditCustomFoodModal.
 */
export const SHEET_DIALOG_CLASS =
  "group mx-auto mt-auto mb-0 h-auto max-h-[92dvh] w-full max-w-full overflow-visible bg-transparent p-0 text-zinc-100 opacity-0 transition-all transition-discrete duration-300 ease-out backdrop:bg-black/70 backdrop:opacity-0 backdrop:transition-all backdrop:transition-discrete backdrop:duration-300 open:opacity-100 open:backdrop:opacity-100 sm:my-auto sm:max-w-md starting:open:opacity-0 starting:open:backdrop:opacity-0";

export const SHEET_PANEL_CLASS =
  "flex max-h-[92dvh] translate-y-full flex-col gap-4 overflow-y-auto rounded-t-3xl bg-zinc-900 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-white/10 transition-transform duration-300 ease-out group-open:translate-y-0 sm:translate-y-8 sm:rounded-3xl sm:group-open:translate-y-0 starting:group-open:translate-y-full sm:starting:group-open:translate-y-8";
