# Organization ko basic se samjhein

Yeh guide is repository ke **legacy snapshot** ke source code par based hai, live system ki verification nahin. Screens aur prices live version mein alag ho sakte hain. Demo video mein clinic names aur counts kalpanik hain; UI illustration hai, asli screen recording nahi.

## 1. Pehle shabd samjhein

- **Software / platform:** poora AetherDev therapy-clinic software.
- **Organization:** platform par ek clinic business ka account. Jaise Sunrise Clinic ek organization; doosra clinic alag organization.
- **Branch:** ek organization ki location. Ek clinic ki Pune aur Mumbai branches ho sakti hain.
- **Platform Admin:** platform chalane wala, jo multiple clinics aur plans manage karta hai.
- **Org Admin:** kisi ek clinic ka administrator, jo apne clinic ke users aur settings manage karta hai.
- **Plan / subscription:** clinic ke package ki limits, features aur uski trial/active status.

**Example:** Platform → Sunrise Clinic (organization) → Pune branch → staff, patients aur appointments. Branch aur organization ek cheez nahi hain.

## 2. Naya clinic kaise banayein

1. Platform administrator se authorized access lein. App ke `/platform-admin` page par Platform Admin account se login karein. Apne live server ka actual address apne administrator se confirm karein.
2. **Organizations** tab mein **+ Create clinic** dabayein.
3. **Clinic name** mein clinic ka naam, **Main branch name** (optional) mein location likhein.
4. **Owner / Org Admin name** aur uska email bharein. Agar owner khud therapy karta hai to checkbox chhod dein; sirf administration karta hai to hata dein. Specialization optional hai.
5. **Plan** select karein. 7-day trial, 14-day trial, ya turant active monthly/yearly option chun sakte hain. Form mein dikhne wale actual current plan/price ko verify karein; video ke values snapshot ke seed se examples hain.
6. **Create** dabayein. Source ke mutabik organization, subscription, pehli branch aur Org Admin account ek transaction mein bante hain.
7. Banaya gaya temporary password owner ko **private, secure channel** se dein. Owner ko password badalne ko kahein. Screen/share recording mein asli passwords, bachchon ke naam, emails aur health information na dikhayein.
8. Clinic owner normal clinic login (`/login`) se login karke Settings / User Management mein apne staff aur access roles set kare. Pehle test data se patients aur appointments ka workflow samjhein.

**Password par important correction:** create notice 'shown only once' kehta hai, lekin snapshot ke code mein generated password encrypted form mein store hota hai aur Platform Admin Organizations list mein dobara dikh sakta hai. Isliye use strictly sensitive samjhein; is statement ko security guarantee na samjhein.

## 3. Organizations table ko kaise padhein

- **Clinic:** naam aur slug (URL-friendly pehchaan).
- **Login:** Org Admin email aur kuch generated passwords.
- **Plan / Status:** assigned plan aur trialing/active/suspended status.
- **Usage:** therapists, branches, staff aur patient counts.
- **Period / Trial:** trial ya billing period ki end date.
- **Actions:** `Mark paid`, `+7d trial`, `Suspend` / `Activate`, `Customize plan`, `Reset pwd`, `Login as`, `Delete`.

`Suspend` access rokta hai; `Login as` clinic account ke roop mein support access deta hai aur source mein action log hota hai. `Delete` destructive hai: production par kabhi practice ke liye na dabayein. Pehle backup aur authorized approval lein. Plans badalne se access/features badal sakte hain.

## 4. Roz ka safe workflow

1. Plan aur clinic create karein → admin credentials safely share karein.
2. Clinic admin branch/settings aur roles check kare → test user banaye.
3. Test patient → appointment → session → billing workflow ko non-production setup mein verify kare.
4. Plan limits, trial expiry, billing aur staff permissions check kare.
5. Dusri test organization ke saath isolation test kare: doosri organization ka record ID/API se bhi access nahin hona chahiye. Sirf UI na dikhne se security prove nahin hoti.

## 5. `/brag` kya hai aur use kaise karein?

[latent-spaces/brag](https://github.com/latent-spaces/brag) clinic management software nahi, balki AI coding agent ke liye **skill** hai jo project ka short launch video banane mein help karta hai. Agent project inspect karta hai, storyboard banata hai aur default workflow mein Hyperframes se video render karta hai. `/brag` khud comprehensive security audit ka substitute nahi hai.

Repository README ke hisab se supported agent, Node.js 22+, FFmpeg aur `npx hyperframes` chahiye. **Claude Code** mein agent ke andar:

```text
/plugin marketplace add latent-spaces/brag
/plugin install brag@brag
```

Phir apne project folder mein agent se ` /brag ` bolein. Voiceover opt-in hai: `/brag --voice`. Dusre supported agents ke liye:

```bash
npx skills add https://github.com/latent-spaces/brag --skill brag
```

README ke mutabik result aam taur par `brag-output/` mein `brag.mp4`, plan aur share copy hota hai. `--tone`, `--format`, `--duration` jaise options bhi hain. Tool installations ko apne environment mein review karein; patient data aur credentials ko public video mein na bhejein.

**Is deliverable ka workflow:** `/brag` ke ideas aur bundled music se custom illustrative video banaya gaya hai; yeh actual `/brag` ya Hyperframes command ka render nahin hai. Isme voiceover nahin hai.

## 6. Safety aur limitations

- `README.md` is checkout ko read-only production snapshot kehta hai; yahan live production database, uploads aur secrets shamil nahin hain. Seed/backfill, database reset, delete ya deploy commands live par na chalayein.
- Source mein tenant aur platform login ke OTP blocks disabled hain. Isliye 2FA enabled hone ka assumption na karein. Admin se secure authentication par baat karein.
- `organizationId` kai models mein nullable hai; isolation ko independently test karna zaroori hai. Is guide ne production isolation certify nahi kiya.
- Seed scripts mein demo passwords ka zikr README karta hai. Agar production par use hue hon to administrator se unhe turant rotate/disable karwa kar verify karein.
- Video audio credit: Music: Sascha Ende, ende.app, “Happy Beats / Business Moves Vol. 1”, CC BY 4.0. SFX: Kenney / bundled CC0 effects.
