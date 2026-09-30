"""Check and rasterize review PDFs; this does not test or build the app."""
from pathlib import Path
import json
import fitz
from PIL import Image, ImageOps, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'previews'
out.mkdir(exist_ok=True)
report=[]
for path in sorted(ROOT.glob('*.pdf')):
    doc=fitz.open(path)
    expected=4 if path.name.startswith('00-') else 17
    assert len(doc)==expected,(path,len(doc))
    assert len(doc.get_toc())==expected
    bounds=[];overlap=[];chars=0;links=0;thumbs=[]
    for i,page in enumerate(doc):
        txt=page.get_text();chars+=len(txt);links+=len(page.get_links())
        assert '\ufffd' not in txt,(path,i,'replacement character')
        spans=[]
        for block in page.get_text('dict')['blocks']:
            if 'lines' not in block:continue
            for line in block['lines']:
                for sp in line['spans']:
                    if not sp['text'].strip():continue
                    box=fitz.Rect(sp['bbox'])
                    if box.x0<0 or box.y0<0 or box.x1>page.rect.width or box.y1>page.rect.height:
                        bounds.append({'page':i+1,'text':sp['text'],'box':list(box)})
                    spans.append(sp)
        for n,sp in enumerate(spans):
            a=fitz.Rect(sp['bbox'])
            for other in spans[n+1:]:
                z=fitz.Rect(other['bbox']);inter=a&z
                if not inter.is_empty and inter.width>3 and inter.height>3:
                    overlap.append({'page':i+1,'a':sp['text'],'b':other['text'],'intersection':list(inter)})
        pix=page.get_pixmap(matrix=fitz.Matrix(.36,.36),alpha=False)
        im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
        panel=Image.new('RGB',(im.width,im.height+25),'white');panel.paste(im,(0,25))
        ImageDraw.Draw(panel).text((8,7),f'{i+1:02d}  {path.stem}',fill='#172831')
        thumbs.append(panel)
        if i in ([0] if expected==4 else [0,2,3,4,5,6,7,10]):
            page.get_pixmap(matrix=fitz.Matrix(1.3,1.3),alpha=False).save(out/f'{path.stem}-p{i+1:02d}.png')
    cols=3;rows=(len(thumbs)+cols-1)//cols;tw,th=thumbs[0].size
    contact=Image.new('RGB',(cols*(tw+12)+12,rows*(th+12)+12),'#D8DEDA')
    for i,im in enumerate(thumbs):contact.paste(im,(12+(i%cols)*(tw+12),12+(i//cols)*(th+12)))
    contact.save(out/f'{path.stem}-contact.png')
    item={'file':path.name,'pages':len(doc),'text_characters':chars,'source_links':links,'bytes':path.stat().st_size,'out_of_bounds':bounds,'text_overlaps':overlap}
    report.append(item)
    print(path.name, len(doc),'pages',links,'links',len(bounds),'out-of-bounds',len(overlap),'overlap candidates')
    assert not bounds,bounds
(ROOT/'research'/'pdf-validation.json').write_text(json.dumps(report,indent=2)+'\n')
