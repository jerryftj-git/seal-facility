# 封印設施（暫名）

給國小四～六年級的 3D 網頁解謎遊戲：玩家用「推演手套」推出封印艙裡雙足／四足生物的組成，
在不知不覺中練習雞兔同籠的假設法。three.js + Vite + TypeScript，純前端。

- 線上版：<https://jerryftj-git.github.io/seal-facility/>
- 里程碑 1：出生點 → 走廊 → 封印艙 + 門 → 寶箱 → 結算

## 本機執行

需要 Node.js 22 以上。

```bash
npm install
npm run dev
```

打開終端機顯示的 `http://localhost:5173/`。

### 用 iPad 測試

`npm run dev` 已經開放區網連線（`server.host = true`）。iPad 和電腦連同一個 Wi-Fi，
用 Safari 打開終端機上 `Network:` 那一行的網址（例如 `http://192.168.x.x:5173/`）。
偵測到觸控裝置會自動切換成搖桿介面。

### 其他指令

| 指令 | 用途 |
|---|---|
| `npm test` | 跑 Vitest（`tests/`） |
| `npm run test:watch` | 監看模式 |
| `npm run typecheck` | TypeScript 型別檢查 |
| `npm run build` | 型別檢查 + 打包到 `dist/` |
| `npm run preview` | 預覽打包結果 |

### 網址參數（除錯用）

| 參數 | 作用 |
|---|---|
| `?seed=123` | 固定亂數種子，每次進關的題目序列相同 |
| `?fps=1` | 右上角顯示幀率、draw call、三角形數（在 iPad 上檢查效能用） |

## 操作

| | PC | iPad |
|---|---|---|
| 移動 | WASD | 左半邊虛擬搖桿（從手指按下的地方展開） |
| 視角 | 滑鼠（點畫面鎖定游標，Esc 解除） | 右半邊拖曳 |
| 互動 | E | 靠近時右下角出現的互動鈕 |
| 推演：轉雙足／轉四足 | 點面板按鈕，或 A／← 、D／→（可按住連按） | 點面板按鈕（可按住連按） |
| 離開推演 | E／Esc | 面板右上「離開」 |

## 部署到 GitHub Pages

已經設定好：push 到 `main` 就會自動跑 `.github/workflows/deploy.yml`
（安裝 → 測試 → 打包 → 部署）。也可以在 GitHub 的 Actions 頁面手動按 **Run workflow**。

- 網站放在 `/<repo 名稱>/` 底下，workflow 會用 `VITE_BASE=/${{ github.event.repository.name }}/` 打包，
  所以 repo 改名也不用改程式。
- 本機想模擬 Pages 的路徑：`VITE_BASE=/seal-facility/ npm run build && npx vite preview --base /seal-facility/`
- 如果改用自訂網域（網站在根目錄），把 workflow 裡的 `VITE_BASE` 改成 `/`。
- 新 repo 第一次部署前，要到 **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**
  （`seal-facility` 已經設定好了）。

## 替換 3D 模型（Blender → glTF）

把 Blender 匯出的 `.glb` 放到 **`public/models/`**，檔名用下表的 id，重新整理就會取代佔位模型，
不用改程式。沒放的就繼續用佔位幾何體。瀏覽器 Console 會印出哪些是從 glb 載入的：

```
[AssetLoader] glb: chest, door；其餘使用佔位模型
```

### 檔名與約定

