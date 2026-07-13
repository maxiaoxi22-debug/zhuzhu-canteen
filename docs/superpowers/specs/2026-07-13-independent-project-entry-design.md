# 猪猪食堂独立项目入口设计

## 目标

在 `/Users/kanyun/Documents` 下建立与 `workspace` 同层级、名称为 `猪猪食堂` 的独立项目入口，使其能够作为 Codex 侧边栏中的顶层项目使用。

## 约束

- 原项目代码继续保存在 `/Users/kanyun/Documents/workspace/menu-app/zhuzhu-canteen`。
- 不移动、不复制、不重建原项目代码。
- 不修改原仓库内容、依赖、Git 历史或远端配置。
- 新入口和原路径访问的是同一份文件，避免产生两个代码版本。

## 目录设计

```text
/Users/kanyun/Documents
├── workspace
└── 猪猪食堂 -> workspace/menu-app/zhuzhu-canteen
```

`猪猪食堂` 使用文件系统符号链接实现。进入该入口后，读写操作直接作用于原项目。

## 创建与冲突处理

- 创建前检查 `/Users/kanyun/Documents/猪猪食堂` 是否已经存在。
- 若路径不存在，则创建指向原项目绝对路径的符号链接。
- 若路径已存在，不覆盖、不删除，停止并报告冲突。
- 创建后校验入口类型、指向目标以及 Git 仓库可访问性。

## 验收标准

1. `/Users/kanyun/Documents/猪猪食堂` 存在且为符号链接。
2. 链接目标是 `/Users/kanyun/Documents/workspace/menu-app/zhuzhu-canteen`。
3. 从新入口可以读取项目文件并识别原 Git 仓库。
4. 原项目目录仍在原处，文件内容和 Git 工作区状态未因创建入口而改变。

