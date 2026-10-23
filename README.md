# 封印設施（暫名）

給國小四～六年級的 3D 網頁解謎遊戲：護衛機器人帶著有限的電力往設施深處走，每一道門都要用「推演手套」
想出封印艙裡雙足／四足生物的組成，再到密碼盤輸入答案（只有一次機會），拿門後寶箱的電池補電，看能走多遠。
在不知不覺中練習雞兔同籠的假設法。three.js + Vite + TypeScript，純前端。

- 線上版：<https://jerryftj-git.github.io/seal-facility/>
- 流程（電力限時探索）：出發（120 秒電力）→ 掃描台 → 封印艙（推演手套）→ 大門密碼盤 → 門後寶箱（電池）→ 下一段走廊 → … → 電力耗盡 → 任務結束

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
| `?seed=123` | 固定亂數種子，每一局的題目、側室序列相同（`?seed=7` 第 1 門是 5 隻、18 個接觸點） |
| `?fps=1` | 右上角顯示幀率、draw call、三角形數（在 iPad 上檢查效能用） |

## 操作

| | PC | iPad |
|---|---|---|
| 移動 | WASD（按住 Shift 慢走） | 左半邊虛擬搖桿（輕推慢走、推到底跑） |
| 視角 | 滑鼠（點畫面鎖定游標） | 右半邊拖曳 |
| 互動 | E | 靠近時右下角出現的互動鈕 |
| 推演手套 | 封印艙前按 E | 互動鈕 |
| 封印解除碼 | 大門右側密碼盤前按 E；數字鍵 0–9、Backspace、Enter | 互動鈕；螢幕鍵盤 |
| 離開面板 | E | 面板右上「離開」 |
| 暫停 | Esc（或滑鼠被解除鎖定） | 右上角暫停鈕 |

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
| `agent.glb` | 探員 | 高約 1.8 m | 腳底中心，**面向 −Z**（和其他模型相反，見下方「探員模型規格」） | 選用動畫 `idle`、`walk`、`run`（可含骨架） |
| `scout.glb` | 偵察體（雙足） | 高約 0.9 m，長 0.6 m | 腳底中心，面向 +Z | 選用：腳底空物件 `foot_*`（觸地點標記用）。生物動畫目前不會播放 |
| `hunter.glb` | 獵獸（四足） | 高約 0.55 m，長 1.1 m | 腳底中心，面向 +Z | 同上 |
| `seal_pod.glb` | 封印艙（長型培養槽） | 寬 5.4 m（X）、深 1.5 m、高 2.7 m；生物排在艙內，`slots_start`／`slots_end` 兩端要離玻璃至少 0.5 m | 底面中心，正面朝 +Z | **`glass`**（玻璃 mesh，除霧時調透明度）；空物件 `readout_N`、`readout_L`（讀數面板位置）、`slots_start`、`slots_end`（生物排列的兩端，`slots_start` 是第 0 隻、在正面看的右手邊） |
| `door.glb` | 門 | 開口 4.4 × 3.4 m，外框 6 × 4 m | 地面中心，正面朝 +Z | 三擇一：① 動畫 `open`；② 節點 `lock_bar`、`seg_0`～`seg_3`（左外、左內、右內、右外，程式會做分段滑開）；③ 都沒有就整扇往上升。選用 `status_light`（mesh，解鎖時轉綠） |
| `chest.glb` | 寶箱 | 0.9 × 0.6 × 0.6 m | 底面中心，正面朝 +Z | 選用動畫 `open`，或節點 `lid`（樞紐放在後上緣，程式會繞 X 軸打開）；選用空物件 `battery_anchor`（電池出現位置） |
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

目前的主角是「護衛機器人」，從設計圖 `art/concepts/sheets/agent_ai_robot_sheet.webp` 的正面用 AI 生成，
動作是 Mixamo 的 Standard Walk（走路）與 Running（跑步）重定向上去的（流程見下方「從概念圖做出探員」）。

