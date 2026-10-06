<!-- Test fixture: synthetic draft that is careful about evidence but mixes audit remarks into the paper. Every defect is intentional. -->
# Event-Grounded Report Generation from Traffic Camera Clips

## Abstract

Incident reports written from traffic camera clips must match what actually happened in the clip. We present a pipeline that extracts a shared event record before planning and writing the report, and checks the report against the record. On 120 synthetic clips, factual consistency rose from 0.71 to 0.78. However, the backend used for some rows cannot be attributed with certainty. The subjective protocol has not been verified. These results do not establish general reader preference, and we do not claim real-time operation.

## 1. Introduction

Traffic agencies rely on short written reports to triage incidents. Reports that read well can still misstate who did what, and a correct understanding of the clip may not survive the hand-off to the report writer.

We do not claim that existing captioning systems ignore temporal context. We do not treat multi-stage planning itself as a new research gap. We did not compare against the three closest planners, and this comparison remains to be established in future work.

## 2. Methods

The event extractor converts each clip into an event record with six fields. In this draft, the record format follows the supplied materials, although the exact field order could not be confirmed from the repository. The prompts in the work tree differ from the design notes.

The planner uses a window of 12 frames, an offset of 0.5 s, a fallback to the first record, 280-character instructions and at most 3 constraints per instruction.

The checker compares each sentence with the record and requests at most 2 revision rounds. [MISSING: number of revision rounds actually executed in each experimental run, which the logs do not record because logging was disabled in the version of the code used for the main table]

## 3. Results

Factual consistency rose from 0.71 to 0.78 (Table 1). Scores were not recomputed in this writing trial.

Table 1. Factual consistency with and without the shared record.

| Condition | Consistency |
|---|---|
| Without record | 0.71 |
| With record | 0.78 |

## 4. Conclusion

The shared event record improved consistency in this setting. The link between experiment rows and configurations remains to be verified. The subjective protocol has not been confirmed, and the results cannot be generalised to live traffic feeds.
