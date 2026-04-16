# AI Baby Image Generator — 实施计划

> 版本：v3（2026-04-16 定版）
> 关联需求：为 BabyBoogey 新增独立 AI 宝宝图片生成入口，并与现有 AI 舞蹈视频生成器衔接。
> 受众：后续接手的工程师（含 AI agent）。阅读本文后应能直接按 Phase 执行。

---

## 1. 目标与产品决策

### 1.1 目标
1. 新增独立入口 `/ai-baby-image-generator`，用户可上传参考照片 / 纯文字 prompt / 两者叠加，选择 8 种风格之一生成 AI 宝宝图。
2. 生成完成后支持一键跳转到现有 `/ai-baby-dance-video-generator`，**自动使用刚生成的图片**作为跳舞视频输入，省去用户二次上传。
3. SEO-friendly 落地页（en / zh / ja 三语），配 16 张 before/after showcase。

### 1.2 已确认决策

| 项 | 决策 |
|---|---|
| 落地页 slug | `/ai-baby-image-generator`（长 slug） |
| 输入模式 | 文字 prompt / 参考照片 / 两者叠加 全部支持 |
| 默认模型 | kie **Nano Banana**（Gemini 2.5 Flash Image）— 人脸一致性最强 |
| 备选模型 | Seedream 4.0（留扩展结构，v1 不启用） |
| 风格预设数 | 8 个 |
| 定价 | **40 credits / 图**（成本 $0.20，$0.017/credit 售价 = $0.68，70% 毛利） |
| 获客钩子 | **首次免费 1 张**，复用 `grantCreditsForFirstLogin` 风控 |
| 内容合规 | v1 **不接入** moderation provider，通过 ToS 兜底；R2 违禁图残留风险用户已知悉并接受 |
| 总工期 | **5 天**（Phase 0–5 相加：0.25+0.25+0.5+0.5+2+1+0.5） |

### 1.3 8 个风格预设

内部 styleId 保留原语义（用于 prompt 选择），UI label 规避商标/IP 风险：

| # | 内部 styleId | UI label (EN) | 定位 |
|---|---|---|---|
| 1 | `pixar-3d` | 3D Animation Studio | 皮克斯暗示但不写商标，流量担当 |
| 2 | `ghibli` | Hand-drawn Fantasy | 吉卜力水彩感，**避免** "Studio G Style"（粉丝一眼识别有法务风险） |
| 3 | `anime` | Classic Anime | 日系动漫，通用词安全 |
| 4 | `claymation` | Clay Sculpt | 黏土质感 |
| 5 | `chibi` | Chibi Cute | 日语通用词 OK |
| 6 | `watercolor` | Watercolor | 温暖手绘 |
| 7 | `plush` | Plush Doll | 毛绒玩偶 |
| 8 | `pixel-art` | Pixel Art | 像素风，小众差异化 |

（已砍：Simpsons / South Park — IP 风险 + Gemini 可能拒答）

---

## 2. 关键架构事实（开工前必读）

### 2.1 项目已有基础设施（不要重复造）

