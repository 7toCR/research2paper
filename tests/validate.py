"""Validate Markdown and execute the README installers in isolated directories.

Run from any directory: python -X utf8 tests/validate.py
Maintenance dependencies: markdown-it-py, PyYAML. No model or global install.
Optional: --json PATH --render PATH (local HTML, not a GitHub preview).
"""

import argparse
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import unquote, urlsplit

from markdown_it import MarkdownIt
import yaml


ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / 'skills' / 'research2paper'
MD = MarkdownIt('commonmark', {'html': True}).enable('table')
PROMPT_KEYS = [
    'flash', 'pro', 'introduction', 'methodology', 'results-discussion',
    'conclusion-abstract-title', 'figures-tables', 'reviewer-response',
    'submission-check',
]
CLIENT_KEYS = ['codex', 'claude', 'cursor', 'windsurf', 'pi', 'gemini', 'opencode']


def require(condition, message):
    if not condition:
        raise AssertionError(message)


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.ids, self.links, self.codes, self.details = [], [], [], []
        self.in_code = False
        self.detail_depth = 0
        self.feed(html)
        self.close()
        require(self.detail_depth == 0, 'Unclosed details element')

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if 'id' in attributes:
            self.ids.append(attributes['id'])
        if tag == 'a' and attributes.get('href'):
            self.links.append(attributes['href'])
        if tag == 'details':
            self.detail_depth += 1
        if tag == 'code':
            self.in_code = True
            self.codes.append('')
            self.details.append(self.detail_depth)

    def handle_endtag(self, tag):
        if tag == 'code':
            self.in_code = False
        if tag == 'details':
            self.detail_depth -= 1
            require(self.detail_depth >= 0, 'Extra closing details element')

    def handle_data(self, data):
        if self.in_code:
            self.codes[-1] += data


def read(path):
    return path.read_text(encoding='utf-8')


def manifest(directory):
    return {p.relative_to(directory).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(directory.rglob('*')) if p.is_file()}


def validate_links(path, boundary=None):
    page = Page(MD.render(read(path)))
    require(len(page.ids) == len(set(page.ids)), f'Duplicate anchors: {path}')
    local = []
    for href in page.links:
        link = urlsplit(href)
        if link.scheme:
            require(link.scheme in {'http', 'https', 'mailto'}, f'Unexpected URL: {href}')
            if link.scheme != 'mailto':
                require(bool(link.netloc), f'Invalid URL: {href}')
            continue
        target = (path.parent / unquote(link.path)).resolve() if link.path else path.resolve()
        if boundary:
            require(target.is_relative_to(boundary.resolve()), f'External runtime file: {href}')
        require(target.exists(), f'Broken file link in {path}: {href}')
        if link.fragment:
            require(target.is_file(), f'Anchor on non-file: {href}')
            ids = page.ids if target == path.resolve() else Page(MD.render(read(target))).ids
            require(unquote(link.fragment) in ids, f'Broken fragment in {path}: {href}')
        local.append(target)
    return local


def validate_skill(directory):
    entry = directory / 'SKILL.md'
    require(entry.is_file(), 'Missing SKILL.md')
    text = read(entry)
    require(text.startswith('---\n'), 'Missing frontmatter')
    metadata = yaml.safe_load(text.split('---', 2)[1])
    require(metadata['name'] == directory.name == 'research2paper', 'Skill name mismatch')
    require(bool(metadata.get('description')), 'Missing description')
    require(metadata.get('license') == 'MIT', 'License metadata changed')
    require((directory / 'LICENSE').read_bytes() == (ROOT / 'LICENSE').read_bytes(),
            'Package license differs')
    ui = yaml.safe_load(read(directory / 'agents' / 'openai.yaml'))['interface']
    require(25 <= len(ui['short_description']) <= 64, 'UI description length')
    require('$research2paper' in ui['default_prompt'], 'UI invocation missing')
    seen, pending = set(), [entry.resolve()]
    while pending:
        path = pending.pop()
        if path in seen:
            continue
        seen.add(path)
        for target in validate_links(path, directory):
            if target.suffix == '.md':
                pending.append(target)
    refs = {p.resolve() for p in (directory / 'references').glob('*.md')}
    require(len(refs) == 9 and refs <= seen, 'Unreachable or missing Skill rules')
    return {'files': len(manifest(directory)), 'reachable_references': len(refs)}


