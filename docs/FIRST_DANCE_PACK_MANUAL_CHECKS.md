# First Dance Pack 人工把控清单

更新日期：2026-04-25

这份清单记录首单视频转化方案上线前后，需要人工确认、配置或观察的事项。代码已经支持 `First Dance Pack` 漏斗，但以下项目不能只依赖本地构建验证。

## 上线前必须确认

- [ ] 生产环境设置 `MEDIA_ASSET_SIGNING_SECRET`。
  - 必须是独立密钥，不要复用 `AUTH_SECRET`、`NEXTAUTH_SECRET` 或支付 webhook secret。
  - 建议生成方式：`openssl rand -base64 32`。

- [ ] 生产 settings 表同步注册送积分配置。
  - `initial_credits_enabled = true`
  - `initial_credits = 36`
  - `initial_credits_expire_days = 3`
  - 注意：代码默认值只影响缺省配置；如果生产库已经有旧配置，需要在后台或数据库中手动改。

- [ ] 配置真实支付产品。
  - Stripe / PayPal：当前走动态价格，确认 `$4.99`、`225 credits`、`one-time` 正确。
  - Creem：如果作为默认支付，必须把 `first-dance-pack` 映射到真实 Creem product id，不能保留 `prod_xxx` 占位值。

- [ ] 确认支付默认 provider。
  - 视频生成器内的首单按钮会使用站点配置里的默认支付 provider。
  - 若默认 provider 未启用或产品 id 缺失，会导致余额不足用户无法完成首单。

## 支付闭环验收

- [ ] 新注册用户获得 `36 credits / 3 天`。
- [ ] 新注册用户不能免费生成完整视频。
- [ ] 新注册用户可以在图片页使用赠送积分体验 AI baby image。
- [ ] 非订阅登录用户可以在 Pricing 看到并购买 `First Dance Pack`。
- [ ] 从首页上传照片、选择模板、余额不足后，按钮显示 `Get First Dance Pack - $4.99`。
- [ ] 点击首单按钮能进入 checkout。
- [ ] 支付成功后回到首页 `/#generator`。
- [ ] 回到首页后恢复支付前的上传图、模板、分辨率、prompt 和公开/私有状态。
- [ ] 支付成功后 credits 刷新，用户可以继续生成视频。
- [ ] `$4.99 / 225 credits` 至少能生成一个 `15 秒 / 720p / Pro` 模板。
- [ ] 买过任意积分包后，Pro 模板可用，生成结果无水印。

## 文案与 SEO 抽查

- [ ] 首页、Pricing、FAQ 三语版本都优先展示真实能力：
  - `14 dance templates`
  - `usually 45-180 seconds`
  - `720p / 1080p`
  - `8 baby image styles`
- [ ] 不再出现这些承诺：
  - `50+ templates`
  - `under 30 seconds`
  - `4K video`
  - `batch generation`
  - `no sign-up required`
- [ ] 免费阶段的表达统一为：可以预览模板、可以用注册送积分试图片，但生成完整视频需要 credits。
- [ ] Pro 模板表达统一为：`Unlock with any paid pack` 或对应本地化文案。

## 安全与权限复核

- [ ] admin payment 诊断接口只允许 admin 访问。
- [ ] 邮件发送接口只允许 admin 访问。
- [ ] checkout 创建支付失败时，订单状态为 `FAILED`，不能写成 `COMPLETED`。
- [ ] Markdown raw HTML 关闭。
- [ ] chat messages 接口不能读取其他用户的 chat。
- [ ] media asset token 只使用 `MEDIA_ASSET_SIGNING_SECRET` 签名，没有 auth secret fallback。

## 投放后观察

- [ ] 观察首页上传后进入 checkout 的转化率。
- [ ] 观察 checkout 成功后回到 `/#generator` 的继续生成率。
- [ ] 观察支付成功但 credits 未刷新、状态未恢复的异常日志。
- [ ] 观察 `First Dance Pack` 用户是否继续购买更大积分包或订阅。
- [ ] 观察视频生成失败后的 credits 自动退回是否正常。
