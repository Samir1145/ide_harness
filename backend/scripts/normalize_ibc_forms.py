#!/usr/bin/env python3
"""
normalize_ibc_forms.py
─────────────────────────────────────────────────────────────────
Normalizes statutory IBC forms across all 5 processes:
  1. CIRP (Corporate Insolvency Resolution Process)
  2. CILP (Corporate Liquidation Process)
  3. CIVLP (Voluntary Liquidation Process)
  4. PPIRP (Pre-packaged Insolvency Resolution Process for MSMEs)
  5. PG (Personal Guarantors to Corporate Debtors)

Reads raw source files from ~/Downloads, converts them to
standardized Markdown skeletons with {{ PLACEHOLDERS }},
generates forms-manifest.json, and mirrors outputs to both
haya_agents_ide and haya_vaults_ide.
─────────────────────────────────────────────────────────────────
"""

import os
import sys
import glob
import re
import json
import shutil
import subprocess
import pypdf

REPO_ROOT = '/Users/atulgrover/Desktop/haya_agents_ide'
VAULTS_ROOT = '/Users/atulgrover/Desktop/haya_vaults_ide'
PANDOC_BIN = os.path.join(REPO_ROOT, 'backend', 'bin', 'pandoc-x64')

TARGET_BASE_AGENTS = os.path.join(REPO_ROOT, 'backend', 'lib', 'pipeline', 'forms', 'skeletons', 'ibc_forms')
TARGET_BASE_VAULTS = os.path.join(VAULTS_ROOT, 'raw_data', 'suites')

DOWNLOADS_DIR = os.path.expanduser('~/Downloads')

SUITES_CONFIG = [
    {
        'id': 'cirp',
        'name': 'Corporate Insolvency Resolution Process (CIRP)',
        'source_dir': os.path.join(DOWNLOADS_DIR, 'resolution cirp forms'),
        'file_glob': '*.docx',
        'regulation': 'IBBI (Insolvency Resolution Process for Corporate Persons) Regulations, 2016'
    },
    {
        'id': 'liquidation',
        'name': 'Corporate Insolvency Liquidation Process (CILP)',
        'source_dir': os.path.join(DOWNLOADS_DIR, 'liquidation cilp forms'),
        'file_glob': '*.pdf',
        'regulation': 'IBBI (Liquidation Process) Regulations, 2016'
    },
    {
        'id': 'voluntary_liquidation',
        'name': 'Corporate Voluntary Liquidation Process (CIVLP)',
        'source_dir': os.path.join(DOWNLOADS_DIR, 'vol liquidation civlp forms'),
        'file_glob': '*.pdf',
        'regulation': 'IBBI (Voluntary Liquidation Process) Regulations, 2017'
    },
    {
        'id': 'ppirp',
        'name': 'Pre-packaged Insolvency Resolution Process for MSMEs (PPIRP)',
        'source_dir': os.path.join(DOWNLOADS_DIR, 'prepack forms'),
        'file_glob': '*.docx',
        'regulation': 'IBBI (Pre-packaged Insolvency Resolution Process) Regulations, 2021'
    },
    {
        'id': 'personal_guarantor',
        'name': 'Personal Guarantors to Corporate Debtors (IIRP & Bankruptcy)',
        'source_dir': os.path.join(DOWNLOADS_DIR, 'personal guarantor forms'),
        'file_glob': '*.docx',
        'regulation': 'IBBI (Insolvency Resolution & Bankruptcy Process for Personal Guarantors) Regulations, 2019'
    }
]

def sanitize_slug(name):
    base = os.path.splitext(name)[0]
    base = base.lower().replace(' ', '-').replace('_', '-')
    base = re.sub(r'[^a-z0-9\-]', '', base)
    base = re.sub(r'-+', '-', base)
    return base.strip('-')

def convert_placeholders(text):
    # First, unescape pandoc's escaped brackets \[ and \]
    text = text.replace(r'\[', '[').replace(r'\]', ']')

    # Convert [bracketed words] or [ ... ] to {{ UPPER_CASE }}
    def replacer(match):
        inner = match.group(1).strip()
        # skip markdown links like [text](url)
        if len(inner) > 100 or 'http' in inner:
            return match.group(0)
        # normalize to UPPER_SNAKE_CASE
        clean = re.sub(r'[\s\-\/\.\(\)\,\:\;\"]+', '_', inner).strip('_').upper()
        if not clean or clean.isdigit():
            return match.group(0)
        return f"{{{{ {clean} }}}}"

    # Match brackets: [Something Here]
    text = re.sub(r'\[([A-Za-z0-9\s\-\/\.\,\:\;\(\)\"\']{2,80})\]', replacer, text)
    # Also clean up double brackets if any
    text = re.sub(r'\{\{\s*\{\{\s*', '{{ ', text)
    text = re.sub(r'\s*\}\}\s*\}\}', ' }}', text)
    return text


