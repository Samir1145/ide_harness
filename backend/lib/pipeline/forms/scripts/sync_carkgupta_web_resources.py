#!/usr/bin/env python3
"""
sync_carkgupta_web_resources.py
─────────────────────────────────────────────────────────────────
1. Scrapes all 46 PDF and document resources from https://www.carkgupta.com/resource/IBC_2016.aspx
2. Downloads them into `formats/00_master_originals/carkgupta_web_downloads/`
3. Calculates SHA-256 hashes and compares against existing files in `00_master_originals`
4. Segregates bare laws into `formats/00_master_originals/06_Statutory_Laws_Reference/`
5. Identifies exact duplicates vs. net-new format compendiums to be formatted.
─────────────────────────────────────────────────────────────────
"""

import os
import re
import sys
import json
import hashlib
import shutil
import urllib.request
import urllib.parse
import time

TARGET_DOWNLOAD_DIR = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/00_master_originals/carkgupta_web_downloads'
LAWS_REF_DIR        = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/00_master_originals/06_Statutory_Laws_Reference'
MASTER_ORIGINALS    = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/00_master_originals'
EXTRACTED_DIR       = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/01_extracted_instruments'
REFINED_DIR         = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/02_refined_library'

SCRAPED_HTML_FILE   = '/Users/atulgrover/.gemini/antigravity-ide/brain/7cbc7a3e-ce12-44b6-8c06-63fe906f99a0/.system_generated/steps/1545/content.md'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8',
    'Referer': 'https://www.carkgupta.com/resource/IBC_2016.aspx'
}

def get_file_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def extract_links():
    with open(SCRAPED_HTML_FILE, 'r', encoding='utf-8') as f:
        text = f.read()

    raw_links = re.findall(r'<a\s+href=[\"\']([^\"\']+)[\"\'][^>]*>(.*?)</a>', text, re.IGNORECASE)
    items = []
    seen = set()

    for href, title in raw_links:
        href_clean = href.strip()
        if not href_clean.lower().endswith('.pdf'):
            continue
        
        title_clean = re.sub(r'<[^>]+>', '', title).strip()
        filename = os.path.basename(href_clean)
        if filename in seen:
            continue
        seen.add(filename)

        # Build candidate URLs
        url1 = f"https://www.carkgupta.com/resource/{href_clean.lstrip('/')}"
        url2 = f"https://www.carkgupta.com/{href_clean.lstrip('/')}"
        if href_clean.startswith('http'):
            candidate_urls = [href_clean]
        else:
            candidate_urls = [url1, url2]

        items.append({
            'filename': filename,
            'title': title_clean or filename.replace('.pdf', ''),
            'urls': candidate_urls
        })

    return items

