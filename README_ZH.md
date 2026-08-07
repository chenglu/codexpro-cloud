# CodexPro Cloud

中文 | [English](README.md)

在 Linux 服务器上运行一个私有 CodexPro 工作区，再通过 MCP 连接你自己的 ChatGPT 账号。Docker 镜像自带首次安装向导、固定 Cloudflare Tunnel、仅 MCP 公网网关、持久化存储和本地管理页。

它不是模型代理、ChatGPT 账号池、额度共享服务，也不是托管版 Codex。ChatGPT 是 MCP 客户端；CodexPro Cloud 是 MCP Server，为这个客户端提供一个有边界的云端代码工作区。

> 当前阶段：单用户 MVP。每个用户或信任边界应独占一个容器。多用户托管版还需要 OAuth 和更强的租户隔离。

## 架构

```text
你自己的 ChatGPT 账号
        |
        | HTTPS Streamable HTTP MCP
        v
Cloudflare Named Tunnel
        |
        v
127.0.0.1:8788  仅 MCP 网关  -> 只允许 /mcp
        |
        v
127.0.0.1:8787  CodexPro 核心 -> /mcp + 本地管理路由
        |
        v
     /workspace
```

公网域名只能指向 `8788`，绝不能指向完整 CodexPro 服务 `8787`。网关会先校验随机 MCP Token，转发后 CodexPro 还会独立校验同一个凭据。

| 端口 | 用途 | 是否公网暴露 |
| --- | --- | --- |
| `8787` | 完整上游 CodexPro HTTP 服务 | 永不暴露 |
| `8788` | 只接受 `/mcp` 的安全网关 | 通过 Cloudflare Tunnel 暴露 |
| `8789` | 首次安装和本地管理页 | 仅宿主机回环地址 |

Cloudflare ingress 的最后一条永远是 `http_status:404`，不存在回退到核心服务的 fallback。

## 准备条件

- 一台安装了 Docker Engine 和 Docker Compose v2 的 Linux 服务器
- 一个 DNS 已经托管到 Cloudflare 的域名
- 一个具备 `Account / Cloudflare Tunnel / Edit`、`Zone / DNS / Edit`、`Zone / Zone / Read` 权限的 Cloudflare API Token
- 支持自定义远程 MCP App 的 ChatGPT 界面

OpenAI 当前的远程 MCP 文档见 [MCP and Connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)。

## 部署

```bash
git clone https://github.com/chenglu/codexpro-cloud.git
cd codexpro-cloud
cp docker-compose.example.yml docker-compose.yml
docker compose up -d
docker compose logs -f codexpro-cloud
```

第一次启动会在日志里打印：

```text
[codexpro-cloud] installation code: <随机安装码>
[codexpro-cloud] secure first-run setup: https://<随机地址>.trycloudflare.com/setup
```

打开临时 HTTPS 地址，依次填写：

1. 日志里的安装码
2. 新的本地管理密码
3. 一个尚未使用的域名，例如 `mcp-workspace.example.com`
4. Cloudflare API Token
5. 工作区权限模式

向导会自动创建 Named Tunnel、代理 CNAME、固定的 `404` ingress fallback 和随机 MCP Token。完成后，临时 Quick Tunnel 自动关闭，页面直接显示可粘贴到 ChatGPT 的完整 Server URL。

Cloudflare API Token 不会写入磁盘。如果这个 Token 只为本次安装创建，完成后可直接在 Cloudflare 后台撤销。

## 连接 ChatGPT

向导返回的地址类似：

```text
https://mcp-workspace.example.com/mcp?codexpro_token=<随机密钥>
```

在 ChatGPT 中新建自定义 MCP App/Plugin，将完整地址粘贴到 **Server URL**，认证方式选择 **No Authentication / None**。URL 参数是为无法自定义 Bearer Header 的 ChatGPT 表单准备的兼容方式，不要分享这个地址。

支持自定义 Header 的 MCP 客户端应使用：

```text
URL: https://mcp-workspace.example.com/mcp
Authorization: Bearer <token>
```

如果以后把它做成共享的多用户服务，必须补 OAuth；当前随机 Token 方案只定位为单用户实例。

