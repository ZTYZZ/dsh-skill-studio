# Skill Studio（技能工坊）

[English](README.en.md) | 中文

**在对话里直接创建、安装、读取、更新、列出和删除可复用的 Agent 技能。**

DeepSeek Harness 已经会「用」技能。Skill Studio 用同一套 `SKILL.md` 补齐「做、装、管、接」——不另起运行时。思路和 Codex 的 skill-creator 一样：技能就是磁盘上的普通 `SKILL.md` 包，由 Harness 自带的文件系统 provider 发现并热更新。

## 和原生 skill 的区别

DSH 原生已经会「用」技能：`skill` 工具负责加载，会话目录负责展示，文件系统 provider 负责发现和监听。Skill Studio 不重复这些，而是补齐「做、装、管、接」：

| 能力 | DSH 原生 | Skill Studio |
| --- | --- | --- |
| 发现并加载技能 | ✅ `skill` 工具 + 文件系统 provider | 复用原生，不另起一套 |
| 技能格式 | ✅ `SKILL.md` | 完全兼容，不魔改 |
| 热更新 | ✅ 监听技能根目录 | ✅ 另加 7 类外部 Agent 目录 |
| 新建 / 修改 / 删除 | 需自己写文件 | `skill_create` / `skill_update` / `skill_delete`，校验后原子写入 |
| 安装现成技能 | — | `skill_install`：GitHub / raw URL / `owner/repo/path` / 本地目录 |
| 接入其他 Agent | — | 自动发现 Codex、Claude、Cursor、Grok、Gemini、WorkBuddy、Hub（本机 82 个） |
| 坏技能诊断 | 目录静默跳过 | `skill_list` 列出错误和警告 |
| 可视化管理 | `/` 菜单（技术名，有缓存） | 设置 → 技能工坊：搜索、详情、安装、新建、删除 |
| 中文名 | 仅 kebab 技术名 | 中文 H1 优先，英文技术名第二 |
| 删除恢复 | 手动 | `.trash` 软删除 |
| 安全边界 | 取决于你用的写入工具 | 路径 jail、符号链接拦截、大小限制 |

一句话：**原生负责「用」，Skill Studio 负责「做、装、管、接」。** 两者不是替代关系；卸载插件，已有技能仍然可用。

## 能做什么

| 你想做的事 | 直接说 | 背后发生什么 |
| --- | --- | --- |
| 把一次流程沉淀成技能 | 「把刚才这套分镜流程做成技能」 | `skill-creator` 指导模型，`skill_create` 写文件 |
| 装一个现成技能 | 「安装这个技能：https://github.com/...」 | `skill_install` 抓取、校验、落盘 |
| 用 Codex 里的技能 | 不用操作，刷新后自动出现 | 只读外部 provider，原文件原地读取 |
| 查技能为什么没出现 | 「列出技能，看看哪个坏了」 | `skill_list` 显示错误、警告和路径 |
| 删掉试用的技能 | 「删掉 xxx 技能」 | `skill_delete` 移入 `.trash`，可恢复 |
| 在浏览器里管理 | 设置 → 技能工坊 | 搜索、查看、安装、新建、删除 |

```text
你：把我们发布说明的流程沉淀成一个技能。

Agent：[加载 skill-creator]
       [调用 skill_list]      → 没有现成的 release-notes
       [调用 skill_create]    → ~/.dsh/skills/release-notes/SKILL.md
       已创建技能 "release-notes"。
       技能目录会自动刷新。
```

不用重启，不用改配置。下一步开始，新技能就出现在所有标准预设会话的技能目录里。

---

## 提供的工具

| 工具 | 作用 |
| --- | --- |
| `skill_list` | 列出技能目录中的全部技能，**包括解析失败的技能和诊断信息**——会话目录会静默隐藏坏技能，这里能查到原因。 |
| `skill_read` | 读取某个技能的 frontmatter、正文和资源文件列表，或读取其中一个资源文件。 |
| `skill_create` | 写入 `<技能目录>/<name>/SKILL.md`，可同时写入 `references/`、`scripts/`、`assets/` 文件；写入前做校验，默认拒绝覆盖。 |
| `skill_install` | 从 GitHub tree/blob URL、`owner/repo/path`、raw `SKILL.md` URL 或本地目录安装现成技能，落盘前先校验。 |
| `skill_update` | 局部更新技能。未传的字段、未知的 frontmatter 键、未列出的文件都会保留；资源可增、可换、可删。 |
| `skill_delete` | 把技能移入 `<技能目录>/.trash`，而不是直接删除；`confirm` 必须与技能名完全一致。 |