| 檔名 | 內容 | 參考尺寸 | 原點與朝向 | 必要／選用的節點、動畫 |
|---|---|---|---|---|
| `agent.glb` | 探員 | 高約 1.8 m | 腳底中心，**面向 −Z**（和其他模型相反，見下方「探員模型規格」） | 選用動畫 `idle`、`run`（可含骨架） |
| `scout.glb` | 偵察體（雙足） | 高約 0.9 m，長 0.6 m | 腳底中心，面向 +Z | 選用：腳底空物件 `foot_*`（觸地點標記用）。生物動畫目前不會播放 |
| `hunter.glb` | 獵獸（四足） | 高約 0.55 m，長 1.1 m | 腳底中心，面向 +Z | 同上 |
| `seal_pod.glb` | 封印艙（長型培養槽） | 寬 5.4 m（X）、深 1.5 m、高 2.7 m；生物排在艙內，`slots_start`／`slots_end` 兩端要離玻璃至少 0.5 m | 底面中心，正面朝 +Z | **`glass`**（玻璃 mesh，除霧時調透明度）；空物件 `readout_N`、`readout_L`（讀數面板位置）、`slots_start`、`slots_end`（生物排列的兩端，`slots_start` 是第 0 隻、在正面看的右手邊） |
| `door.glb` | 門 | 開口 4.4 × 3.4 m，外框 6 × 4 m | 地面中心，正面朝 +Z | 三擇一：① 動畫 `open`；② 節點 `lock_bar`、`seg_0`～`seg_3`（左外、左內、右內、右外，程式會做分段滑開）；③ 都沒有就整扇往上升。選用 `status_light`（mesh，解鎖時轉綠） |
| `chest.glb` | 寶箱 | 0.9 × 0.6 × 0.6 m | 底面中心，正面朝 +Z | 選用動畫 `open`，或節點 `lid`（樞紐放在後上緣，程式會繞 X 軸打開）；選用空物件 `chip_anchor`（晶片出現位置） |
| `corridor_straight.glb` | 走廊直段 | 寬 6 m、高 4 m、長 4 m | 段落起點的地面中心，沿 **−Z** 延伸 4 m | — |
| `corridor_end.glb` | 走廊端牆 | 6 × 4 m | 牆面在 z = 0，朝 +Z | — |

### Blender 匯出設定

- **File → Export → glTF 2.0**，Format 選 **glTF Binary (.glb)**。
- 單位：1 Blender 單位 = 1 公尺。
- **+Y Up** 保持勾選（預設）。Blender 的「正面」（Numpad 1 看到的 −Y 方向）匯出後就是上表說的 +Z。
- 勾選 **Apply Modifiers**；有動畫就勾 **Animation**，動作（Action）名稱要和上表的動畫名稱一樣。
- 材質用 Principled BSDF（會轉成 three.js 的 MeshStandardMaterial），發光部分用 Emission。
- 空物件（Empty）的名稱會原樣保留，用來標記 `readout_N`、`foot_L` 這類位置。

### 探員模型規格（含骨架動畫）

| 項目 | 規格 |
|---|---|
| 檔名 | `public/models/agent.glb` |
| 高度 | 約 1.8 公尺 |
| 原點 | 兩腳之間的地面（腳底） |
| 朝向 | 臉朝 **−Z**（glTF 座標）。程式載入後會轉 180°，對齊遊戲內的前進方向 |
| 動畫剪輯 | `idle`（待機）、`run`（跑步）。都要做成可循環的，**原地動畫（In Place）**，不能有根骨位移 |
| 骨架 | 可有可無。有骨架與動畫時用 AnimationMixer 播放，沒有動畫就維持現在的上下晃動 |

- 遊戲依移動速度在 `idle` 和 `run` 之間平滑混合（約 0.3 秒），慢速移動時跑步動畫會放慢，減少腳底打滑。
- 名稱不分大小寫，也接受 Blender 匯出常見的 `Armature|run` 這種「物件|動作」格式。
- 找不到 `run` 時會改用 `walk`；兩個都找不到時會循環播放第一個剪輯，並在 Console 警告。
- 推演模式（時間停止）時動畫會凍結。

#### 從 Mixamo 取得動畫並匯出 .glb

