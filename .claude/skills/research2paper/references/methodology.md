# Methods: how the results were obtained

Purpose (DR_CAN, part III): explain to the reader how the results were obtained. Implicit condition: with the same resources, a reader can follow the path and reproduce the derivations, simulations or experiments. Methods are usually the first section to draft — easy to fill with facts, hard only where the contribution lies.

## Organise by research type

- **Theoretical:** problem definition, assumptions, notation, model, derivation and conditions of validity. An unfinished proof is not a proven theorem.
- **Empirical:** subjects or data sources, inclusion/exclusion criteria, measurement, processing and analysis. Report sample sizes and statistics as given.
- **Engineering / algorithmic:** task inputs and outputs, system or algorithm steps, implementation, training or operating settings, baselines and evaluation protocol. Separate method design from experimental setup when it helps.

Each step states its input, operation and output, in the order performed.

## Reproducibility details

Check, as the study requires: data splits, preprocessing, key parameters, equipment and models, software and versions, number of repetitions, randomness (seeds), metric definitions and statistical methods. Anything not supplied becomes a marker such as `[MISSING: random seed and number of runs]`. Never infer the author's choices from "common practice" or software defaults.

Separate what is adopted from prior work (cite it, describe briefly) from what this paper contributes (describe fully). Give the space to details that affect the results or the contribution claim.

## Symbols and equations

- Define every symbol, subscript and unit at first use; spell out every abbreviation at first use. For symbol-heavy papers build a Nomenclature table (symbol, unit, meaning) at the start of writing, as the notes recommend.
- One object, one symbol, one name, one unit throughout; one symbol never silently means two quantities. Use subscripts where confusion is likely.
- Write equations in LaTeX; number displayed equations that are referred to and refer to them by number ("Substituting Eq. (3) into Eq. (5) gives …"). Keep existing labels; if a renumbering is unavoidable, update every reference.
- If you find a symbol clash, a dimensional inconsistency or a missing derivation step, point to its location. Do not "fix" it into a plausible-looking formula without evidence.

Symbol and equation errors affect acceptance: reviewers check derivations, and inconsistent notation makes a paper unreadable.

## No padding

Cut content the results do not use (DR_CAN's test: is the equation used later in a derivation or experiment?). Unrelated background moves to the Introduction or out; textbook material (e.g. F = ma) is cited, not derived. Save the space for Results and Discussion.

## Tense and status

Completed work: past tense. Planned work: future or conditional tense, clearly labelled. Never present a planned step as performed.

## Self-check

Could another researcher follow the described path? Was every described step actually performed? Does every metric, dataset or condition used in Results have its origin here? Does every marker have a line in the notes?
