# 更新记录

## 2026-10 · Research2Paper 重制

本次重制按 [paper2patent](https://github.com/7toCR/paper2patent) 的结构重做了整个仓库：项目名统一为 Research2Paper，重写 README、Skill 和 9 份 Prompt，新增自动检查脚本、示例、评估方案和多平台适配文件。下面先列旧版的问题，再说明改动。

### 一、旧版问题（commit 41a0c48）

1. **名称不一致**：仓库叫 research2paper，README 标题叫 SCI-DR.CAN，Skill 曾叫 sci-dr-can，读者很难确定该搜索和安装哪个名字。
2. **README 过长且难读**：近 1000 行，其中约 300 行是七个客户端的安装说明和两套各 30 行的安装函数；大量“本轮已读取官方正文”“未实测发现和行为”之类的过程记录混在用户文档里。
3. **规则只能靠模型自查**：缺口标记、图表与公式引用、参考文献对应、缩写定义、百分点、显著性措辞等，全部依赖模型重读自己的文本，没有任何自动检查。
4. **VALIDATION.md 不适合公开**：175 行制作过程记录，包含本机绝对路径和 Windows 用户名，以及与使用者无关的哈希值和失败日志。
5. **验收场景无法执行**：`examples/acceptance-cases.md` 只有文字描述和“人工走查”结论，没有可以对模型输出自动判定的断言。
6. **Skill 规则缺少可操作的写法**：只有约束，没有句式、措辞强度阶梯、图注模板等能直接照着写的内容；Prompt 与 Skill 的规则各自维护，已出现不一致。
7. **白名单式 .gitignore**：`*` 加逐个文件放行，新增任何文件都会被静默忽略。

### 二、主要改动

**README**（约 1000 行 → 结构对齐 paper2patent）

- 结构改为：为什么做这个项目 → 能做什么 → 快速开始 → Skill（安装、使用、输出）→ 自动检查 → Prompt 模板 → 使用须知 → 致谢。
- 安装说明压缩为一张表，覆盖 Claude Code、Claude 桌面版／网页版、Codex、Cursor、Windsurf、Gemini CLI、OpenCode；Codex 路径按当前官方文档改为 `~/.agents/skills/`。
- 9 份 Prompt 全部重写：规则与 Skill 同步，每份可单独复制使用；保留旧锚点（如 `#sci-dr-can-flash`），已有外链不失效。
- 新增“使用须知”：AI 辅助写作需按期刊政策披露、不得用于补造数据和文献。

**Skill**（`skills/research2paper/`）

- `SKILL.md` 重写为六步工作流：接收与范围 → 证据清单 → 论证主线 → 按研究顺序写作 → 自动检查 → 交付；列出“最重要的规则”和常见请求对应表。
- 参考文件重写并补充可直接使用的内容：引言的论证句式、方法的可复现检查项、结果讨论的措辞强度阶梯和百分点示例、图注模板、回复信中“修改状态决定措辞”的对照表、常见审稿意见的处理方式。
- 缺口说明的格式改为“逐条引用 `[MISSING: …]` 原文”，让检查脚本能核对缺口是否都已列出。
- `source-map.md` 精简为来源、映射表、经验值和新增约束，去掉制作过程记录。
- 新增 `assets/example_manuscript.md` 和 `assets/example_response_letter.md`：完整、能通过检查的虚构示例，演示英文正文 + 中文说明的交付格式。

**自动检查**（新增 `scripts/check_paper_draft.py`，仅用标准库）

- 支持 Markdown、LaTeX（含 `.bib` 与 `\bibitem`）、Word（.docx 文本）和纯文本；自动区分整稿、局部章节和回复信。
- 39 个检查代码，分为缺口、结构、图表与公式、参考文献、缩写、措辞、单位、一致性、回复信九类，代码表见 `references/quality-checklist.md`。
- 重点检查：
  - 空的或含糊的 `[MISSING]`、TODO 等非标准占位，以及未列入中文“材料缺口”的标记；
  - 引用了却没有定义的图、表、公式和文献，定义了却从未引用的图表和文献，首次引用顺序，LaTeX 未定义标签；
  - 没有统计检验的 significant、把百分点写成百分比（如 80% → 84% 写成 improved by 4%）、无依据的 first／novel／state-of-the-art、prove／guarantee／always；
  - 摘要和结论中出现、正文却没有的数字，结论照抄结果的句子，DR_CAN 教学例子混入论文；
  - 回复信中“We have conducted”与 `[MISSING]` 并存、缺字段、跳号、只有客套话、拿其他审稿人的意见代替回答。
- 对常见误报做了处理：区间 `[0, 1]` 不当作引用，“first-order” 不当作优先性主张，“has not been tested for significance” 不报显著性问题，硬换行中的 “Fig. 3.” 不当作图注。

**评估与测试**

- 新增 `evals/`：12 个可执行的验收场景（`cases.json`，由旧版 9 个人工走查场景扩展而来）、9 维评分细则（`rubric.md`）、输出评分脚本（`grade_outputs.py`，含自检）和评估流程说明。
- 新增 `tests/`：检查脚本的回归测试（含故意出错的 Markdown、LaTeX、回复信样例）和仓库结构测试（Skill 元数据、镜像一致、README 中 9 份 Prompt、本地链接、隐私路径）。

**仓库结构**

- 删除 `VALIDATION.md`、`tests/validate.py`、`examples/acceptance-cases.md`，内容分别由本更新记录、新测试和 `evals/` 取代。
- `DR.Can.md` 移至 `docs/DR.Can.md`，内容未改动。
- 新增 `.claude/skills/research2paper/`（Skill 镜像，Claude Code 在本仓库中可直接使用）、`CLAUDE.md`、`GEMINI.md`、`.cursor/rules/`、`.windsurf/rules/`、`.github/copilot-instructions.md`、`CLAUSE.md`。
- `.gitignore` 改为常规写法，忽略评估输入输出和临时文件。
- 许可证版权方改为 7toCR，与 paper2patent 一致。

### 三、已知限制

- 检查脚本是启发式的：WARN 需要人工判断，通过检查不代表研究内容正确，也不能核对引用是否真实支持某句话。
- Word 文件只读取文字和标题样式，不读取公式、表格结构和图片；复杂稿件建议导出为 Markdown 或 LaTeX 再检查。
- 缩写检查对领域内约定俗成、无需展开的缩写会给出提示，可按期刊习惯忽略。
- 本次重制没有按 `evals/README.md` 做多模型、多次运行的盲评，规则改动对生成质量的影响有待验证；自动检查的回归测试已全部通过。
- 各客户端的 Skills 目录以 2026 年的官方文档为准，客户端更新后可能变化。
