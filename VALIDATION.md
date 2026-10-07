# 验证记录

## Skill 重命名（2026-09-08）

按用户最新要求，将 Skill 目录和 `name` 统一改为 `research2paper`，界面显示为 `research2paper 科研写作`。入口是 [skills/research2paper/SKILL.md](skills/research2paper/SKILL.md)，Codex 调用为 `$research2paper`；其他客户端的安装路径与调用示例也已同步。

此次命名要求取代原重制说明中的 Skill 旧名约定。README 的 SCI-DR.CAN 方法分组、九份 Prompt、稳定锚点及来源归属仍沿用既有含义。目录整体移动，保留全部 12 个包文件；同步 README、界面元数据、验证脚本和本记录中的文件链接。历史记录中的旧命令描述的是重命名前的运行，当前复查命令如下：

```powershell
python -X utf8 tests/validate.py
python -X utf8 <skill-creator>/scripts/quick_validate.py ./skills/research2paper
git diff --check
```

重命名后的验证已通过：9 份 Prompt、34 个锚点、7 个客户端小节、12 个 Skill 文件及 9 个参考文件均有效；PowerShell 和 Git Bash 各通过 15 次复制检查，重复安装与缺失资源会正确停止。skill-creator 输出 `Skill is valid!`，`git diff --check` 通过。9 个参考文件与包内许可证逐字节保留，`DR.Can.md`、AGENTS.md、根许可证及用户重制说明的哈希未变。未改动全局安装，宿主发现与模型行为仍未实测。

## README 重制结果（重命名前，2026-09-08）

按 `CODEX_README_SKILLS_REWORK.md` v2.0 完成 README 集中展示、独立 Skill 对齐、七种客户端安装说明、完整致谢及维护检查。结论限定为文档结构、文件复制和人工规则走查；宿主发现、实际模型行为与浏览器视觉预览未执行成功。

### 基线、材料对应与改动

- 开始时已有九份 README 内的完整 Prompt、一个含 12 个文件的 Skill、MIT 许可和五类人工验收场景；没有 `prompts/` 目录，也没有需要再次迁入的独立 Prompt。仓库共 19 个非 Git 文件。
- 当时 Git 工作区唯一未跟踪项为用户提供的 `CODEX_README_SKILLS_REWORK.md`；已跟踪文件无未提交改动。本轮保留该指令文件，未提交或推送。
- 原始笔记实际为 `DR.Can.md`，其哈希与说明中 `DR.Can(2).md` 完全一致。名为 `粘贴的 markdown (1)。md(6)` 的附件不在仓库；按现有 README 制作，其重制前 SHA-256 为 `91843962c643f411efbd4c6f2570a30901d2b2c497257db023f6b35825f40918`，与上传草稿快照不同，不声称是同一字节版本。
- 展示名保留 SCI-DR.CAN。当前远程为 `https://github.com/7toCR/research2paper.git`，没有重命名或新建仓库；安装说明只使用本地源目录。
- 修改文件：`README.md`、`skills/sci-dr-can/SKILL.md`、其 `references/intake-and-workflow.md`、`references/conclusion-abstract-title.md`、`references/source-map.md`、`examples/acceptance-cases.md` 和本记录；新增 `tests/validate.py`。当前共 20 个非 Git 文件，本轮未删除既有文件。

README 结构为：**项目介绍 → 可直接使用的 Prompt → Skills 安装与使用 → 致谢与来源 → 许可证与使用边界**。九份 Prompt 均位于 SCI-DR.CAN 分组，有稳定的新锚点，并保留旧锚点；长代码块折叠显示，简介可直接跳至安装和致谢。

逐份比较重制前后的 Prompt：保留九种不同任务及全部既有事实保护、输出和输入接口。改动限于标题、显式语言优先要求、方法局部修改范围，以及有来源依据的摘要顺序澄清；不是逐字节未变的迁移。原先允许充分材料直接支持早期摘要，本次收紧为用户明确要求时才给“暂定草稿”，默认仍从已完成主体提炼。详见[来源映射](skills/research2paper/references/source-map.md)。

### 实际运行的检查

运行环境：Windows 11（10.0.26200），Python 3.13.13，markdown-it-py 4.0.0，PyYAML 6.0.2，Windows PowerShell 5.1.26100.9278，Git Bash 5.2.26（x86_64-pc-msys）。未安装新的运行框架或批量安装客户端。

在本仓库根目录执行：

```powershell
python -X utf8 tests/validate.py
python -X utf8 <skill-creator>/scripts/quick_validate.py ./skills/sci-dr-can
git diff --check
```

