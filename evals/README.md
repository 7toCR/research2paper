# research2paper 评估方案

用于判断 Skill 或 Prompt 的某次修改是否真的让草稿更可靠，而不只是让它看起来更像论文。

只跑一个场景、每个版本一次的对比，只能说明“这次哪份产物更好”，不能说明哪个版本更稳定。

## 1. 固定条件

- 两个版本使用同一模型、同一输入、同一用户提示和同一预算；各自只使用自己的文件，旧版不混入新版的参考资料。
- 每次运行记录版本（commit）、入口（Skill 或哪份 Prompt）、模型、耗时和 token，否则无法把差异归因于修改。

## 2. 场景集

[`cases.json`](cases.json) 有 17 个人工构造的场景，全部为虚构材料，覆盖最容易出错的情况：

| 场景 | 主要考察 |
|---|---|
| `results-sufficient`、`results-80-84` | 百分点与相对变化、无检验不写显著、只写一段 |
| `no-results`、`default-order-no-early-abstract` | 没有结果时不编造完成式发现 |
| `provisional-abstract-on-request` | 只有明确要求时才写暂定摘要 |
| `unverified-citation` | 不把题录当证据，不补造作者和年份 |
| `journal-guide-conflict` | 作者指南优先于笔记经验值 |
| `reviewer-experiment-pending` | 未完成的实验不写 We have conducted |
| `methods-subsection-only`、`standalone-methods-prompt` | 只改指定小节；单份 Prompt 不依赖其他文件 |
| `teaching-example-isolation` | DR_CAN 课上的例子不进入论文 |
| `pre-submission-check` | 对 [问题稿件](../tests/fixtures/flawed_manuscript.md) 找出关键问题，不给评分 |
| `audit-remarks-stay-in-notes` | 材料核查与写作过程说明只进中文说明，不进论文正文 |
| `abstract-limitation-budget` | 摘要里的限制最多一句，其余放进 Discussion |
| `positioning-positive-with-contributions` | 正面定位、不堆叠“我们不声称”，以对应章节的贡献收束 |
| `method-purpose-before-procedure` | 组件先写设计目的，再写规则、修订与停止条件 |
| `revise-author-draft-as-base` | 以作者自己的段落为底稿修改，保留引用与术语 |

每个场景写明适用入口（`entries`）、用户提示（`prompt`）、输入材料（`input` 或 `input_file`）、正则断言（`must_match` / `must_not_match` / `max_count`，可按条设置 `scope`: `body`／`notes`／`all`）、是否运行检查脚本（`checker`，其中 `forbid_codes` 列出不允许出现的检查代码）以及需要人工判断的要点（`manual`）。

## 3. 运行与保存

- 每个场景、每个版本至少运行 3 次。
- 把模型的完整最终回复保存为 `runs/<case-id>/<version>/run-<n>/output.md`。`runs/` 已在 `.gitignore` 中，不进仓库。
- 用 Skill 测试时，在新会话中加载对应版本的 Skill，再发送 `prompt` 和输入材料；用 Prompt 测试时，把对应 Prompt 代码块和输入一起发送。

## 4. 两层评估

**自动断言（门槛）**

```bash
python evals/grade_outputs.py --self-test        # 先确认评分脚本本身正常
python evals/grade_outputs.py                    # 评所有已保存的输出
python evals/grade_outputs.py --case results-80-84 --version new --json evals/report.json
```

- 断言默认只作用于英文正文（第一个“主要修改／材料缺口／待核验事项”标题之前），避免中文说明里的“不能写 significant”被误判。
- 设置了 `checker` 的场景会对输出运行 `check_paper_draft.py`，出现 ERROR 或 `forbid_codes` 中的代码即不通过。
- 断言只能发现编造数字、虚假完成式、越界改写、百分点算错这类硬伤，通过不代表写得好。

**质量评审（人工或模型盲评）**

- 按 [`rubric.md`](rubric.md) 的 11 个维度做成对盲评：A/B 随机命名，用模型评审时交换位置各评一次。
- 每个场景取新旧各一次运行配对，至少评 3 对。

## 5. 结论规则

**可以说“新版更好”，需要同时满足：**

- 维度 1（证据忠实度）、2（缺口处理）、4（数值与统计表述）、10（叙述层级）上不劣于旧版：多数配对中新版“更好或持平”的次数不少于“更差”的次数。
- 其余维度中，新版在多数场景上胜出的维度多于落败的维度。
- 自动断言通过率不低于旧版。

**汇报要求：**

- 按维度报告胜、平、负，以及同一版本不同次运行之间的差异。
- 只在某一个场景上出现的差异单独说明，不外推。

## 6. 回归测试

修改检查脚本后，先在仓库根目录运行 `python -m unittest discover -s tests`，再跑上述评估。