def clean_pandoc_markdown(text):
    # Clean HTML header tags often emitted inside tables by pandoc
    text = re.sub(r'<h[1-6][^>]*>(.*?)</h[1-6]>', r'\1', text, flags=re.DOTALL)
    text = re.sub(r'<span[^>]*>(.*?)</span>', r'\1', text, flags=re.DOTALL)
    text = re.sub(r'</?(?:table|thead|tbody|tr|th|td|colgroup|col)[^>]*>', '', text)
    # Clean up empty lines excess
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def extract_pdf_to_markdown(pdf_path):
    reader = pypdf.PdfReader(pdf_path)
    pages_text = []
    for idx, page in enumerate(reader.pages):
        t = page.extract_text() or ''
        if t.strip():
            pages_text.append(t.strip())
    raw = '\n\n---\n\n'.join(pages_text)
    return raw

def process_suite(cfg):
    suite_id = cfg['id']
    suite_name = cfg['name']
    source_dir = cfg['source_dir']
    pattern = cfg['file_glob']
    regulation = cfg['regulation']

    print(f"\n📂 Processing Suite: {suite_name} ({suite_id})")
    files = sorted(glob.glob(os.path.join(source_dir, pattern)))
    print(f"   Found {len(files)} files in {source_dir}")

    dest_agents_sources = os.path.join(TARGET_BASE_AGENTS, suite_id, 'sources')
    dest_agents_md = os.path.join(TARGET_BASE_AGENTS, suite_id, 'markdown')

    dest_vaults_sources = os.path.join(TARGET_BASE_VAULTS, suite_id, 'forms', 'sources')
    dest_vaults_md = os.path.join(TARGET_BASE_VAULTS, suite_id, 'forms', 'markdown')

    for d in [dest_agents_sources, dest_agents_md, dest_vaults_sources, dest_vaults_md]:
        os.makedirs(d, exist_ok=True)

    manifest_forms = []

    for fpath in files:
        fname = os.path.basename(fpath)
        slug = sanitize_slug(fname)
        md_name = f"{slug}.md"

        # 1. Copy source binary to both repos
        shutil.copy2(fpath, os.path.join(dest_agents_sources, fname))
        shutil.copy2(fpath, os.path.join(dest_vaults_sources, fname))

        # 2. Extract and normalize content
        raw_text = ""
        if fname.endswith('.docx'):
            # Convert via pandoc
            cmd = [PANDOC_BIN, '-f', 'docx', '-t', 'gfm', fpath]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode == 0:
                raw_text = clean_pandoc_markdown(res.stdout)
            else:
                print(f"   ⚠️ Pandoc warning on {fname}: {res.stderr[:200]}")
        elif fname.endswith('.pdf'):
            raw_text = extract_pdf_to_markdown(fpath)

        # 3. Convert placeholders
        normalized_md = convert_placeholders(raw_text)

        # Extract placeholder list
        placeholders = sorted(list(set(re.findall(r'\{\{\s*([A-Z0-9_]+)\s*\}\}', normalized_md))))

        # 4. Save normalized markdown
        dest_md_agents = os.path.join(dest_agents_md, md_name)
        dest_md_vaults = os.path.join(dest_vaults_md, md_name)

        with open(dest_md_agents, 'w', encoding='utf8') as out:
            out.write(normalized_md + '\n')
        with open(dest_md_vaults, 'w', encoding='utf8') as out:
            out.write(normalized_md + '\n')

        # Extract form title
        lines = [l.strip() for l in normalized_md.split('\n') if l.strip()]
        title = lines[0] if lines else slug
        title = re.sub(r'^[#\*\_\s]+', '', title).strip()

        manifest_forms.append({
            'id': slug,
            'title': title,
            'sourceFile': fname,
            'markdownFile': md_name,
            'placeholdersCount': len(placeholders),
            'placeholdersSample': placeholders[:10]
        })

        print(f"   ✓ Normalized: {fname} -> {md_name} ({len(placeholders)} variables)")

    # 5. Write suite manifest
    suite_manifest = {
        'suiteId': f"suite_{suite_id}",
        'name': suite_name,
        'regulation': regulation,
        'totalForms': len(manifest_forms),
        'forms': manifest_forms
    }

    manifest_json = json.dumps(suite_manifest, indent=2)
    with open(os.path.join(TARGET_BASE_AGENTS, suite_id, 'forms-manifest.json'), 'w') as mf:
        mf.write(manifest_json)
    with open(os.path.join(TARGET_BASE_VAULTS, suite_id, 'forms', 'forms-manifest.json'), 'w') as mf:
        mf.write(manifest_json)

    print(f"   📋 Manifest saved with {len(manifest_forms)} forms.")

def main():
    print("═══════════════════════════════════════════════════════════")
    print("🚀 Hayagriva IBC Forms Normalization Engine")
    print("═══════════════════════════════════════════════════════════")

    for cfg in SUITES_CONFIG:
        if os.path.exists(cfg['source_dir']):
            process_suite(cfg)
        else:
            print(f"⚠️ Source directory not found: {cfg['source_dir']}")

    print("\n═══════════════════════════════════════════════════════════")
    print("✅ All 5 IBC Suites Normalized & Synchronized!")
    print("═══════════════════════════════════════════════════════════")

if __name__ == '__main__':
    main()
