---
name: skill-studio
description: 列出、查看和安装本机所有 Agent 的技能（Codex、Claude、Cursor、Grok、Gemini、WorkBuddy、Hub、DSH）。当用户问“我有哪些技能”“列出 skill”“这个技能在哪”“安装这个技能”时使用。输出中文标题优先、英文技术名其次。
---

# 本机技能工坊（Antigravity）

本技能通过一个无依赖的 Node 脚本读取本机已接入的技能目录。所有命令中的
`scripts/skill-studio.mjs` 都相对于本 `SKILL.md` 所在目录解析。

## 列出技能

运行：

```bash
node scripts/skill-studio.mjs list
```

把输出按来源分组呈现给用户：

- **中文标题在前，英文技术名在后**；
- 保留来源（Codex / Claude / Cursor / Grok / Gemini / WorkBuddy / Hub / DSH）；
- 不要编造列表里没有的技能；
- 如果用户要找某个技能，用 `read` 或 `where` 确认，不要凭名字猜。

## 查看一个技能

```bash
node scripts/skill-studio.mjs read <name>
node scripts/skill-studio.mjs where <name>
```

`name` 可以是技术名（`novel-to-ai-storyboard`），也可以是中文标题
（`诡异升级小说改编分镜`）。

## 安装一个技能

```bash
node scripts/skill-studio.mjs install <本地目录 | GitHub tree URL | raw SKILL.md URL>
```

- 安装目标是 `~/.gemini/config/skills/<name>`；
- 已存在同名技能时脚本会拒绝，不会覆盖；
- 安装完成后运行一次 `list` 确认；
- 需要联网或 `git` 时，先向用户说明。

## 创建一个技能

按 Antigravity 的格式写入 `~/.gemini/config/skills/<name>/SKILL.md`：

```markdown
---
name: kebab-case-name
description: 一句话说明做什么、什么时候用；把触发词放在最前面。
---

# 中文标题

## 步骤

1. ...
2. ...
```

规则：

- `name` 必须是小写 kebab-case；
- `description` 决定模型什么时候加载它，不要写“帮助处理任务”这种空话；
- 正文控制在 7,500 字符以内，长内容放进 `references/`；
- 写完后运行 `list`，确认新技能出现。

## 边界

- 本技能只读外部 Agent 的技能；安装写入 Antigravity 自己的
  `~/.gemini/config/skills`。
- Antigravity 的技能列表 UI 只显示技术名；中文标题来自 `SKILL.md` 的第一个
  `# 标题`，在本技能的列表输出里显示。
- 不修改 `~/.codex`、`~/.cursor` 等原目录。