def validate_readme():
    text = read(ROOT / 'README.md')
    tokens = MD.parse(text)
    fences = [t for t in tokens if t.type == 'fence']
    prompts = [t for t in fences if t.info == 'markdown' and len(t.markup) >= 4]
    require(len(prompts) == 9, 'README must contain nine complete Prompt blocks')
    page = Page(MD.render(text))
    rendered_prompts = [(s, d) for s, d in zip(page.codes, page.details)
                        if s.startswith('# SCI-DR.CAN · ')]
    require([s for s, _ in rendered_prompts] == [t.content for t in prompts],
            'Rendered Prompt contents differ from Markdown fences')
    require(all(depth == 1 for _, depth in rendered_prompts), 'Prompt folding is broken')
    headings = [(t.tag, tokens[i + 1].content) for i, t in enumerate(tokens)
                if t.type == 'heading_open']
    require([s for tag, s in headings if tag == 'h2'] == [
        '项目介绍', '可直接使用的 Prompt', 'Skills 安装与使用', '致谢与来源', '许可证与使用边界'],
        'Top-level reading order changed')
    require(len([h for h in headings if h[0] == 'h4']) == 9, 'Prompt heading hierarchy')
    lines = text.splitlines()
    for key, token in zip(PROMPT_KEYS, prompts):
        require(f'sci-dr-can-{key}' in page.ids and key in page.ids, f'Missing anchor: {key}')
        require(lines[token.map[1] - 1].strip() == token.markup, f'Unclosed Prompt: {key}')
        nested = MD.parse(token.content)
        forms = [t for t in nested if t.type == 'fence' and t.info == 'text']
        require(any('【' in t.content for t in forms), f'Missing input form: {key}')
        require(all(len(t.markup) < len(token.markup) for t in nested if t.type == 'fence'),
                f'Unsafe nested fence: {key}')
        require(not any(t.type.startswith('html') for t in nested), f'HTML in Prompt: {key}')
        require('[MISSING:' in token.content, f'No explicit evidence gap marker: {key}')
    first_prompt = text.index('<a id="sci-dr-can-flash">')
    require('](#skills)' in text[:first_prompt] and '](#acknowledgements)' in text[:first_prompt],
            'No front navigation to installation and credits')
    require(all('install-' + key in page.ids for key in CLIENT_KEYS), 'Client section missing')
    expected_urls = ['https://space.bilibili.com/230105574',
                     'https://space.bilibili.com/60706948',
                     'https://www.bilibili.com/video/BV1pW411A7C2/',
                     'https://github.com/7toCR/paper2patent']
    require(all(url in page.links for url in expected_urls), 'Required attribution link missing')
    docs = [ROOT / 'README.md', ROOT / 'VALIDATION.md', ROOT / 'examples/acceptance-cases.md']
    for path in docs:
        validate_links(path)
    prompt_texts = {t.content for t in prompts}
    for path in ROOT.rglob('*.md'):
        if '.git' in path.parts or path == ROOT / 'README.md':
            continue
        for token in MD.parse(read(path)):
            require(not (token.type == 'fence' and token.content in prompt_texts),
                    f'Duplicated complete Prompt: {path}')
    return tokens, {'prompts': len(prompts), 'anchors': len(page.ids),
                    'client_sections': len(CLIENT_KEYS), 'links': len(page.links)}


def executable(name):
    if name == 'powershell':
        return shutil.which('powershell') or shutil.which('pwsh')
    if os.name == 'nt':
        path = Path(r'C:\Program Files\Git\bin\bash.exe')
        return str(path) if path.is_file() else None  # Do not start WSL implicitly.
    return shutil.which('bash')