舊版本備份在 `art/backup/`，複製回 `public/models/agent.glb` 就能換回去：

| 檔案 | 造型 | `WALK_CLIP_SPEED`／`RUN_CLIP_SPEED` |
|---|---|---|
| `agent_robot_orange.glb` | 黑白橘機器盔甲（Standard Run） | 1.25／3.52 |
| `agent_human.glb` | 真人探員（墨鏡、深藍戰鬥服） | 1.25／3.52 |
| `agent_mixamo_beta.glb` | Mixamo Beta 人偶 | 1.56／4.4 |

| 項目 | 規格 |
|---|---|
| 檔名 | `public/models/agent.glb` |
| 高度 | 約 1.8 公尺 |
| 原點 | 兩腳之間的地面（腳底） |
| 朝向 | 臉朝 **−Z**（glTF 座標）。程式載入後會轉 180°，對齊遊戲內的前進方向 |
| 動畫剪輯 | `idle`（待機）、`walk`（走路）、`run`（跑步），都要可循環，**原地動畫**（沒有根骨位移） |
| 骨架 | 可有可無。有骨架與動畫時用 AnimationMixer 播放，沒有動畫就維持上下晃動 |

- 依移動速度混合：停下 → `idle`，慢走（1.6 m/s：按住 **Shift**，或搖桿輕推）→ `walk`，全速（4.2 m/s）→ `run`，中間速度平滑混合。
- 播放速度會依實際移動速度調整，讓腳步對得上地面。動畫原本的步伐速度寫在 `src/player/locomotion.ts` 的 `WALK_CLIP_SPEED`、`RUN_CLIP_SPEED`；換成步伐差很多的動畫時改這兩個數字。
- 名稱不分大小寫，也接受 `Armature|run` 這種格式。缺 `walk` 時用 `run` 代替，反之亦然；缺 `idle` 時停下會凍結在當下的姿勢。
- 推演模式（時間停止）時動畫會凍結。

#### 從概念圖做出探員（AI 生成 → 綁骨 → 套 Mixamo 動作）

需要本機的 Hunyuan3D 2.1 環境（`~/tools/hy3d-venv`）、Blender 4.4 以上，以及 `godot-ai-3d-assets` 技能的腳本。
在專案根目錄依序執行：

1. 轉面圖放進 `art/concepts/sheets/`，在 `art/concepts/crops.json` 寫正面那一格的範圍（比例 0～1），然後切圖去背：

```bash
~/tools/hy3d-venv/bin/python ~/.claude/skills/godot-ai-3d-assets/scripts/ai3d/prep_concepts.py agent
```

2. 生成網格＋貼圖（約 3 分鐘，GPU 一次只跑一件事）：

```bash
FACES=16000 ~/.claude/skills/godot-ai-3d-assets/scripts/ai3d/run_all.sh agent
```

3. 綁骨（骨架位置從網格量：手、手臂中心線、胯下、腿；A 字、T 字或手臂下垂的站姿都可以，A 字效果最好）：

```bash
blender -b --python tools/rig-agent.py -- art/generated/agent_tex/agent_textured.obj art/generated/rig/agent_rest.glb
```

4. 把 Mixamo 動畫重定向上去、縮放 1.8 m、貼地、面向 −Z、匯出：

```bash
blender -b --python tools/retarget-agent.py -- --rig art/generated/rig/agent_rest.glb --walk "$HOME/下載/Standard Walk.fbx" --run "$HOME/下載/Standard Run.fbx" --arm-swing 0.6 --out public/models/agent.glb
```

   `--arm-swing`：手臂擺動幅度（1 = 照原動畫）。第 3 步若印出「手臂和軀幹黏在一起」（手臂下垂的站姿，AI 常把手臂和身體生成成一整塊），
   用 0.6 左右，腰側才不會被手拉出一片；A 字站姿用 1 即可。
   最後會印出「步幅比例」：把 `src/player/locomotion.ts` 的 `WALK_CLIP_SPEED`／`RUN_CLIP_SPEED` 設成
   1.56 × 比例、4.4 × 比例，腳步才不會打滑。