1. **kie provider 的 image 生成已实现**：[src/extensions/ai/kie.ts](../src/extensions/ai/kie.ts) 的 `generateImage` 接受 `{model, input: {prompt, image_input[], aspect_ratio, resolution, output_format}}`；`queryImage` 轮询 + 自动 `saveFiles()` 下载结果图到 R2 并落 `media_asset` 表。
2. **退款机制已存在**：[src/shared/models/ai_task.ts:73-122](../src/shared/models/ai_task.ts) 的 `updateAITaskById` 在 `status=FAILED && creditId` 时，事务内展开 `consumedDetail`、原子加回 credits、置 `CreditStatus.DELETED`。**幂等**通过 `CreditStatus.ACTIVE` 判断实现。Phase 1a 只需加观测字段，不要重做退款逻辑。
3. **签名 URL 批量 API 已存在**：`POST /api/storage/assets/sign`（[src/app/api/storage/assets/sign/route.ts](../src/app/api/storage/assets/sign/route.ts)），接受 `assetIds/assetRefs`，默认 10 分钟过期，最大 24 小时。Phase 4 **不需要前端主动调这个 API**——见下一条。
4. **`asset://` 引用会在 generate 路由里自动转签名绝对 URL**：`resolveAssetRefsWithSignedUrls({ absolute: true })`，透传给 kie 前已处理。**推论**：Phase 4 前端只需把 `asset://xxx` 存入 `uploadedImage.url` state，后端 generate route 自动签名，**无需前端主动重签**。
5. **现有 image 生成 UI**：[src/shared/blocks/generator/image.tsx](../src/shared/blocks/generator/image.tsx) 已有 Nano Banana 图生图完整实现，Phase 2 fork 后改风格选择器即可。
6. **首次免费 credit**：`src/shared/models/credit.ts` 的 `grantCreditsForFirstLogin` 已内置 IP 节流，baby-image 无需重复做。
7. **DB Schema 分三方言**：**不是单一** `src/config/db/schema.ts`，而是 `schema.sqlite.ts`（生产 D1）/ `schema.mysql.ts` / `schema.postgres.ts` 三份方言文件并列。Phase 1a 加字段必须同时改三处，否则切方言即崩。现有时间戳列统一使用 `integer('xxx', { mode: 'timestamp_ms' })`（sqlite/d1）。
8. **Dance 真实路由是 `/ai-video-generator`**（不是 `/ai-baby-dance-video-generator`）：[src/app/[locale]/(landing)/(ai)/ai-video-generator/page.tsx](../src/app/[locale]/(landing)/(ai)/ai-video-generator/page.tsx) 才挂 `<VideoGenerator />` 真实组件；`/ai-baby-dance-video-generator` 只是 `[...slug]` 兜底路由通过 i18n JSON 驱动的 **SEO 落地页**，**不含生成器**。Phase 4 的图→视频跳转目标 = `/ai-video-generator`。
9. **VideoGenerator 的 state 契约**：[src/shared/blocks/generator/video.tsx:630](../src/shared/blocks/generator/video.tsx) 使用 `uploadedImage: { url, ... }` state（`setUploadedImage` setter），payload 在第 1820 行 `image_input: [uploadedImage.url]`。Phase 4 handoff 就是 `setUploadedImage({ url: 'asset://xxx', ... })`。

### 2.2 Cloudflare Workers 部署相关

1. **middleware 给公共页面注入 CDN 缓存**：`s-maxage=3600, stale-while-revalidate=14400`——这是 Phase 4 **禁止用 query param 传 assetId** 的根本原因（CDN 默认不把 query param 加入 cache key，会导致跨用户污染）。
2. **D1/SQLite**：`ALTER TABLE ADD COLUMN` 支持，Phase 1a 加字段成本低。
3. **默认签名 URL 过期 10 分钟**：Phase 4 禁止沿用图片生成时的签名，必须"生成时刻"重签。

### 2.3 Credit 单价（从 [pricing.json](../src/config/locale/messages/en/pages/pricing.json) 反推）

| 档位 | $/credit |
|---|---|
| 小额包 $9.99 / 410 credits | $0.024 |
| 中额包 $19.99 / 1170 credits | $0.017（主流） |
| 大额包 $39.99 / 3040 credits | $0.013 |
| Premium 年费 | $0.011 |

40 credits/图定价在主流用户端（$0.017/credit）实现 **70.3% 毛利**。

---

## 3. 实施阶段

### Phase 0 · 开工前校验（0.25 天）

**产出**：一份"可以安全开工"的确认清单。

- [ ] 登录 kie market（https://kie.ai/market）确认 Nano Banana 精确 model ID 字符串；计划文档用的 `google/nano-banana` 是**假设值**，必须用实测值替换
- [ ] dev 环境手跑一次 `POST https://api.kie.ai/api/v1/jobs/createTask` 验证联通（任意 prompt + 任意 styleId 对应的 prompt 模板）
- [ ] 读通 [src/app/api/ai/query/route.ts](../src/app/api/ai/query/route.ts) 的退款调用路径，确认 notify 路由和 query 路由双重触发时是否有竞态（预期：`CreditStatus.ACTIVE` 判断已幂等，但需肉眼确认）
- [ ] 把实测到的 model ID 回填到本文档和代码常量