def shell_test(language, tokens, scratch):
    program = executable(language)
    if not program:
        return {'status': 'not_run', 'reason': f'{language} unavailable'}
    blocks = [t.content for t in tokens if t.type == 'fence' and t.info == language]
    require(len(blocks) == 8, f'Expected function and seven {language} examples')
    function, examples = blocks[0], blocks[1:]
    area = scratch / language
    source_root = area / 'source tree with spaces'
    shutil.copytree(SKILL, source_root / 'skills/research2paper')
    baseline = manifest(SKILL)
    script_number = 0

    def run(source, tail):
        nonlocal script_number
        script_number += 1
        if language == 'powershell':
            # The README asks users to paste commands; keep the system's script policy intact.
            command = [program, '-NoProfile', '-NonInteractive', '-Command', function + '\n' + tail]
        else:
            script = area / f'case-{script_number}.sh'
            script.write_text(function + '\n' + tail + '\n', encoding='utf-8', newline='\n')
            command = [program, str(script)]
        environment = os.environ.copy()
        if language == 'bash' and os.name == 'nt':
            # Direct subprocess launch lacks the PATH normally supplied by Git Bash's terminal.
            unix_bin = Path(program).parents[1] / 'usr' / 'bin'
            environment['PATH'] = str(unix_bin) + os.pathsep + environment.get('PATH', '')
        return subprocess.run(command, cwd=source, capture_output=True, text=True,
                              encoding='utf-8', errors='replace', timeout=45, env=environment)

    def install(source, parent):
        if language == 'powershell':
            literal = "'" + str(parent).replace("'", "''") + "'"
            tail = f'Install-Research2Paper -SkillParent {literal}'
        else:
            literal = "'" + parent.as_posix().replace("'", "'\"'\"'") + "'"
            if os.name == 'nt':
                literal = '"$(cygpath -u ' + literal + ')"'
            tail = f'install_research2paper {literal}'
        return run(source, tail)

    target_parent = area / 'installed skills with spaces'
    result = install(source_root, target_parent)
    require(result.returncode == 0 and 'Files verified' in result.stdout,
            f'{language} copy failed: {result.stdout}\n{result.stderr}')
    target = target_parent / 'research2paper'
    require(manifest(target) == baseline, f'{language} copy differs')
    validate_skill(target)

    # Existing and edited copies must survive attempted reinstall.
    (target / 'local-notes.txt').write_text('user customization', encoding='utf-8')
    protected = manifest(target)
    result = install(source_root, target_parent)
    require(result.returncode != 0 and 'Target already exists' in result.stdout + result.stderr,
            f'{language} did not reject repeated installation')
    require(manifest(target) == protected, f'{language} changed existing files')

    partial_root = area / 'entry only source'
    partial = partial_root / 'skills/research2paper'
    partial.mkdir(parents=True)
    shutil.copy2(SKILL / 'SKILL.md', partial / 'SKILL.md')
    result = install(partial_root, area / 'must not be created')
    require(result.returncode != 0 and 'Incomplete source' in result.stdout + result.stderr,
            f'{language} accepted incomplete source')
    require(not (area / 'must not be created').exists(), 'Failed check mutated destination')
    try:
        validate_skill(partial)
    except (AssertionError, FileNotFoundError):
        pass
    else:
        raise AssertionError('Entry-only package passed isolation validation')

    # Execute all documented calls; only the home token is redirected to a test variable.
    # System HOME/USERPROFILE and any real client directories are never assigned or changed.
    for key, example in zip(CLIENT_KEYS, examples):
        rows = [row.strip() for row in example.splitlines() if row.strip()]
        require(len(rows) == 2 and rows[1].startswith('# '), 'Expected two install scopes')
        for scope, row in zip(['user', 'project'], rows):
            work = area / f'{key} {scope} source'
            shutil.copytree(SKILL, work / 'skills/research2paper')
            user = area / f'{key} fake user'
            if language == 'powershell':
                prefix = "$sciTestUser = '" + str(user).replace("'", "''") + "'\n"
                call = row.removeprefix('# ').replace('$env:USERPROFILE', '$sciTestUser')
            else:
                literal = "'" + user.as_posix().replace("'", "'\"'\"'") + "'"
                if os.name == 'nt':
                    literal = '"$(cygpath -u ' + literal + ')"'
                prefix = 'sci_test_user=' + literal + '\n'
                call = row.removeprefix('# ').replace('$HOME/', '$sci_test_user/')
            result = run(work, prefix + call)
            require(result.returncode == 0, f'{language}/{key}/{scope}: {result.stderr}')
            search = user if scope == 'user' else work
            installed = [p.parent for p in search.rglob('SKILL.md')
                         if not p.is_relative_to(work / 'skills')]
            require(len(installed) == 1 and manifest(installed[0]) == baseline,
                    f'{language}/{key}/{scope} wrong location or incomplete copy')
    return {'status': 'passed', 'executable': program,
            'copies_checked': 15, 'repeat_install_rejected': True,
            'incomplete_source_rejected': True, 'entry_only_package_rejected': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json', type=Path)
    parser.add_argument('--render', type=Path)
    args = parser.parse_args()
    require(hashlib.sha256((ROOT / 'DR.Can.md').read_bytes()).hexdigest() ==
            '29e9c42d04c78dfc8349e8b5d6bdac125cfc7193a57b04d25e1116de191200e8',
            'Protected source note changed')
    tokens, readme = validate_readme()
    report = {'readme': readme, 'skill': validate_skill(SKILL)}
    with tempfile.TemporaryDirectory(prefix='research2paper validation ') as directory:
        scratch = Path(directory).resolve()
        require(scratch.is_relative_to(Path(tempfile.gettempdir()).resolve())
                and scratch.name.startswith('research2paper validation '), 'Unexpected temporary root')
        for language in ['powershell', 'bash']:
            report[language] = shell_test(language, tokens, scratch)
    report['host_discovery'] = 'not_run'
    report['model_behavior'] = 'not_run'
    if args.render:
        require(args.render.resolve() not in {p.resolve() for p in ROOT.rglob('*') if p.is_file()},
                'Preview must not overwrite a repository file')
        body = MD.render(read(ROOT / 'README.md'))
        args.render.write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>SCI-DR.CAN local preview</title>
<style>body{font:16px/1.65 system-ui,"Microsoft YaHei",sans-serif;max-width:1000px;margin:32px auto;padding:0 24px;color:#1f2328}
h1,h2{border-bottom:1px solid #d1d9e0;padding-bottom:8px}h2,h3,h4{scroll-margin-top:18px}
a{color:#0969da}pre{background:#f6f8fa;padding:16px;overflow:auto;font-size:14px;line-height:1.55}
code{font-family:Consolas,monospace}table{border-collapse:collapse;display:block;overflow:auto}
th,td{border:1px solid #d1d9e0;padding:6px 12px}summary{cursor:pointer;color:#0969da}
details{border:1px solid #d1d9e0;border-radius:6px;padding:10px 14px;margin:12px 0 32px}</style>
<body>''' + body + '</body></html>', encoding='utf-8')
    if args.json:
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