此外，插件还会注册一个运行时技能 **`skill-creator`**，教 Agent 写出真正好用的技能：触发词前置的描述、祈使式正文、把长内容拆进 `references/`、8 KB 工具结果限制，以及「先校验再交付」的检查清单。

---

## 安装

### 前置条件

- DeepSeek Harness 桌面版（或其他 DSH 部署），使用默认 `standard` 预设——它已挂载 `@deepseek-ai/dsh-skill-filesystem` 与 `@deepseek-ai/dsh-tool-skill`。
- Node.js 20+（Host 运行时已满足）。

### 安装 bundle

克隆仓库，然后让 Agent 安装本地 bundle：

```bash
git clone https://github.com/ZTYZZ/dsh-skill-studio.git
```

```text
用 plugin_manager 安装 /绝对路径/dsh-skill-studio 这个 DSH bundle。
```

等价操作是 `plugin_manager` 的 `install_bundle`，`target` 传包的绝对路径。管理器会把 checkout 链接进 profile，之后 `git pull` 会更新磁盘上的文件。

### 更新

替换已安装插件的 JavaScript 需要新的模块代：`git pull` 之后重启应用，或在 **设置 → 插件** 里先禁用再启用 bundle。创建技能永远不需要重启——只有更新插件代码才需要。

在下一步验证：

```text
skill_list
→ 0 skills in /Users/you/.dsh/skills
```

六个工具和 `skill-creator` 目录项应当立即可见。

### 手动写入组合

如果你手写 profile，可把 bundle 加进 `cordis.patch.yml`（前提是包已能被 profile 解析）：

```yaml
- insert:
    - id: skill-studio
      name: dsh-skill-studio
      config: {}
```

优先用 `plugin_manager`：它会安装依赖、登记 bundle，并明确告诉你组合是否真正生效。

---

## 用法

正常说话即可，Agent 会通过 `skill-creator` 和这些工具完成：

- 「给我们的每周数据分析报告做一个技能。」
- 「把这份检查清单做成可复用技能，描述要贴合我平时的说法。」
- 「这个技能太长了，把 API 细节移到 reference 文件里。」
- 「把刚才这套分镜流程沉淀成一个技能。」
- 「从这个 GitHub 地址安装技能：https://github.com/ZTYZZ/dsh-skill-studio/tree/main/examples/release-notes」
- 「删掉旧的 `weekly-report` 技能。」

推荐流程：

1. `skill_list`——先查有没有现成的。
2. `skill_read`——接近的先读，能扩展就不新建。
3. `skill_create`——写「能跑通的最小技能」。
4. `skill_list` / `skill_read`——确认有效，并回读渲染结果。
5. `skill_update`——真跑一次后再迭代。

### 安装现成技能

`skill_install` 支持：

| 来源 | 示例 |
| --- | --- |
| GitHub tree URL | `https://github.com/ZTYZZ/dsh-skill-studio/tree/main/examples/release-notes` |
| GitHub blob URL | `https://github.com/ZTYZZ/dsh-skill-studio/blob/main/examples/release-notes/SKILL.md` |
| 简写 | `ZTYZZ/dsh-skill-studio/examples/release-notes` |
| 原始 `SKILL.md` | `https://raw.githubusercontent.com/.../SKILL.md` |
| 本地路径 | `/Users/you/work/skills/release-notes`（含 `SKILL.md` 的目录，或单个 `.md` 文件） |

GitHub 目录通过 Contents API 读取，所以 `references/` 等文本文件会一起装进来；单个 raw 文件只装 `SKILL.md`。未认证的 GitHub API 每小时限 60 次；更大的私有仓库建议先 clone，再从本地路径安装。

安装和 `skill_create` 走同一个存储层，先校验再落盘，目录照样自动刷新。来源 URL、解析位置和时间戳会记录在技能目录内的 `.skill-studio.json`。二进制资源会跳过：这种方式安装的技能只包含文本。

```text
安装 https://github.com/ZTYZZ/dsh-skill-studio/tree/main/examples/release-notes
→ 已安装技能 "release-notes"。
  Source: https://github.com/ZTYZZ/dsh-skill-studio/tree/main/examples/release-notes
  Files: references/format.md
```

---

## 界面：技能工坊

打开 **设置 → 技能工坊**：