**阻断性**：Phase 0 未完成禁止进入 Phase 1。

### Phase 1a · 退款观测性加固（0.25 天）

**目标**：不重做退款，仅加运营对账字段。

- [ ] **同时改三份方言 schema**（不要只改其中一个，CI 可能只跑 sqlite 会漏网）：
  - `src/config/db/schema.sqlite.ts`（生产 D1）：
    ```ts
    refundedAt: integer('refunded_at', { mode: 'timestamp_ms' }),
    refundReason: text('refund_reason'),
    ```
  - `src/config/db/schema.mysql.ts`：按现有 timestamp 列风格加 `timestamp`/`datetime` + `varchar(64)` 或 `text`
  - `src/config/db/schema.postgres.ts`：按现有风格加 `timestamp` + `varchar(64)` 或 `text`
- [ ] `pnpm db:generate` 生成 migration（三方言），`pnpm db:migrate` 在 dev 执行
- [ ] [src/shared/models/ai_task.ts](../src/shared/models/ai_task.ts) 的 `updateAITaskById` 退款分支（L76-L108）里，在最后 `.update(aiTask).set(updateAITask)` 前把 `updateAITask.refundedAt = new Date(); updateAITask.refundReason = updateAITask.refundReason ?? 'task_failed'` 注入到 payload（Drizzle sqlite `timestamp_ms` mode 接受 Date 对象）
- [ ] admin/ai-tasks 列表加一列显示 refund 状态（后续运营需要）

**覆盖面**：现有 music / video / image scene 全部自动继承（它们都走 `updateAITaskById`）。**无行为变化**，只加字段。

### Phase 1b · baby-image 路由 + 业务服务（0.5 天）

**架构位置**（审查代理建议拆分）：

```
src/shared/services/baby-image/
├── styles.ts    # 8 风格 prompt 模板，结构 Record<styleId, Record<modelId, string>>
└── config.ts    # scene 常量（BABY_IMAGE_SCENE = 'baby-image'）、costCredits = 40、defaultModel
```

- [ ] 新建 `src/shared/services/baby-image/config.ts`：
  ```ts
  export const BABY_IMAGE_SCENE = 'baby-image';
  export const BABY_IMAGE_COST_CREDITS = 40;
  export const BABY_IMAGE_DEFAULT_MODEL = '<Phase 0 实测的 kie model ID>';
  ```
- [ ] 新建 `src/shared/services/baby-image/styles.ts`：8 风格 × ≥1 模型的 prompt 模板，结构如：
  ```ts
  export const BABY_STYLES: Record<string, Record<string, string>> = {
    'pixar-3d': {
      'google/nano-banana': 'Transform into a Pixar-style 3D animated baby character, huge sparkling eyes, soft rounded face, subsurface scattering skin, cinematic lighting, ultra high quality 3D render',
      // 'bytedance/seedream-v4': '...' (v1 暂不填)
    },
    // ...剩下 7 个
  };
  ```
- [ ] [src/app/api/ai/generate/route.ts](../src/app/api/ai/generate/route.ts) 加 baby-image 分支：
  - 按 `options.styleId` + `options.model || defaultModel` 查模板，拼最终 prompt
  - `scene = BABY_IMAGE_SCENE`，`costCredits = BABY_IMAGE_COST_CREDITS`
  - `image_input` / `aspect_ratio` 走现有透传
- [ ] **不改 kie.ts**（现有 generateImage 已覆盖所有需求）

### Phase 2 · Generator UI（0.5 天）

