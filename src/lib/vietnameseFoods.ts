/**
 * Từ điển dinh dưỡng tĩnh — thực phẩm cơ bản của người Việt. Mọi chỉ số tính trên 100 g phần ăn được.
 *
 * Nguồn tham khảo: Bảng thành phần thực phẩm Việt Nam (Viện Dinh dưỡng, 2007) và USDA FoodData Central.
 * Giá trị đã làm tròn, chỉ để ước lượng — chênh lệch theo giống, cách chế biến, độ ẩm là bình thường.
 * Ghi rõ "(sống)" / "(chín)" vì cùng một thực phẩm có thể chênh 2–3 lần (gạo 344 kcal vs cơm 130 kcal).
 *
 * `aliases`: tên gọi khác theo vùng miền (heo / lợn, đậu hũ / đậu phụ…) để tìm kiếm khớp cả hai.
 */

export type FoodGroup = "carb" | "protein" | "dairy" | "veg" | "fruit" | "condiment";

export type VietnameseFood = {
  id: string;
  name: string;
  group: FoodGroup;
  aliases?: string[];
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export const FOOD_GROUP_LABEL: Record<FoodGroup, string> = {
  carb: "Tinh bột",
  protein: "Đạm",
  dairy: "Sữa",
  veg: "Rau củ",
  fruit: "Trái cây",
  condiment: "Gia vị & chất béo",
};

type Row = [id: string, name: string, kcal: number, p: number, c: number, f: number, aliases?: string[]];

const rows = (group: FoodGroup, list: Row[]): VietnameseFood[] =>
  list.map(([id, name, calories, proteinG, carbsG, fatG, aliases]) => ({
    id: `vn-${id}`,
    name,
    group,
    ...(aliases ? { aliases } : {}),
    calories,
    proteinG,
    carbsG,
    fatG,
  }));

export const VIETNAMESE_FOODS: VietnameseFood[] = [
  ...rows("carb", [
    ["com-trang", "Cơm trắng (chín)", 130, 2.7, 28.2, 0.3, ["cơm tẻ"]],
    ["gao-te", "Gạo tẻ (sống)", 344, 7.9, 75.9, 1.0],
    ["com-gao-lut", "Cơm gạo lứt (chín)", 123, 2.7, 25.6, 1.0],
    ["gao-lut", "Gạo lứt (sống)", 367, 7.5, 76.2, 2.7],
    ["gao-nep", "Gạo nếp (sống)", 370, 6.8, 81.7, 0.6],
    ["bun-tuoi", "Bún tươi", 110, 1.7, 25.7, 0.0, ["bún"]],
    ["banh-pho", "Bánh phở tươi", 141, 3.2, 32.1, 0.0, ["phở", "bánh phở"]],
    ["mien-dong", "Miến dong (khô)", 332, 0.6, 82.2, 0.1, ["miến"]],
    ["banh-trang", "Bánh tráng (khô)", 333, 4.0, 78.9, 0.2, ["bánh đa nem", "bánh tráng cuốn"]],
    ["banh-mi", "Bánh mì trắng", 249, 7.9, 52.6, 0.8, ["bánh mì"]],
    ["banh-mi-den", "Bánh mì nguyên cám", 247, 13.0, 41.0, 3.4, ["bánh mì đen"]],
    ["mi-goi", "Mì ăn liền (gói, khô)", 440, 9.5, 62.0, 17.0, ["mì tôm", "mì gói"]],
    ["mi-y", "Mì Ý / spaghetti (chín)", 158, 5.8, 30.9, 0.9, ["pasta"]],
    ["yen-mach", "Yến mạch (khô)", 389, 16.9, 66.3, 6.9, ["oats", "oatmeal"]],
    ["khoai-lang", "Khoai lang (luộc)", 76, 1.4, 17.7, 0.1],
    ["khoai-tay", "Khoai tây (luộc)", 87, 1.9, 20.1, 0.1],
    ["khoai-mon", "Khoai môn (sống)", 112, 1.5, 26.5, 0.2],
    ["san", "Sắn / khoai mì (sống)", 160, 1.4, 38.1, 0.3, ["củ mì"]],
    ["ngo", "Ngô ngọt (luộc)", 96, 3.4, 21.0, 1.5, ["bắp", "bắp ngô"]],
    ["bot-mi", "Bột mì", 364, 10.3, 76.3, 1.0],
  ]),
  ...rows("protein", [
    ["bo-nac", "Thịt bò nạc (sống)", 118, 21.0, 0.0, 3.8, ["thịt bò"]],
    ["bap-bo", "Bắp bò (sống)", 150, 21.5, 0.0, 7.0],
    ["ga-uc", "Ức gà bỏ da (sống)", 120, 22.5, 0.0, 2.6, ["lườn gà", "ức gà"]],
    ["ga-uc-chin", "Ức gà bỏ da (chín)", 165, 31.0, 0.0, 3.6],
    ["ga-dui", "Đùi gà bỏ da (sống)", 121, 19.7, 0.0, 4.1],
    ["ga-canh", "Cánh gà cả da (sống)", 222, 18.3, 0.0, 16.0],
    ["heo-nac", "Thịt heo nạc (sống)", 139, 19.0, 0.0, 7.0, ["thịt lợn nạc", "thịt nạc"]],
    ["ba-chi", "Ba chỉ heo (sống)", 260, 16.5, 0.0, 21.5, ["ba rọi", "thịt ba chỉ", "ba chỉ lợn"]],
    ["suon-heo", "Sườn heo (sống)", 187, 17.9, 0.0, 12.8, ["sườn lợn", "sườn non"]],
    ["gio-lua", "Giò lụa / chả lụa", 136, 21.5, 0.0, 5.5, ["chả lụa", "giò"]],
    ["vit", "Thịt vịt (sống)", 267, 17.8, 0.0, 21.8],
    ["trung-ga", "Trứng gà", 143, 12.6, 0.7, 9.5, ["trứng"]],
    ["long-trang", "Lòng trắng trứng gà", 52, 10.9, 0.7, 0.2],
    ["trung-vit", "Trứng vịt", 184, 13.0, 1.0, 14.2],
    ["trung-cut", "Trứng cút", 158, 13.1, 0.4, 11.1],
    ["tom", "Tôm (sống)", 85, 20.1, 0.0, 0.5, ["tôm sú", "tôm thẻ"]],
    ["muc", "Mực (sống)", 92, 15.6, 3.1, 1.4],
    ["ca-hoi", "Cá hồi (sống)", 208, 20.4, 0.0, 13.4, ["salmon"]],
    ["ca-ngu", "Cá ngừ tươi (sống)", 109, 24.4, 0.0, 0.5],
    ["ca-ngu-hop", "Cá ngừ đóng hộp (ngâm nước)", 116, 25.5, 0.0, 0.8],
    ["ca-thu", "Cá thu (sống)", 166, 18.2, 0.0, 10.3],
    ["ca-ro-phi", "Cá rô phi (sống)", 96, 20.1, 0.0, 1.7, ["cá diêu hồng"]],
    ["ca-basa", "Cá basa / cá tra phi lê (sống)", 92, 15.0, 0.0, 3.5, ["cá tra"]],
    ["dau-phu", "Đậu phụ", 95, 10.9, 0.7, 5.4, ["đậu hũ", "tofu"]],
    ["dau-phu-chien", "Đậu phụ chiên", 270, 17.2, 10.5, 20.2, ["đậu hũ chiên", "đậu rán"]],
    ["dau-xanh", "Đậu xanh (hạt khô)", 328, 23.4, 53.1, 2.4],
    ["dau-den", "Đậu đen (hạt khô)", 325, 24.2, 53.3, 1.7],
    ["lac", "Lạc / đậu phộng (hạt)", 573, 27.5, 15.5, 44.5, ["đậu phộng"]],
    ["hat-dieu", "Hạt điều", 553, 18.2, 30.2, 43.9],
    ["hanh-nhan", "Hạnh nhân", 579, 21.2, 21.6, 49.9],
  ]),
  ...rows("dairy", [
    ["sua-tuoi", "Sữa tươi không đường", 61, 3.2, 4.8, 3.3, ["sữa bò"]],
    ["sua-chua", "Sữa chua không đường", 61, 3.5, 4.7, 3.3, ["yaourt", "da ua"]],
    ["sua-chua-hy-lap", "Sữa chua Hy Lạp không béo", 59, 10.2, 3.6, 0.4, ["greek yogurt"]],
    ["sua-dau-nanh", "Sữa đậu nành không đường", 33, 2.9, 1.7, 1.6],
    ["sua-dac", "Sữa đặc có đường", 321, 7.9, 54.4, 8.7],
  ]),
  ...rows("veg", [
    ["rau-muong", "Rau muống", 19, 2.6, 3.1, 0.2],
    ["sup-lo-trang", "Súp lơ trắng", 25, 1.9, 5.0, 0.3, ["bông cải trắng"]],
    ["sup-lo-xanh", "Bông cải xanh", 34, 2.8, 6.6, 0.4, ["súp lơ xanh", "broccoli"]],
    ["cai-bap", "Cải bắp", 25, 1.3, 5.8, 0.1, ["bắp cải"]],
    ["cai-xanh", "Cải xanh", 27, 2.9, 4.7, 0.4, ["cải đắng", "cải ngọt"]],
    ["cai-thia", "Cải thìa", 13, 1.5, 2.2, 0.2, ["cải chíp", "bok choy"]],
    ["cai-bo-xoi", "Cải bó xôi", 23, 2.9, 3.6, 0.4, ["rau bina", "rau chân vịt"]],
    ["rau-ngot", "Rau ngót", 35, 5.3, 3.4, 0.0],
    ["mong-toi", "Mồng tơi", 14, 2.0, 1.4, 0.0],
    ["xa-lach", "Xà lách", 15, 1.4, 2.9, 0.2, ["rau diếp"]],
    ["bi-do", "Bí đỏ", 26, 1.0, 6.5, 0.1, ["bí ngô"]],
    ["bi-dao", "Bí xanh / bí đao", 13, 0.4, 3.0, 0.2],
    ["ca-rot", "Cà rốt", 41, 0.9, 9.6, 0.2],
    ["ca-chua", "Cà chua", 18, 0.9, 3.9, 0.2],
    ["dua-chuot", "Dưa chuột", 15, 0.7, 3.6, 0.1, ["dưa leo"]],
    ["gia-do", "Giá đỗ", 30, 3.0, 5.9, 0.2, ["giá"]],
    ["dau-que", "Đậu cô ve", 31, 1.8, 7.0, 0.2, ["đậu que"]],
    ["dau-bap", "Đậu bắp", 33, 1.9, 7.5, 0.2],
    ["ca-tim", "Cà tím", 25, 1.0, 5.9, 0.2],
    ["su-hao", "Su hào", 27, 1.7, 6.2, 0.1],
    ["cu-cai", "Củ cải trắng", 18, 0.6, 4.1, 0.1],
    ["hanh-tay", "Hành tây", 40, 1.1, 9.3, 0.1],
    ["ot-chuong", "Ớt chuông", 31, 1.0, 6.0, 0.3],
    ["mang-tay", "Măng tây", 20, 2.2, 3.9, 0.1],
    ["nam-huong", "Nấm hương tươi", 34, 2.2, 6.8, 0.5, ["nấm đông cô", "shiitake"]],
    ["nam-kim-cham", "Nấm kim châm", 37, 2.7, 7.8, 0.3],
    ["nam-rom", "Nấm rơm", 32, 3.8, 4.6, 0.7],
  ]),
  ...rows("fruit", [
    ["chuoi", "Chuối", 89, 1.1, 22.8, 0.3],
    ["tao", "Táo", 52, 0.3, 13.8, 0.2],
    ["cam", "Cam", 47, 0.9, 11.8, 0.1],
    ["buoi", "Bưởi", 38, 0.8, 9.6, 0.0],
    ["dua-hau", "Dưa hấu", 30, 0.6, 7.6, 0.2],
    ["xoai", "Xoài chín", 60, 0.8, 15.0, 0.4],
    ["du-du", "Đu đủ chín", 43, 0.5, 10.8, 0.3],
    ["thanh-long", "Thanh long", 60, 1.2, 13.0, 0.0],
    ["oi", "Ổi", 68, 2.6, 14.3, 1.0],
    ["bo-qua", "Bơ (quả)", 160, 2.0, 8.5, 14.7, ["trái bơ", "avocado"]],
    ["nho", "Nho", 69, 0.7, 18.1, 0.2],
    ["dua", "Dứa", 50, 0.5, 13.1, 0.1, ["thơm", "khóm"]],
  ]),
  ...rows("condiment", [
    ["dau-an", "Dầu ăn", 884, 0.0, 0.0, 100.0, ["dầu thực vật", "dầu đậu nành"]],
    ["dau-o-liu", "Dầu ô liu", 884, 0.0, 0.0, 100.0, ["olive"]],
    ["mo-lon", "Mỡ heo", 902, 0.0, 0.0, 100.0, ["mỡ lợn"]],
    ["bo-lat", "Bơ lạt (butter)", 717, 0.9, 0.1, 81.1, ["bơ động vật"]],
    ["mayonnaise", "Sốt mayonnaise", 680, 1.0, 0.6, 75.0, ["mayo"]],
    ["nuoc-cot-dua", "Nước cốt dừa", 230, 2.3, 5.5, 23.8],
    ["nuoc-mam", "Nước mắm", 35, 5.1, 3.6, 0.0, ["mắm"]],
    ["xi-dau", "Nước tương / xì dầu", 53, 8.1, 4.9, 0.6, ["nước tương"]],
    ["tuong-ot", "Tương ớt", 93, 1.9, 19.2, 0.9],
    ["tuong-ca", "Tương cà", 101, 1.0, 27.4, 0.1, ["ketchup"]],
    ["duong", "Đường trắng", 387, 0.0, 100.0, 0.0, ["đường"]],
    ["mat-ong", "Mật ong", 304, 0.3, 82.4, 0.0],
  ]),
];