- 实时读取技能目录，磁盘新增/删除立刻反映，不依赖 `/` 菜单的会话缓存；
- 搜索、查看完整 `SKILL.md` 和资源文件；
- 从 GitHub / 本地路径安装，或直接新建技能；
- 删除前二次确认，移入 `.trash`；
- 标出无效技能、`仅手动调用`、`不可 / 调用` 和外部安装来源。

页面通过 `/skill-studio/api` 与 Host 通信：GET 只读，POST 只接受同端口 loopback `Origin`，避免其他网页跨站创建或删除技能。

> DSH 自带的 `/` 技能菜单只显示当前会话可调用的技能，并按字母排序；它在磁盘新增/删除技能后不会立刻刷新（DSH 的已知限制）。技能工坊页面和 `skill_list` 工具不受这个缓存影响。

---

## 技能格式

技能是一个带 `SKILL.md` 的目录包：

```text
~/.dsh/skills/
  release-notes/
    SKILL.md
    references/
      format.md
    scripts/
      collect.sh
```

```markdown
---
name: release-notes
description: 根据 git 历史和已合并的 PR 生成发布说明。当用户要求 changelog、发布说明、版本总结时使用。
whenToUse: 用户询问某个版本改了什么。
---

# 发布说明

## 步骤

1. 收集上个 tag 以来的提交。
2. 按用户可见的功能分组，而不是按 commit 类型。
3. 每条结论都要对照 diff 验证。

输出结构不明确时，读 `references/format.md`。
```

插件强制或提示的规则：

| 规则 | 行为 |
| --- | --- |
| `name`、`description` 必填 | 硬错误 |
| `name` 为 kebab-case，≤ 64 字符 | 硬错误 |
| `description` 单行，≤ 1024 字符 | 超过 1024 硬错误；**超过 500 警告**，因为目录最多渲染 500 |
| 正文 ≤ 7500 字符 | 警告：标准预设会裁剪超过 8192 字符的工具结果 |
| 正文 ≤ 60000 字符 | 硬错误 |
| 资源路径必须相对且留在技能目录内 | `..`、绝对路径、反斜杠、符号链接穿越均为硬错误 |
| `SKILL.md` 不能作为资源写入 | 硬错误；正文请用 `body` |
| 删除必须传一致的 `confirm` | 否则硬错误 |
| 技能已存在 | 硬错误，除非 `overwrite: true` |

可选 frontmatter：

- `disable-model-invocation: true`——从模型目录隐藏，只保留 `/name` 显式调用。
- `user-invocable: false`——移除 `/name` 手势，仍可被模型调用。
- `metadata: { owner: platform, version: 2 }`——扁平的字符串/数字/布尔映射。
- 未知的顶层键会被 `skill_update` 原样保留。

扁平的 `<name>.md` 技能也能被发现、读取和更新，但 `skill_create` 总是写目录包。

---

## 配置

唯一的配置是技能目录：

```yaml
- insert:
    - id: skill-studio
      name: dsh-skill-studio
      config:
        skillsDir: /Users/you/work/skills
```

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `skillsDir` | `$DSH_HOME/skills`（通常是 `~/.dsh/skills`） | 工具扫描和写入的目录。支持 `~`；相对路径按 Host 进程工作目录解析。 |
| `externalSkillDirs` | 自动发现 | 显式追加/覆盖其他 Agent 的技能目录；`[]` 关闭外部技能。 |
| `autoDiscoverExternalSkills` | `true` | 自动发现 Codex、Claude、Cursor、Grok、Gemini、WorkBuddy、Hub 等目录。 |

默认值就是内置文件系统 provider 扫描的用户根目录，所以这里创建的技能对所有会话可见，并且重启后仍在。若改到自定义目录，还需要把该目录加入 provider 的 `customSkillDirs`，否则工具能写，但技能不会被目录发现。

### 其他 Agent 的技能

DSH 默认只扫描自己的根目录：`~/.dsh/skills`、`~/.agents/skills`，以及项目里的 `.dsh/skills`、`.agents/skills`。Codex 的 `~/.codex/skills`、Claude 的 `~/.claude/skills`、Cursor 的 `.cursor/skills-cursor` **不会自动加载**——这是目录约定不同，不是技能坏了。

从 1.4.0 起，插件会注册一个只读 provider，**自动发现所有已知 Agent 的技能目录**：

`~/.codex/skills`、`~/.claude/skills`、`~/.workbuddy/skills`、`~/.hub/skills`、`~/.gemini/antigravity/skills`、`~/.gemini/antigravity/builtin/skills`、`~/.cursor/skills-cursor`、`~/.grok/bundled/skills`，以及家目录下其他 `<agent>/skills`。