1. 到 [Mixamo](https://www.mixamo.com/) 上傳角色（或選一個現成角色），完成自動綁骨。
2. 搜尋待機動畫（例如 *Idle*），右側勾選 **In Place**（若有這個選項），按 **Download**：
   - Format：**FBX Binary (.fbx)**
   - Skin：**With Skin**
   - Frames per Second：30
3. 同樣下載跑步動畫（例如 *Running*，一定要勾 **In Place**）。這一份可以選 **Without Skin**，只要動作。
4. 開 Blender（4.x），**File → Import → FBX** 匯入待機那一份（含 Skin 的）。
   - Mixamo 的 FBX 常常是 100 倍大：匯入後選骨架，把 Scale 調到身高約 1.8 m，然後 **Ctrl+A → All Transforms** 套用。
5. 再匯入跑步那一份。打開 **Dope Sheet → Action Editor**，會看到兩個動作（名稱多半是 `mixamo.com` 之類）：
   - 把它們分別改名成 **`idle`** 和 **`run`**。
   - 兩個動作都按一下盾牌圖示（**Fake User**），避免存檔時被清掉。
   - 用 **Push Down** 把兩個動作都推到骨架的 NLA 軌道上。
   - 刪掉第二份匯入時多出來的骨架，只保留一副骨架加角色網格。
6. **調整朝向**：Mixamo 角色匯入後臉朝 Blender 的 −Y（從前視圖 Numpad 1 看得到臉），匯出後會是 +Z。
   - 本專案要 **−Z**，所以把骨架連同網格繞 Z 軸轉 **180°**（`R` `Z` `180`），再 **Ctrl+A → Rotation** 套用。
   - 轉好之後，從前視圖（Numpad 1）看到的應該是角色的背面。
7. **File → Export → glTF 2.0**：
   - Format：**glTF Binary (.glb)**
   - Include：勾選 **Selected Objects**（先選好骨架和網格）
   - Transform：**+Y Up** 保持勾選
   - Data → Mesh：勾選 **Apply Modifiers**
   - Animation：勾選，模式選 **Actions**（或 NLA Tracks），確認 `idle`、`run` 都有匯出
8. 存成 `public/models/agent.glb`，重新整理遊戲。Console 會顯示 `[AssetLoader] glb: agent`。
   - 走路時角色臉朝前進方向就對了；如果倒著走，代表第 6 步的朝向沒轉。

### 注意事項

- **碰撞不讀模型**：走廊範圍、艙、門、寶箱的碰撞框寫在 `src/core/Level.ts`（`LAYOUT` 和 `world.add(...)`）。
  模型尺寸和上表差很多時，要一起調整那裡。
- **生物模型也會拿來做全像投影**：投影時所有材質會換成全像 shader，只看得出剪影和輪廓，所以剪影要好認。
  場上最多同時有 8 隻投影 + 8 隻真實生物，每隻建議 **3,000 個三角形以內**。
- 效能預算（手機等級）：整個場景 draw call 100 以內、三角形 10 萬以內，不開陰影、不做後處理。可以用 `?fps=1` 檢查。
- 檔案要真的是 glb：`AssetLoader` 會檢查檔頭的 `glTF` 標記，不是 glb 就退回佔位模型。

## 專案結構

```
src/
├─ core/      遊戲迴圈、流程狀態機（Game）、關卡（Level）、碰撞、補間、音效、色票與材質
├─ world/     場景實體：封印艙、全像投影、門、寶箱、警示燈、氛圍效果
├─ player/    輸入（鍵鼠／觸控統一介面）、角色控制、追尾鏡頭
├─ puzzle/    純邏輯（不依賴 three.js）：生物種類、讀數、產題、推演狀態機、評級
├─ ui/        HUD、觸控搖桿、推演手套面板、標題／結算畫面、CSS
└─ assets/    AssetLoader、資產清單、佔位模型
tests/        Vitest：puzzle 全部邏輯，以及碰撞、互動判定、按住連發
```

### puzzle/ 的擴充點（給之後的里程碑）

- **生物種類**是清單（`SpeciesDef { id, name, legs }`），新增種類不用改邏輯。
- **`Modifier`**：改變每隻生物的受力點數，例如里程碑 2 的重力靴（`legsOf: (s, legs) => legs - 2`）。
- **`startAssumption`**：`'allBiped'`（預設）或 `'random'`（起點隨機但不等於答案）。
- **動作**：`apply(state, { type: 'convert' })` 單步、`{ type: 'batch', count }` 批次轉盤（里程碑 2），每個有效動作算一步；最少步數會依起點和工具自動計算。

設計與實作上的細節決定記在 [DECISIONS.md](DECISIONS.md)，待確認事項在 [QUESTIONS.md](QUESTIONS.md)。
