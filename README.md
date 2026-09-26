# 放射性废料转运舱联锁网 · 危险下限覆盖审计

纯前端（零第三方运行时依赖、可离线打开/部署）的 Petri 网 **Karp–Miller 覆盖树**
审计工具。安全员录入库所、迁移、初始令牌与各危险库所的最低令牌数后，判定该组
危险下限是否可能在某可达标记下**同时被满足**——结论不会因为有限回放没有触发而
误判为安全。

## 它保证了什么

- 引擎构造**带祖先比较的 Karp–Miller 覆盖树**：
  - 触发迁移得到后继标记后，沿祖先链找严格小于它的祖先，所有严格增大的分量
    写入符号 **ω（无界）**；
  - **ω 是符号，不是某个大整数**：`ω + n = ω`、有限数永远 `< ω`、`ω` 与 `ω`
    之间不存在严格增大；
  - 新节点被树中任一已有节点逐分量支配（`existing ≥ new`）时剪枝；无可发生
    迁移的节点记死锁叶；
  - 展开顺序按迁移标识字典序稳定排序，结论与证据对同一输入逐节点一致；
  - **不设置回放/搜索深度上限**，有限终止由 Karp–Miller 定理与支配剪枝保证。
- 危险可覆盖：展示**覆盖节点、根→覆盖节点的逐迁移符号标识路径、祖先加速链**
  （每次 ω 提升对应哪条边、哪位祖先、加速前/后标记）。
- 危险不可覆盖：展示**已闭合的规范树摘要**（ASCII 树）及**每个叶子**的支配
  剪枝或死锁原因。
- 录入校验（重复标识、悬空引用、全零迁移、非法下限/初始值、数量上限等）
  **一次性合并反馈**，且审计点击产生校验错误时**立即移除旧结论**。

## 目录结构

```
index.html            审计页（录入 + 结论/证据）
health.html           人类可读健康页
styles.css
src/
  km.js               Karp–Miller 覆盖树核心（ω 语义、祖先加速、支配剪枝）
  validate.js         草稿校验（合并错误反馈）
  audit.js            审计编排与证据/闭合树摘要组织
  render.js           结论 HTML 纯函数渲染（ω 高亮、转义）
  app.js              浏览器交互
scripts/
  serve.js            零依赖静态服务器（/health 探针 + /health.html 健康页）
  build.js            前端构建检查（JS 语法、资源引用、模块图、健康页）
  smoke.js            健康页 HTTP 冒烟（可自带临时服务，也可探测给定 URL）
  verify-nets.js      直接驱动一组可覆盖网 / 一组不可覆盖网做算法断言
  verify-all.sh       Compose verify 总控（算法测试 → 构建检查 → HTTP 冒烟）
test/                 node --test 套件（算法 / 校验 / 端到端 / 渲染）
Dockerfile            node:20-alpine，零 npm 安装
docker-compose.yml    web + verify 两服务
```

## 用 Docker Compose 运行

```bash
# 启动审计站点（守护态）
docker compose up -d web
# 浏览器访问 http://localhost:8080/          审计页
#               http://localhost:8080/health.html 健康页
#               http://localhost:8080/health       JSON 探针

# 宿主机端口可配置（.env 或环境变量）
WEB_PORT=9090 docker compose up -d web      # → http://localhost:9090

# 一键验证：围绕一组可覆盖网与一组不可覆盖网，依次运行
#   1) 算法测试（样例网断言 + node --test 全套件）
#   2) 前端构建检查
#   3) 健康页 HTTP 冒烟
# 完成后以退出码报告结果（0 通过 / 非 0 失败）
docker compose run --rm verify
# 或：docker compose up --build verify（日志末尾可见 “>>> verify 全部通过”）
```

## 不使用 Docker（本机 Node ≥ 20，完全离线）

```bash
node scripts/verify-nets.js     # 两组样例网断言
node --test test/               # 全部算法/校验/端到端/渲染测试
node scripts/build.js           # 前端构建检查
PORT=8080 node scripts/serve.js # 起静态服务
node scripts/smoke.js           # 自起临时服务做 HTTP 冒烟
```

离线使用时运行 `PORT=8080 node scripts/serve.js` 后访问
`http://localhost:8080/`（无任何外部网络请求、无构建步骤；部分浏览器在
`file://` 下会因模块 CORS 策略阻止原生 ES 模块，故以本地静态服务为准）。

## 两组内置样例

页面右上可一键载入：

- **可覆盖样例**：许可 `P0` 经 `t_a/t_b` 循环使阀位计数 `V` 每轮净 +1，
  覆盖树在 `V` 分量写入 ω，任意 `V≥k` 可覆盖——即便回放前几步看不到 ≥3，
  也必须判为危险；
- **不可覆盖样例**：资源守恒 `R+A+B=2` 的有界互斥网，`A≥3` 永不成立，
  规范树全部叶子以支配剪枝闭合。

## 限制与边界

- 库所 ≤ 7、迁移 ≤ 10；令牌数与阈值为非负整数（安全整数范围）；
- 危险阈值必须为正整数（0 恒被满足，不构成下限）；
- 全零迁移（所有库所消耗与产生均为 0）被禁止；
- 迁移必须对每个库所显式声明消耗/产生（悬空/缺行一并报错）。
