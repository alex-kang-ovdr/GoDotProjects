"""Export the full improvement report with embedded Korean fonts and evidence."""
import html
import re
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, NextPageTemplate, KeepTogether
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'Reports/2026-11-18-improved-model-qa/REPORT.md'
OUT = ROOT / 'output/pdf/PlayHub-QA-improved-report.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('Malgun', 'C:/Windows/Fonts/malgun.ttf'))
pdfmetrics.registerFont(TTFont('MalgunBold', 'C:/Windows/Fonts/malgunbd.ttf'))
pdfmetrics.registerFontFamily('Malgun', normal='Malgun', bold='MalgunBold', italic='Malgun', boldItalic='MalgunBold')

INK, ACCENT = colors.HexColor('#17302d'), colors.HexColor('#007d85')
styles = {
    'body': ParagraphStyle('body', fontName='Malgun', fontSize=9, leading=15, textColor=INK, wordWrap='CJK', spaceAfter=7),
    'title': ParagraphStyle('title', fontName='MalgunBold', fontSize=21, leading=29, textColor=INK, spaceAfter=16, keepWithNext=True, wordWrap='CJK'),
    'h2': ParagraphStyle('h2', fontName='MalgunBold', fontSize=14, leading=21, textColor=ACCENT, spaceBefore=13, spaceAfter=9, keepWithNext=True),
    'h3': ParagraphStyle('h3', fontName='MalgunBold', fontSize=11, leading=17, textColor=INK, spaceBefore=10, spaceAfter=7, keepWithNext=True),
    'cell': ParagraphStyle('cell', fontName='Malgun', fontSize=8, leading=12, wordWrap='CJK', textColor=INK),
    'code': ParagraphStyle('code', fontName='Malgun', fontSize=7.6, leading=12, wordWrap='CJK', backColor=colors.HexColor('#f0f5f4'), borderPadding=9, spaceBefore=8, spaceAfter=12),
    'caption': ParagraphStyle('caption', fontName='Malgun', fontSize=10, leading=15, textColor=INK, wordWrap='CJK', spaceAfter=10),
}

def inline(value):
    tokens = []
    def save(match):
        label, target = match.group(1), match.group(2) or match.group(3)
        if re.match(r'^[A-Z]:/', target):
            target = 'file:///' + target
        tokens.append(f'<link href="{html.escape(target, quote=True)}" color="#007d85">{html.escape(label)}</link>')
        return f'ZZLINK{len(tokens)-1}ZZ'
    value = re.sub(r'\[([^\]]+)\]\((?:<([^>]+)>|([^\)]+))\)', save, value)
    value = html.escape(value)
    value = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', value)
    value = re.sub(r'`([^`]+)`', r'<font color="#395a65">\1</font>', value)
    for index, token in enumerate(tokens):
        value = value.replace(f'ZZLINK{index}ZZ', token)
    return value

def p(text, style='body'):
    return Paragraph(inline(text), styles[style])

def footer(canvas, doc):
    w, h = canvas._pagesize
    canvas.setStrokeColor(colors.HexColor('#c8d5d2'))
    canvas.line(38, 31, w-38, 31)
    canvas.setFont('Malgun', 7)
    canvas.setFillColor(colors.HexColor('#526b67'))
    canvas.drawString(38, 19, 'PlayHub QA · 개선 실험 결과 · 2026-11-18')
    canvas.drawRightString(w-38, 19, str(doc.page))

doc = BaseDocTemplate(str(OUT), pagesize=A4, title='PlayHub 포트리스·비시즈 QA 개선 결과', author='PlayHub QA', leftMargin=38, rightMargin=38, topMargin=38, bottomMargin=42)
doc.addPageTemplates([
    PageTemplate(id='portrait', pagesize=A4, frames=[Frame(38, 42, A4[0]-76, A4[1]-80, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=footer),
    PageTemplate(id='evidence', pagesize=landscape(A4), frames=[Frame(38, 42, landscape(A4)[0]-76, landscape(A4)[1]-80, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=footer),
])
lines = SOURCE.read_text(encoding='utf-8').splitlines()
story, index, evidence_mode, caption, image_count = [], 0, False, [], 0
while index < len(lines):
    line = lines[index].strip()
    index += 1
    if not line:
        continue
    if line == '## 증거 화면':
        evidence_mode = True
        continue
    if evidence_mode and line.startswith('## '):
        evidence_mode = False
        story += [NextPageTemplate('portrait'), PageBreak()]
    if evidence_mode:
        match = re.match(r'!\[([^\]]*)\]\(<([^>]+)>\)', line)
        if not match:
            caption.append(line)
            continue
        image_count += 1
        story += [NextPageTemplate('evidence'), PageBreak()]
        story += [p(f'증거 {image_count:02d} · ' + ' '.join(caption), 'caption')]
        caption = []
        image_path = Path(match.group(2))
        # Each evidence image gets a full landscape page; preserve every pixel.
        story.append(Image(str(image_path), width=736, height=460, hAlign='CENTER'))
        continue
    if line.startswith('# '):
        story.append(p(line[2:], 'title'))
    elif line.startswith('### '):
        story.append(p(line[4:], 'h3'))
    elif line.startswith('## '):
        if line == '## 원본 로그와 수정 파일':
            story.append(PageBreak())
        story.append(p(line[3:], 'h2'))
    elif line.startswith('```'):
        block = []
        while index < len(lines) and not lines[index].startswith('```'):
            block.append(html.escape(lines[index]))
            index += 1
        index += 1
        story.append(Paragraph('<br/>'.join(block), styles['code']))
    elif line.startswith('|'):
        rows = [line]
        while index < len(lines) and lines[index].strip().startswith('|'):
            rows.append(lines[index].strip())
            index += 1
        data = [[p(cell.strip(), 'cell') for cell in row.strip('|').split('|')] for row in rows if not re.match(r'^\|[\s:|\-]+\|$', row)]
        count = len(data[0])
        ratios = {4:[.20,.26,.19,.35],5:[.07,.49,.19,.12,.13],6:[.30,.10,.10,.07,.21,.22]}[count]
        table = Table(data, colWidths=[(A4[0]-76)*ratio for ratio in ratios], repeatRows=1, hAlign='LEFT')
        table.setStyle(TableStyle([
            ('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dbece8')),
            ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f4f7f6')]),
            ('LINEBELOW',(0,0),(-1,0),.7,ACCENT),('LINEBELOW',(0,1),(-1,-1),.3,colors.HexColor('#d8e2df')),
            ('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),
            ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
        ]))
        story += [table, Spacer(1, 9)]
    elif line.startswith('- '):
        story.append(p('• ' + line[2:]))
    else:
        story.append(p(line))

doc.build(story)
reader = PdfReader(str(OUT))
text = '\n'.join(page.extract_text() for page in reader.pages)
for expected in ['308', '960', '27회', '9/9', '입력 대체 0회']:
    assert re.sub(r'\s+', '', expected) in re.sub(r'\s+', '', text), expected
assert image_count == 8
assert sum(len(page.images) for page in reader.pages) == 8
print(f'{OUT}\nPages: {len(reader.pages)}; embedded screenshots: {image_count}; Korean text verified')
