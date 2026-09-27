#!/usr/bin/env python3
"""
split_compendiums.py
─────────────────────────────────────────────────────────────────────────────
Comprehensive Compendium Splitting Engine for Sovereign Legal Compendiums.
Strips apart multi-format compendiums into discrete, standalone Markdown instruments.

Input:  /Users/atulgrover/Desktop/HAYAGRIVA/formats/00_master_originals/compendiums/
Output: /Users/atulgrover/Desktop/HAYAGRIVA/formats/01_extracted_instruments/<compendium_slug>/
─────────────────────────────────────────────────────────────────────────────
"""

import os
import re
import zipfile
import xml.etree.ElementTree as ET

BASE_IN = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/00_master_originals/compendiums'
BASE_OUT = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/01_extracted_instruments'
os.makedirs(BASE_OUT, exist_ok=True)

NAMESPACES = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

def sanitize_slug(name):
    clean = re.sub(r'[^a-zA-Z0-9_-]', '_', name.lower())
    clean = re.sub(r'_+', '_', clean).strip('_')
    return clean

def extract_docx_elements(docx_path):
    with zipfile.ZipFile(docx_path) as z:
        xml_content = z.read('word/document.xml')
        tree = ET.fromstring(xml_content)
    body = tree.find('.//w:body', NAMESPACES)
    return body

def render_table_to_md(tbl_elem):
    table_lines = []
    cells_len = 0
    for row in tbl_elem.findall('.//w:tr', NAMESPACES):
        cells = []
        for cell in row.findall('.//w:tc', NAMESPACES):
            cell_text = ' '.join([t.text for t in cell.findall('.//w:t', NAMESPACES) if t.text]).strip()
            cells.append(cell_text.replace('|', '/'))
        if cells:
            cells_len = len(cells)
            table_lines.append('| ' + ' | '.join(cells) + ' |')
    if table_lines and cells_len > 0:
        header_sep = '| ' + ' | '.join(['---'] * cells_len) + ' |'
        return '\n' + table_lines[0] + '\n' + header_sep + '\n' + '\n'.join(table_lines[1:]) + '\n'
    return ''

# ── 1. CIRP Second Edition Splitter ──────────────────────────────────────────
def split_cirp_second_edition():
    src = os.path.join(BASE_IN, '20260915_CIRP_MASTER_COMPENDIUM_Second_Edition.docx')
    if not os.path.exists(src): return 0
    out_dir = os.path.join(BASE_OUT, '01_cirp_master_compendium_2nd_ed')
    os.makedirs(out_dir, exist_ok=True)
    
    body = extract_docx_elements(src)
    current_inst = None
    current_title = None
    current_lines = []
    count = 0
    
    for elem in body:
        tag = elem.tag.split('}')[-1]
        if tag == 'p':
            texts = [t.text for t in elem.findall('.//w:t', NAMESPACES) if t.text]
            line = ''.join(texts).strip()
            if not line: continue
            
            match = re.match(r'^(Instrument\s+([0-9]+[A-Za-z]?|S-[0-9]+|31-Alt))\s*[\u2014\u2013-]\s*(.*)$', line, re.I)
            if match:
                if current_inst and current_lines:
                    fname = f'{current_slug}.md'
                    with open(os.path.join(out_dir, fname), 'w', encoding='utf-8') as f:
                        f.write(f'# {current_title}\n\n' + '\n\n'.join(current_lines))
                    count += 1
                
                inst_id = match.group(1).strip()
                inst_name = match.group(3).strip()
                current_inst = inst_id
                current_title = f'{inst_id} — {inst_name}'
                current_slug = sanitize_slug(f'{inst_id}_{inst_name}')[:80]
                current_lines = []
                continue
            if current_inst:
                current_lines.append(line)
        elif tag == 'tbl' and current_inst:
            tbl_md = render_table_to_md(elem)
            if tbl_md: current_lines.append(tbl_md)
                
    if current_inst and current_lines:
        fname = f'{current_slug}.md'
        with open(os.path.join(out_dir, fname), 'w', encoding='utf-8') as f:
            f.write(f'# {current_title}\n\n' + '\n\n'.join(current_lines))
        count += 1
        
    print(f'✓ CIRP Second Edition: {count} instruments extracted to {out_dir}')
    return count