def download_file(item, out_dir):
    dest = os.path.join(out_dir, item['filename'])
    if os.path.exists(dest) and os.path.getsize(dest) > 1024:
        print(f"   [EXISTS] {item['filename']} ({os.path.getsize(dest) // 1024} KB)")
        return dest, True

    for url in item['urls']:
        # Encode spaces in URL
        encoded_url = urllib.parse.quote(url, safe=':/?=&%')
        req = urllib.request.Request(encoded_url, headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                if resp.status == 200:
                    content = resp.read()
                    if len(content) > 100:  # Valid non-empty file
                        with open(dest, 'wb') as f_out:
                            f_out.write(content)
                        print(f"   ✓ Downloaded: {item['filename']} ({len(content) // 1024} KB)")
                        return dest, True
        except Exception as e:
            # print(f"      (Failed {url}: {e})")
            continue

    print(f"   ❌ FAILED to download: {item['filename']}")
    return dest, False

# Classification keywords for Bare Acts & Laws
LAW_KEYWORDS = [
    'saleofgoodsact', 'partnershipact', 'alliedlaws', 'corruption',
    'enterprises development', 'real estate', 'securities contracts',
    'sarfaesi', 'arbitration and conciliation', 'recovery od debts',
    'transfer of property', 'negotiable instrument', 'indian contracr act',
    'contract act', 'barecode', 'bare code', 'rddbvssarfaesi'
]

# Classification keywords for IBBI Statutory Regulations
REGULATION_KEYWORDS = [
    'regulations', 'modelbyelaws', 'prepackre', 'ipregulations',
    'inspectionandinvestigation', 'informationutilities',
    'partiiiregulations', 'partivregulations', 'partiiregulations',
    'incometaxinibc', 'ipipaip'
]

def classify_resource(filename, title):
    fn_lower = filename.lower()
    t_lower = title.lower()

    for kw in LAW_KEYWORDS:
        if kw in fn_lower or kw in t_lower:
            return 'STATUTORY_LAW'

    for kw in REGULATION_KEYWORDS:
        if kw in fn_lower or kw in t_lower:
            return 'STATUTORY_REGULATION'

    return 'FORMAT_COMPENDIUM'

def main():
    os.makedirs(TARGET_DOWNLOAD_DIR, exist_ok=True)
    os.makedirs(LAWS_REF_DIR, exist_ok=True)

    items = extract_links()
    print("═════════════════════════════════════════════════════════════════")
    print(f"📥 Discovered {len(items)} PDF resources on carkgupta.com/resource/IBC_2016.aspx")
    print("═════════════════════════════════════════════════════════════════\n")

    downloaded = []
    for i, it in enumerate(items, 1):
        print(f"[{i:2d}/{len(items)}] {it['title']}...")
        dest, ok = download_file(it, TARGET_DOWNLOAD_DIR)
        if ok:
            downloaded.append((it, dest))
        time.sleep(0.3)

    print(f"\n✨ Download Phase Complete: {len(downloaded)}/{len(items)} downloaded.\n")

    # Step 3 & 4: Deduplication and Law Segregation
    # Compute existing hashes in 00_master_originals
    existing_hashes = {}
    for root, dirs, files in os.walk(MASTER_ORIGINALS):
        if 'carkgupta_web_downloads' in root or '06_Statutory_Laws_Reference' in root:
            continue
        for f in files:
            p = os.path.join(root, f)
            if os.path.isfile(p) and not f.startswith('.'):
                try:
                    h = get_file_sha256(p)
                    existing_hashes[h] = p
                except Exception:
                    pass

    print(f"📊 Indexed {len(existing_hashes)} existing files in 00_master_originals for deduplication.\n")

    report = {
        'duplicates_deleted': [],
        'statutory_laws_shifted': [],
        'format_compendiums_retained': []
    }

    for it, dest in downloaded:
        if not os.path.exists(dest):
            continue

        file_hash = get_file_sha256(dest)
        classification = classify_resource(it['filename'], it['title'])

        # Check duplicate
        if file_hash in existing_hashes:
            orig = existing_hashes[file_hash]
            print(f"🗑️  DUPLICATE: {it['filename']} matches existing {os.path.basename(orig)}")
            report['duplicates_deleted'].append({
                'filename': it['filename'],
                'matched_with': orig,
                'sha256': file_hash
            })
            os.remove(dest)
            continue

        # Check if it's a bare statutory law or regulation
        if classification in ('STATUTORY_LAW', 'STATUTORY_REGULATION'):
            law_dest = os.path.join(LAWS_REF_DIR, it['filename'])
            shutil.move(dest, law_dest)
            print(f"🏛️  SHIFTED TO LAWS REFERENCE: {it['filename']} ({classification})")
            report['statutory_laws_shifted'].append({
                'filename': it['filename'],
                'title': it['title'],
                'classification': classification,
                'path': law_dest,
                'size_kb': os.path.getsize(law_dest) // 1024
            })
        else:
            print(f"📋 RETAINED FOR FORMATTING: {it['filename']} ({it['title']})")
            report['format_compendiums_retained'].append({
                'filename': it['filename'],
                'title': it['title'],
                'size_kb': os.path.getsize(dest) // 1024,
                'sha256': file_hash,
                'path': dest
            })

    # Save summary report
    report_path = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/carkgupta_sync_audit_report.json'
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2)

    print("\n═════════════════════════════════════════════════════════════════")
    print(f"📊 SUMMARY REPORT:")
    print(f"   • Duplicates Deleted: {len(report['duplicates_deleted'])}")
    print(f"   • Bare Laws Shifted to 06_Statutory_Laws_Reference/: {len(report['statutory_laws_shifted'])}")
    print(f"   • Net-New Format Compendiums to be Formatted: {len(report['format_compendiums_retained'])}")
    print(f"📄 Full Audit Report: {report_path}")
    print("═════════════════════════════════════════════════════════════════\n")

if __name__ == '__main__':
    main()
