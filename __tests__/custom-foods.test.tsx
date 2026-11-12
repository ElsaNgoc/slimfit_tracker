import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/actions/custom-foods", () => ({ updateCustomFood: vi.fn(), deleteCustomFood: vi.fn() }));

import { deleteCustomFood, updateCustomFood } from "@/actions/custom-foods";
import { CustomFoodManager } from "@/components/profile/CustomFoodManager";
import { per100Problem } from "@/lib/food-search";

const update = vi.mocked(updateCustomFood);
const del = vi.mocked(deleteCustomFood);

const BUN_CHA = { id: 1, name: "Bún chả Hà Nội", calories: 200, proteinG: 10, carbsG: 24, fatG: 6 };
const COM_TAM = { id: 2, name: "Cơm tấm sườn", calories: 180, proteinG: 9.5, carbsG: 22, fatG: 6 };
const BANH_FLAN = { id: 3, name: "Bánh flan", calories: 145, proteinG: 4.2, carbsG: 21, fatG: 4.6 };

const list = () => screen.getByRole("list", { name: "Món đã lưu" });
const rows = () => within(list()).getAllByRole("listitem");
const rowOf = (name: string) => rows().find((r) => r.textContent?.includes(name))!;

describe("per100Problem", () => {
  it("chặn calo > 900 và tổng macro > 100 g / 100 g", () => {
    expect(per100Problem({ calories: 884, proteinG: 0, carbsG: 0, fatG: 100 })).toBeNull();
    expect(per100Problem({ calories: 901, proteinG: 0, carbsG: 0, fatG: 0 })).toMatch(/900/);
    expect(per100Problem({ calories: 400, proteinG: 40, carbsG: 40, fatG: 30 })).toMatch(/100 g/);
  });
});