# ── 2. Part III Vol 1 (Individual Insolvency) Splitter ─────────────────────
def split_part_iii_vol1():
    src = os.path.join(BASE_IN, '20260915_IBC_PartIII_VOL1_Individual_Insolvency_Resolution.docx')
    if not os.path.exists(src): return 0
    out_dir = os.path.join(BASE_OUT, '02_part_iii_vol1_individual_insolvency')
    os.makedirs(out_dir, exist_ok=True)
    
    body = extract_docx_elements(src)
    current_inst = None
    current_title = None
    current_lines = []
    count = 0
    
    for elem in body:
        tag = elem.tag.split('}')[-1]
        if tag == 'p':
            texts = [t.text for t in elem.findall('.//w:t', NAMESPACES) if t.text]
            line = ''.join(texts).strip()
            if not line: continue
            
            match = re.match(r'^(MASTER INDEX\s*#\s*([0-9]+[a-z]?)|APPENDIX\s+[A-Z]\b)\s*[\u2014\u2013-]?\s*(.*)$', line, re.I)
            if match and len(match.group(3)) > 3:
                if current_inst and current_lines:
                    fname = f'{current_slug}.md'
                    with open(os.path.join(out_dir, fname), 'w', encoding='utf-8') as f:
                        f.write(f'# {current_title}\n\n' + '\n\n'.join(current_lines))
                    count += 1
                
                inst_id = match.group(1).replace(' ', '_').upper()
                inst_name = match.group(3).strip()
                current_inst = inst_id
                current_title = f'{inst_id} — {inst_name}'
                current_slug = sanitize_slug(f'{inst_id}_{inst_name}')[:80]
                current_lines = []
                continue
            if current_inst:
                current_lines.append(line)
        elif tag == 'tbl' and current_inst:
            tbl_md = render_table_to_md(elem)
            if tbl_md: current_lines.append(tbl_md)
                
    if current_inst and current_lines:
        fname = f'{current_slug}.md'
        with open(os.path.join(out_dir, fname), 'w', encoding='utf-8') as f:
            f.write(f'# {current_title}\n\n' + '\n\n'.join(current_lines))
        count += 1
        
    print(f'✓ Part III Vol 1 (Individual Insolvency): {count} instruments extracted to {out_dir}')
    return count

# ── 3. Part III Vol 2 (Bankruptcy) Splitter ────────────────────────────────
def split_part_iii_vol2():
    src = os.path.join(BASE_IN, '20260915_IBC_PartIII_VOL2_Individual_Bankruptcy.docx')
    if not os.path.exists(src): return 0
    out_dir = os.path.join(BASE_OUT, '03_part_iii_vol2_individual_bankruptcy')
    os.makedirs(out_dir, exist_ok=True)
    
    body = extract_docx_elements(src)
    current_inst = None
    current_title = None
    current_lines = []
    count = 0
    
    for elem in body:
        tag = elem.tag.split('}')[-1]
        if tag == 'p':
            texts = [t.text for t in elem.findall('.//w:t', NAMESPACES) if t.text]
            line = ''.join(texts).strip()
            if not line: continue
            
            # Pattern like: '#1  BANKRUPTCY-READINESS & ELIGIBILITY NOTE: ...'
            match = re.match(r'^(#\s*([0-9]+[a-z]?))\s+([A-Z0-9\s\u2014\u2013\-\(\)\:\;\&\,\./]+)$', line)
            if match and len(match.group(3)) > 8 and not 'BANKRUPTCY MODULE' in line:
                if current_inst and current_lines:
                    fname = f'{current_slug}.md'
                    with open(os.path.join(out_dir, fname), 'w', encoding='utf-8') as f:
                        f.write(f'# {current_title}\n\n' + '\n\n'.join(current_lines))
                    count += 1
                
                num = match.group(2).strip()
                inst_id = f'bankruptcy_{num}'
                inst_name = match.group(3).strip()
                current_inst = inst_id
                current_title = f'Bankruptcy #{num} — {inst_name}'
                current_slug = sanitize_slug(f'bankruptcy_{num}_{inst_name}')[:80]
                current_lines = []
                continue
            if current_inst:
                current_lines.append(line)
        elif tag == 'tbl' and current_inst:
            tbl_md = render_table_to_md(elem)
            if tbl_md: current_lines.append(tbl_md)
                
    if current_inst and current_lines:
        fname = f'{current_slug}.md'
        with open(os.path.join(out_dir, fname), 'w', encoding='utf-8') as f:
            f.write(f'# {current_title}\n\n' + '\n\n'.join(current_lines))
        count += 1
        
    print(f'✓ Part III Vol 2 (Individual Bankruptcy): {count} instruments extracted to {out_dir}')
    return count