- 不复制文件，直接读原目录；在 Codex 里改技能，DSH 这边同步看到；
- 技能进入所有会话的技能目录，`references/` 相对路径仍指向原目录；
- 目录变化会触发刷新，不需要重启；
- 额外目录用 `externalSkillDirs` 追加；最多可挂载 80+ 个技能；
- `autoDiscoverExternalSkills: false` 只保留显式目录；`externalSkillDirs: []` 完全关闭。

```yaml
- insert:
    - id: skill-studio
      name: dsh-skill-studio
      config:
        externalSkillDirs:
          - ~/.codex/skills
          - ~/.claude/skills
```

`~/.claude/skills` 里如果是指向 `~/.agents/skills/...` 的符号链接，链接目标必须真实存在，否则会被跳过。**技能工坊页面会显示这些外部技能（只读，中文标题优先、英文技术名其次）；删除或修改请回原工具。** DSH 自带的 `/` 菜单只能显示技术名（kebab-case），不能显示中文标题。

> 只接入你信任的目录：目录里的所有技能都会进入会话目录。

---

## 工作原理

- 这是一个 Host bundle：`cordis.patch.yml` 插入一行插件；`index.js` 在全局工具注册表上注册六个工具，并通过 `ctx.skills` 注册一个运行时技能。
- `skill_create`、`skill_install`、`skill_update`、`skill_delete` 只在 `skillsDir` 内写入，使用原子 rename。
- `skill_install` 抓取指定来源、校验技能包，再交给同一个存储层；它是唯一会发起网络请求的代码路径。
- Harness 的 `dsh-skill-filesystem` provider 监听该目录。新增、修改或删除 `SKILL.md` 会让它的目录缓存失效，`dsh-tool-skill` 随即追加一份替换目录。这就是无需重启的原因。
- 所有校验发生在写入之前。规则集中在 `lib/frontmatter.js`，并有单元测试覆盖。
- 零运行时依赖、无后台进程；只有 `skill_install` 会联网，而且只访问你指定的来源。

---

## 安全

- **写入被限制**在 `skillsDir` 内。`..`、绝对路径、反斜杠、把 `SKILL.md` 当资源、以及通过符号链接写出目录，都会被拒绝。
- **删除可恢复**：技能被移到 `<skillsDir>/.trash/<name>-<timestamp>`。
- **大小限制**：技能文件 512 KiB、单个资源 256 KiB、单次创建/安装/更新调用 1 MiB。
- **远程安装拒绝回环和私有网段地址**，只支持 `http(s)`；GitHub 目录通过公开 Contents API 读取。
- **技能是指令，不是普通数据**。由不可信内容生成的技能可能影响之后的会话。不是自己写的技能，保留前先审阅；`.trash` 不会被扫描，移出目录即移出目录影响。
- 插件不读取环境密钥、不执行技能脚本。`scripts/` 只存储，不运行。网络访问只发生在 `skill_install` 且只针对你提供的来源。

---

## 开发

```bash
npm test        # node:test —— frontmatter、存储、路径安全、回收站、扁平技能
npm run check   # 对所有运行时模块执行 node --check
```

目录结构：

```text
index.js              Host 插件：工具、配置、运行时技能注册
lib/frontmatter.js    YAML 子集解析/序列化、校验、限制
lib/skills.js         文件系统存储：list/read/create/update/delete
lib/install.js        从 GitHub、URL 或本地路径抓取并校验技能
lib/meta-skill.js     运行时注册的 skill-creator 指令
test/                 单元测试
examples/             可直接复制的示例技能
```

设计原则：

- 写能跑通的最小技能，细节拆进 `references/`。
- 技能目录是路由层：描述质量比正文长度更重要。
- 不销毁用户内容。保留未知 frontmatter 与未列出的文件；删除用回收站。
- 保持零依赖，任何 profile 都能装。

见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 路线图

- Settings → Skills 页面（无需通过 Agent，直接浏览、创建、编辑）。
- 技能索引与 `skill_search`：不靠 URL 也能找到技能。
- `skill_validate`：对整个技能目录做 CI 式 lint。
- 可选的仓库级根目录（当前仓库的 `.dsh/skills`）。

欢迎 issue 和 PR。

---

## 许可证

MIT © 2026 ZTYZZ。见 [LICENSE](LICENSE)。

[English](README.en.md)