5. 檢查：`blender -b -P ~/.claude/skills/godot-ai-3d-assets/scripts/preview/check_glb.py -- public/models/agent.glb /tmp/check.json`，
   各動作的「最大拉長」應在 10 公分左右以內、最低點約 0。

`art/generated/` 是中間檔（很大），不進版本控制。

#### 從 Mixamo 換一個探員（自動轉換腳本）

1. 到 [Mixamo](https://www.mixamo.com/) 選角色（或上傳自己的角色讓它自動綁骨）。
2. 下載動畫，格式 **FBX Binary**、30 fps：
   - **走路**：Skin 選 **With Skin**（這一個檔案同時提供角色網格）。
   - **跑步**、**待機**：With Skin 或 Without Skin 都可以，只會用到動作。
   - 不用勾 In Place，腳本會自動去掉根骨位移。
3. 在專案根目錄執行（需要 Blender 4.4 以上；`--idle` 可省略）：

```bash
blender -b --python tools/mixamo-to-glb.py -- --character "$HOME/下載/Standard Walk.fbx" --walk "$HOME/下載/Standard Walk.fbx" --run "$HOME/下載/Standard Run.fbx" --idle "$HOME/下載/Idle.fbx" --out public/models/agent.glb
```

   腳本會：合併動畫、去掉根骨位移、改名成 idle／walk／run、縮放成 1.8 m、腳底貼地、轉成面向 −Z、匯出 glb。
   - 沒給 `--idle` 時，會從走路動畫挑「兩腳最靠近」的那一格當成靜止的待機姿勢。
4. 重新整理遊戲，Console 會顯示 `[AssetLoader] glb: agent`。如果新動畫的步伐速度不同，調整上面提到的 `WALK_CLIP_SPEED`／`RUN_CLIP_SPEED`。

想手動在 Blender 裡做也可以，重點是：三個動作命名成 `idle`／`walk`／`run`、去掉 Hips 的水平位移、角色繞 Z 軸轉 180°（從前視圖 Numpad 1 看到背面）、匯出 glTF Binary 並帶上動畫。

### 電力限時探索（規則數值在 `src/run/runConfig.ts` 的 `RUN_CONFIG`）

| 欄位 | 預設 | 意思 |
|---|---|---|
| `startPower` | 120 | 起始電力（秒），按「出發」開始倒數；只有暫停選單會停 |
| `creatures` | base 4、max 12 | 第 k 道門 N = min(4 + k, 12) |
| `hunterRange` | 1 ～ N−1 | 答案的獵獸數範圍（`generatePuzzle` 隨機產題） |
| `chestBattery` | 40 | 門後寶箱的大電池 |
| `hiddenBattery` | 15 | 每段側室裡的小電池 |
| `alarmSeconds` | 20 | 答錯的保全閉鎖，之後換題 |
| `lowPower`、`criticalPower` | 20、5 | 低電力（轉橘閃爍、走廊轉紅、心跳）、心跳加快 |
| `pointsPerDoor` | 10 | 每通過一道門的分數 |
| `corridorColors` | 青、紫、橘 | 每段走廊線條輪流的配色 |
| `maxSegments` | 2 | 同時存在的走廊段數 |
| `batteryAnimSeconds`、`powerOutSeconds`、`resumeCountdown` | 0.5、1.5、3 | 電力條滑動、關機演出、暫停回來前的倒數 |

- **走廊**：每一道門是一段 44 m 的模板（`src/world/Segment.ts`）：掃描台、封印艙、大門＋密碼盤、門後 2 m 的寶箱、三間候選側室（每段隨機開一間，`src/world/SideRoom.ts`）。
  大門開啟時在門後接上下一段；走進下一段後，背後的隔門關上，關好才卸載上一段（`src/core/Level.ts`）。
- **題目**：`src/run/doors.ts`；答錯換題用 `redeployPuzzle`（`src/puzzle/answer.ts`）。
- **存檔**：只存最佳紀錄（最高分數、最多門數）和開場是否看過（`src/core/saveData.ts`）。進行中的一局不存檔。
  想重新體驗「第一次」：在瀏覽器 Console 執行 `localStorage.removeItem('sealFacility.save.v1')` 後重新整理。
- **走廊線條換色**：線條材質名稱是 `accent`，`recolorAccent()` 會把它換成該段的顏色。之後換成 glb 走廊時，發光線條的材質也命名為 `accent` 就能跟著換色。
  側室那一節是程式產生的幾何（`buildSideRoom`），換成 glb 走廊時要另外處理。

### 主角外觀參數（和場景的融合）

主角的材質色調、青色邊緣光、腳下陰影、環境反射、SSAO、鏡頭距離都集中在 `src/core/agentLook.ts` 的 `AGENT_LOOK`，
改數字重新整理就能看到。`style: 'toon'` 可以切回柔和卡通著色。

### 注意事項

- **碰撞不讀模型**：走廊範圍、艙、門、寶箱的碰撞框寫在 `src/world/Segment.ts`（`LAYOUT` 和 `world.add(...)`）。
  模型尺寸和上表差很多時，要一起調整那裡。
- **生物模型也會拿來做全像投影**：投影時所有材質會換成全像 shader，只看得出剪影和輪廓，所以剪影要好認。
  場上最多同時有 12 隻投影 + 12 隻真實生物（9 隻以上分上下兩層），每隻建議 **3,000 個三角形以內**。
- 效能預算（手機等級）：整個場景 draw call 100 以內、三角形 10 萬以內，不開陰影、不做後處理。可以用 `?fps=1` 檢查。
- 檔案要真的是 glb：`AssetLoader` 會檢查檔頭的 `glTF` 標記，不是 glb 就退回佔位模型。

## 專案結構

```
src/
├─ core/      遊戲迴圈、流程狀態機（Game）、無限走廊（Level：串接／卸載段落＋隔門＋燈光池）、碰撞、補間、音效、存檔、色票與材質
├─ run/       電力限時探索的規則：設定（RUN_CONFIG）、電力、每道門的題目、最佳紀錄（純邏輯）
├─ world/     場景實體：一段走廊（Segment）、側室、電池、封印艙、全像投影、掃描台、門、寶箱、警示燈、生物小圖、氛圍效果
├─ player/    輸入（鍵鼠／觸控統一介面）、角色控制、追尾鏡頭
├─ puzzle/    純邏輯（不依賴 three.js）：生物種類、讀數、產題、封印解除碼的判定與換題
├─ ui/        HUD（電力條）、觸控搖桿、推演手套面板（數線）、密碼盤、暫停選單、開場、標題／任務結束畫面、CSS
└─ assets/    AssetLoader、資產清單、佔位模型
tests/        Vitest：puzzle、run 的全部邏輯，以及存檔、碰撞、互動判定、燈光池、數線、開場點擊規則
```

### puzzle/ 的擴充點（給之後的里程碑）

- **生物種類**是清單（`SpeciesDef { id, name, legs }`），新增種類不用改邏輯。
- **`Modifier`**：改變每隻生物的受力點數，例如里程碑 2 的重力靴（`legsOf: (s, legs) => legs - 2`）。
- **作答**（`answer.ts`）：`checkCode`、`redeployPuzzle`（答錯換題，用 `generatePuzzle`）。

設計與實作上的細節決定記在 [DECISIONS.md](DECISIONS.md)，待確認事項在 [QUESTIONS.md](QUESTIONS.md)。
