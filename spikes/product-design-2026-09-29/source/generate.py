"""Generate design documents only. No application runtime code."""
from pathlib import Path
import json, math, html
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle

ROOT = Path(__file__).resolve().parents[1]
W, H = 1120, 760
FONTS = Path('/System/Library/Fonts/Supplemental')
for name, fname in [('R','Arial.ttf'),('B','Arial Bold.ttf'),('I','Arial Italic.ttf'),('G','Georgia.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(FONTS/fname)))
pdfmetrics.registerFontFamily('R',normal='R',bold='B',italic='I',boldItalic='B')
INK='#172831'; MUTED='#53636C'; PAPER='#F5F3ED'; LINE='#D8DEDA'; WHITE='#FFFFFF'
GREEN='#16765D'; AMBER='#99600E'; RED='#B6473D'; BLUE='#3868AE'

SOURCES = [
 ('alphaTab format catalog','https://alphatab.net/docs/category/formats/','Import candidates: GP3–8 and MusicXML. Verify each feature on a fixture corpus.'),
 ('alphaTab GP8 compatibility','https://alphatab.net/docs/formats/guitar-pro-8/','Reading, engraving and audio support differ; importing a feature is not proof of fidelity.'),
 ('alphaTab external audio synchronization','https://www.alphatab.net/docs/guides/audio-video-sync','External playback hooks and GP8 sync data. Built-in backing and synthesis are alternative modes.'),
 ('alphaTab project / licensing','https://docs.alphatab.net/','MPL-2.0; notation, interactive playback and SoundFont support. Review shipped dependencies and notices.'),
 ('W3C Web Audio specification','https://www.w3.org/TR/webaudio-1.0/','AudioContext, AudioWorklet and output timestamps underpin the proposed timing pipeline.'),
 ('W3C Media Capture and Streams','https://www.w3.org/TR/mediacapture-streams/','Input permissions and audio constraints. Inspect actual settings; requests are not guarantees.'),
 ('Spotify Basic Pitch repository','https://github.com/spotify/basic-pitch','Candidate for post-take multipitch analysis. Best with one instrument; benchmark before adopting.'),
 ('Basic Pitch research paper','https://arxiv.org/abs/2203.09893','Bittner et al., 2022. Research basis, not evidence of student-assessment accuracy.'),
 ('Versilian Community Sample Library','https://github.com/sgossner/VCSL','CC0 library candidate for selected accompaniment sounds; audition and curate per patch.'),
 ('Virtuosity Drums source and license','https://github.com/sfzinstruments/virtuosity_drums','Candidate drum source. Keep the exact pack license and provenance with derivative assets.'),
]

def esc(s): return html.escape(str(s))
def color(s): return HexColor(s) if isinstance(s,str) else s

class Book:
    def __init__(self, filename, title, accent, pale, total=17):
        self.c=canvas.Canvas(str(ROOT/filename),pagesize=(W,H),pageCompression=1)
        self.c.setTitle(title+' | Music practice product design')
        self.c.setAuthor('Codex · Design exploration for Bryan')
        self.c.setSubject('Storyboards, interface concepts, system architecture and implementation plan')
        self.name=title; self.accent=accent; self.pale=pale; self.n=0; self.total=total
    def rect(self,x,y,w,h,fill=WHITE,stroke=None,r=0):
        c=self.c;c.setFillColor(color(fill));c.setStrokeColor(color(stroke or fill))
        if r:c.roundRect(x,H-y-h,w,h,r,fill=1,stroke=bool(stroke))
        else:c.rect(x,H-y-h,w,h,fill=1,stroke=bool(stroke))
    def line(self,x,y,x2,y2,col=LINE,width=1,dash=None):
        c=self.c;c.saveState();c.setStrokeColor(color(col));c.setLineWidth(width)
        if dash:c.setDash(dash)
        c.line(x,H-y,x2,H-y2);c.restoreState()
    def text(self,s,x,y,size=13,font='R',col=INK):
        self.c.setFont(font,size);self.c.setFillColor(color(col));self.c.drawString(x,H-y-size*.82,str(s))
    def para(self,s,x,y,w,size=13,col=INK,font='R',maxh=None,leading=None):
        style=ParagraphStyle('p',fontName=font,fontSize=size,leading=leading or size*1.38,textColor=color(col),spaceAfter=0)
        p=Paragraph(s,style);_,hh=p.wrap(w,10000)
        if maxh is not None and hh>maxh+.1: raise ValueError(f'{self.name} p{self.n}: text overflow {hh:.1f}>{maxh}: {s[:90]}')
        p.drawOn(self.c,x,H-y-hh)
        return hh
    def pill(self,s,x,y,w=None,fill=None,col=None,size=10,h=25):
        w=w or pdfmetrics.stringWidth(s,'B',size)+22
        self.rect(x,y,w,h,fill or self.pale,r=h/2)
        self.text(s,x+11,y+(h-size)/2-1,size,'B',col or self.accent)
        return w
    def button(self,s,x,y,w,fill=None):
        self.rect(x,y,w,31,fill or self.accent,r=6);self.text(s,x+12,y+9,11,'B',WHITE)
    def circle(self,x,y,r,fill):
        self.c.setFillColor(color(fill));self.c.circle(x,H-y,r,stroke=0,fill=1)
    def arrow(self,x,y,x2,y2,col=None):
        col=col or self.accent;self.line(x,y,x2,y2,col,1.5)
        a=math.atan2(y2-y,x2-x);d=6
        self.line(x2,y2,x2-d*math.cos(a-.5),y2-d*math.sin(a-.5),col,1.5)
        self.line(x2,y2,x2-d*math.cos(a+.5),y2-d*math.sin(a+.5),col,1.5)
    def page(self,kicker,title,subtitle='',source=''):
        if self.n:self.c.showPage()
        self.n+=1;self.rect(0,0,W,H,PAPER);self.rect(0,0,W,7,self.accent)
        self.text(f'{self.name.upper()}  /  {kicker.upper()}',48,29,10,'B',self.accent)
        self.text(title,48,59,32,'B')
        if subtitle:self.para(subtitle,49,103,1015,12.5,col=MUTED,maxh=40)
        self.line(48,712,1072,712)
        self.text('PRODUCT EXPLORATION  ·  29 SEP 2026  ·  GUITAR + BASS FIRST',48,732,8,'B',MUTED)
        if source:self.text(source,440,732,8,'R',MUTED)
        self.text(f'{self.n:02d} / {self.total:02d}',1019,731,9,'B',self.accent)
        self.c.bookmarkPage(f'p{self.n}');self.c.addOutlineEntry(title,f'p{self.n}',0,False)
    def card(self,x,y,w,h,title,body,num=None,fill=WHITE,size=13):
        self.rect(x,y,w,h,fill,r=10)
        yy=y+18
        if num:
            self.pill(num,x+18,yy,size=9,h=22);yy+=33
        self.para(title,x+18,yy,w-36,17,font='B',maxh=50)
        self.para(body,x+18,yy+37,w-36,size,col=MUTED,maxh=h-(yy-y)-50)
    def callout(self,title,body,x,y,w,h=95):
        self.rect(x,y,w,h,self.pale,r=8);self.rect(x,y,4,h,self.accent)
        self.text(title,x+17,y+15,13,'B',self.accent)
        self.para(body,x+17,y+39,w-34,12,maxh=h-47)
    def save(self):
        assert self.n==self.total,(self.name,self.n,self.total)
        self.c.save()

def mini_chart(b,x,y,w,h,kind='line'):
    b.rect(x,y,w,h,WHITE,r=7)
    if kind=='path':
        for i in range(5):
            xx=x+25+i*(w-50)/4;yy=y+h/2+(10 if i%2 else -10)
            if i: b.line(xx-(w-50)/4,y+h/2+(-10 if i%2 else 10),xx,yy,LINE,3)
            b.circle(xx,yy,10,b.accent if i<3 else LINE);b.text(str(i+1),xx-3,yy-5,9,'B',WHITE)
    elif kind=='bars':
        for i,v in enumerate([.4,.65,.5,.88,.78,.95]):
            xx=x+18+i*(w-34)/6;b.rect(xx,y+h-17-v*(h-35),(w-50)/8,v*(h-35),b.accent if i!=3 else AMBER,r=3)
    else:
        for j in range(3):b.line(x+20,y+20+j*(h-35)/3,x+w-15,y+20+j*(h-35)/3,LINE,.7)
        vals=[.2,.4,.4,.6,.8,.8]
        for i in range(1,len(vals)):
            b.line(x+20+(i-1)*(w-40)/5,y+h-18-vals[i-1]*(h-30),x+20+i*(w-40)/5,y+h-18-vals[i]*(h-30),b.accent,2.5)

def notation(b,x,y,w,h,tab=True,feedback=False,bars=4,start=17,timing_label='+34 ms'):
    b.rect(x,y,w,h,WHITE,r=7)
    left=x+24;right=x+w-18
    if feedback:b.rect(left+(w-42)/bars,y+15,(w-42)/bars,h-30,b.pale,r=3)
    staff_y=y+42
    for k in range(5):b.line(left,staff_y+k*6,right,staff_y+k*6,'#A9B2B4',.6)
    gap=(right-left)/bars
    for n in range(bars+1):
        xx=left+n*gap;b.line(xx,staff_y,xx,staff_y+24,INK,.7)
        if n<bars:b.text(str(start+n),xx+5,y+16,8,'B',MUTED)
    for j in range(bars*4):
        xx=left+gap*.2+j*gap/4;yy=staff_y+18-([0,1,2,1,0,2,3,2][j%8])*3
        cc=AMBER if feedback and j==6 else b.accent if feedback and j<6 else INK
        b.c.setFillColor(color(cc));b.c.ellipse(xx-4,H-yy-2.5,xx+4,H-yy+2.5,fill=1,stroke=0)
        b.line(xx+3.7,yy,xx+3.7,yy-21,cc,1)
    if tab and h>115:
        ty=y+100
        for k in range(6):b.line(left,ty+k*6,right,ty+k*6,'#B8BEBF',.6)
        for n in range(bars+1):b.line(left+n*gap,ty,left+n*gap,ty+30,INK,.6)
        for j in range(bars*4):
            xx=left+gap*.2+j*gap/4;yy=ty+([2,2,1,1,3,2,2,1][j%8])*6
            b.rect(xx-5,yy-5,10,11,WHITE);b.text(str([5,7,5,8,7,5,7,5][j%8]),xx-3,yy-4,9,'B')
    if feedback:
        xx=left+gap*1.7;b.line(xx,y+29,xx,y+h-16,AMBER,1.4)
        b.pill(timing_label,min(xx+5,x+w-74),y+h-27,fill='#FBEBD0',col=AMBER,size=8,h=20)

def shell(b,x,y,w,h,brand,active='Practice'):
    b.rect(x,y,w,h,WHITE,LINE,r=11)
    b.rect(x,y,w,38,INK,r=10);b.rect(x,y+24,w,14,INK)
    b.text(brand,x+17,y+11,14,'B',WHITE)
    b.text('Library     Practice     Jam     Progress',x+160,y+13,10,'R','#CED9DB')
    b.text('Input: ready',x+w-106,y+13,9,'B','#A7D7C7')
    return x+15,y+52,w-30,h-67

def workspace(b,x,y,w,h,cfg,compact=False):
    ix,iy,iw,ih=shell(b,x,y,w,h,cfg['name'])
    if compact:
        b.text(cfg['workspace_title'],ix,iy,15,'B')
        b.pill('72 BPM',ix+iw-78,iy-2,size=9)
        notation(b,ix,iy+35,iw,ih-77,True,True,timing_label='−34 ms' if cfg['name']=='Pocket' else '+34 ms')
        b.button('Play loop',ix,iy+ih-31,110)
        b.text('Bars 17–20  •  Count-in 1 bar',ix+130,iy+ih-23,10,'R',MUTED)
        return
    lw=155;rw=202;mainx=ix+lw+13;mainw=iw-lw-rw-28
    b.rect(ix,iy,lw,ih,'#EFF2EF',r=7)
    b.text(cfg['sidebar_title'],ix+12,iy+13,12,'B')
    for i,(title,sub) in enumerate(cfg['sidebar']):
        yy=iy+43+i*61
        if i==1:b.rect(ix+6,yy-7,lw-12,52,b.pale,r=6)
        b.text(title,ix+12,yy,10.5,'B',b.accent if i==1 else INK)
        b.text(sub,ix+12,yy+18,9,'R',MUTED)
    b.text(cfg['workspace_title'],mainx,iy+2,19,'B')
    b.text(cfg['workspace_sub'],mainx,iy+28,10,'R',MUTED)
    b.pill('Score + TAB',mainx,iy+53,size=9)
    b.pill('72 BPM  /  90 target',mainx+110,iy+53,size=9)
    b.pill('Loop 17–20',mainx+257,iy+53,size=9)
    notation(b,mainx,iy+89,mainw,177,True,True,timing_label='−34 ms' if cfg['name']=='Pocket' else '+34 ms')
    b.text('Listen     Play along     Check take',mainx+10,iy+284,11,'B',MUTED)
    b.button('Pause',mainx,iy+316,78)
    b.pill('−  Tempo  +',mainx+90,iy+319,size=10)
    b.pill('A  [ 17 ]   B  [ 20 ]',mainx+210,iy+319,size=10)
    b.text('Count-in: 1 bar     Rest: 2 beats     Repeat: 3',mainx,iy+361,10,'R',MUTED)
    rx=ix+iw-rw
    b.rect(rx,iy,rw,ih,b.pale,r=7)
    b.text(cfg['right_title'],rx+13,iy+14,12,'B',b.accent)
    b.para(cfg['right_copy'],rx+13,iy+42,rw-26,13,maxh=116)
    b.text('THIS TAKE',rx+13,iy+164,9,'B',MUTED)
    b.text('Listen for the change',rx+13,iy+187,12,'B')
    b.para('Detailed feedback appears when the loop ends.',rx+13,iy+211,rw-26,11,col=MUTED,maxh=50)
    b.line(rx+13,iy+273,rx+rw-13,iy+273)
    b.text('BAND MIX',rx+13,iy+286,9,'B',MUTED)
    b.text('Your part   muted',rx+13,iy+309,11,'B')
    b.text('Bass   70%    Drums   55%',rx+13,iy+332,10,'R',MUTED)
    b.text('Keys   35%   Click   20%',rx+13,iy+353,10,'R',MUTED)

def feedback_mock(b,x,y,w,h,cfg):
    ix,iy,iw,ih=shell(b,x,y,w,h,cfg['name'])
    left=iw*.63;rx=ix+left+18;rw=iw-left-18
    b.text(cfg['feedback_title'],ix,iy+2,22,'B')
    b.text('Bars 17–20  ·  72 BPM  ·  Take 3',ix,iy+34,11,'R',MUTED)
    for j,(big,small) in enumerate([('28 / 31','assessed notes matched'),('26 ms','median |timing|'),('31 / 32','notes assessable')]):
        xx=ix+j*(left/3);b.rect(xx,iy+66,left/3-10,77,b.pale,r=7)
        b.text(big,xx+12,iy+79,23,'B',b.accent);b.text(small,xx+12,iy+113,10,'R',MUTED)
    notation(b,ix,iy+157,left,150,True,True,timing_label='−34 ms' if cfg['name']=='Pocket' else '+34 ms')
    timing='Early' if cfg['name']=='Pocket' else 'Late'
    b.text(f'● Matched     ▲ {timing}     × Pitch mismatch     ? Unclear',ix+5,iy+319,10,'R',MUTED)
    b.rect(rx,iy,rw,ih,'#EFF2EF',r=9)
    b.pill('ONE NEXT STEP',rx+15,iy+15,size=9)
    b.para(cfg['feedback_copy'],rx+15,iy+55,rw-30,17,font='B',maxh=95)
    b.para(cfg['exercise_copy'],rx+15,iy+158,rw-30,12,maxh=98)
    b.button(cfg['exercise_button'],rx+15,iy+278,rw-30)
    b.text('Replay evidence  ·  Mark incorrect',rx+15,iy+325,10,'R',MUTED)

def progress_mock(b,x,y,w,h,cfg):
    ix,iy,iw,ih=shell(b,x,y,w,h,cfg['name'],'Progress')
    b.text(cfg['progress_title'],ix,iy,22,'B')
    b.text('Same phrase, same rubric. Your last 4 sessions.',ix,iy+31,11,'R',MUTED)
    left=iw*.56
    b.rect(ix,iy+65,left,ih-65,b.pale,r=8)
    if cfg['name']=='Trail':
        b.text('YOUR SKILL PATH',ix+18,iy+83,10,'B',b.accent)
        for i,(t,s) in enumerate([('Recall','Phrase remembered at 64 BPM'),('Connect','Transition demonstrated at 72'),('Transfer','Try the rhythm in a new jam')]):
            yy=iy+126+i*67
            if i<2:b.line(ix+32,yy+4,ix+32,yy+66,b.accent,2)
            b.circle(ix+32,yy+5,10,b.accent if i<2 else WHITE)
            b.text(str(i+1),ix+29,yy,9,'B',WHITE if i<2 else b.accent)
            b.text(t,ix+54,yy-1,13,'B');b.para(s,ix+54,yy+22,left-70,10.5,col=MUTED,maxh=34)
        b.text('Tomorrow: one recall check',ix+18,iy+322,10,'B',b.accent)
    elif cfg['name']=='Pocket':
        b.text('GROOVE BY CHORUS / 72 BPM',ix+18,iy+83,10,'B',b.accent)
        for i,(t,s) in enumerate([('Chorus 1','Re-entry: 44 ms early'),('Chorus 2','Re-entry: 28 ms early'),('Chorus 3','Re-entry: 14 ms early')]):
            yy=iy+114+i*63;b.rect(ix+15,yy,left-30,52,WHITE,r=5)
            b.text(t,ix+27,yy+9,11,'B');b.text(s,ix+27,yy+30,10,'R',MUTED)
            for j in range(12):
                hh=5+((j*7+i*3)%19);xx=ix+left-108+j*6
                b.line(xx,yy+26-hh/2,xx,yy+26+hh/2,b.accent,2)
        b.text('Saved: shuffle in A / bass role',ix+18,iy+322,10,'B',b.accent)
    else:
        b.text('RELIABLE TEMPO',ix+18,iy+83,10,'B',b.accent)
        mini_chart(b,ix+16,iy+111,left-32,146)
        b.text('60     64     64     68     72     72 BPM',ix+25,iy+269,10,'B')
        b.text('Sep 15                              Sep 29',ix+25,iy+291,10,'R',MUTED)
    rx=ix+left+20;rw=iw-left-20
    for j,(title,body) in enumerate(cfg['progress_cards']):
        b.rect(rx,iy+65+j*84,rw,73,'#EFF2EF',r=7)
        b.text(title,rx+13,iy+78+j*84,12,'B')
        b.para(body,rx+13,iy+100+j*84,rw-26,10.5,col=MUTED,maxh=33)

def jam_mock(b,x,y,w,h,cfg):
    ix,iy,iw,ih=shell(b,x,y,w,h,cfg['name'],'Jam')
    b.text('Build a band in a sentence',ix,iy,21,'B')
    b.rect(ix,iy+38,iw,44,'#EFF2EF',r=7)
    b.text('shuffle beat ii–V–I in A',ix+15,iy+52,16,'R')
    b.text('Interpreted as A major  ·  jazz sevenths  ·  edit any chip',ix,iy+95,11,'R',MUTED)
    labels=['A major','4/4','90 BPM','Shuffle 2:1','8 bars','Jazz trio']
    px=ix
    for lab in labels:px+=b.pill(lab,px,iy+121,size=10)+9
    for j,(chord,bars) in enumerate([('Bm7','bars 1–2'),('E7','bars 3–4'),('Amaj7','bars 5–8')]):
        xx=ix+j*(iw/3);b.rect(xx,iy+165,iw/3-10,80,b.pale,r=8)
        b.text(chord,xx+16,iy+179,26,'B',b.accent);b.text(bars,xx+16,iy+219,10,'R',MUTED)
    b.text('Drums: shuffle     Bass: walking     Keys: sparse comping',ix,iy+263,12,'B')
    b.text(cfg['jam_role'],ix,iy+286,11,'R',MUTED)
    b.button('Preview band',ix,iy+317,130)
    b.button('Start practice',ix+142,iy+317,140,INK)
    b.text('Same score, loop and feedback controls',ix+301,iy+327,10,'R',MUTED)

def node(b,x,y,w,h,title,body,fill=WHITE):
    b.rect(x,y,w,h,fill,LINE,r=8);b.text(title,x+13,y+13,13,'B')
    b.para(body,x+13,y+37,w-26,10.5,col=MUTED,maxh=h-42)

def table(b,x,y,width,headers,rows,colwidths,rowh=65,fontsize=11):
    b.rect(x,y,width,34,INK,r=6)
    xx=x
    for title,cw in zip(headers,colwidths):b.text(title,xx+12,y+11,10,'B',WHITE);xx+=cw
    yy=y+34
    for ri,row in enumerate(rows):
        b.rect(x,yy,width,rowh,WHITE if ri%2==0 else '#EDEFEA')
        xx=x
        for text_,cw in zip(row,colwidths):
            b.para(text_,xx+12,yy+12,cw-24,fontsize,maxh=rowh-19)
            xx+=cw
        yy+=rowh
    return yy

def storyboard(b,cfg):
    b.page('03 / storyboard','A practice session with a beginning and an outcome','Six frames follow one guitarist or bassist from choosing music to returning with a reason. All interface data are illustrative.')
    for i,frame in enumerate(cfg['story']):
        x=48+(i%3)*349;y=155+(i//3)*267;w=326;h=246
        b.rect(x,y,w,h,WHITE,r=10);b.pill(f'{i+1:02}',x+14,y+12,size=9,h=22)
        b.text(frame[0],x+59,y+15,13,'B')
        if i in [0,1]:
            b.rect(x+15,y+49,w-30,93,b.pale,r=5)
            b.text(frame[1],x+27,y+63,12,'B',b.accent)
            for k in range(3):
                b.rect(x+27,y+87+k*14,w-85-(k%2)*35,5,'#C6D3D0',r=2)
        elif i==2:notation(b,x+15,y+49,w-30,93,False,True,3)
        elif i==3:
            b.rect(x+15,y+49,w-30,93,b.pale,r=5);b.text('A specific observation',x+27,y+61,10,'B',b.accent)
            b.para(frame[1],x+27,y+82,w-54,15,font='B',maxh=51)
        else:mini_chart(b,x+15,y+49,w-30,93,'path' if cfg['name']=='Trail' else 'line' if i==5 else 'bars')
        b.para(frame[2],x+15,y+155,w-30,12,maxh=71)

DESIGNS = [
 dict(
  name='Phrase',file='01-phrase.pdf',accent='#16665E',pale='#DCEDE6',
  strap='Make the hard part playable.',
  summary='A calm rehearsal workbench that turns a score into a map of what you can play, at which tempo, and what to work on next.',
  audience='For self-directed guitarists and bassists learning specific pieces. The score stays central; coaching arrives at useful pauses.',
  promise='Open your own music. Find one difficult phrase. Hear it, slow it, loop it, improve it, then prove it in context.',
  thesis='The unit of progress is a phrase you can reliably play.',
  pillars=[('Control','The musician chooses the section, tempo and goal. Recommendations remain optional.'),('Evidence','Every observation points to a bar, note or replayable moment.'),('Readiness','A piece becomes ready through repeated, connected performances.')],
  workspace_title='Evening Study / lead guitar',workspace_sub='Phrase 04  ·  Shift into the chorus  ·  Original practice sketch',
  sidebar_title='Piece map',sidebar=[('01  Intro','Comfortable at 90'),('04  Chorus entry','Working at 72'),('05  Chorus','Next: connect phrases'),('06  Full run','Target: 90 BPM')],
  right_title='Your focus',right_copy='Keep the first note after the shift in time.<br/><br/>Finish this pass, then review the evidence.',
  feedback_title='The shift is getting steadier.',feedback_copy='Bar 18 starts late on two of your last three takes.',
  exercise_copy='Try the last beat of bar 17 into bar 18 at 64 BPM. Listen once, play three times, then return to the full phrase.',exercise_button='Practice the transition',
  progress_title='This piece is becoming reliable.',
  progress_cards=[('Phrase 04 · 72 BPM','Two qualified takes today. One delayed check still due.'),('Your reliable tempo +12','At 72: 90% notes, 26 ms timing, 97% coverage.'),('Connect, then confirm','Next: phrases 04 + 05 together at 68 BPM.')],
  jam_role='Practice role: lead guitar  ·  Goal: land on chord tones  ·  Bass part stays audible',
  story=[
   ('Choose the piece','Import Guitar Pro or MusicXML','Alex imports a file, picks the lead part, and confirms tuning. The track preview makes unfamiliar labels understandable.'),
   ('Mark the difficult phrase','Drag bars 17–20 to loop','A short baseline at 72 BPM establishes note, timing and recording quality. The app proposes one focus.'),
   ('Play with the band','A quiet screen during the take','The chosen part is muted. A moving cursor and restrained markers keep attention on the music.'),
   ('Understand one problem','The shift begins late.','Alex hears the relevant moment and sees expected versus performed timing. One uncertain note is ungraded.'),
   ('Practice the transition','Shorten → slow → reconnect','A generated two-beat transition drill returns to the original phrase, so an isolated success is tested in context.'),
   ('Leave with evidence','72 BPM reliable; 76 next','The map saves the tempo and evidence. Tomorrow opens with a short retention check before raising the target.')],
  navigation='Library → Piece → Phrase → Take review; Jam and Progress remain one click away.',
  unique_features=[('Piece map','Name sections manually; offer bar and repeat suggestions. Show reliable tempo, coverage and next action for each phrase.'),('Phrase workbench','Score / TAB / both; track mixer, count-in, A–B loop, tempo slider, rest between passes and saved practice presets.'),('Evidence drawer','Select a marked event to replay it, compare timing, hear the reference and challenge a questionable observation.'),('Jam from the piece','Create an editable backing pattern from entered chords or the selected section. Reuse the same sounds and transport.')],
  workspace_notes=[('1 / Select a phrase','Drag across measures or type A and B. Keyboard brackets set the same boundaries.'),('2 / Practice with control','Tempo changes apply at the next loop. A count-in and optional rest make repetitions playable.'),('3 / Receive one focus','During a take, keep feedback sparse. Afterward, open the evidence and one suggested drill.')],
  coaching='A transition error becomes a transition exercise. A repeated rhythmic error becomes an open-string rhythm drill. A pitch cluster becomes a slow two-note alternation. Always include a return-to-piece test.',
  rewards='Earn phrase stamps for Learn, Connect and Retain. Stamps represent evidence at a stated tempo; revisiting a phrase is normal. Show personal improvements and completed musical goals.',
  game_rules='Learn: two qualified takes at a chosen tempo. Connect: pass the phrase with its neighbors. Retain: pass a delayed check on another day. No score for merely letting playback run.',
  agency='Manual practice is always available. Dismiss a drill, edit phrase boundaries or choose a different tempo without losing earned progress.',
  retention='Resume with the most relevant unfinished phrase, plus one earlier phrase due for review. Reminders are optional and never erase progress for a missed day.',
  jam_differentiator='Jam is a transfer exercise: reuse a phrase rhythm over a new chord sequence, then return to the piece. Store jam goals separately from exact-score mastery.',
  engine_name='Phrase evidence engine',engine_body='Bar clusters → transition drills → connected-phrase checks → readiness map',
  model_extra='Phrase {scoreVersion, trackId, startEvent, endEvent, label}; Readiness {phraseId, tempo, rubric, evidenceTakeIds, retainedAt}.',
  endpoint_extra='POST /phrases; GET /phrases/:id/evidence; POST /exercise-plans/from-phrase. A take can update only the matching phrase version.',
  risks='The workspace may feel analytical. Test whether players can act on the first recommendation without interpreting a dashboard. Reduce the displayed metrics if they cannot.',
  phase3='Build phrase selection, evidence drawer, transition templates, readiness map and retained-tempo history. Exit: a user completes baseline → drill → return-to-piece unassisted.',
  timeline='18–22 weeks',later='8–12 more weeks',
  experiment='Recruit 12 self-directed players. Compare 15 minutes with ordinary looping against Phrase on counterbalanced phrases. Measure delayed performance at the same tempo, recommendation use and trust.',
  success='Proposed signal: 8 of 12 choose to continue using the phrase map, and most can explain why the next exercise was recommended.',
  sell='A dependable practice tool for the music you already own. A paid library of progress, exercises and quality sounds could support the business; validate willingness to pay after learning value.',
  bet='Strongest overall starting point: the closest fit to the requested interface, with a small but meaningful coaching loop.'
 ),
 dict(
  name='Trail',file='02-trail.pdf',accent='#505CB0',pale='#E4E5F7',
  strap='Turn your song into a path.',
  summary='A guided practice companion that builds short, adaptive sessions from the pieces a musician actually wants to learn.',
  audience='For guitarists and bassists who can play but do not always know how to practice. The app supplies a plan without taking away the score.',
  promise='Bring a piece and a goal. Get a ten-minute session that diagnoses, teaches, checks and schedules your next step.',
  thesis='The unit of progress is a skill demonstrated in your own music.',
  pillars=[('Direction','A clear next activity reduces the effort of deciding what to practice.'),('Transfer','Every drill links back to a phrase in the chosen piece.'),('Memory','A later check distinguishes a temporary success from durable learning.')],
  workspace_title='Today / make the chorus feel easy',workspace_sub='Mission 2 of 3  ·  Your piece: Evening Study  ·  Original practice sketch',
  sidebar_title='Today’s session',sidebar=[('01  Recall','2 min · warm start'),('02  Transition','5 min · active focus'),('03  In context','3 min · check'),('Free practice','Open the whole score')],
  right_title='Mission: land together',right_copy='Play the new position on the beat.<br/><br/>First listen, then play. Your next activity depends on this take.',
  feedback_title='You found the notes. Now connect them.',feedback_copy='The same shift still delays the next beat. Let’s isolate it once.',
  exercise_copy='A 90-second mission: hear the transition, play it on one string, then restore the fingering. Finish by playing bars 17–20.',exercise_button='Start the short mission',
  progress_title='Skills you can bring back tomorrow.',
  progress_cards=[('Timing / steady transitions','Demonstrated at 72 BPM in Evening Study.'),('Recall check due tomorrow','One short return to the phrase; no daily streak penalty.'),('Transfer mission unlocked','Try this rhythm over a new backing pattern.')],
  jam_role='Mission: play roots on beat 1  ·  Role: bass  ·  Generated bass muted',
  story=[
   ('Name a goal','Play this chorus in two weeks','Sam imports a favorite piece and chooses bass, ten minutes per session, and a target tempo. Dates guide the plan; they do not guarantee mastery.'),
   ('Find a starting point','A short, supportive baseline','The app samples two phrases at a comfortable tempo and checks the input. Sam can override the suggested difficulty.'),
   ('Do one focused mission','Listen → imitate → restore','A compact score shows the exact fragment and the current task. Full-score practice remains accessible.'),
   ('See why the plan changes','Notes right; transition late.','Evidence selects a transition mission. Low-confidence audio instead selects an input check, never a remedial lesson.'),
   ('Use it somewhere new','Transfer into a jam','Sam plays the same rhythm over ii–V–I in A. The app scores the stated exercise goal rather than all improvised notes.'),
   ('Return and remember','A recall check, then the next step','Tomorrow begins with a short check of the phrase. A capability badge records where and at what tempo the skill was shown.')],
  navigation='Today → Mission → Evidence → Piece; Library, Jam and Skill history remain accessible.',
  unique_features=[('Today plan','Choose 5, 10 or 20 minutes. Balance a recall check, one focus and a return-to-piece performance.'),('Mission score','Same transport, loop and mixer as a normal score view. The active fragment adds a goal and a concise instruction.'),('Skill history','Show demonstrated skills with source phrases, tempos and review dates. Separate exercise success from transfer.'),('Adaptive path','Create a draft phrase and skill map from the imported score. Let users correct it and freely skip any activity.')],
  workspace_notes=[('1 / A small plan','The left rail explains session order and remaining time, with an immediate exit to free practice.'),('2 / A real score','Every mission uses the notation / TAB interface, tempo and loop controls. There is no detached minigame.'),('3 / An explicit goal','Give one observable task. Update the plan only after a take ends and the evidence is reliable.')],
  coaching='Use a teacher-authored template catalog: Hear/Repeat, Rhythm Only, Two-Note Shift, Slow-to-Target and Reconnect. Bind templates to score events and a diagnosed issue; record the reason for each choice.',
  rewards='Capability badges show what was demonstrated, in which music, at what tempo. A session closes with one improvement and the next review. Cosmetic rewards are optional; practice history never resets.',
  game_rules='A mission completes only when its stated criterion is met or deliberately self-marked. Verified and self-reported evidence stay distinct. A badge requires an in-piece check; transferable skills require a second context.',
  agency='Show “Why this mission?” and “Too easy / too hard / skip.” Never gate access to a piece behind prior missions. Offer guided and free practice from the same screen.',
  retention='Start with a simple review heuristic: next day, then 3 and 7 days after successful recall. Reschedule from observed performance, and evaluate the heuristic rather than claiming scientific optimality.',
  jam_differentiator='Jam is a transfer mission: roots on beat 1, guide tones at changes or a written rhythmic pattern. Label each goal so a creative choice is never automatically counted as an error.',
  engine_name='Session planner',engine_body='Skill evidence + review queue + time budget → mission graph → transfer / recall checks',
  model_extra='SkillEvidence {skillTag, sourceTake, context, tempo, confidence}; Mission {templateVersion, eventRange, target, reason}; ReviewDue {itemId, dueAt}.',
  endpoint_extra='POST /plans/today; POST /missions/:id/complete; GET /reviews/due. Replaying a saved plan keeps the exact template and rubric versions.',
  risks='Generated lessons can feel generic or patronizing. Test user edits to the inferred skill map and whether the chosen exercise actually transfers back to the piece.',
  phase3='Build template bindings, editable phrase/skill map, time-boxed session planner, mission state and review queue. Exit: a mission improves the linked phrase and a user can explain the recommendation.',
  timeline='20–26 weeks',later='8–14 more weeks',
  experiment='Recruit 12 players who report unstructured practice. Compare self-chosen looping with guided ten-minute sessions on matched excerpts. Recheck after 24–72 hours and ask whether guidance felt useful or restrictive.',
  success='Proposed signal: 8 of 12 finish a complete session without coaching from the researcher; delayed tests show that drill gains return to the piece.',
  sell='A personal practice program built from your repertoire. Subscription value would come from sustained guidance and retained progress; content authoring is a real operating cost.',
  bet='Best if the central problem is “I do not know what to practice next.” Requires stronger pedagogy and more content operations than Phrase.'
 ),
 dict(
  name='Pocket',file='03-pocket.pdf',accent='#A75824',pale='#F6E5D6',
  strap='Get better inside the groove.',
  summary='A rehearsal room with a convincing backing band, where musical challenges and take reviews turn practice into playing.',
  audience='For guitarists and bassists motivated by groove, improvisation and performing with others. Imported pieces remain first-class rehearsal material.',
  promise='Open a piece or describe a jam. Choose your role, play with a great-sounding band, and get one specific way to sound more together.',
  thesis='The unit of progress is a musical role performed reliably in context.',
  pillars=[('Feel','The band sounds good enough to make another chorus inviting.'),('Context','Challenges measure a stated musical role, not conformity to one improvised solo.'),('Momentum','Feedback arrives between passes so the music remains the focus.')],
  workspace_title='Rehearsal / Evening Study',workspace_sub='Your role: lead guitar  ·  Band: drums + bass + keys  ·  Original practice sketch',
  sidebar_title='Set list',sidebar=[('01  Sound check','Input + band balance'),('02  Learn the part','Loop bars 17–20'),('03  Hold the groove','Jam in A · shuffle'),('04  Full take','90 BPM · review after')],
  right_title='Band challenge',right_copy='Stay with the pulse when the click drops out.<br/><br/>The band keeps a steady reference.',
  feedback_title='The groove held. The entry rushed.',feedback_copy='You came back early after the quiet bar. Try the same entry again.',
  exercise_copy='Two bars with a click, one without. Repeat the entry at 64 BPM, then bring the full band back for a written phrase check.',exercise_button='Try the gap challenge',
  progress_title='A set you can play with confidence.',
  progress_cards=[('Groove / shuffle at 72 BPM','Three consistent choruses under this challenge rule.'),('Piece / phrase 04 at 72 BPM','Exact-score accuracy stays separate from jam results.'),('Next: a full rehearsal','Connect the entry with the following four bars.')],
  jam_role='Your role: guitar  ·  Mode: free improvisation  ·  Feedback: groove observations only',
  story=[
   ('Choose music or a jam','Import a part, or describe a groove','Riley imports a Guitar Pro arrangement and selects bass. Another day can begin with “shuffle beat ii–V–I in A.”'),
   ('Meet the band','Mute the part you will play','Preview each instrument, choose the groove density, and check input balance. The band shows the exact form before starting.'),
   ('Play a chorus','The score is the shared roadmap','A Guitar Pro-like score view follows the band. Riley loops a transition and drops from 90 to 72 BPM.'),
   ('Hear the useful difference','Early after the quiet bar.','A take review highlights the entry and lets Riley hear it against the band. The app suggests one groove challenge.'),
   ('Trade a phrase','Model plays; you answer','A generated call-and-response exercise uses the score’s rhythm. The backing parts stay fixed during an assessed pass.'),
   ('Keep a rehearsal card','A better take in the same setting','Riley saves the form, sound, tempo and challenge result. A later rehearsal tests the same task and then a new key.')],
  navigation='Rehearse → Piece or Jam → Take review; Set list, Mixer and Progress are persistent.',
  unique_features=[('Rehearsal room','A set list combines imported pieces, loops and jam recipes. The score remains the main playing surface.'),('Band builder','Editable chord form, style, swing, key, role and density. Preview the result before playing; mute the user’s role.'),('Musical challenges','Click gaps, call-and-response, roots at changes and written groove patterns. Each challenge names exactly what is assessed.'),('Rehearsal cards','Save the arrangement seed, sound pack, tempo, role and evidence. Compare takes on equivalent tasks.')],
  workspace_notes=[('1 / A musical set','Move between the imported piece and a related jam without resetting input, instrument or mixer.'),('2 / A shared form','Notation / TAB, loop handles and tempo remain visible; a chord strip can replace TAB in open jams.'),('3 / Between-take coaching','The band does not chase the student during an assessed pass. Adaptations happen at the next chorus.')],
  coaching='A timing drift selects a metronome-gap task; unstable changes select roots-only or two-chord alternation; phrase length issues select call-and-response. Recheck with the original band and score afterward.',
  rewards='Collect rehearsal cards for pocket, consistency and recall, each tied to a role, groove and tempo. Personal bests compare the same form and backing seed; a nice-sounding saved take is itself a reward.',
  game_rules='Written parts use exact-score criteria. Constrained jams use the announced task. Free improvisation offers timing and phrase observations without a pitch-accuracy grade or a musical-quality score.',
  agency='Choose free jam, a challenge or an exact part. Accept a suggested variation at the next chorus, lock the arrangement, or keep playing with feedback hidden.',
  retention='Offer one familiar groove, one weak transition and one optional variation. A saved set makes returning easy; new sounds never gate core practice tools.',
  jam_differentiator='Jam is the main creative surface. Arrange idiomatic bass, drums and comping from a small curated style library. Rehearsal changes happen on form boundaries, with an explicit preview.',
  engine_name='Band and challenge director',engine_body='Form + role + seeded arrangement + evidence → next-chorus variation / challenge',
  model_extra='JamRecipe {chords, form, groove, role, seed, packVersion}; Challenge {mode, referenceEvents, criteria}; RehearsalCard {recipeVersion, takeIds, result}.',
  endpoint_extra='POST /jam-recipes/validate; POST /arrangements; POST /challenges; GET /rehearsal-cards. Persist the arrangement seed for comparable takes.',
  risks='Musicality and tone quality are the product. A technically correct but repetitive backing band will fail. Budget for arrangement authors and listening tests, not just a text-generation API.',
  phase3='Build the typed jam composer, three authored styles, role-aware arrangements, challenge director and rehearsal cards. Exit: musicians approve the groove and can tell exactly what the challenge evaluates.',
  timeline='22–28 weeks',later='10–16 more weeks',
  experiment='Recruit 12 guitarists and bassists who use backing tracks. Blind-audition the band, then compare open jamming with one focused challenge and a return to the written piece.',
  success='Proposed signal: 8 of 12 prefer the sampled band to the fallback sound set; most willingly repeat a challenge and understand why free solos are not graded for pitch accuracy.',
  sell='A great band that also helps you practice. Premium sounds and styles could support a subscription, but convincing audio and reliable core feedback must arrive before cosmetic content.',
  bet='Most distinctive jam experience and strongest immediate musical appeal. Highest arrangement and sample-production effort; avoid starting with an unrestricted AI band.'
 )
]

def product_pages(b,d):
    b.page('01 / product direction',d['strap'],f"{d['name']} / {d['summary']}")
    b.pill('DESIGN PROPOSAL · NOT A BUILT PRODUCT',48,157,size=9)
    b.para(d['thesis'],48,208,397,32,font='G',maxh=135,leading=40)
    b.para(d['audience'],48,362,385,15,col=MUTED,maxh=94)
    b.para(d['promise'],48,475,385,14,maxh=93)
    workspace(b,468,159,604,401,d,True)
    for i,(title,body) in enumerate(d['pillars']):
        x=48+i*349;b.card(x,589,326,102,title,body,size=11)

    b.page('02 / product structure','A complete practice app, with one clear center',d['navigation'])
    for i,(title,body) in enumerate(d['unique_features']):
        b.card(48+(i%2)*521,154+(i//2)*156,503,140,title,body,size=12.5)
    b.text('COMMON CAPABILITIES IN THE FIRST COMPLETE RELEASE',48,482,11,'B',b.accent)
    table(b,48,507,1024,['Bring music','Hear and control','Play and improve','Keep and return'],[
        ('GP3–8 + MusicXML import; track and tuning confirmation; score / TAB.','Sampled band; track mute/solo; 40–200% speed; A–B loops; count-in.','Mic / interface input; supported note and timing assessment; evidence-linked drills.','Per-phrase tempo history; reliable-score coverage; saved exercises and jam recipes.'),
        ('Import report lists degraded or unsupported features. Keep the source file.','Learn mode, assessment mode, mixer, metronome and reference listening.','Clear recording-confidence states; replay; report an incorrect observation.','Guest practice with local saves; optional account sync and deletion controls.')
    ],[256]*4,rowh=73,fontsize=11)

    storyboard(b,d)

    b.page('04 / main interface','The score remains the place where playing happens','Desktop-first concept. Vector mockup uses an invented phrase and illustrative data; notation is schematic.')
    workspace(b,48,151,1024,452,d)
    for i,(title,body) in enumerate(d['workspace_notes']):
        x=48+349*i;b.text(title,x,624,12,'B',b.accent);b.para(body,x,647,325,11.5,maxh=48)

    b.page('05 / feedback and exercises','Observe → explain → practice → return','Useful feedback needs a visible cause, a manageable next action and a check that the action helped.')
    feedback_mock(b,48,152,1024,422,d)
    b.callout('How the coach chooses this exercise',d['coaching'],48,592,665,106)
    b.callout('When the recording is unclear','Show “Could not assess this note.” Offer a level or input check; preserve the take without changing mastery.',731,592,341,106)

    b.page('06 / progress and motivation','Reward evidence of learning',d['rewards'])
    progress_mock(b,48,154,639,421,d)
    b.card(707,154,365,203,'The reward rule',d['game_rules'],size=12.5)
    b.card(707,373,365,202,'Player control',d['agency'],size=12.5)
    b.callout('A reason to return',d['retention'],48,593,639,104)
    b.callout('Keep comparisons honest','Store tempo, phrase, tuning, rubric, input quality and arrangement version. Show unknown separately; compare like with like.',707,593,365,104)

    b.page('07 / generative jam','A plain-language request becomes an editable band','“Shuffle beat ii–V–I in A” is ambiguous. Show the chosen harmony and feel before playback; users can edit either.')
    jam_mock(b,48,151,760,431,d)
    b.card(828,151,244,206,'Why it belongs here',d['jam_differentiator'],size=12)
    b.card(828,373,244,209,'Musical defaults','A major; Bm7 → E7 → Amaj7; 2 + 2 + 4 bars; 4/4 at 90 BPM; eighth-note shuffle 2:1. Offer triads, minor key or dominant blues explicitly.',size=12)
    steps=[('Parse','Text or form → typed recipe'),('Validate','Key, chord quality, bar totals'),('Arrange','Style rules + voicings + seed'),('Perform','Events → samples → feedback')]
    for i,(title,sub) in enumerate(steps):
        xx=48+i*261;node(b,xx,603,241,85,title,sub,b.pale)
        if i<3:b.arrow(xx+242,646,xx+258,646)

def architecture_page(b,d):
    b.page('08 / system architecture','One musical timeline connects the whole system','Proposed stack: TypeScript + React/Vite; alphaTab adapter; Web Audio; worker-based analysis; a small API and database. [1–8]')
    b.rect(48,152,1024,364,'#E9EEE8',r=12)
    b.text('ON THE PLAYER’S DEVICE — THE REAL-TIME PATH',64,166,11,'B',b.accent)
    node(b,66,201,213,111,'1  Score / jam input','Import in a worker, or validate an editable jam recipe. Preserve source IDs.')
    node(b,324,201,220,111,'2  Musical model','Notated score + unfolded performance events + capability report.')
    node(b,589,201,214,111,'3  Audio transport','One AudioContext clock. Schedule samples, loops and count-in; drive score cursor.')
    node(b,847,201,206,111,'4  Play + display','Band + click → headphones; selected part muted. Score cursor and feedback overlay → screen.')
    b.arrow(280,256,322,256);b.arrow(546,256,587,256);b.arrow(805,256,845,256)
    node(b,66,370,213,116,'5  Input capture','Mic / interface → AudioWorklet → timestamped PCM. Recording stays local by default.')
    node(b,324,370,220,116,'6  Analysis worker','Signal health + onsets + pitch / multipitch candidates. Align to expected events.')
    node(b,589,370,214,116,'7  Evidence','Matched, missing, extra or uncertain events; confidence, timing and coverage.')
    node(b,847,370,206,116,'8  Product engine',d['engine_body'],b.pale)
    b.arrow(280,426,322,426);b.arrow(546,426,587,426);b.arrow(805,426,845,426)
    b.arrow(433,313,433,368);b.text('expected events',443,330,9,'B',MUTED)
    b.arrow(694,313,694,368);b.text('clock / offset',705,330,9,'B',MUTED)
    b.arrow(1037,368,1037,314);b.text('feedback to UI',947,336,9,'B',MUTED)
    b.rect(48,539,1024,143,INK,r=12)
    b.text('OPTIONAL ACCOUNT + SYNC — NEVER THE METRONOME CLOCK',65,554,10,'B','#BCD4CD')
    for i,(title,body) in enumerate([
        ('API + Postgres','Identity, score versions, takes, exercise plans and progress. Idempotent sync.'),
        ('Object storage + CDN','Private source files and opted-in recordings; public, versioned sample packs.'),
        ('Job worker','Opt-in post-take analysis or export. Queued, retryable and versioned.')]):
        x=66+i*332;b.text(title,x,583,13,'B',WHITE);b.para(body,x,608,302,11,col='#DDE5E2',maxh=56)
    b.arrow(951,488,951,537);b.text('save evidence',845,518,9,'B',b.accent)

def import_page(b,d):
    b.page('09 / source music and evidence','The supplied files already reveal the hard cases','Local metadata inspection with alphaTab 1.8.4, plus GP8 XML inspection. Parsing succeeded for all three; rendering and sound were not validated.')
    table(b,48,154,1024,['Supplied file','Observed structure','What it changes in the design'],[
        ('Born under a bad sign .gp4','6 tracks · 84 notated bars · 90 BPM<br/>Bass, guitars, drums, piano and brass.','Start with bass and a selected guitar part. Track names and instrument metadata need user confirmation.'),
        ('Hotel California .gp4','10 tracks · 121 bars · 74 BPM<br/>122 bent notes; 108 tie destinations.','Large mixer and score layout; sustain and bends. Import emitted custom-bend fallback warnings; inspect those events.'),
        ('Solo 3 – Comfort Food .gp','GP8.1.2 · 1 track · 53 bars · 88 BPM<br/>Embedded MP3; 32 sync points; swing.','Separate notation time from recorded performance time. Blank title metadata needs a filename fallback; preserve tuplets and grace notes.')
    ],[267,336,421],rowh=83,fontsize=11.5)
    b.card(48,453,496,233,'Import → validate → normalize','1. Check magic bytes, archive size, file count and decompression limits.<br/>2. Parse off the UI thread; disable external XML references.<br/>3. Confirm the playing track, instrument, tuning and capo.<br/>4. Report unsupported notation, sound and grading separately.<br/>5. Persist original bytes + parser version + immutable score version.',size=12)
    b.card(565,453,507,233,'A notation model and a performance model','Keep bars, voices, rational durations, rests, ties, ornaments, strings/frets, tuning, capo, written/sounding pitch and source IDs. Unfold repeats into occurrence IDs; map source notes to each occurrence.<br/><br/>Compile expressive timing and tempo into expected events. A tied continuation is not a new attack. Keep MIDI as an export of the richer score model.',size=12)

def sound_page(b,d):
    b.page('10 / playback and sound','Treat the backing band as an instrument','Sample-based playback is part of the core product. Broad format support and beautiful tone are separate acceptance gates. [3–5, 9–10]')
    table(b,48,155,1024,['Layer','First complete release','Quality and expansion plan'],[
        ('Guitar + bass','Curate or commission clean picked / fingered multisamples with 3+ velocity layers and alternate attacks.','Map tuning, key ranges, release and mute behavior. Add per-voice bends, slides and amp/cab effects; do not assume access to Guitar Pro RSE assets.'),
        ('Drums + comping','Audition a web-sized Virtuosity Drums subset and VCSL keys; retain source licenses.','Author dynamics, choke groups, bass voice leading and sparse comping. Commission missing core sounds with web redistribution rights.'),
        ('Pack pipeline','Offline tooling trims, normalizes and maps licensed WAVs into manifests, zones and compressed assets.','Load active tracks first; decode before playback; cache versioned packs. Target a 15–40 MB starter download and ≤256 MB decoded samples on the baseline laptop; validate with real packs.'),
        ('Fallback sounds','A permitted GM SoundFont covers unusual instruments; label it as standard sound quality.','Quality packs must pass listening tests before launch. The fallback is continuity during downloads, not the premium-sound acceptance criterion.')
    ],[184,399,441],rowh=80,fontsize=11.5)
    b.card(48,529,496,164,'Transport owns musical time','One AudioContext and event scheduler drive playback. Prototype alphaTab’s IExternalMediaHandler for cursor sync; retain a bounds-based cursor fallback. Tempo scales event time, not sample pitch. Cancel events on seek; handle sustain, count-in, loop tails and tied notes explicitly.',size=12)
    b.card(565,529,507,164,'Imported recordings have their own path','Offer Reference recording and Generated band modes. GP8 sync maps align audio to bars. Fixed recordings need pitch-preserving time-stretching and cannot mute a single part without stems. Evaluate a licensed DSP implementation; avoid two independent playback clocks.',size=12)

def arrangement_page(b,d):
    b.page('11 / jam implementation','Generate musical events, then play them beautifully','A constrained arranger is an achievable first product. A language model may help interpret wording later; it never owns the timing clock or the grading target.')
    b.rect(48,157,378,273,INK,r=10)
    b.text('VALIDATED JAM RECIPE',68,177,11,'B','#C6DDD2')
    recipe=[('Key / mode','A / major'),('Harmony','Bm7 × 2 | E7 × 2 | Amaj7 × 4'),('Meter / tempo','4/4 / 90 BPM'),('Groove','shuffle-eighths / ratio 2:1'),('Band','drums + bass + piano'),('Player role','guitar'),('Form / variation','8 bars / seed 1042'),('Assessment','free, constrained or written')]
    for i,(k,v) in enumerate(recipe):
        yy=210+i*25;b.text(k,68,yy,10,'R','#BED0D2');b.text(v,184,yy,10,'B',WHITE)
    b.card(446,157,626,273,'From words to an arrangement you can inspect','1. A grammar recognizes key, Roman numerals/chord names, feel, meter, tempo and bar counts. Unknown terms stay highlighted; the structured form always works.<br/>2. Normalize chord spelling and mode; validate durations and instrument ranges. Show defaults rather than silently guessing.<br/>3. A style template chooses drum cells, bass patterns and comping density. Constrained voice leading keeps chord shapes playable and bass movement idiomatic.<br/>4. Emit note, articulation and dynamic events plus an editable score/chord view. Save the recipe, generator version and seed.',size=12.5)
    b.card(48,449,496,245,'Make the groove intentional','For straight eighths, an offbeat is at 1/2 beat; a 2:1 shuffle places it at 2/3. Swing only eligible pairs, not explicit tuplets or imported timing twice.<br/><br/>Drums use authored accents, alternate samples and choke groups. Bass can use roots, fifths and reviewed approach-note rules. Comping selects sparse chord voicings within an instrument range. Humanization is seeded and bounded; store the exact reference events.',size=12.5)
    b.card(565,449,507,245,'Connect the band to practice','Mute the role the user will play, while retaining its expected events for a written or constrained task. In open improvisation, keep harmony visible and offer observations rather than a pitch grade.<br/><br/>Preview a 4–8-bar form, loop it, change key or tempo, and save it. Regenerate only at a stopped state or next form boundary. A generated arrangement enters the same transport, score, assessment and history pipeline as an imported piece.',size=12.5)

def evaluation_page(b,d):
    b.page('12 / performance assessment','Know what was played before judging it','Proposed capability tiers, not claims of proven accuracy. Ship each assessed mode only after it passes an instrument- and input-specific benchmark. [5–8]')
    stages=[('Capture','Frame timestamps, device profile, clipping and noise'),('Detect','Onset candidates + pitch tracks + confidence'),('Align','Expected score, bounded sequence matching, loop IDs'),('Explain','Evidence + uncertainty + one actionable observation')]
    for i,(t,s) in enumerate(stages):
        xx=48+i*261;node(b,xx,156,241,96,t,s,b.pale)
        if i<3:b.arrow(xx+242,204,xx+259,204)
    table(b,48,277,1024,['Playing mode','Assessment method','What the product promises'],[
        ('Clean single notes<br/>Initial grading mode','Spectral-flux onsets and YIN-style pitch candidates; bounded sequence alignment with match, missing and extra events. Retain detected pitches before consulting the score.','Notes and timing on validated clean guitar / bass ranges. Target B0–E6, with longer windows for low bass; validate the range before advertising it.'),
        ('Chords and strumming<br/>Post-take extension','Multipitch model candidate (Basic Pitch) + score-conditioned event matching; group staggered string attacks.','Grade rhythm first; enable note-set checks only on validated chord families. Distortion, bleed and ambiguous voicings can remain ungraded.'),
        ('Bends, slides, legato<br/>Technique extension','Compare pitch contours and target arrival. Model ties and hammer-ons separately from picked onsets.','Show expressive notes in notation and playback immediately. Add technique-specific grading after musician-labeled validation; audio cannot prove fingering.'),
        ('Free improvisation<br/>Jam mode','Beat-relative onset and phrase observations; optional announced constraints such as roots on beat 1.','No pitch-correctness score without a defined target. Musical taste, tone and creative choices are not reduced to a universal percentage.')
    ],[196,421,407],rowh=82,fontsize=11.2)
    b.text('LIVE AND FINAL FEEDBACK HAVE DIFFERENT JOBS',48,655,11,'B',b.accent)
    b.para('Live markers are provisional. Reconcile each take in a worker; preserve evidence and rubric versions. Keep prior results if models change.',48,678,1024,11,maxh=26)

def metrics_page(b,d):
    b.page('13 / measurement contract','A score is only useful when its meaning is clear','Store raw counts, timing distributions, coverage and rubric version. The following thresholds are starting hypotheses for teacher validation.')
    b.card(48,154,496,241,'Separate pitch, timing and uncertainty','Pitch: correct expected notes / assessable expected notes; also show missing notes and extra attacks. Coverage: assessable expected notes / all eligible expected notes.<br/><br/>Timing: signed median, median absolute onset error and the 90th percentile on matched onsets. Preserve the bias: consistent lateness must not be automatically centered away.',size=12.5)
    b.card(565,154,507,241,'Keep the task stable during assessment','Bind every take to a track, phrase occurrence, tempo map, tuning, input profile, score version and rubric. Backing remains fixed while assessing; bounded alignment may recover the score location without forgiving actual timing errors.<br/><br/>Distinguish “missed” from “not assessable.” Silence on a healthy signal can be a miss; clipping or ambiguous pitch can be unknown.',size=12.5)
    b.rect(48,413,1024,105,WHITE,r=9)
    b.text('EXPECTED',65,429,9,'B',MUTED);b.text('PERFORMED',65,470,9,'B',MUTED)
    for i in range(7):
        xx=214+i*114;b.line(xx,425,xx,497,LINE,1,[2,3]);b.circle(xx,443,4,b.accent)
        off=[3,-4,5,22,24,4,0][i]
        if i==6:b.text('?',xx-3,477,13,'B',MUTED)
        else:b.circle(xx+off,483,4,AMBER if off>10 else b.accent)
    b.text('A fixed calibration offset is removed. Real playing variation remains.',214,502,9,'R',MUTED)
    b.card(48,536,496,161,'Calibrate the recording and playback path','Measure round-trip delay with loopback where possible. A guided musical alignment is provisional because it includes human timing. Save uncertainty per device / sample rate; never recalibrate from each scored take. Recheck after route changes; unreliable Bluetooth timing disables fine timing grades.',size=11.8)
    b.card(565,536,507,161,'A proposed tempo ladder','For a simple picked-note drill: ≥90% note matches, ≥90% coverage, extras ≤5%, median |onset| ≤30 ms and p90 ≤60 ms. Require two qualified takes; offer +4 BPM next loop. Two difficult takes suggest −8 BPM or a smaller phrase. Retain only after a later check; adapt tolerances for expressive tasks.',size=11.8)

def data_page(b,d):
    b.page('14 / data and operations','Save the evidence that makes progress reproducible','Start with a modular application and one backend. Keep sound scheduling and the initial feedback loop independent of network access.')
    node(b,48,155,218,93,'ScoreVersion','Source hash, parser version, tracks, notes and import report',b.pale)
    node(b,316,155,220,93,'PracticeTarget','Score occurrence / jam seed, role, tempo, task and rubric',b.pale)
    node(b,585,155,219,93,'Take + EventEvidence','Device profile, note matches, errors, confidence and counts',b.pale)
    node(b,852,155,220,93,'ProgressSnapshot','Derived evidence summary; never an untraceable total',b.pale)
    for xx in [268,538,806]:b.arrow(xx,201,xx+46,201)
    b.card(48,269,496,188,d['engine_name'],d['model_extra']+'<br/><br/>'+d['endpoint_extra'],size=11.5)
    b.card(565,269,507,188,'Local first, account optional','IndexedDB stores scores, takes and a sync outbox. UUIDs and idempotency keys prevent duplicate attempts. Immutable score and rubric versions avoid corrupting old progress. Optional account sync uses an authenticated API, Postgres and private object storage with short-lived URLs.',size=12)
    b.card(48,477,496,212,'API and job boundaries','POST /scores creates a version after upload validation; POST /takes records a completed attempt; GET /progress filters comparable evidence. A background job can refine an opted-in recording; results carry model and rubric versions.<br/><br/>Use a queue only for post-take work. Signed uploads, ownership checks, quotas and archive limits protect the shared backend.',size=12)
    b.card(565,477,507,212,'Privacy, recovery and release operations','No raw recording upload by default. Explicitly save or upload a take; offer per-take and account deletion plus export. Recordings are not model-training data without separate opt-in.<br/><br/>Show local / syncing / saved / failed states. Retry safely after offline use. Monitor input failure, analysis time, underruns and disputed feedback; exclude private score/audio content from telemetry.',size=12)

def build_page(b,d):
    b.page('15 / implementation plan',f"A gated path to a complete {d['name']} beta",f"Planning estimate: {d['timeline']} with three engineers, a half-time designer, fractional QA and a musician/teacher partner. Ranges are assumptions, not vendor estimates.")
    phase_len='4 weeks' if d['name']=='Phrase' else '6–8 weeks' if d['name']=='Trail' else '8–10 weeks'
    rows=[
      ('0 · Prove the risks<br/>2 weeks','Audio/DSP + frontend','Render and audition the three supplied files; label input recordings; verify clock and external-cursor integration. Exit: fidelity report, sample rights inventory and a measurable assessment baseline.'),
      ('1 · Complete playback<br/>3 weeks','Frontend + audio','Import report, score/TAB, selected track, loop, speed, count-in and mixer. Canonical events handle repeats and tempo changes. Exit: deterministic playback and cursor tests; seek and loop sustain behavior checked.'),
      ('2 · Hear the student<br/>4–6 weeks','DSP + platform + sound contractor','Capture, device checks, alignment, monophonic evaluation and evidence review. In parallel, curate quality sounds. Exit: precision, coverage, latency and blind-listening gates pass on supported setups.'),
      (f'3 · Deliver the concept<br/>{phase_len}','Product + full team',d['phase3']),
      ('4 · Finish the whole loop<br/>3–4 weeks','Full stack + product','Add or complete jam recipes, arrangement-to-score, account sync, progress, retention checks and recovery states. GP8 reference audio uses a validated sync/time-stretch path. Exit: full user journey works across reloads.'),
      ('5 · Pilot and harden<br/>2–3 weeks','Full team + teacher + QA','Run the musician pilot; test Safari/Chromium, long pieces and input changes. Audit accessibility, storage, sample licenses and feedback disputes. Exit: launch gates met and supported modes published.')
    ]
    table(b,48,158,1024,['Phase / duration','Primary owner','Deliverable and exit criterion'],rows,[195,180,649],rowh=67,fontsize=10.7)
    b.callout('After the complete beta',f"Budget {d['later']} for validated chord families, bend/slide assessment and more styles; research may extend this. New instruments require new profiles and benchmarks. Core note, timing, training, progress and jam workflows already exist in the beta.",48,603,665,99)
    b.callout('Cost drivers','Three engineers dominate cost. Allow $10k–$30k for sound/style work; obtain quotes after auditioning the first pack.',731,603,341,99)

def validation_page(b,d):
    b.page('16 / validation and scope','Define the promises, then test them','All numeric gates below are proposed acceptance targets. None was measured on a finished application during this design exercise.')
    table(b,48,156,1024,['Risk / requirement','Evidence needed before release'],[
        ('Import and notation fidelity','Compare GP3/4/5/6/7/8 and MusicXML fixtures to trusted notation and MIDI references. Include tuning, capo, repeats, alternate endings, tempo/meter changes, ties, swing and tuplets. The three local files alone are insufficient.'),
        ('Trustworthy feedback','Collect consented clean DI and mic takes from guitarists and bassists, plus noisy/distorted negatives. Split by player and instrument. On supported cases: ≤2% false mistake flags among teacher-labeled correct events and ≥90% coverage and ≥85% recall of labeled mistakes; report all three together.'),
        ('Clock and response','Test injected timing offsets and loopback recordings. Target ≤10 ms p95 residual error on calibrated wired setups; onset markers ≤150 ms p95, final review ≤5 s for a 30 s mono take on a stated midrange laptop. Low bass pitch may appear later.'),
        ('Sound and reliability','Blind-listen with ≥12 musicians; target ≥8 preferring the quality band over fallback. Test 30-minute sessions, seeks and tempo changes without stuck notes or underruns on the baseline device. Preload and cache only the needed patches.'),
        ('Learning and usability',d['experiment']),
        ('Concept-specific failure',d['risks'])
    ],[220,804],rowh=67,fontsize=10.8)
    b.callout('Release scope covers every requested workflow','Upload → score/TAB → sampled playback → tempo/loop → live audio → supported note/timing evidence → generated exercise → progress history. Typed jam request → editable form → sampled backing → the same practice and review tools.',48,604,653,100)
    b.callout('Broader validation','Keyboard controls, text alongside colors, large targets, reduced motion and a tablet score view. Phone gets a focused single-system view.',719,604,353,100)

def sources_page(b,d):
    b.page('17 / evidence and decisions','What is verified, what is proposed, what comes next','External technical sources reviewed September 29, 2026. Links are clickable. Product behavior, thresholds, schedules and budgets are design proposals.')
    for i,(title,url,note) in enumerate(SOURCES):
        x=48+(i//5)*521;y=157+(i%5)*85
        b.text(f'[{i+1}]  {title}',x,y,11.8,'B',b.accent)
        b.c.linkURL(url,(x,H-y-18,x+498,H-y+3),relative=0,thickness=0)
        b.para(note,x,y+24,486,10.7,col=MUTED,maxh=47)
    b.rect(48,590,1024,108,WHITE,r=9)
    b.text('LOCAL EVIDENCE',64,605,10,'B',b.accent)
    b.para('Source files: main checkout /guitarpro; metadata and import warnings recorded in research/file-analysis.json. Prototype reviewed: timingAnalyzer.ts, microphoneRecorder.ts, metronome.ts, sampler.ts and pitch.ts. Existing onset logic and UI ideas are references; this plan does not depend on keeping their implementation.',64,628,606,11,maxh=62)
    b.text('DECISION THIS DESIGN SUPPORTS',701,605,10,'B',b.accent)
    b.para(d['bet'],701,628,353,11.5,maxh=61)

def make_book(d):
    b=Book(d['file'],d['name'],d['accent'],d['pale'])
    product_pages(b,d)
    architecture_page(b,d)
    import_page(b,d)
    sound_page(b,d)
    arrangement_page(b,d)
    evaluation_page(b,d)
    metrics_page(b,d)
    data_page(b,d)
    build_page(b,d)
    validation_page(b,d)
    sources_page(b,d)
    b.save()

def comparison():
    b=Book('00-design-comparison.pdf','Three ways to practice','#314C5E','#E2E9EB',4)
    b.page('01 / review guide','Three complete directions. One shared musical engine.','Recommendation: begin with Phrase; borrow Trail’s short session planning and add Pocket’s richer band experience after the feedback earns trust.')
    for i,d in enumerate(DESIGNS):
        x=48+i*349;b.rect(x,155,326,383,WHITE,r=12)
        b.pill(f'0{i+1}',x+20,175,fill=d['pale'],col=d['accent'])
        b.text(d['name'],x+20,222,31,'G',d['accent'])
        b.para(d['thesis'],x+20,275,286,20,font='B',maxh=91)
        b.para(d['summary'],x+20,377,286,13,col=MUTED,maxh=114)
        b.text(d['timeline']+' to complete beta',x+20,507,10,'B',d['accent'])
    b.callout('Read the books in this order','Pages 1–7: concept, storyboard and interface. Pages 8–14: system, music, sound, jam generation, assessment and data. Pages 15–17: delivery, acceptance gates and evidence. Each book stands alone; shared infrastructure is deliberately consistent.',48,562,659,126)
    b.callout('What was produced','Three 17-page design books plus this comparison. Original vector mockups and diagrams, linked sources and local sample analysis. No application was built or changed.',725,562,347,126)

    b.page('02 / product tradeoffs','Three distinct ways to organize practice','All three retain a simpler Guitar Pro-style playing interface. They differ in what chooses the next action and what progress means.')
    rows=[
      ('First question','Which phrase needs work?','What should I practice today?','What do I want to play with?'),
      ('Home and main screen','Piece map → score workbench','Today plan → mission score','Set list → rehearsal score'),
      ('Feedback emphasis','Exact event and transition evidence','One learning objective at a time','Timing and role in musical context'),
      ('Core reward','Reliable phrase tempo; connected sections','Demonstrated skill; recall and transfer','Saved rehearsal; consistent groove'),
      ('Jam’s role','Transfer a phrase into another context','Prove a skill over a new harmony','Create the main playing experience'),
      ('Unique complexity','Phrase boundaries and readiness rollups','Pedagogy, planning and content operations','Style arranging, samples and groove logic'),
      ('Product risk','Too much analysis on the screen','Guidance becomes generic or restrictive','Backing band sounds stiff or repetitive'),
      ('Best starting audience','Self-directed repertoire learners','Players who need practice structure','Players motivated by jamming and groove')
    ]
    table(b,48,157,1024,['Decision','Phrase','Trail','Pocket'],rows,[193,277,277,277],rowh=62,fontsize=11.4)

    b.page('03 / objective coverage','Every design includes the complete requested loop','This matrix points into each standalone book. Initial release capabilities and later assessment expansions are distinguished throughout.')
    table(b,48,157,1024,['User objective','Where it is designed','First complete beta / later expansion'],[
      ('Upload Guitar Pro and other digital music','pp. 2, 8–9','GP3–8 and MusicXML with a feature report. Original-file retention and a canonical score; PDF/image OCR deferred.'),
      ('Sheet music or tablature; simple familiar UI','pp. 3–4, 9','Central score / TAB / both; selected tracks, keyboard controls and a focused tablet layout.'),
      ('Playback at different speeds; loop sections','pp. 4, 10','A–B loops, tempo control, count-in, rest, mute/solo and repeat rules. Imported recordings use a distinct sync path.'),
      ('High-quality musical instruments and samples','pp. 8, 10, 15–16','Curated sampled core band with a listening gate. Licensed/commissioned packs; broader GM fallback and later articulations.'),
      ('Evaluate current audio performance','pp. 5, 12–13','Validated clean single-note guitar/bass plus rhythm grading. Confidence and coverage visible. Chords and technique grading extend by benchmark.'),
      ('Feedback, exercises and gamification','pp. 3, 5–6, 13–15','Evidence → targeted drill → in-piece retest. Rewards differ by concept; uncertain input never reduces mastery.'),
      ('Track note/timing accuracy across tempos','pp. 6, 13–14','Versioned takes, phrase-tempo history, note counts, timing distributions, retained checks and optional account sync.'),
      ('Natural-language jam patterns → backing','pp. 7–8, 10–11','Text or form → validated recipe → deterministic musical arrangement → sampled playback, editable score and practice mode.')
    ],[279,137,608],rowh=62,fontsize=11.2)

    b.page('04 / recommendation','Choose the smallest learning loop that feels valuable','A proposed decision sequence for the next phase. Implementation begins only after selecting a direction; this delivery contains design work only.')
    b.card(48,155,496,175,'Start with Phrase’s core loop','Import one piece, select one part and phrase, play a baseline, inspect one trustworthy observation, practice a targeted exercise and retest. This connects every core learning capability with the least product machinery.',size=13)
    b.card(565,155,507,175,'Validate sound and assessment first','The score parser is promising: all three local files loaded with alphaTab 1.8.4. Fidelity still needs checking, including bend fallback warnings and GP8 sync. Recognition quality and musical sound are the primary unknowns.',size=13)
    b.card(48,350,496,179,'Run three focused product tests','Use the storyboards with 12 guitarists/bassists. Observe which next action they expect, whether feedback feels fair, and what evidence convinces them they improved. Then test the chosen loop with recorded performances and a musician-labeled reference.',size=13)
    b.card(565,350,507,179,'Share infrastructure; commit to one behavior','All concepts use the same score model, sampler, input/evidence pipeline and history. Build one product shell first. Trail’s planner and Pocket’s director can become later modes once the core practice value is established.',size=13)
    b.callout('Three decisions for the next planning round','1. Which concept’s daily practice loop would you most want to use?<br/>2. Is a wired interface a reasonable recommendation for precise grading, while microphone practice remains supported?<br/>3. Which first tone/style pack matters most: blues/shuffle, rock, or jazz?',48,550,659,144)
    b.callout('What remains unproven','No user study, audio benchmark, rendering comparison, sound audition or production performance test has been run. Estimates assume three engineers and specialist musical input. The plans include exit gates so these uncertainties can be resolved early.',725,550,347,144)
    b.save()

if __name__=='__main__':
    for design in DESIGNS:make_book(design)
    comparison()
    print('Generated 3 design books (17 pages each) and 4-page comparison.')
