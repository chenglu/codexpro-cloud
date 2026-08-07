# Xiechengqi fork CodexPro 的公开证据

> 调查快照：2026-08-07。范围仅限 GitHub 公开元数据、分支、提交、Compare API、Issues/PRs/Events，以及 iVnc 的公开提交时间线。

## 结论

公开证据**不能证明 Xiechengqi 已经决定如何使用 CodexPro**。目前最准确的表述是：他建立了一个尚未修改的 fork，可能只是评估、留档或为后续实验预留空间。

结合时间线，一个较合理但仍属推断的方向是：**在 iVnc 移除内置 AI Agent/MCP 后，评估让 CodexPro 承担独立的 MCP/编码代理职责，而 iVnc 保持桌面与应用运行环境。** 这一推断置信度为低到中等；没有公开代码、说明或讨论确认二者会集成。

## 已确认事实

1. [`Xiechengqi/codexpro`](https://github.com/Xiechengqi/codexpro) 于 **2026-08-06 15:18:17 UTC** 创建，GitHub 元数据明确标记它是 [`rebel0789/codexpro`](https://github.com/rebel0789/codexpro) 的 fork。[Repository API](https://api.github.com/repos/Xiechengqi/codexpro)
2. fork 目前只有 `main` 分支，HEAD 为 `9b2a0ba7e4ccddced1ab88acb6e0d5092648a2b6`，与上游 `main` 完全相同。[Branches API](https://api.github.com/repos/Xiechengqi/codexpro/branches)；[Compare：`ahead 0 / behind 0`](https://github.com/rebel0789/codexpro/compare/main...Xiechengqi:main)
3. GitHub 的 `pushed_at` 仍是上游最后提交时间 **2026-07-29 12:56:01 UTC**，早于 fork 创建时间；按作者过滤也没有 Xiechengqi 自己的提交。[Commits by author API](https://api.github.com/repos/Xiechengqi/codexpro/commits?author=Xiechengqi)
4. 截至快照时间，fork 没有公开 PR，仓库公开事件只有创建 fork 的 `ForkEvent`；在上游也没有发现 Xiechengqi 参与的公开 Issue/PR。[Pulls API](https://api.github.com/repos/Xiechengqi/codexpro/pulls?state=all)；[Events API](https://api.github.com/repos/Xiechengqi/codexpro/events)；[Upstream issue search API](https://api.github.com/search/issues?q=repo%3Arebel0789%2Fcodexpro+involves%3AXiechengqi)
5. 两个仓库当前都没有对方名称的代码引用。[iVnc 中搜索 `codexpro`](https://github.com/search?q=repo%3AXiechengqi%2FiVnc+codexpro&type=code)；[CodexPro 中搜索 `ivnc`](https://github.com/search?q=repo%3AXiechengqi%2Fcodexpro+ivnc&type=code)
6. CodexPro 在 fork 时已经是独立的本地 MCP 服务：README 明确写有 ChatGPT Developer Mode、`--headless`、Cloudflare Tunnel 和工作区受限工具，并明确称其不是托管服务或模型代理。[固定到 fork HEAD 的 README](https://github.com/rebel0789/codexpro/blob/9b2a0ba7e4ccddced1ab88acb6e0d5092648a2b6/README.md)

## iVnc 时间线

- **2026-07-28 09:43 UTC**：iVnc 提交明确“Remove built-in AI agent and MCP server”，删除 `src/agent/`、`src/mcp/`、MCP stdio 启动和相关功能。[提交 `d8d669f`](https://github.com/Xiechengqi/iVnc/commit/d8d669f65ae7e734a82cb148e1720b239d5027b5)
- **2026-07-28 10:12 UTC**：继续删除 MCP/Agent 文档和 smoke suite。[提交 `d8aecff`](https://github.com/Xiechengqi/iVnc/commit/d8aecff10bee7f1f1cce4f27afbcbabeba9690cc)
- **2026-08-06 15:18 UTC**：创建 CodexPro fork。[Fork Events API](https://api.github.com/repos/Xiechengqi/codexpro/events)
- **2026-08-07 08:54 UTC**：iVnc 下一次公开提交处理持久化目录和 managed-app HOME 隔离，但没有提到 CodexPro。[提交 `1f85d98`](https://github.com/Xiechengqi/iVnc/commit/1f85d988b9e0fff133c7fb22880125aa51c97c96)

## 推断与置信度

| 判断 | 置信度 | 依据与限制 |
| --- | --- | --- |
| 只是收藏、评估或准备实验 | 中等 | fork 后零改动、零分支、零讨论；但沉默本身不能说明最终目的。 |
| 评估用 CodexPro 替代 iVnc 已移除的内置 MCP/Agent | 低到中等 | 功能互补且时间相邻；但没有交叉引用、集成提交或作者声明。 |
| 已计划把 CodexPro 集成进 iVnc 或发布云版本 | 很低 | 当前没有任何公开实现、路线图、Issue、PR 或自有提交支持该说法。 |

因此，这个 fork 目前应被视为**探索信号，不是产品路线公告**。能改变结论的后续证据包括：fork 出现独立分支或提交、加入 iVnc/Docker 启动文件、两个仓库互相引用，或作者发布 Issue/README/Release 说明。

## Cloud 化可行性

结论：**可以做，而且不需要 iVnc；但应建立独立的 `codexpro-cloud` 项目，不能并入 `cc-switch-cloud` 的容器或安全边界。**

CodexPro 已经具备 Cloud 版所需的大部分核心能力：

- Node.js 20 的无界面 HTTP MCP Server，支持 `codexpro start --headless`。
- 默认监听 `127.0.0.1:8787`，支持 Bearer Token 和兼容 ChatGPT 表单的 URL Token。
- 支持 Cloudflare Quick Tunnel、Named Tunnel、ngrok 和 Tailscale。
- 通过 allowlist、真实路径检查和 symlink 检查限制工作区。
- 提供 `off`、`handoff`、`workspace` 写入模式，以及 `off`、`safe`、`full` Bash 模式。
- `CODEXPRO_HOME` 可将配置、连接资料和运行状态迁到独立持久化目录。

这些能力见固定版本的 [README](https://github.com/rebel0789/codexpro/blob/9b2a0ba7e4ccddced1ab88acb6e0d5092648a2b6/README.md)、[HTTP 服务](https://github.com/rebel0789/codexpro/blob/9b2a0ba7e4ccddced1ab88acb6e0d5092648a2b6/src/http.ts)、[配置加载](https://github.com/rebel0789/codexpro/blob/9b2a0ba7e4ccddced1ab88acb6e0d5092648a2b6/src/config.ts)、[路径边界](https://github.com/rebel0789/codexpro/blob/9b2a0ba7e4ccddced1ab88acb6e0d5092648a2b6/src/guard.ts)和[官方安全说明](https://github.com/rebel0789/codexpro/blob/9b2a0ba7e4ccddced1ab88acb6e0d5092648a2b6/SECURITY.md)。

本次在 `9b2a0ba` 上完成了以下本地验证：

- `npm ci`、TypeScript build、全部 smoke tests 和 stress test 通过。
- `--headless --tunnel none` 能启动并输出 `CODEXPRO_READY`。
- 未认证 `/healthz` 返回 `401`。
- Bearer Token 认证后的 MCP `initialize` 返回 `200` 和有效 session id。

## 推荐的第一版

第一版只做**单用户、单实例、单工作区**：

```text
ChatGPT 用户自己的账号
        |
        v
https://mcp-instance.example.com/mcp
        |
Cloudflare Tunnel
        |
只允许 /mcp 的本地安全网关
        |
CodexPro 127.0.0.1:8787
        |
/workspace 持久化代码仓库
```

容器至少需要两个持久化位置：`/data` 对应 `CODEXPRO_HOME`，`/workspace` 保存代码。首次安装向导负责生成 MCP 凭据、创建 Cloudflare Tunnel/DNS、选择只读/写入/Bash 模式并输出 ChatGPT Server URL。ChatGPT 登录仍由用户在自己的 ChatGPT 页面完成，因此不需要浏览器桌面或 iVnc。

公网 hostname 不应直接指向 CodexPro 完整 HTTP 服务。当前 `/`、`/setup`、`/healthz`、`/admin/profile` 和 `/mcp` 共用一个端口与 Token；Cloud 版应增加一层只放行 `/mcp` 的网关，管理与安装入口使用独立域名或一次性 Quick Tunnel。

## 生产前阻塞项

1. **认证**：现有 URL Token 适合个人连接，不适合共享 SaaS。OpenAI 官方文档建议自定义远程 MCP Server 使用 OAuth，并支持 Client ID Metadata Documents；多用户版必须补 OAuth、租户和撤销机制。[OpenAI MCP authentication](https://developers.openai.com/api/docs/mcp#handle-authentication)
2. **容器隔离**：CodexPro 明确不是 OS sandbox。每个用户/项目应独占非 root 容器，禁用 Docker socket，限制 CPU、内存、进程和网络，并使用只读 root filesystem。
3. **命令风险**：`bash safe` 仍允许运行仓库 package scripts，而 package scripts 本质上可以执行任意代码。托管陌生仓库时默认应为 `--no-bash`，需要执行时再进入更强隔离环境。
4. **依赖更新**：本次 `npm audit` 在当前锁文件中报告 3 个 high 和 1 个 moderate 传递依赖告警，来自 MCP SDK 和 minimatch 依赖树，发布镜像前应升级并重新审计。
5. **发布固定**：npm 上的 `0.29.0` 发布于 2026-07-13，落后于 2026-07-29 的 GitHub `main`；仓库没有正式 GitHub Release。Cloud 镜像应固定经过测试的 commit 和 lockfile，不能直接跟随 npm `latest` 或 GitHub `main`。
6. **多租户**：不要让多个不互信用户共享同一个 CodexPro 进程或工作区。真正的共享产品需要 OAuth、设备/实例注册、审计、撤销，以及每租户容器或强 sandbox。

## 项目边界建议

- `cc-switch-cloud`：共享模型账号的代理与安全 API Gateway。
- `codexpro-cloud`：让用户自己的 ChatGPT 通过 MCP 操作云端代码工作区。
- 二者可以复用 Cloudflare 初始化向导、Tunnel 生命周期和发布流水线，但不共享进程、数据卷、Token、域名或运行容器。

许可证方面，CodexPro 使用 MIT License，允许 fork、修改和再发布，但派生项目必须保留版权及许可证文本。[LICENSE](https://github.com/rebel0789/codexpro/blob/9b2a0ba7e4ccddced1ab88acb6e0d5092648a2b6/LICENSE)