describe("CustomFoodManager", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("chưa có món → trạng thái rỗng hướng dẫn cách lưu, link về Tổng quan", () => {
    render(<CustomFoodManager initialFoods={[]} />);
    const section = screen.getByRole("region", { name: "Từ điển món ăn của tôi" });
    expect(section).toHaveTextContent("Chưa có món nào");
    expect(section).toHaveTextContent("Lưu món này vào từ điển của tôi");
    expect(within(section).getByRole("link", { name: "Tổng quan" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("liệt kê theo tên (tiếng Việt), mỗi dòng có tên + macro / 100 g + nút Sửa / Xoá", () => {
    render(<CustomFoodManager initialFoods={[COM_TAM, BUN_CHA, BANH_FLAN]} />);
    expect(screen.getByTestId("custom-food-count")).toHaveTextContent("3 món");
    expect(rows().map((r) => within(r).getByText(/^(Bánh|Bún|Cơm)/).textContent)).toEqual([
      "Bánh flan",
      "Bún chả Hà Nội",
      "Cơm tấm sườn",
    ]);
    const row = rowOf("Cơm tấm sườn");
    expect(row).toHaveTextContent("180 kcal · P 9,5 · C 22 · F 6 g");
    expect(within(row).getByRole("button", { name: "Sửa Cơm tấm sườn" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Xoá Cơm tấm sườn" })).toBeInTheDocument();
  });

  it("Xoá: hỏi xác nhận; Huỷ → không làm gì; OK → mất khỏi danh sách và gọi action", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    del.mockResolvedValue({ ok: true, data: { id: 1 } });
    const user = userEvent.setup();
    render(<CustomFoodManager initialFoods={[BUN_CHA, COM_TAM]} />);

    await user.click(screen.getByRole("button", { name: "Xoá Bún chả Hà Nội" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Xoá "Bún chả Hà Nội" khỏi từ điển?'));
    expect(del).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Xoá Bún chả Hà Nội" }));
    expect(del).toHaveBeenCalledWith(1);
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.queryByText("Bún chả Hà Nội")).not.toBeInTheDocument();
    expect(screen.getByTestId("custom-food-count")).toHaveTextContent("1 món");
  });

  it("Xoá lỗi từ server → món quay lại đúng thứ tự + báo lỗi", async () => {
    del.mockResolvedValue({ ok: false, error: "Không tìm thấy món này trong từ điển." });
    const user = userEvent.setup();
    render(<CustomFoodManager initialFoods={[BANH_FLAN, BUN_CHA, COM_TAM]} />);

    await user.click(screen.getByRole("button", { name: "Xoá Bún chả Hà Nội" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tìm thấy món này trong từ điển.");
    expect(rows().map((r) => r.querySelector("p")?.textContent)).toEqual([
      "Bánh flan",
      "Bún chả Hà Nội",
      "Cơm tấm sườn",
    ]);
  });

  it("Sửa: modal điền sẵn dữ liệu cũ → đổi tên + macro → lưu, dòng cập nhật và sắp lại", async () => {
    update.mockImplementation(async (input) => ({
      ok: true,
      data: { id: input.id, name: input.name.trim(), calories: input.calories, proteinG: input.proteinG, carbsG: input.carbsG, fatG: input.fatG },
    }));
    const user = userEvent.setup();
    render(<CustomFoodManager initialFoods={[BANH_FLAN, COM_TAM]} />);

    await user.click(screen.getByRole("button", { name: "Sửa Cơm tấm sườn" }));
    const dialog = screen.getByRole("dialog", { name: "Sửa món" });
    expect(within(dialog).getByLabelText(/^Tên món ăn/)).toHaveValue("Cơm tấm sườn");
    expect(within(dialog).getByLabelText(/^Calories/)).toHaveValue("180");
    expect(within(dialog).getByLabelText("Protein (g)")).toHaveValue("9,5");
    expect(within(dialog).getByLabelText("Carbs (g)")).toHaveValue("22");
    expect(within(dialog).getByLabelText("Fat (g)")).toHaveValue("6");
    expect(within(dialog).getByText("Theo macro ≈ 180 kcal")).toBeInTheDocument();

    const name = within(dialog).getByLabelText(/^Tên món ăn/);
    await user.clear(name);
    await user.type(name, "Bánh mì ốp la");
    const kcal = within(dialog).getByLabelText(/^Calories/);
    await user.clear(kcal);
    await user.type(kcal, "230");
    const protein = within(dialog).getByLabelText("Protein (g)");
    await user.clear(protein);
    await user.type(protein, "10,5");
    expect(within(dialog).getByText("Theo macro ≈ 184 kcal")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Lưu thay đổi" }));

    expect(update).toHaveBeenCalledWith({ id: 2, name: "Bánh mì ốp la", calories: 230, proteinG: 10.5, carbsG: 22, fatG: 6 });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(rows().map((r) => r.querySelector("p")?.textContent)).toEqual(["Bánh flan", "Bánh mì ốp la"]);
    expect(rowOf("Bánh mì ốp la")).toHaveTextContent("230 kcal · P 10,5 · C 22 · F 6 g");
  });

  it("Sửa: validate ở client (tên trống, calo > 900, tổng macro > 100 g) — không gọi server", async () => {
    const user = userEvent.setup();
    render(<CustomFoodManager initialFoods={[BUN_CHA]} />);
    await user.click(screen.getByRole("button", { name: "Sửa Bún chả Hà Nội" }));
    const dialog = screen.getByRole("dialog", { name: "Sửa món" });
    const save = within(dialog).getByRole("button", { name: "Lưu thay đổi" });

    await user.clear(within(dialog).getByLabelText(/^Tên món ăn/));
    await user.click(save);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Nhập tên món ăn.");

    await user.type(within(dialog).getByLabelText(/^Tên món ăn/), "Bún chả");
    const kcal = within(dialog).getByLabelText(/^Calories/);
    await user.clear(kcal);
    await user.type(kcal, "950");
    await user.click(save);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Nhập số calo nguyên từ 0 đến 900 (trên 100 g).");

    await user.clear(kcal);
    await user.type(kcal, "400");
    const carbs = within(dialog).getByLabelText("Carbs (g)");
    await user.clear(carbs);
    await user.type(carbs, "90");
    await user.click(save);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Tổng Protein + Carbs + Fat không thể vượt 100 g / 100 g.");
    expect(update).not.toHaveBeenCalled();
  });

  it("Sửa: server báo trùng tên → giữ modal mở, hiện lỗi, danh sách không đổi", async () => {
    update.mockResolvedValue({ ok: false, error: "Từ điển đã có một món khác cùng tên." });
    const user = userEvent.setup();
    render(<CustomFoodManager initialFoods={[BUN_CHA, COM_TAM]} />);
    await user.click(screen.getByRole("button", { name: "Sửa Bún chả Hà Nội" }));
    const dialog = screen.getByRole("dialog", { name: "Sửa món" });
    const name = within(dialog).getByLabelText(/^Tên món ăn/);
    await user.clear(name);
    await user.type(name, "cơm tấm sườn");
    await user.click(within(dialog).getByRole("button", { name: "Lưu thay đổi" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Từ điển đã có một món khác cùng tên.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(rowOf("Bún chả Hà Nội")).toBeTruthy();
  });

  it("Đóng modal rồi mở sửa món khác → form điền đúng dữ liệu món mới (không giữ bản nháp cũ)", async () => {
    const user = userEvent.setup();
    render(<CustomFoodManager initialFoods={[BUN_CHA, COM_TAM]} />);
    await user.click(screen.getByRole("button", { name: "Sửa Bún chả Hà Nội" }));
    let dialog = screen.getByRole("dialog", { name: "Sửa món" });
    await user.type(within(dialog).getByLabelText(/^Tên món ăn/), " nháp");
    await user.click(within(dialog).getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Sửa Cơm tấm sườn" }));
    dialog = screen.getByRole("dialog", { name: "Sửa món" });
    expect(within(dialog).getByLabelText(/^Tên món ăn/)).toHaveValue("Cơm tấm sườn");

    await user.click(within(dialog).getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Sửa Bún chả Hà Nội" }));
    dialog = screen.getByRole("dialog", { name: "Sửa món" });
    expect(within(dialog).getByLabelText(/^Tên món ăn/)).toHaveValue("Bún chả Hà Nội");

    // Mở lại CÙNG món sau khi gõ nháp + đóng → bản nháp bị bỏ
    await user.type(within(dialog).getByLabelText(/^Calories/), "9");
    await user.click(within(dialog).getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Sửa Bún chả Hà Nội" }));
    expect(within(screen.getByRole("dialog", { name: "Sửa món" })).getByLabelText(/^Calories/)).toHaveValue("200");
  });

  it("mở lại: ngay lúc dialog hiện (showModal) form ĐÃ là dữ liệu gốc, không phải bản nháp lần trước", async () => {
    const user = userEvent.setup();
    render(<CustomFoodManager initialFoods={[BUN_CHA]} />);
    await user.click(screen.getByRole("button", { name: "Sửa Bún chả Hà Nội" }));
    await user.type(screen.getByLabelText(/^Tên món ăn/), " nháp");
    await user.click(screen.getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const seen: string[] = [];
    const original = HTMLDialogElement.prototype.showModal;
    const spy = vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) {
      seen.push(this.querySelector<HTMLInputElement>("input[type=text]")!.value);
      original.call(this);
    });
    await user.click(screen.getByRole("button", { name: "Sửa Bún chả Hà Nội" }));
    spy.mockRestore();
    expect(seen).toEqual(["Bún chả Hà Nội"]);
  });

  it("sự kiện 'close' cũ đến muộn sau khi đã mở lại modal → không đóng nhầm modal mới (race khi bấm nhanh)", async () => {
    const user = userEvent.setup();
    render(<CustomFoodManager initialFoods={[BUN_CHA, COM_TAM]} />);
    await user.click(screen.getByRole("button", { name: "Sửa Bún chả Hà Nội" }));
    await user.click(screen.getByRole("button", { name: "Đóng" }));
    await user.click(screen.getByRole("button", { name: "Sửa Cơm tấm sườn" }));
    const dialog = screen.getByRole("dialog", { name: "Sửa món" });

    // Trình duyệt thật bắn "close" bất đồng bộ → có thể tới SAU khi showModal() của lần mở mới
    act(() => {
      dialog.dispatchEvent(new Event("close"));
    });
    expect(screen.getByRole("dialog", { name: "Sửa món" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Tên món ăn/)).toHaveValue("Cơm tấm sườn");
  });

  it("danh sách dài → ô lọc không dấu", async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ...BUN_CHA, id: 10 + i, name: `Món số ${i + 1}` }));
    const user = userEvent.setup();
    render(<CustomFoodManager initialFoods={[...many, COM_TAM]} />);
    const filter = screen.getByRole("searchbox", { name: "Lọc món trong từ điển" });

    await user.type(filter, "com tam");
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("Cơm tấm sườn");

    await user.clear(filter);
    await user.type(filter, "pizza");
    expect(screen.getByText("Không có món nào khớp “pizza”.")).toBeInTheDocument();
  });

  it("danh sách ngắn → không hiện ô lọc", () => {
    render(<CustomFoodManager initialFoods={[BUN_CHA]} />);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
});
