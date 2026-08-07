# CodexPro Cloud 常见问题

## 容器里运行的是 ChatGPT Pro 吗？

不是。容器里运行的是远程 MCP Server 和代码工作区。用户仍然在自己的设备上登录自己的 ChatGPT，ChatGPT 作为客户端连接 MCP URL。

## 它会共享 ChatGPT 订阅或模型额度吗？

不会。它不代理模型请求、不池化账号，也不绕过账号限制。可用模型和 MCP 操作取决于用户自己的 ChatGPT 账号和当前产品界面。

## 为什么不需要 iVNC？

容器内不需要浏览器登录。CodexPro 本身就是无界面的 HTTP MCP Server，增加 X11、VNC 和浏览器只会扩大攻击面。

## 为什么有三个端口？

- `8787`：完整 CodexPro 核心服务
- `8788`：只转发 `/mcp` 的严格网关
- `8789`：首次安装和本地管理

只有 `8788` 可以放在公网 Tunnel 后面。默认 Compose 只把 `8789` 映射到宿主机回环地址。

网关和 CodexPro 都会校验同一个随机 MCP Token。请求先通过网关校验，转发后还要再通过 CodexPro 自身的校验。

## 为什么 ChatGPT 地址里有 Token？

部分 ChatGPT 连接表单不能自定义 `Authorization` Header，因此单用户版本用 URL Token 兼容。支持 Header 的客户端应改用 Bearer Token。

## 一个实例可以给多个用户使用吗？

不安全。一个进程共享工作区、Token 和权限策略。请为每个用户创建独立实例。真正的多用户产品需要 OAuth、租户级容器或更强沙箱、审计、限额和撤销机制。

## 一个实例能放多个仓库吗？

可以。多个仓库可以分别放在 `/workspace` 下，但它们共享容器、Token 和权限，因此只应放同一所有者、同一信任级别的仓库。

## `开发` 模式能完全隔离命令吗？

不能。它启用上游 CodexPro 的 `safe` Bash，会阻止一批危险命令，但仍可运行仓库脚本，而仓库脚本本质上就是代码。不可信仓库请使用 `只读` 或 `编辑`。

## Cloudflare API Token 最后去了哪里？

它只在首次安装请求的内存中存在。容器只保存权限更窄的 Tunnel connector token。安装完成后可以撤销账号 API Token。

## 如何更换域名？

当前 MVP 不在管理页里修改已经安装好的 Tunnel 域名。最稳妥的方式是用新域名创建新实例；手工修改 Cloudflare 时必须继续保持 `8788` origin 和 `404` fallback。

## 如何彻底重置？

备份需要的数据后，删除 data volume 并重建容器。这样只会删除本地凭据，不会自动删除 Cloudflare Tunnel 和 DNS，需要去 Cloudflare 后台单独清理。