- [ ] Fork [src/shared/blocks/generator/image.tsx](../src/shared/blocks/generator/image.tsx) → `src/shared/blocks/generator/baby-image.tsx`
- [ ] 砍掉 **UI 上的** provider / model 选择器（下拉组件 + `MODEL_OPTIONS` / `PROVIDER_OPTIONS` 常量）
- [ ] ⚠️ **保留请求体的 `provider` / `model` 字段**——后端 `generate` route 仍按这两个字段分发。UI 砍掉 ≠ payload 砍掉。fork 后硬编码 `provider='kie', model=<BABY_IMAGE_DEFAULT_MODEL>`，仍传进 request body
- [ ] 新增 **8 风格卡片网格**（每张卡片一个缩略图 + UI label），单选
- [ ] 保留：prompt 输入、参考图上传（复用现有 upload 组件）、aspect ratio、轮询 pattern、credit 成本显示
- [ ] 成功结果面板加 CTA "Make them dance →"（Phase 4 连接）
- [ ] **契约（与 Phase 1b 对齐）**：请求体统一为 `{ provider, model, scene: 'baby-image', prompt, options: { styleId, image_input?, aspect_ratio } }`。后端按 `styleId` 查 prompt 模板并与 user prompt 拼接

### Phase 3 · 落地页 + SEO（2 天）

- [ ] 新路由 `src/app/[locale]/(landing)/(ai)/ai-baby-image-generator/page.tsx`，结构对齐 `ai-video-generator/page.tsx`：Hero → Generator → Showcase → FAQ → CTA
- [ ] [src/config/locale/index.ts](../src/config/locale/index.ts) 的 `localeMessagesPaths` 追加两项：
  - `ai/baby-image`（生成器组件文案）
  - `pages/ai-baby-image-generator`（落地页文案）
- [ ] **6 份 JSON 文件**（en/zh/ja 三语 × 2 namespace）。**模板**：copy `src/config/locale/messages/en/pages/ai-baby-dance-video-generator.json` 结构作为落地页 JSON 骨架；`ai/baby-image.json` 新建
  - ⚠️ 该 JSON 只含 Hero/FAQ/CTA/Testimonials 等 **SEO 落地页骨架**，**不含 Generator section**。"Generator" 部分要在 `page.tsx` 里直接嵌入 `<BabyImageGenerator />` React 组件（JSON 不能存组件），参考 [src/app/[locale]/(landing)/(ai)/ai-video-generator/page.tsx](../src/app/[locale]/(landing)/(ai)/ai-video-generator/page.tsx) 的 `sections.generator.component` 编排方式
- [ ] **16 张 showcase 样图**（8 风格 × 2 before/after），用 Phase 0 实测 model 手动生成 + 筛选（约半天）。R2 路径约定（项目无既有 showcases 目录）：`https://r2.babyboogey.com/assets/imgs/showcases/ai-baby-image-generator/<styleId>-{before|after}.webp`（对齐现有 `r2.babyboogey.com/assets/imgs/` 域，见 `ai-video-generator/page.tsx` 背景图路径约定）
- [ ] SEO 长尾博文 `content/posts/how-to-create-ai-baby-photo-*.mdx`（英中日三语）。**产出方**：文案由产品/市场团队提供，工程只负责 MDX 落地与 front-matter
- [ ] Header nav 加入口（定位 [src/shared/blocks/common/](../src/shared/blocks/common/) 或 landing header）
- [ ] **ToS 增补**三语：[content/pages/terms-of-service.mdx](../content/pages/terms-of-service.mdx) 及 `.zh.mdx` / `.ja.mdx`（**注意**：目前项目没有 `.ja.mdx`，Phase 3 需要**同时新增** ToS 日语版），加条款：
  > **User-Uploaded Content Compliance**. By uploading any photo to the AI Baby Image Generator, you represent and warrant that: (a) you are the parent or legal guardian of any minor appearing in the uploaded photo, or have obtained explicit consent from such guardian; (b) the photo does not contain nudity, violence, or any unlawful content; (c) you will not use the service to generate images depicting real identifiable minors without consent. You are solely responsible for your uploads. We reserve the right to remove content and terminate accounts that violate this policy.

### Phase 4 · 图→视频衔接（1 天）⭐ 最关键

**跳转目标 = `/ai-video-generator`**（不是 `/ai-baby-dance-video-generator`——后者是 SEO 落地页不含真生成器，见 2.1 第 8 条）。

