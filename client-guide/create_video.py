#!/usr/bin/env python3
"""Render an illustrative clinic training video from pre-generated narration.
Requires Pillow, mutagen and imageio-ffmpeg. All visual data is fictional."""
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFont
from mutagen.mp3 import MP3
import imageio_ffmpeg

BASE = Path(__file__).resolve().parent
TMP = BASE / 'render-work'
TMP.mkdir(exist_ok=True)
FF = imageio_ffmpeg.get_ffmpeg_exe()
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
W, H = 1280, 720
SCENES = [
 ('01-intro', 'SHURUAT', [
  ('Clinic software', 'Client training | Basic se shuru karein', ['Example visuals; asli patient data nahi', 'Har user ka apna login'], '01 / WELCOME'),
  ('Login kaise karein', 'Clinic ka sahi link aur login lein', ['Email aur password se sign in karein', 'Credentials kisi se share na karein'], '02 / LOGIN'),
  ('Aapka menu', 'Role aur plan ke hisaab se badal sakta hai', ['Owner / Admin', 'Reception | Therapist | Accounts'], '03 / ACCESS')]),
 ('02-setup', 'PEHLA SETUP', [
  ('Clinic settings', 'Settings > Center Information', ['Clinic name, phone, email aur address', 'Logo aur approved GST details check'], '01 / SETTINGS'),
  ('Branch aur staff', 'User Management > Branches / Users', ['Branch aur staff ki details verify karein', 'Role aur branch sochkar set karein'], '02 / USERS'),
  ('Access aur employees', 'Har staff ko zaroori access hi dein', ['Employee record aur login alag ho sakte hain', 'Therapist scheduling setting verify karein'], '03 / PERMISSIONS')]),
 ('03-patients', 'PATIENTS', [
  ('Pehle search karein', 'Patients > naam / ID / mobile', ['Duplicate record banane se bachein', 'Phir naya patient add karein'], '01 / SEARCH'),
  ('Patient details', 'Child aur parent ki zaroori details bharein', ['Contact number dobara verify karein', 'Save ke baad patient ID check karein'], '02 / ADD'),
  ('Patient profile', 'History aur clinical details carefully dekhein', ['Private data sirf authorized logon ke liye', 'Demo ke liye fictional details use karein'], '03 / PROFILE')]),
 ('04-care', 'CLINICAL WORKFLOW', [
  ('Appointment', 'Patient + therapist + date + time', ['Save karein; calendar mein verify karein', 'Reschedule / cancel: reason check karein'], '01 / BOOK'),
  ('Package', 'Pehle template, phir patient ko assign', ['Sessions, duration aur price check karein', 'Schedule aur remaining sessions verify karein'], '02 / PACKAGE'),
  ('Therapy Sessions', 'Scheduled session ka status update karein', ['Therapist clinical notes complete kare', 'Package aur session details verify karein'], '03 / SESSION'),
  ('Assessments', 'Findings, goals aur recommendations', ['Authorized therapist review kare', 'Complete karne se pehle details check'], '04 / ASSESSMENT')]),
 ('05-billing', 'BILLING', [
  ('Billing & Invoices', 'Sahi patient aur service / package chunein', ['Amount, discount aur GST verify karein', 'Invoice banne par total aur balance dekhein'], '01 / INVOICE'),
  ('Payment aur receipt', 'Rakam, date aur payment mode check karein', ['Pehle se recorded payment dobara na daalein', 'Receipt aur invoice balance milayein'], '02 / PAYMENT'),
  ('Expenses', 'Category, date, vendor aur amount', ['Bill upload: permission aur privacy check', 'Approved accounts process follow karein'], '03 / EXPENSES')]),
 ('06-hr', 'STAFF & HR', [
  ('Employees', 'Staff ka HR record carefully banayein', ['Role aur branch alag se verify karein', 'Salary aur documents confidential hain'], '01 / EMPLOYEES'),
  ('Attendance & Leaves', 'Check in / check out aur leave requests', ['Timing aur status review karein', 'Leave approval authorized manager kare'], '02 / ATTENDANCE'),
  ('Payroll & Earnings', 'Mahine ke records pehle milayein', ['Attendance, leave, rates aur earnings check', 'Salary aur deductions approval se verify'], '03 / PAYROLL')]),
 ('07-reports', 'REPORTS & PARENTS', [
  ('Reports & Exports', 'Sahi module aur date range chunein', ['Report ko source records se milayein', 'Export file secure rakhein'], '01 / REPORTS'),
  ('Parent Login', 'Sahi parent ko sahi child se link karein', ['Credentials privately share karein', 'Portal access aur consent verify karein'], '02 / PARENT'),
  ('Print & Projection', 'Print preview aur patient details check', ['Projection estimate hai, payment nahi', 'Actual receipts ke saath reconcile karein'], '03 / REVIEW')]),
 ('08-close', 'DAILY CHECKLIST', [
  ('Har din ki shuruat', 'Dashboard aur aaj ka schedule dekhein', ['Patient History: sahi record verify karein', 'Pending appointments aur sessions dekhein'], '01 / OPENING'),
  ('Din ke end mein', 'Sessions, receipts aur balance check karein', ['Apne clinic ki policy follow karein', 'Shared device par logout karein'], '02 / CLOSING'),
  ('Aage kaise badhein', 'Subscription aur available features dekhein', ['Leads / inquiries: agar access mile', 'Detailed steps: saath diya gaya guide'], '03 / NEXT STEPS')]),
 ('09-extra', 'AUR MODULES', [
  ('Patient History', 'Sahi patient ka purana record dekhein', ['Date aur identity check karein', 'Clinical details confidential rakhein'], '01 / HISTORY'),
  ('Parent Portal', 'Authorized parent ko child se link karein', ['Available appointments aur records dekhein', 'Access aur consent verify karein'], '02 / PORTAL'),
  ('Leads & WhatsApp', 'Agar role aur plan mein available ho', ['Naye contacts aur message records dekhein', 'Delivery ya access separately verify karein'], '03 / COMMUNICATION'),
  ('Subscription', 'Apna plan aur limits check karein', ['Menu role aur plan ke hisaab se badalta hai', 'Details ke liye written guide padhein'], '04 / PLAN')]),
 ('10-journey', 'PRACTICE WORKFLOW', [
  ('1. Patient', 'Fictional example: Aarav Demo', ['Search karein; record na ho to add karein', 'Save ke baad ID aur contact check karein'], '01 / PATIENT'),
  ('2. Appointment', 'Patient, therapist, date aur time chunein', ['Calendar mein booking verify karein', 'Zaroorat ke hisaab se package assign'], '02 / BOOK'),
  ('3. Therapy session', 'Schedule, status aur clinical notes check', ['Authorized therapist notes record kare', 'Package balance verify karein'], '03 / THERAPY'),
  ('4. Invoice & payment', 'Amount aur receipt ko reconcile karein', ['Payment dobara record na karein', 'Invoice ka pending balance verify karein'], '04 / BILLING')]),
 ('11-corrections', 'CORRECTIONS', [
  ('Pehle verify karein', 'Sahi patient aur date dobara check', ['Duplicate record turant na banayein', 'Allowed ho to Edit ka use karein'], '01 / VERIFY'),
  ('Schedule badalna', 'Reschedule / cancel / no show', ['Sahi status aur reason check karein', 'Badla hua time dobara confirm karein'], '02 / CHANGE'),
  ('Financial correction', 'Galat balance par admin se baat karein', ['Refund ya delete: permission aur policy', 'Approval se pehle data na hatayein'], '03 / REVIEW')]),
 ('12-parent', 'PARENT PORTAL', [
  ('Parent Login', 'Parent aur child ki identity verify karein', ['Authorized staff credentials banaye', 'Password private channel se share karein'], '01 / ACCESS'),
  ('Parent kya dekhega?', 'Available appointments aur clinic records', ['Package, payments aur reports check', 'Access role aur configuration par depend'], '02 / PORTAL'),
  ('Request aur review', 'Option dikhne par request bhej sakte hain', ['Reschedule = request, confirmed booking nahi', 'Clinic ki confirmation ka wait karein'], '03 / REQUEST')]),
 ('13-roles', 'ROLE-WISE KAAM', [
  ('Reception & therapist', 'Reception: patient aur appointments', ['Therapist: sessions aur clinical notes', 'Sirf authorized records access karein'], '01 / CLINICAL'),
  ('Accounts & clinic admin', 'Accounts: invoices, payments, expenses', ['Clinic admin: users, settings, reports', 'Permissions aur plan ke hisaab se menu'], '02 / ADMIN'),
  ('Secure close', 'Kaam ke baad logout karein', ['Patient aur staff details private rakhein', 'Practice ke liye fictional data use karein'], '03 / SAFETY')]),
]

