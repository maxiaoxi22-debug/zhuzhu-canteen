# 猪猪食堂独立项目入口实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/Users/kanyun/Documents` 下创建名为 `猪猪食堂` 的顶层入口，并让它访问原 `zhuzhu-canteen` 仓库。

**Architecture:** 使用一个文件系统符号链接作为独立项目入口，链接目标采用原仓库的绝对路径。创建前执行非破坏性冲突检查，创建后分别验证链接目标、项目文件访问和 Git 仓库识别。

**Tech Stack:** macOS 文件系统、POSIX 符号链接、Git

## Global Constraints

- 原项目代码继续保存在 `/Users/kanyun/Documents/workspace/menu-app/zhuzhu-canteen`。
- 不移动、不复制、不重建原项目代码。
- 不修改原仓库内容、依赖、Git 历史或远端配置。
- 若 `/Users/kanyun/Documents/猪猪食堂` 已存在，不覆盖、不删除。

---

### Task 1: 创建并验证独立项目入口

**Files:**
- Create: `/Users/kanyun/Documents/猪猪食堂`（符号链接）
- Target: `/Users/kanyun/Documents/workspace/menu-app/zhuzhu-canteen`
- Test: 文件系统与 Git 只读检查

**Interfaces:**
- Consumes: 已存在的原项目目录 `/Users/kanyun/Documents/workspace/menu-app/zhuzhu-canteen`
- Produces: 顶层项目入口 `/Users/kanyun/Documents/猪猪食堂`

- [ ] **Step 1: 检查源目录和目标入口状态**

Run:

```bash
test -d /Users/kanyun/Documents/workspace/menu-app/zhuzhu-canteen
test ! -e /Users/kanyun/Documents/猪猪食堂
test ! -L /Users/kanyun/Documents/猪猪食堂
```

Expected: 三条检查均以状态码 `0` 结束且没有输出。若入口已存在或是失效链接，停止执行并报告冲突。

- [ ] **Step 2: 创建符号链接**

Run:

```bash
ln -s /Users/kanyun/Documents/workspace/menu-app/zhuzhu-canteen /Users/kanyun/Documents/猪猪食堂
```

Expected: 状态码 `0`，没有输出。

- [ ] **Step 3: 验证链接指向**

Run:

```bash
test -L /Users/kanyun/Documents/猪猪食堂
test "$(readlink /Users/kanyun/Documents/猪猪食堂)" = "/Users/kanyun/Documents/workspace/menu-app/zhuzhu-canteen"
```

Expected: 两条检查均以状态码 `0` 结束且没有输出。

- [ ] **Step 4: 验证项目与 Git 仓库可访问**

Run:

```bash
test -f /Users/kanyun/Documents/猪猪食堂/package.json
git -C /Users/kanyun/Documents/猪猪食堂 rev-parse --show-toplevel
```

Expected: 文件检查成功；Git 输出原仓库根目录 `/Users/kanyun/Documents/workspace/menu-app/zhuzhu-canteen` 或其等价解析路径。

- [ ] **Step 5: 确认原工作区状态未被入口创建改变**

Run:

```bash
git -C /Users/kanyun/Documents/workspace/menu-app/zhuzhu-canteen status --short --branch
```

Expected: 仓库可正常读取；除实施计划文档提交外，已有用户文件状态保持不变。符号链接本身位于仓库外，不出现在仓库状态中。