**为什么不用 query param**：Cloudflare Workers 的 CDN 默认不把未登记的 query param 加入 cache key（[middleware.ts:75-79](../src/middleware.ts) 给公共页注入了 `s-maxage=3600`），会导致"A 用户的 assetId 被缓存给 B 用户"的数据污染事故。

**为什么不用 sessionStorage**：跨标签页打开会丢、iOS Safari 私密模式抛异常。

**为什么不需要前端重签**：generate route 已在后端 `resolveAssetRefsWithSignedUrls` 自动把 `asset://xxx` 转签名绝对 URL（见 2.1 第 4 条）。前端只管把 `asset://xxx` 塞到 `uploadedImage.url`，submit 时后端会在"生成时刻"重签，TTL 天然重置。

**方案：localStorage + TTL + 依赖后端自动重签**

- [ ] **图片结果页**（Phase 2 的 UI 内）："Make them dance →" CTA 点击时：
  ```ts
  try {
    localStorage.setItem('babyboogey:baby-image-handoff', JSON.stringify({
      assetRef: `asset://${mediaAssetId}`,
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 分钟 TTL（仅防用户隔天点开）
    }));
  } catch {}
  router.push('/ai-video-generator');
  ```
  ⚠️ **`mediaAssetId` 来源**：现有 image.tsx 的 `generatedImages` 条目只有 `url: '/api/storage/assets/<assetId>'`（见 [image.tsx:398-404](../src/shared/blocks/generator/image.tsx)），**没有独立 `assetId` 字段**。Phase 2 fork 时需要二选一：(a) 扩展 `generatedImages` 条目 shape 加 `assetId` 字段（推荐，更清晰）；(b) 在 CTA handler 里用 `extractAssetIdFromMediaUrl`（见 [video.tsx:1086](../src/shared/blocks/generator/video.tsx) 同名工具）从 url 解析
- [ ] **Dance 页面**（[src/shared/blocks/generator/video.tsx:630](../src/shared/blocks/generator/video.tsx)）：在 `VideoGenerator` 组件内加 `useEffect`（**client only，避 SSR hydration mismatch**）：
  ```ts
  useEffect(() => {
    try {
      const raw = localStorage.getItem('babyboogey:baby-image-handoff');
      if (!raw) return;
      const data = JSON.parse(raw);
      localStorage.removeItem('babyboogey:baby-image-handoff'); // 读后立即删
      if (Date.now() > data.expiresAt) return;
      // uploadedImage 是 { url, ... } 形态，payload 用 image_input: [uploadedImage.url]
      // 此处 url 直接用 asset:// 引用，generate route 会自动签名
      setUploadedImage({ url: data.assetRef, /* 其他字段按现有 shape 填充 */ });
      setShowHandoffBanner(true);
    } catch {}
  }, []);
  ```
  ⚠️ **开工前必读 `video.tsx:630` 的 `uploadedImage` 完整 shape**，上面 `{ url, ... }` 的其他字段（尺寸/类型/缩略图等）要按 image 上传组件的真实返回补全，否则 UI 可能显示异常
- [ ] Dance 页顶部展示横幅："Using your AI-generated baby photo"，给用户一个明显的反馈点
- [ ] 三语 banner 文案加入 i18n messages

### Phase 5 · 收尾（0.5 天）

- [ ] 端到端冒烟：8 风格各生成 1 张
- [ ] **退款回归测试**：手动触发一条 video scene FAILED（通过 admin/fix-stuck-orders 或 mock notify），验证 `refundedAt` / `refundReason` 正确写入、credit 正确加回
- [ ] [src/app/sitemap.ts](../src/app/sitemap.ts) 验证（`as-needed` 策略下三语路径应自动带上）
- [ ] admin/ai-tasks 确认 scene 过滤能筛出 `baby-image`（若硬编码白名单要补）
- [ ] UI 三处 credit 成本文案一致（生成器 tooltip / pricing 页 / FAQ）

---

## 4. 关键文件索引

| 用途 | 路径 |
|---|---|
| kie provider | [src/extensions/ai/kie.ts](../src/extensions/ai/kie.ts) |
| AI 任务模型 + 退款 | [src/shared/models/ai_task.ts](../src/shared/models/ai_task.ts) |
| Credit 模型 + 首次免费 | [src/shared/models/credit.ts](../src/shared/models/credit.ts) |
| Generate API | [src/app/api/ai/generate/route.ts](../src/app/api/ai/generate/route.ts) |
| Notify API（provider callback） | [src/app/api/ai/notify/[provider]/route.ts](../src/app/api/ai/notify/[provider]/route.ts) |
| Query API（轮询） | [src/app/api/ai/query/route.ts](../src/app/api/ai/query/route.ts) |
| 签名 URL 批量 API | [src/app/api/storage/assets/sign/route.ts](../src/app/api/storage/assets/sign/route.ts) |
| 现有 image 生成 UI | [src/shared/blocks/generator/image.tsx](../src/shared/blocks/generator/image.tsx) |
| i18n 注册中心 | [src/config/locale/index.ts](../src/config/locale/index.ts) |
| ToS | [content/pages/terms-of-service.mdx](../content/pages/terms-of-service.mdx) |
| Middleware（CDN 缓存） | [src/middleware.ts](../src/middleware.ts) |
| DB Schema | [src/config/db/schema.ts](../src/config/db/schema.ts) |

---

## 5. 已知风险与未来改进

### 5.1 v1 接受的风险

- **违禁图 R2 残留**：用户上传真实违法内容会持久化在 R2。依赖 Cloudflare Abuse takedown + ToS 免责兜底。若收到 takedown 请求升级风控，考虑 v2 接入 moderation。
- **恶意刷 failed 退款**：kie 对 model-not-found 等错误同步 400 返回（不进 task 表），真进表的 FAILED 多为 kie 侧故障，概率低。`grantCreditsForFirstLogin` 的 IP 节流已覆盖新用户滥用路径。

### 5.2 v2 可能加入

1. **Moderation provider**（如 AWS Rekognition / Sightengine）在上传端做 NSFW + 未成年人检测
2. **Seedream 4.0 模型档位**（更便宜 + 水彩/吉卜力艺术化更强），在 `BABY_STYLES` 结构里加第二层 key
3. **订阅独立配额**：baby-image 单独一份月度限额，避免重度用户吸干订阅 credit
4. **社交分享**：用户生成的图默认可公开分享到 showcase 页（需勾选同意），形成内容飞轮

---

## 6. 定版变更历史

- **v1**（初稿）：3 天工期，含 moderation provider。用户确认独立入口 + 8 风格 + 长 slug。
- **v2**：审查发现 3 个 Critical（无退款 / query 污染 / 签名过期），工期 → 5 天含 moderation。用户选"不做 moderation / ToS 兜底"，工期 → 4.5 天。
- **v3（本文）**：二次审查发现退款机制实际已存在、签名 API 已存在，Phase 1a 从 1 天压缩到 0.25 天，Phase 3 从 1.5 天扩到 2 天。Phase 4 从 sessionStorage 改 localStorage + 30 分钟 TTL。商标风险词二次清理。加首次免费 1 张钩子。**总工期 5 天**（0.25+0.25+0.5+0.5+2+1+0.5）。
- **v3.1（本次事实核对修正）**：三轮审查发现（a）DB schema 实际是三方言文件（sqlite/mysql/postgres）不是单一 `schema.ts`，Phase 1a 必须同时改三处；（b）`/ai-baby-dance-video-generator` 不是功能路由而是 SEO 落地页，Phase 4 跳转目标修正为 `/ai-video-generator`；（c）`VideoGenerator` 真实 state 名是 `uploadedImage: { url, ... }`（原文档 `setInputImageAssetRef` 是杜撰的）；（d）前端不需要主动重签——generate route 已自动 resolve `asset://` refs；（e）Phase 2 UI 砍选择器但保留 request body 的 `provider/model` 字段；（f）Phase 3 指定 R2 showcase 路径约定 + 确认项目无 ToS 日语版需新增。