# Keep the complete example alongside the clinical modules, and finish with
# the daily checklist. This order must match create_subtitles.py.
ORDER = ['01-intro', '02-setup', '03-patients', '04-care', '10-journey',
         '11-corrections', '05-billing', '06-hr', '07-reports', '09-extra',
         '12-parent', '13-roles', '08-close']
SCENES.sort(key=lambda scene: ORDER.index(scene[0]))


def f(size, bold=False): return ImageFont.truetype(BOLD if bold else FONT, size)

def fit(draw, text, max_width, size, bold=False):
    while draw.textbbox((0, 0), text, font=f(size, bold))[2] > max_width and size > 18:
        size -= 1
    return f(size, bold)

def text(draw, xy, value, size, color, bold=False, width=None):
    font = fit(draw, value, width, size, bold) if width else f(size, bold)
    box = draw.textbbox(xy, value, font=font)
    if box[0] < 0 or box[1] < 0 or box[2] > W or box[3] > H:
        raise ValueError(f'Out of frame: {value} {box}')
    draw.text(xy, value, font=font, fill=color)
    return box

def slide(chapter, index, title, sub, bullets, tag):
    img = Image.new('RGB', (W, H), '#f2f7f7')
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, 14), fill='#0f7a87')
    d.rounded_rectangle((52, 45, 1228, 674), radius=26, fill='#ffffff', outline='#dce8e8', width=2)
    d.rounded_rectangle((85, 80, 296, 119), radius=19, fill='#e5f3f2')
    text(d, (101, 89), chapter, 17, '#075660', True, 178)
    text(d, (990, 91), tag, 15, '#526a70', True, 190)
    text(d, (88, 155), title, 57, '#102a33', True, 1070)
    text(d, (90, 240), sub, 27, '#34555c', False, 1060)
    for i, line in enumerate(bullets):
        y = 322 + i * 91
        d.rounded_rectangle((90, y, 1185, y + 71), radius=14, fill='#f1f7f6')
        d.ellipse((112, y + 24, 132, y + 44), fill='#0f7a87')
        text(d, (153, y + 19), line, 25, '#183a42', False, 1000)
    d.line((90, 568, 1185, 568), fill='#dbe8e7', width=2)
    text(d, (90, 594), 'ILLUSTRATION  |  Fictional examples', 17, '#50676b', True, 630)
    text(d, (944, 594), 'CLIENT TRAINING', 17, '#0f6c77', True, 220)
    return img


def run(cmd):
    subprocess.run(cmd, check=True)

paths = []
for key, chapter, cards in SCENES:
    audio = BASE / 'audio' / (key + '.mp3')
    duration = MP3(audio).info.length
    listing = TMP / (key + '.txt')
    with listing.open('w') as out:
        for i, card in enumerate(cards):
            path = TMP / f'{key}-{i}.png'
            slide(chapter, i, *card).save(path)
            out.write(f"file '{path}'\nduration {duration / len(cards):.6f}\n")
        out.write(f"file '{path}'\n")
    target = BASE / (key + '.mp4')
    run([FF, '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(listing),
         '-i', str(audio), '-t', str(duration), '-vf', 'fps=30,format=yuv420p',
         '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac',
         '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', str(target)])
    paths.append(target)
    print(key, round(duration, 2), flush=True)
concat = TMP / 'all.txt'
concat.write_text(''.join(f"file '{p}'\n" for p in paths))
run([FF, '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(concat),
     '-c', 'copy', '-movflags', '+faststart', str(BASE / 'clinic-full-training.mp4')])
print('Full video complete', flush=True)
