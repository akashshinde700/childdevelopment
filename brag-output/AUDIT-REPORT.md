# Video aur source review — 13 November 2026

## Scope

Yeh audit custom 22-second illustrative video aur repository source ke selected organization/login paths tak simit hai. Yeh complete application, tenant-isolation, penetration, production, real-browser responsive, ya end-to-end audit **nahin** hai. Database, production credentials aur live data available nahin the. Kisi production mutation ka prayog nahin kiya. Video synthetic UI hai, app ki actual screen recording nahin.

## Video checks

- Final full video: H.264/AAC, 1280×720, 30 fps, 22 seconds. Teen clips usi full video ke 7s, 7.5s aur 7.5s extracts hain; alag tutorials nahin.
- FFmpeg ne full video aur teen clips ko poora decode kiya; koi decoding error report nahin hua. FFprobe ne resolution, format, frame rate aur durations confirm kiye.
- `work/check_layout.py` ne final 1280×720 composition ke 37 key text boxes ke nominal bounds, foreground/background contrast aur approximate hold time check kiye: 0 flagged. Yeh check illustrative chhote UI labels, true pixel-level contrast, transitions ya overlapping elements ka comprehensive automated test nahin hai.
- Har scene aur cut ke aas-paas stills extract kiye; selected settled frames aur create-clinic click manually dekhe. Sabhi frames manual inspect nahin kiye. Crossfade ki jagah background dip use kiya.
- Banate waqt foreground/shape compositing ka issue (flat bright blob), transparent logo par black background, aur moving cursor clipping mila; fix kiya. Plans ke do orange prices ka nominal contrast 3.1:1 tha; darker colour use kiya. Long captions shorten kiye aur last create items jaldi dikhaye.
- **Remaining limitation:** detailed table aur mock form text chhote hain, khaaskar phone par. Full-screen dekhna behtar hai. Yeh short overview hai, detailed narrated beginner tutorial nahin; koi voiceover nahin. Audio ka perceptual listening test, real device test aur exhaustive frame-by-frame visual review nahin hua. Narrow/vertical output deliver ya validate nahin kiya.

## Source review: dhyan dene layak

1. `src/app/api/auth/login/route.ts` aur `src/app/api/platform/auth/login/route.ts` mein OTP flow commented out hai: snapshot mein password-only login. Live deployment ka behaviour verify nahin hua.
2. `src/app/api/platform/organizations/route.ts`, `src/app/platform-admin/page.tsx`, `src/lib/secret-crypto.ts`: UI/create comment mein credentials once ka message hai, lekin code generated password ko reversibly encrypt karke Platform Admin list mein dobara dikhata hai. Password sensitive hai; security team review kare.
3. `prisma/schema.prisma`: kai `organizationId` fields nullable hain. Alag clinics ke isolation ko UI aur API dono par, two-tenant test data se verify karna hoga; schema dekhkar full isolation guarantee nahin di ja sakti.
4. Repository README seed scripts mein hardcoded demo credentials ki warning deta hai. Production mein kabhi use hue hon to authorized admin rotate/disable karke verify kare.
5. Snapshot ke mutabik Organization table mobile par horizontal scrolling use karti hai; yeh intentional overflow wrapper hai, lekin real device/browser test nahin kiya gaya. Create modal source mein fixed overlay aur form hai; chhoti screen par fit/scroll behaviour test karna pending hai — confirmed bug nahin.

## Follow-up test plan

Isolated non-production MySQL environment + fictional data mein platform admin aur do tenant accounts se create/login, branch, plan change, expiry, suspend/activate, user permissions, aur cross-tenant record/API access test karein. 320px, 375px, 768px aur desktop par modal, table aur keyboard access check karein. Production par seed/reset/delete na chalayein.

## Attribution

Music: Sascha Ende, ende.app, “Happy Beats / Business Moves Vol. 1”, CC BY 4.0. SFX from the `/brag` repository's bundled CC0 library. Video custom Pillow/FFmpeg se bana hai; Hyperframes ya `/brag` command execute nahin hua.
