# Skill Studio for Antigravity (agy)

把本机所有 Agent 的技能接到 Antigravity，并提供一个能列出、查看、安装技能的
`skill-studio` 插件。

## 它做什么

1. 写入 `~/.gemini/config/skills.json`，把以下目录注册为 Antigravity 的技能来源：

   - `~/.codex/skills`
   - `~/.claude/skills`
   - `~/.cursor/skills-cursor`
   - `~/.grok/bundled/skills`
   - `~/.gemini/antigravity/skills`
   - `~/.workbuddy/skills`
   - `~/.hub/skills`
   - `~/.dsh/skills`
   - `~/.agents/skills`
   - `~/.gemini/config/skills`（安装目标）

2. 安装插件 `~/.gemini/config/plugins/skill-studio`，其中包含一个
   `skill-studio` 技能，可以：

   - `list`：按来源分组列出所有技能，**中文标题在前，英文技术名在后**；
   - `read <name>`：查看完整 `SKILL.md`；
   - `where <name>`：查看技能路径；
   - `install <source>`：从本地目录、GitHub tree URL 或 raw `SKILL.md` 安装到
     `~/.gemini/config/skills`。

## 安装

在仓库根目录运行：

```bash
node antigravity/install.mjs
```

然后重启 Antigravity。打开：

- **Settings → Customizations / Skills**（不同版本可能叫 Skills / 定制），应能看到
  来自 Codex、Claude、Cursor、Grok、Gemini、WorkBuddy、Hub、DSH 的技能；
- 或者直接对 Agent 说：**“列出本机技能”**，它会调用 `skill-studio` 技能运行脚本。

安装是可重复的：再次运行会备份旧插件；加 `--force` 替换。

```bash
node antigravity/install.mjs --force   # 覆盖旧插件
node antigravity/install.mjs --dry-run # 只看会改什么
node antigravity/install.mjs --uninstall
```

## 直接使用脚本

插件安装后：

```bash
node ~/.gemini/config/plugins/skill-studio/skills/skill-studio/scripts/skill-studio.mjs list
node ~/.gemini/config/plugins/skill-studio/skills/skill-studio/scripts/skill-studio.mjs read novel-to-ai-storyboard
node ~/.gemini/config/plugins/skill-studio/skills/skill-studio/scripts/skill-studio.mjs install https://github.com/owner/repo/tree/main/skills/foo
```

## 说明

- **不复制**外部技能：Antigravity 直接读原目录；你在 Codex/Cursor 里改技能，重启
  Antigravity 或重新扫描后生效。
- **中文名**来自 `SKILL.md` 的第一个 `# 标题`。Antigravity 自带的技能列表 UI 只显示
  技术名；中文优先的展示在 `skill-studio` 的 `list` 输出里。
- `~/.claude/skills` 里指向不存在目录的符号链接会被跳过。
- `skills.json` 的 `exclude` 用来跳过 Codex 的 `.system` 与空的
  `codex-primary-runtime`。
- 只接入你信任的目录：目录中的技能会进入 Antigravity 的技能目录。