## 添加代码仓库

默认 Compose 使用 Docker Volume 持久化 `/workspace`：

```bash
docker compose exec codexpro-cloud \
  git clone https://github.com/OWNER/REPOSITORY.git /workspace/REPOSITORY
```

`/workspace` 下的内容都在允许访问的工作区范围内。CodexPro 仍会屏蔽常见密钥、私钥、依赖目录、构建目录和 Git 内部文件。

若要直接挂载宿主机目录，修改 `docker-compose.yml`：

```yaml
volumes:
  - codexpro-data:/data
  - /srv/codexpro-workspace:/workspace
```

该目录必须允许容器 UID/GID `10001:10001` 读写。

## 权限模式

| 模式 | 文件修改 | Bash | 适用场景 |
| --- | --- | --- | --- |
| 只读 | 关闭 | 关闭 | 审查和分析 |
| 编辑 | 仅工作区 | 关闭 | 更稳妥的远程编辑，默认模式 |
| 开发 | 仅工作区 | CodexPro `safe` 模式 | 可信仓库和运行验证 |

`safe` Bash 不是操作系统沙箱。仓库里的 package script 仍然可以执行代码；不可信仓库应保持 Bash 关闭。

## 本地管理

管理页只发布到服务器回环地址：

```text
http://127.0.0.1:8789/admin
```

从其他电脑访问时，用 SSH 端口转发：

```bash
ssh -L 8789:127.0.0.1:8789 root@你的服务器
```

然后在本机打开 `http://127.0.0.1:8789/admin`。管理页可以：

- 查看 CodexPro、MCP 网关和公网 Tunnel 状态
- 切换工作区权限模式
- 轮换 MCP Token 和连接地址

切换模式或轮换 Token 会重启内部 CodexPro 和 MCP 网关进程，不会改动 Tunnel 和 DNS。

## 日常维护

更新：

```bash
docker compose pull
docker compose up -d
docker compose logs --tail=100 codexpro-cloud
```

备份两个 Volume：

- `codexpro-data`：配置、管理密码哈希、MCP Token 和 Tunnel connector token
- `codexpro-workspace`：代码仓库和工作区文件

健康检查：

```bash
docker inspect --format '{{.State.Health.Status}}' codexpro-cloud
docker compose logs --tail=200 codexpro-cloud
```

安装前，健康检查验证本地安装页；安装后，验证 CodexPro 和网关路径边界。默认不会为了健康检查访问公网。

## 默认安全措施

- 运行进程使用非 root UID/GID `10001:10001`。
- 示例 Compose 中根文件系统只读，只有 `/data`、`/workspace` 和 `/tmp` 可写。
- 丢弃 Linux capabilities，并启用 `no-new-privileges`。
- 不挂载 Docker Socket。
- Compose 设置 CPU、内存和进程数限制。
- 公网只允许精确路径 `/mcp`，方法仅限 `POST`、`GET`、`DELETE`、`OPTIONS`。
- 网关会先校验随机 Bearer/URL Token，CodexPro 收到转发后还会再次校验。
- 首次安装使用随机一次性安装码和临时 HTTPS Quick Tunnel。
- Cloudflare 账号级 API Token 只在初始化请求内存中存在。

把重要或私有代码放入工作区之前，请阅读 [SECURITY.md](SECURITY.md)。

## 开发

```bash
npm ci
npm run build
npm run cloud:smoke
npm run smoke
docker build -t codexpro-cloud:dev .
```

`npm run cloud:smoke` 会验证 Cloudflare 失败回滚、固定 ingress、安装凭据处理、本地管理认证、Token 轮换和 `/mcp` 路径网关。

## 上游关系

CodexPro Cloud 的 MCP 核心来自 [rebel0789/codexpro](https://github.com/rebel0789/codexpro)，Cloud 运行层独立放在 `cloud/`、`Dockerfile`、Compose、测试和部署文档中。Git 的 `upstream` remote 持续跟踪原仓库。

同步规则见 [docs/upstream-sync.md](docs/upstream-sync.md)。项目保留原作者的 MIT 版权和 [LICENSE](LICENSE)。