首条命令仅依赖维护环境中的 `markdown-it-py` 和 `PyYAML`；第二条是本机已存在的 skill-creator 校验器，不是安装后 Skill 的运行依赖。Git 使用单条命令的 `safe.directory` 参数，未改全局 Git 配置。

已得到的结果：

- **Markdown 解析**：用真实解析器读取 README，并解析生成的 HTML；9 个完整 Prompt、34 个唯一显式锚点、7 个客户端小节、51 个链接。顶级板块和标题层级正确，页内锚点与本地文件链接可达；链接语法检查与网站访问结果分开记录。
- **复制文本完整性**：9 份 Prompt 的外层四反引号闭合，内层三反引号输入区完整。HTML 中每个折叠区的代码文本与解析器提取的 Prompt 完全一致；未混入导航 HTML 或致谢。未发现其他文件中重复维护同一完整 Prompt。
- **Skill 独立性**：12 个包文件完整，9 个参考文件均可由入口通过相对链接到达；引用路径留在包内。复制后的许可证和全部文件哈希一致，只有 SKILL.md 的副本无法通过资源检查。来源说明中的外部链接不属于写作步骤的必读依赖。
- **安装函数与示例**：直接提取 README 中的 PowerShell／Bash 函数及七种客户端命令，各执行 14 次项目级／用户级示例，加 1 次带空格路径的独立复制，共各 15 次成功复制。测试只把示例中的主目录引用替换为临时测试变量，没有更改 HOME、USERPROFILE 或真实客户端目录。
- **安装边界**：两种 shell 都拒绝目标已存在的重复安装，且原有副本及模拟用户修改保持不变；源目录只有 SKILL.md 时先停止，不创建目标。全部复制位于唯一临时目录中，测试结束自动清理。
- **格式与元数据**：skill-creator 输出 `Skill is valid!`；`agents/openai.yaml` 可解析，简介 29 字符，默认调用包含 `$sci-dr-can`；保留现有界面元数据和 MIT 许可。
- **差异复审**：`git diff --check` 通过。原始笔记、AGENTS.md、两个 LICENSE、用户重制说明均与开始时哈希相同；逐份 Prompt 差异已审阅。原始代码块中的输入表单和合法转义没有被全局删除。

本轮还运行了 `tests/validate.py --json <临时结果路径> --render <临时HTML路径>`，成功生成本地 HTML。尝试通过浏览器工具打开预览时返回 `No browser is available`，因此只有解析和 HTML 结构检查通过，没有浏览器截图、交互复制或 GitHub 页面视觉验收结论；预览用本地服务已停止。

### 客户端文档与验证层级

下表中的“文件复制”是在 Windows 临时目录测试文档命令，并不代表安装到了对应客户端。PowerShell 和 Git Bash 均实际执行；macOS、Linux、WSL 原生 shell 未执行。

