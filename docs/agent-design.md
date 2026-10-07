# Research2Paper Paper Agent 设计方案

把 research2paper 从“给通用 AI 工具用的 Skill”升级为一个专门写论文的 agent。基于 [pi](https://github.com/earendil-works/pi) 二次开发，三处改动：系统提示词、工具、LaTeX 编译工具。

## 1. 关键决定

| 决定 | 选择 | 理由 |
|---|---|---|
| 怎么基于 pi | **pi package（extension + skill），不 fork pi 源码** | pi 1.0.x 迭代很快，fork 后每次合并上游都有成本；提示词、工具、编译三处改动，extension API 都有现成入口 |
| 代码放哪 | 本仓库 `agent/` | 规则（`skills/research2paper/`）和 agent 版本一起更新，不会错位 |
| 规则来源 | 只有 `skills/research2paper/` | agent 只做编排和强制，不复制写作规则，也不用 TS 重写 checker |
| 首选编译引擎 | tectonic，没有时退回 latexmk | tectonic 是单个可执行文件，缺的宏包自动下载，Windows 上不需要装完整 TeX Live |
| agent 化的增量价值 | 把“靠模型自觉”的环节改成由 harness 强制 | 例如交付前跑 checker：Skill 里只是提示，agent 里可以做成关卡 |

**激活要有开关。** 只有满足下面任一条件才进入论文模式，否则 pi 保持原样，不影响平时写代码：

- 工作目录有 `PAPER.md` 或 `.r2p/`
- 启动时加 `--paper`
- 会话中执行 `/paper on`

## 2. 结构

```text
research2paper/
├── package.json              pi 包清单：pi.extensions → agent/src/index.ts，pi.skills → skills/
├── agent/
│   ├── src/
│   │   ├── index.ts          extension 入口：激活、提示词、状态跟踪、/paper 命令
│   │   ├── prompt.ts         论文 agent 提示词 + <paper_state> 动态段
│   │   ├── state.ts          模式判断、会话状态
│   │   ├── checker.ts        调用 check_paper_draft.py，解析 JSON 报告
│   │   ├── paths.ts
│   │   ├── evidence.ts       证据账本（notes/evidence.json）
│   │   ├── stats.ts          精确计算：比率、百分点、相对变化，可直接读 CSV 单元格
│   │   ├── bib.ts            BibTeX 解析与 Crossref 核对
│   │   ├── pdf.ts            PDF 页面转 PNG（pdftoppm / mutool / Ghostscript）
│   │   └── tools/            check_draft、latex_compile、paper_init、fill_gaps、evidence、compute_stats、bib_lookup、pdf_preview
│   ├── bin/paper.mjs         独立启动器：pi + 本扩展 + 论文模式
│   ├── templates/            PAPER.md、memo.md、LaTeX 骨架
│   └── test/                 node --test；含 faux 模型驱动的端到端测试
└── skills/research2paper/    不变：规则、references、checker（Python 标准库）
```

论文工作区（由 `paper_init` 或 `/paper init` 生成，已有文件不覆盖）：

```text
my-paper/
├── PAPER.md          目标期刊、模板、字数上限、语言（作为 project_context 注入）
├── materials/        作者原始材料，只读
├── paper/            main.tex、sections/*.tex、refs.bib、figures/、build/
├── notes/memo.md     中文说明：主要修改 / 材料缺口 / 待核验事项
└── .r2p/             agent 状态、检查报告
```

正文编译成 PDF，中文说明不进 PDF，“两层输出”在物理上分开。

## 3. 系统提示词

pi 的 `customPrompt` 一旦设置，会同时去掉 pi 自带的 tools 和 rules 两段。所以 `prompt.ts` 自己渲染工具清单，以及各工具和其他 extension 提供的 guidelines；pi 的 docs 段对写论文的用户没用，正好去掉。

| 段 | 内容 |
|---|---|
| preamble | 身份；权威来源（SKILL.md 优先）；不可违背的规则；工作方式；工具清单与 guidelines |
| `<project_context>` | `PAPER.md` |
| `<skills>` | research2paper，references 按需读取 |
| `<paper_state>` | 模式来源、最近一次检查和编译的结果、之后改过但还没检查或编译的文件。每条用户消息开始时更新（同一轮内的结果由工具返回），pi 只发送变化的部分 |

## 4. 工具

| 工具 | 阶段 | 作用 |
|---|---|---|
| `check_draft` | P0 ✅ | 运行 checker，返回结构化结果，并更新 `<paper_state>` |
| `paper_init` | P1 ✅ | 生成工作区和 LaTeX 骨架（article / elsarticle / IEEEtran），三套骨架都能直接编译 |
| `latex_compile` | P1 ✅ | 见第 5 节 |
| 写保护 | P1 ✅ | 在 `tool_call` 钩子里拦截：`materials/` 和 DR.Can.md 只读；工作区外的已有文件要用户确认（无界面时直接拒绝）；bash/PowerShell 中删除、移动、覆盖 `materials/` 的命令要确认（启发式） |
| `fill_gaps` | P1 ✅ | 调用 `fill_gaps.py`：LaTeX 各节和 `notes/memo.md` 原地填写，其他文件另存 `.filled` 副本；只有在稿件中确实出现的标记，才会从说明里删掉对应条目 |
| `evidence` | P2 ✅ | 证据账本 `notes/evidence.json`：每条记录内容、四类证据分类、出处；可增、改、删、查；被其他条目引用的条目不能删除 |
| `compute_stats` | P2 ✅ | 计算比率、差值、百分点、相对变化和比值；数值可以直接读 CSV/TSV 单元格；输入和结果都自动记进账本，并注明来源和推导关系；不做显著性检验 |
| `bib_lookup` | P3 ✅ | 用 Crossref 核对 .bib 条目：DOI 是否已注册；标题、年份、第一作者是否一致，年份只要等于记录上任一出版年份（正式、网络首发、印刷）即可；没有 DOI 的条目，按标题、作者、年份、期刊检索候选记录供作者确认。只读，从不改 .bib |
| `pdf_preview` | P3 ✅ | 把编译好的 PDF 页面转成 PNG（pdftoppm，没有时用 mutool 或 Ghostscript），作为图片返回，每次最多 6 页；页数用 `pdfinfo` 读取 |

checker 端配套改动：

- 支持多文件 tex（展开 `\input` / `\include`，位置报告为 `sections/x.tex line N`，找不到的文件报 S07）（P1 ✅）
- `--ledger`：正文中的关键数字在账本里找不到就报 V01（WARN），按正文写出的小数位四舍五入匹配；`missing` 类条目里的数字不算有出处（P2 ✅）

## 5. LaTeX 编译

- **引擎检测：** tectonic → latexmk（pdflatex / xelatex）；都没有时返回安装说明，不自动下载二进制。
- **运行参数：** latexmk 用 `-interaction=nonstopmode -halt-on-error -file-line-error -no-shell-escape`；tectonic 用 `--untrusted --keep-logs`。产物都放在 `paper/build/`。
  - 超时：tectonic 300 秒（首次编译要下载宏包），latexmk 180 秒。
  - 用到 fontspec / xeCJK / ctex 时，latexmk 改用 xelatex。
  - shell-escape 一律关闭。
- **日志解析：** 返回结构化结果，而不是原始日志：
  - 错误（文件:行号）
  - 未定义的引用和引文
  - 重复的 label
  - 缺失的图片
  - overfull box 数量
  - PDF 页数和完整日志路径
- **参考文献：** 默认用 bibtex + natbib，避开 tectonic 下 biblatex/biber 的版本匹配问题。
- **模板：** CTAN 上的模板内置骨架；出版社专有模板（Springer Nature、MDPI 等）由用户放进 `paper/template/`。
  - IEEEtran 在还没有任何 `\cite` 时，空参考文献会报错（missing \item）。骨架只在参考文献环境内把这个错误降为警告，因此可以直接编译。
- **两类检查互补：** `refs.bib` 为空时，checker 无法核对引用键，只报 INFO；编译日志里的 undefined citation 会触发修复轮。

## 6. 关卡

| 关卡 | 触发 | 行为 |
|---|---|---|
| 检查 | `agent_before_settle`：本轮改过稿件，但还没检查 | 自动检查（LaTeX 各节和说明改动时检查 `main.tex`）；有 ERROR 时注入结果并续跑一次；WARN 不触发续跑 |
| 编译 | 本轮改过 `.tex`，且有可用引擎 | 自动编译，回传错误 |
| 防死循环 | 每条用户消息最多自动续跑 2 次 | 超过就停下，并在状态栏显示 |
| 投稿 | `/paper final` | 用 `--final` 检查，任何缺口标记都算 ERROR |

## 7. 分阶段

| 阶段 | 内容 | 完成标准 |
|---|---|---|
| **P0 骨架** ✅ | 包清单、激活开关、提示词替换、`PAPER.md` 注入、`<paper_state>`、`check_draft`、`/paper` | faux 模型驱动的端到端测试通过；真实 pi CLI 用 `-e` 加载和 `pi install` 安装都能识别 `--paper` |
| **P1 MVP** ✅ | `paper_init` + 模板、`latex_compile`、写保护、检查和编译关卡、memo 分离、`fill_gaps`、checker 支持多文件 tex | 从 materials 出发，产出能编译、checker 没有 ERROR 的 PDF 初稿 |
| **P2 证据** ✅ | `evidence`、`compute_stats`、checker `--ledger`；账本概况每条用户消息都注入 `<paper_state>`，账本本身是文件，上下文压缩不会丢，因此不需要另写压缩钩子 | 正文里没有出处的数字能被检出 |
| **P3 增强** ✅ | `bib_lookup`、`pdf_preview`、独立的 `paper` 启动器 | 用真实 Crossref 能发现写错的年份，并找回缺 DOI 条目的正确记录；真实模型能看到预览图并描述版面 |

评测沿用 `evals/`：同一批 case 分别用“只有 Skill 的 pi”和“paper agent”跑，按 `evals/rubric.md` 盲评。另外统计交付时剩余的 ERROR 数和编译成功率。

### 刻意不做

- 不 fork pi
- 不重写 checker
- 初期不做多 agent 流水线
- 不做联网检索和自动补引用
- 不打包 TeX 发行版
- 不做 GUI

## 8. 风险

- **pi API 变化：** peerDependency 写 `*`，开发依赖锁定确切版本；升级 pi 后先跑 `npm test`（端到端测试覆盖加载、提示词和工具）。
- **依赖 Python：** checker 只用标准库；会话开始时检测，没有就提示。可用 `R2P_PYTHON` 指定解释器。
- **tectonic 首次编译要联网下载宏包；** 离线时用 latexmk + TeX Live。
- **tectonic 首次编译慢：** 用 tectonic 0.17.0（Windows）实测，三套模板首次编译各要下载宏包。网络慢时会超过 300 秒的超时上限，之后每次编译只要 1–2 秒。超时会明确报告，并提示再编译一次。编译测试会选用本机能找到的引擎；设置 `R2P_TECTONIC` 即可用 tectonic 跑。
- **bash 写保护是启发式的：** 能拦住常见的删除、移动和覆盖命令，但拦不住所有写法。写保护是防止误操作的护栏，不是沙箱。

## 9. 使用

```bash
npm install                                   # 开发依赖：pi、typebox、typescript
npx pi -e ./agent/src/index.ts --paper        # 试用，不写入设置
pi install git:github.com/7toCR/research2paper # 安装为 pi 包
npm install -g github:7toCR/research2paper    # 或安装独立命令 paper（= pi + 本扩展 + 论文模式）
```

`paper` 接受 pi 的全部参数；`paper install`、`paper auth` 等管理命令会原样交给 pi。同时用 `pi install` 安装了本包时，`paper` 也能正常使用：实测扩展只加载一次，没有冲突。

在新目录里用 `pi --paper` 启动，或在会话中输入 `/paper on`，然后执行 `/paper init [article|elsarticle|ieeetran]`。之后进入这个目录会自动开启论文模式。

| 命令 | 作用 |
|---|---|
| `/paper status` | 模式、稿件、引擎、最近一次检查和编译的结果 |
| `/paper check` / `/paper compile` | 手动检查 / 编译 `PAPER.md` 中的稿件 |
| `/paper final` | 投稿前检查，任何缺口标记都算 ERROR |
| `/paper on` / `/paper off` | 在当前会话中开关论文模式 |

环境变量：`R2P_PYTHON`、`R2P_TECTONIC`、`R2P_LATEXMK`，分别指定解释器和编译程序。