# ── 4. Part III Vol 3 (Firm Partner Route) Splitter ─────────────────────────
def split_part_iii_vol3():
    src = os.path.join(BASE_IN, '20260915_IBC_PartIII_VOL3_Firm_Partner_Route.docx')
    if not os.path.exists(src): return 0
    out_dir = os.path.join(BASE_OUT, '04_part_iii_vol3_firm_partner_route')
    os.makedirs(out_dir, exist_ok=True)
    
    body = extract_docx_elements(src)
    current_inst = None
    current_title = None
    current_lines = []
    count = 0
    
    for elem in body:
        tag = elem.tag.split('}')[-1]
        if tag == 'p':
            texts = [t.text for t in elem.findall('.//w:t', NAMESPACES) if t.text]
            line = ''.join(texts).strip()
            if not line: continue
            
            # Pattern like: 'SET 2 — MASTER INDEX #2 — SCHEDULE OF PARTNERS ...'
            match = re.match(r'^(SET\s*2\s*[\u2014\u2013-]\s*(MASTER INDEX|BANKRUPTCY)\s*#\s*([0-9]+[a-z]?))\s*[\u2014\u2013-]?\s*(.*)$', line, re.I)
            if match and len(match.group(4)) > 5:
                if current_inst and current_lines:
                    fname = f'{current_slug}.md'
                    with open(os.path.join(out_dir, fname), 'w', encoding='utf-8') as f:
                        f.write(f'# {current_title}\n\n' + '\n\n'.join(current_lines))
                    count += 1
                
                route_type = match.group(2).replace(' ', '_').lower()
                num = match.group(3).strip()
                inst_id = f'firm_{route_type}_{num}'
                inst_name = match.group(4).strip()
                current_inst = inst_id
                current_title = f'Firm {route_type.capitalize()} #{num} — {inst_name}'
                current_slug = sanitize_slug(f'{inst_id}_{inst_name}')[:80]
                current_lines = []
                continue
            if current_inst:
                current_lines.append(line)
        elif tag == 'tbl' and current_inst:
            tbl_md = render_table_to_md(elem)
            if tbl_md: current_lines.append(tbl_md)
                
    if current_inst and current_lines:
        fname = f'{current_slug}.md'
        with open(os.path.join(out_dir, fname), 'w', encoding='utf-8') as f:
            f.write(f'# {current_title}\n\n' + '\n\n'.join(current_lines))
        count += 1
        
    print(f'✓ Part III Vol 3 (Firm Partner Route): {count} instruments extracted to {out_dir}')
    return count

# ── 5. Formats Compendium Edition 1 Splitter ────────────────────────────────
def split_formats_compendium_ed1():
    src = os.path.join(BASE_IN, 'Formats_Compendium_Edition1.docx')
    if not os.path.exists(src): return 0
    out_dir = os.path.join(BASE_OUT, '05_formats_compendium_ed1')
    os.makedirs(out_dir, exist_ok=True)
    
    body = extract_docx_elements(src)
    current_inst = None
    current_title = None
    current_lines = []
    count = 0
    
    for elem in body:
        tag = elem.tag.split('}')[-1]
        if tag == 'p':
            texts = [t.text for t in elem.findall('.//w:t', NAMESPACES) if t.text]
            line = ''.join(texts).strip()
            if not line: continue
            
            match = re.match(r'^(Form\s+[A-Za-z0-9]+|Annexure\s+[A-Za-z0-9]+|Format\s+[0-9]+)\s*[\u2014\u2013-]?\s*(.*)$', line, re.I)
            if match:
                if current_inst and current_lines:
                    fname = f'{current_slug}.md'
                    with open(os.path.join(out_dir, fname), 'w', encoding='utf-8') as f:
                        f.write(f'# {current_title}\n\n' + '\n\n'.join(current_lines))
                    count += 1
                
                inst_id = match.group(1).strip()
                inst_name = match.group(2).strip() or inst_id
                current_inst = inst_id
                current_title = f'{inst_id} — {inst_name}'
                current_slug = sanitize_slug(f'{inst_id}_{inst_name}')[:80]
                current_lines = []
                continue
            if current_inst:
                current_lines.append(line)
        elif tag == 'tbl' and current_inst:
            tbl_md = render_table_to_md(elem)
            if tbl_md: current_lines.append(tbl_md)
                
    if current_inst and current_lines:
        fname = f'{current_slug}.md'
        with open(os.path.join(out_dir, fname), 'w', encoding='utf-8') as f:
            f.write(f'# {current_title}\n\n' + '\n\n'.join(current_lines))
        count += 1
        
    print(f'✓ Formats Compendium Ed 1: {count} instruments extracted to {out_dir}')
    return count

if __name__ == '__main__':
    print('Starting automated compendium splitting pipeline...\n')
    t1 = split_cirp_second_edition()
    t2 = split_part_iii_vol1()
    t3 = split_part_iii_vol2()
    t4 = split_part_iii_vol3()
    t5 = split_formats_compendium_ed1()
    total = t1 + t2 + t3 + t4 + t5
    print(f'\n=============================================================')
    print(f'✓ TOTAL DISCRETE INSTRUMENTS STRIPPED & EXTRACTED: {total}')
    print(f'✓ Destination: {BASE_OUT}')
    print(f'=============================================================')