| 客户端 | 2026-09-08 文档状态与来源 | 文件复制 | 宿主发现 | 模型行为 |
| --- | --- | --- | --- | --- |
| Codex CLI / IDE | 重制说明记录了官方核对；本轮 [OpenAI 页面](https://developers.openai.com/codex/skills) 返回 403，[ChatGPT Learn](https://learn.chatgpt.com/docs/build-skills) 连接超时，未取得正文 | 已测试两种 shell、两种范围 | 未执行 | 未执行 |
| Claude Code | 本轮读取[官方正文](https://code.claude.com/docs/en/skills)，HTTP 200；核对路径与 `/sci-dr-can` | 已测试两种 shell、两种范围 | 未执行 | 未执行 |
| Cursor | 本轮读取[官方正文](https://cursor.com/docs/skills)，HTTP 200；核对专用／共享路径、Customize → Skills、`/` 搜索及本地与云端范围 | 已测试两种 shell、两种范围 | 未执行 | 未执行 |
| Windsurf / Cascade | [原地址](https://docs.windsurf.com/windsurf/cascade/skills) 跳转至 [Devin Desktop / Cascade](https://docs.devin.ai/desktop/cascade/skills)，HTTP 200；核对目录、Skills 菜单和 `@` 提及 | 已测试两种 shell、两种范围 | 未执行 | 未执行 |
| Pi Agent | 经 GitHub Contents API 读取 [earendil-works/pi 文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)，HTTP 200；blob SHA `02835f82005407b44887f27bca8517ba58dd624b`；核对项目信任与 `/skill:` | 已测试两种 shell、两种范围 | 未执行 | 未执行 |
| Gemini CLI | 本轮读取[官方正文](https://geminicli.com/docs/cli/skills/)，HTTP 200；核对路径、别名优先级、list／reload／enable 与激活流程 | 已测试两种 shell、两种范围 | 未执行 | 未执行 |
| OpenCode | 本轮读取[官方正文](https://opencode.ai/docs/skills/)，HTTP 200；核对原生／兼容路径与 `skill` 工具发现机制 | 已测试两种 shell、两种范围 | 未执行 | 未执行 |

Codex 的安装目录采用说明文件已经核对的 `.agents/skills/`，不因这次网页访问失败而改回旧目录，也不据此否定某个旧版本的兼容目录。Pi 的文件对象标识不是本机客户端版本；Windsurf 界面以跳转后的 Cascade 页面为据，不覆盖所有旧版。OpenCode 的 Windows 原生路径映射及自定义配置目录仍需在目标版本核对。

### 致谢与外部来源

README 已分别感谢 DR_CAN、用户指定的整理博主和 Paper2Patent；原教学主页、用户指定视频、整理博主主页及参考项目链接均完整保留。原始带追踪参数的视频地址和笔记原有两条视频地址保留在 source-map 中。

- DR_CAN 主页、整理博主主页、`BV1pW411A7C2` 视频：本轮请求均返回 HTTP 412 风控页面。归属与地址依据用户提供信息，未取得页面正文；不把此结果记为链接错误，也不补造昵称、正式视频标题或授权关系。
- Paper2Patent README：本轮经 GitHub Contents API 取得正文，文件 blob SHA 为 `ae5b60546f60c4bd541d8a51273de65c89c0f56a`，与说明文件一致。仅参考展示和组织方式；原始来源中的版权／经历／兼容性表述没有移植成本项目事实。

### 回归场景与实际失败记录

[验收场景](examples/acceptance-cases.md) 保留原有 1–5，补充单个方法小节、80% 到 84%、独立专项 Prompt、早期摘要四类，现有 9 类。逐项人工走查当前 Prompt 和 Skill：无结果时留缺口；只改指定小节；80% 到 84% 为 4 个百分点或相对提高 5%；未做实验不写完成式；期刊指南优先；单份 Prompt 无必读外部文件；早期摘要仅走明确请求的暂定分支。**这些是用例设计与人工规则走查，没有实际运行独立模型会话，不计行为测试通过率。**

开发过程中保留以下真实失败及处理结果：

- PowerShell 首次以 `-File` 运行临时脚本，受到当前系统执行策略限制；改为与 README 粘贴命令一致的 `-Command` 测试，未修改执行策略、未使用 Bypass。
- 直接从 Python 启动 Git Bash 时，初次缺少 Unix 工具路径，出现 `mkdir: command not found`；随后 DOS 临时路径出现 `Permission denied`。测试进程补入 Git 自带工具路径，并用 `cygpath` 转换测试路径后全部通过；未改系统 PATH 或用户目录权限。
- 官方页面读取中，Pi 的 raw 地址曾超时，改由 GitHub Contents API 取得同一文件；Codex 的官方域名复核和 B 站正文访问仍受限，状态如上保留。

### 受保护文件与未验证项

以下 SHA-256 与重制开始时一致：

```text
DR.Can.md
29e9c42d04c78dfc8349e8b5d6bdac125cfc7193a57b04d25e1116de191200e8
AGENTS.md
f3a19f05c415233d63ce047306c09fab9fc8b9889c81bd2ca47e4139d3f511ba
LICENSE = skills/sci-dr-can/LICENSE
f8948542245f6c4fd59f01be7d2c0f34a8ab568f0331fa77cb7552af22d30eb1
CODEX_README_SKILLS_REWORK.md
77cdd6367e6b0d7f8ba99f62355bfabc122ecb199b68679c7f5755431e961594
```

未验证：七种宿主中的实际发现与加载、模型行为、macOS／Linux／WSL 原生执行、浏览器视觉与 GitHub 页面预览、真实论文数据或引用核验。本轮没有全局安装、提交、推送或发布。

## 历史记录（原文留存）

下面是重制前的记录，反映更早制作时的环境与操作。其中“当前不是 Git 仓库”、18 个文件及此前删除独立 Prompt 等描述均属于当时记录，不适用于本轮；本轮以前面的检查为准。

<details>
<summary>展开重制前验证记录</summary>

验证日期：2026-09-08。

本记录区分文件与结构检查、场景人工走查及尚未执行的端到端验证，不将前两者表述为模型可靠性或宿主兼容性证明。

## 文件与结构检查

- **来源保护**：`DR.Can.md` 与 `AGENTS.md` 的 SHA-256 均与开始制作前一致。
- **当前结构**：项目共 18 个文件；九份 Prompt 全文集中于 README，Skill 包含 12 个文件，根目录及 Skill 包各有一份 MIT 许可证。原来的九份独立 Prompt 文件及空目录已在内容核对后删除。
- **迁移一致性**：使用 Markdown 解析器提取 README 的九个 Prompt 代码块，将内容的 SHA-256 与迁移前九个原文件逐一比较，九份均逐字节一致。四反引号外层代码块完整保留了 Prompt 内部的三反引号输入表单。
- **Skill 格式**：本机 skill-creator 的 `quick_validate.py` 返回 `Skill is valid!`；名称、描述和 YAML frontmatter 合法。
- **界面元数据**：openai.yaml 可解析，简介长度为 29 个字符，默认调用包含 `$sci-dr-can`。
- **页面与引用**：Markdown 转换后的 HTML 中有九个完整 Prompt 代码块，12 个页内锚点均唯一，目录及其他页内链接均能对应锚点；本地文件链接可解析到现有文件，没有失效的旧 Prompt 路径。
- **编码与接口**：文本为 UTF-8；Prompt 内容未改写。输入表单和 `[MISSING: ...]` 是有意保留的使用接口，页面代码块可整体复制。
- **MIT 许可**：根目录与 Skill 包内许可证逐字节一致；Skill 元数据为 `license: MIT`，README 说明了新增模板和第三方来源材料的权利边界。
- **独立目录检查**：将完整 Skill 复制到系统临时目录；12 个文件逐一校验一致，十处内部文件链接均落在复制目录内，格式校验再次通过。许可证随包携带，运行规则不依赖原始笔记或 README；临时副本已清理。
- **变更复核**：当前目录不是 Git 仓库；以本次迁移前的文件快照为基线核对新增、修改和删除，并使用 `git diff --no-index --check` 检查差异。未初始化 Git 仓库。

来源校验值：

```text
DR.Can.md
29e9c42d04c78dfc8349e8b5d6bdac125cfc7193a57b04d25e1116de191200e8

AGENTS.md
f3a19f05c415233d63ce047306c09fab9fc8b9889c81bd2ca47e4139d3f511ba
```

本机可复跑的 Skill 格式检查，在项目根目录执行：

```powershell
python -X utf8 (Join-Path $env:USERPROFILE '.codex\skills\.system\skill-creator\scripts\quick_validate.py') .\skills\sci-dr-can
```

此命令要求本机已提供 skill-creator 校验脚本及 PyYAML；它是维护检查工具，不是使用新 Skill 的运行依赖。

## 首次制作时的内容与场景人工走查

按 [来源映射](skills/research2paper/references/source-map.md) 逐项对应原笔记七部分，检查 Flash、Pro、专项 Prompt 与 Skill 规则的一致性。写作次序、结果分析、符号单位、图表、结论摘要标题及逐条返修均有落点；期刊相关经验值没有被提升为通用硬约束。

以下结论来自首次制作时的人工规则走查和示例演练，输入与示例见 [验收场景](examples/acceptance-cases.md)。本次迁移只核验内容完整搬入 README，没有重新运行这些行为场景，也没有独立模型调用成绩或通过率。

| 场景 | 走查结论 |
| --- | --- |
| 所需结果材料充分 | 可报告 80% 对 75% 的差异为 5 个百分点；不支持统计显著或机制因果结论 |
| 缺少结果 | 可写材料支持的提纲和方法，结果与贡献留缺口，不生成完成式虚构发现 |
| 引用未核验 | 保留作者提供信息并标注核验边界，不补造书目或扩大支持范围 |
| 期刊规则冲突 | 按提供的测试指南组织结构化摘要及阿拉伯表号，不套用笔记经验值 |
| 补充实验未完成 | 回复为工作草稿，保留实验、稿件修改和定位缺口，不声称已完成 |

同时检查了只有图注时的视觉验收边界、数据冲突的处理，以及原文教学例子不能进入用户研究事实的约束。

## 尚未执行的验证

- 未把 Skill 安装到用户全局目录，未在 Codex 或其他宿主中进行实际发现、加载和调用测试。
- 未进行独立模型、跨模型或独立评估 Agent 的行为测试；模板规则不能保证所有模型每次均遵守。
- 未进行真实研究数据复算、真实文献支持核验、期刊官方指南适配、图片生成或 DOCX/PDF 渲染验收。

本次调整的验收结论限定为：README 九份 Prompt 迁移完整、页面导航与本地链接有效、MIT 许可随包提供、Skill 资源自包含。五类场景结论保留为首次制作时的人工走查记录。

</details>
