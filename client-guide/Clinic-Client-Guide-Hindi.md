# Clinic Software — Client User Guide
## Bilkul basic se: pehle setup, phir roz ka kaam

**Kiske liye:** clinic owner, administrator, receptionist, therapist aur accounts/HR staff.  
**Bhasha:** simple Hindi (Roman script), screen par dikhne wale English button names ke saath.  
**Important:** Yeh guide repository ke available legacy source snapshot ko padhkar banayi gayi hai. Live software ka version, screen, permissions, buttons aur plan alag ho sakte hain. Live database aur login ke saath end-to-end test nahi hua hai. Jahan koi step screen par na dikhe, admin/support se verify karein. Kisi feature ko bina testing ke guaranteed na samjhein.

---

## 1. Sabse pehle — yeh software kya karta hai?

Is software mein clinic patient ki basic details, appointments, therapy sessions, assessments, packages, billing, staff attendance aur reports manage kar sakta hai. Har staff member ko apne role ke hisaab se alag menu dikh sakta hai. Kuch features subscription ya permission par depend kar sakte hain.

### Aasaan shabd

- **Organization:** aapka clinic/business account. Do alag clinic businesses aam taur par alag organizations hote hain.
- **Branch:** us clinic ki ek location, jaise Pune branch. Ek organization mein ek ya multiple branches ho sakti hain, plan par depend karke.
- **Patient:** child ya client jiska record clinic maintain karta hai.
- **Appointment:** patient ko kis date/time par kis therapist se milna hai.
- **Therapy session:** actual planned ya completed therapy work aur uske notes.
- **Assessment:** patient ki evaluation, findings, goals aur recommendations ka record.
- **Package:** sessions aur pricing ka plan; template ko patient ko assign kiya ja sakta hai.
- **Invoice:** patient ko payable bill. **Payment:** mila hua paisa ka record. Dono alag hain.
- **Role:** user kya dekh aur kar sakta hai, jaise admin, receptionist ya therapist.
- **Platform Admin:** software provider ka multiple clinics manage karne wala account. Clinic client ke daily kaam ke liye aam taur par zaroori nahi.

## 2. Kaam karne ka sahi order

Pehli baar: **login → clinic settings → branch check → staff/users aur permissions → therapy/package setup → test patient → appointment → session/assessment → invoice/payment → reports check**.

Har roz: **dashboard check → patients/appointments → session status aur notes → payment entry → attendance/leave → din ke records verify**.

Har mahina: **attendance/leave verify → therapist rates aur earnings verify → payroll review → invoices/payments/expenses reconcile → reports/export review**.

> Pehle test clinic ya authorized test environment mein fictional details se practice karein. Live patient ke naam, medical records ya payment details ko training screenshots/videos mein na dikhayein.

---

## 3. Pehli baar login aur setup

### 3.1 Login
1. Clinic admin se software ka sahi website address aur apna clinic login lein. Platform Admin login aur clinic user login alag hain.
2. Clinic login screen par apna **email aur password** daalein, phir sign in karein.
3. Temporary password private channel se lein aur first login ke baad apna password badlein. Login credentials colleagues ke saath share na karein.
4. Menu nahi dikhe ya access denied aaye to clinic admin se role aur plan check karayein; kisi aur user ka login use na karein.
5. Kaam ke baad logout karein, khaaskar shared computer par.

**Security note:** source snapshot mein tenant aur platform login ke OTP code paths disabled hain. Settings mein OTP label dikhne se OTP chalne ki guarantee nahi; actual deployment ko provider se confirm karayein.

### 3.2 Settings — clinic ki pehchaan
1. Sidebar se **Settings** kholein.
2. **Center Information** mein center name, phone, email aur address check karein.
3. Logo upload karein aur GST number sirf sahi registration details ke saath bharein. Save/update button dabakar result verify karein.
4. **Login Account** mein apna name/email/password update karne ke options dikh sakte hain. Screen par “Center Password” ko login password na samjhein: source mein use center record ke liye alag bataya gaya hai.
5. Print layout/letterhead set karne ke baad ek test print dekhein; asli patient record use na karein.

### 3.3 Branch aur user setup
1. Authorized admin **User Management → Branches / Branch Management** mein existing branch check kare.
2. Zaroorat aur plan permission ke mutabik branch banaye ya edit kare: name, code, address, contact. Screen ke mutabik branch code baad mein change na ho sakta hai — save se pehle verify karein.
3. **Users** mein staff ka naam, email, role aur branch set karein. Therapist ka kaam bhi karne wale owner ke liye **Also takes therapy sessions** / specialization ka option mil sakta hai.
4. Har user ko minimum required access dein. Receptionist ko clinical/admin permissions sirf zaroorat par dein; therapist ko apna kaam dikh raha hai ya nahi test karein.
5. **Employees** HR record aur user login same cheez nahi hain. Employee form mein **Create login account** ka option ho sakta hai; duplicate login banane se pehle check karein.
6. Access band karna ho to admin se account status review karayein. Delete karne se pehle consequences aur backup confirm karein.

### 3.4 Therapy aur package setup
Settings mein available therapy types/configuration check karein. **Packages** mein existing package templates dekhein; clinic ki approved pricing, session count, duration aur validity ke mutabik authorized admin template banaye/edit kare. Template banane aur patient ko package assign karne mein fark hai. Rates aur tax apne accountant/clinic policy se confirm karein.

---

# 4. Har module ka istemal

## A. Dashboard
**Kya hai:** clinic ki summary aur relevant daily information. Role ke hisaab se content badal sakta hai.

1. Login ke baad **Dashboard / My Dashboard** kholein.
2. Available date filter aur cards check karein; aaj ke appointments aur pending work dekhein.
3. Agar attendance check-in card dikh raha ho aur clinic ki policy yahi ho, apna check-in karein. End of day check-out karein.
4. Kisi count par doubt ho to relevant Patients, Appointments ya Billing module mein actual records check karein; dashboard summary ko final accounting proof na maanein.

## B. Patients — naya patient record
**Kaun:** authorized receptionist/admin; therapist ko permissions ke hisaab se view mil sakta hai.

1. **Patients / My Patients** kholein. Search se naam, patient ID ya mobile check karein taaki duplicate record na ban jaye.
2. Naya patient add karne ka option kholein. Child ka naam aur form mein maangi gayi required details bharein; parent names, mobile, date of birth/gender aur address carefully verify karein.
3. Medical history, birth history, diagnosis, school details aur Aadhaar jaise sensitive fields sirf zaroorat, consent aur clinic policy ke mutabik bharein. Optional fields ka andaaza laga kar data na daalein.
4. Save karein; generated patient ID aur profile check karein. Naam spelling aur contact number parent se confirm karein.
5. List mein **View Profile** se patient details, packages, assessments, invoices ya uploaded reports ke available sections dekhein. **Edit** se authorized correction karein.
6. Delete action risk wala hai; source UI reason maang sakti hai. Data delete karne se pehle clinic policy, approval aur backup confirm karein.

**Example:** fictional child “Aarav Demo” ka record banayein; test phone/email hi use karein. Practice ke baad test data ko policy ke hisaab se handle karein.

## C. Patient History
1. **Patient History** kholein aur authorized patient select/search karein.
2. Available history aur appointments/session details ko date ke hisaab se review karein.
3. Agar report/print option use karte hain, document sahi patient ka hai ya nahi aur recipient authorized hai ya nahi check karein. History incomplete ho to therapist/admin se verify karein.

## D. Appointments — time book karna
1. **Appointments / My Appointments → Schedule Appointment** kholein.
2. Patient, appointment type, therapist, date, start/end time aur screen par required fields select karein. Zaroorat ho to package link karein; UI mein package link optional ho sakta hai.
3. Date, therapist aur duration patient ke saath confirm karke save karein. Calendar/list par record check karein.
4. Appointment open karke available **Manage**, attendance, status, reschedule ya cancellation actions ka use authorized policy ke mutabik karein. Cancellation/reschedule par reason carefully bharein.
5. Parent ko details bhejne ka action available ho sakta hai. Bhejne se pehle number, content aur consent verify karein; message delivery ko alag se confirm karein.

**Yaad rakhein:** appointment book hona aur therapy session complete hona ek hi cheez nahi. Dono screens ka status check karein.

## E. Packages — template aur patient assignment
1. **Packages → Add New Package** mein approved template banayein: therapy type(s), session count, session duration, amount aur required details. Save se pehle clinic rate verify karein.
2. Patient ko dena ho to **Assign Package** kholein, patient aur template select karein. Price, dates, sessions aur terms check karke confirm karein.
3. Available **Schedule Sessions / Auto-generate schedule** mein therapist, frequency, preferred time ya days chunein. Generate karne se pehle dates/conflicts aur baad mein generated schedule verify karein.
4. Package summary mein remaining sessions, expiry aur pending payment check karein. Unexpected count ya amount ho to double entry karne ke bajay admin/support se investigate karein.
5. Template delete aur patient ko assigned package delete alag actions ho sakte hain; authorized approval ke bina delete na karein.

## F. Therapy Sessions — actual therapy aur notes
1. **Therapy Sessions → Add Session / New Therapy Session** ya available **Open Scheduler** kholein.
2. Patient, therapy, therapist, date/time, duration aur room select karein. Applicable patient package aur session charge check karein.
3. Session save karein. Therapist apne scheduled work aur status dekhe.
4. Session hone par authorized user relevant status update kare aur **SOAP Notes**/notes bhare: subjective, objective, assessment aur plan jahan screen par available hon. Clinical content trained professional aur clinic policy ke hisaab se likhe.
5. Reschedule/cancel/no-show ka appropriate action use karein, aur package balance/status ke effect ko verify karein. Sirf status change dekhkar billing effect assume na karein.

## G. Assessments
1. **Assessments** mein existing patient aur assessment type select karke naya assessment start karein; assigned therapist aur date verify karein.
2. Therapist history, findings, goals, diagnosis/recommendations aur other displayed fields clinically appropriate tareeke se bhare.
3. Draft ya in-progress work review karein. **Complete Assessment / Confirm Complete** final karne se pehle patient aur content verify karein. Reopen action available ho sakta hai, permissions par depend karta hai.
4. Report/document upload ya export se pehle consent, file content aur access rights check karein.

## H. Billing & Invoices
1. **Billing & Invoices → Create Invoice** kholein aur sahi patient choose karein.
2. Available package aur additional service select karein. Amount, discounts, GST applicability aur total clinic ki approved policy ke mutabik verify karein.
3. Invoice create karke number, total aur balance check karein. **Paid / Partially Paid / Overdue** jaise statuses available ho sakte hain.
4. Payment record karne se pehle check karein ki payment pehle se enter to nahi hua. Receipt/print/export se pehle patient name aur amount verify karein.
5. Tax ya accounting treatment ke liye accountant se confirm karein; software calculations ko automatically legally correct na maanein.

## I. Payments
Aapke role/version mein standalone **Payments** page dikhe ya payment entry billing/session ke andar mile, isliye available screen ke mutabik kaam karein.

1. Patient aur applicable invoice link select karein (standalone form mein invoice link optional ho sakta hai).
2. Amount, payment mode (cash, card, bank transfer, cheque etc.), date aur reference verify karein.
3. Save ke baad payment summary, invoice balance aur receipt ko reconcile karein. Advance/refund sirf clinic policy aur authorized approval se record karein.
4. Real bank/card details training mein expose na karein.

## J. Expenses
1. **Expenses** mein new expense ka action kholein.
2. Date, category, description, vendor, amount aur payment mode bharein. Bill upload sirf authorized file aur permitted data ke saath karein.
3. GST amount aur status (pending/approved/rejected) policy ke mutabik review karein; save ke baad list mein verify karein.
4. Filter/date range se expense review karein. Delete/approval sirf authorized staff kare.

## K. Employees
1. **Employees** mein existing staff search karke duplicate avoid karein.
2. Add/edit employee mein name, contact, department, designation, joining details aur branch bharein. Salary, bank aur identity documents confidential hain; sirf authorized HR/accounting user handle kare.
3. Agar login account bhi create karna hai to displayed **Create login account** option aur role/branch verify karein. User Management mein access alag se check karein.
4. Employee inactive karne ya documents delete karne se pehle HR policy aur access impact check karein.

## L. Attendance
1. **Attendance / Mark Attendance** kholein. Check-in/check-out available ho to staff apni actual timing record kare.
2. Authorized HR date aur employee select karke status/times review ya edit kar sakta hai. Notes mein correction ka reason likhna achha practice hai.
3. Monthly/yearly attendance report export karne se pehle date range aur records check karein. Payroll se pehle mismatches resolve karein.

## M. Leaves
1. **Leaves / Apply Leave** kholein; leave type, start/end date aur reason fill karke request submit karein.
2. Employee pending/approved/rejected status aur remaining balance check kare.
3. Authorized manager request review karke approve/reject kare. **Leave Policy Settings** mein limits/carry-forward ka effect change karne se pehle HR policy verify karein.
4. Approved leave aur attendance payroll run se pehle compare karein.

## N. Payroll
1. Authorized payroll user month/pay period select kare. Staff salary setup, attendance, approved leaves, allowances, deductions aur applicable session earnings pehle verify kare.
2. Payroll records generate/process karne ke available action ka use karein; har employee ke gross, deductions aur net pay review karein.
3. Salary slip aur payment status update karne se pehle accounts approval aur actual payment verify karein. Lock/unlock ya delete ka action bina authorization na karein.
4. Payroll calculations, taxes aur statutory compliance apne payroll professional se independently verify karein.

## O. Therapist Earnings
1. **Therapist Earnings** mein therapist aur available period/filter select karein.
2. Service type, session count, rate, amount aur status ki breakdown dekhein.
3. Rates aur completed session data ko source records se compare karein; payroll mein include/paid hone ka assumption na karein. Discrepancy ho to authorized admin se review karein.

## P. Reports
1. **Reports** kholein, relevant report aur date range/month select karein.
2. Patient, appointments, finance, attendance ya available report sections review karein. Figures ko underlying records se reconcile karein.
3. Report share karne se pehle patient/staff sensitive data aur recipient authorization check karein. Report plan/role par depend kar sakti hai.

## Q. Exports
1. **Exports** mein module aur from/to date select karein.
2. Screen par available export action run karein; downloaded file ka period aur data verify karein.
3. Export mein sensitive records ho sakte hain. Secure storage/access control use karein, aur unauthorized WhatsApp/email par share na karein. Current plan mein exports disabled bhi ho sakte hain.

## R. Parent aur Parent Login
1. **Parent** module mein parent contact ko sahi child/patient se link karne ka option hai. Naam, email, phone aur child identity carefully verify karein.
2. **Parent Login → Create Parent Credentials** se authorized staff selected patient/parent ke liye credentials set kar sakta hai. Email aur child dobara verify karein; password securely share karein.
3. Parent apne login se portal mein available appointments, package progress, assessments, therapy notes aur payment history dekh sakta hai. Actual visibility role/version par depend karti hai.
4. Portal access dene se pehle authorization aur consent verify karein. Reschedule/review options dikhne par parent request bhej sakta hai; clinic ko request review karni pad sakti hai — automatic confirmation assume na karein.

## S. Print
1. **Print** module kholein aur document content type/paste karein.
2. **No Header/Footer**, **Custom Header/Footer Images** ya **Clinic Letterhead** mein suitable option chunein.
3. Preview mein correct patient, page breaks, header/footer aur private details verify karein; phir authorized printer par print karein. Printed copy secure rakhein.

## T. Projection
1. **Projection** mein month/year aur branch filter chunein.
2. Available projected, received, pending payments aur monthly summary check karein.
3. Projection estimate hai; actual collections aur accounting records se reconcile karein. Is report ko payment receipt ka substitute na samjhein.

## U. Subscription
1. **Subscription** screen mein current plan/features aur branch, staff users, therapist usage/limits dekhein.
2. Limit tak pahunchne par provider/platform admin se plan aur billing options discuss karein. Prices/limits live screen se verify karein; old seed values ko quote na karein.
3. Plan change se pehle existing users/features par impact aur effective date confirm karein.

## V. Leads & Inquiries — agar menu/permission mein dikhe
1. **Leads & Inquiries** mein contact/child details, concern aur source enter karein; consent aur minimum data policy follow karein.
2. Assigned person aur status (jaise contacted/interested/registered/dropped) update karein.
3. Lead ko patient banana ho to available workflow aur duplicate check follow karein. Automatic conversion ka assumption na karein.

---

# 5. Ek poora practice example

Sirf test environment mein fictional data ke saath:

1. Admin clinic settings aur branch verify kare, ek demo receptionist aur therapist ko appropriate roles de.
2. Receptionist patient search kare; “Aarav Demo” nahi mile to new patient record save kare, ID note kare.
3. Clinic-approved demo package template check kare; zaroorat ho to patient ko assign kare.
4. Patient, therapist aur test date/time se appointment book kare; calendar/list check kare.
5. Therapist session entry/status aur permitted clinical test notes update kare; package balance verify kare.
6. Accounts test invoice banaye, test payment record kare, amount/balance/receipt compare kare.
7. Dashboard aur report mein same date ka summary check kare. Koi figure mismatch ho to record duplicate na banayein; support se review karein.
8. Parent portal ko sirf authorized demo parent account se test karein. Doosre patient ka data accessible nahi hona chahiye; yeh access control provider ko independently verify karna hoga.

# 6. Client ke common sawaal

**Menu nahi dikhta?** Role, branch, subscription aur live version admin se check karein.  
**Therapist list khaali hai?** Therapist user active hai, sahi branch/role aur relevant “takes sessions” setup hai ya nahi admin se check karein.  
**Galat appointment?** Authorized reschedule/cancel action use karein; reason aur new date check karein.  
**Payment galat?** Duplicate entry na karein; accounts/admin ko transaction details privately batayein aur approved correction process follow karein.  
**Password bhool gaye?** Authorized clinic admin/provider se reset karwayein; password ya OTP chat/group mein na bhejein.  
**Data dikh nahi raha?** Date filter, patient selection aur permissions check karein; refresh ke baad bhi problem ho to record ID aur time support ko securely dein. Sensitive data publicly share na karein.

# 7. Daily / monthly checklist

**Opening:** login → dashboard/date check → aaj ka schedule → missing staff/room verify.  
**During day:** patient identity confirm → appointment/session status aur notes timely update → payment ka accurate record.  
**Closing:** pending appointments, session notes, receipts aur cash/bank reconciliation check → logout.  
**Monthly:** attendance/leaves → earnings/payroll → finance reconciliation → reports → secure export/backup according to clinic policy.

# 8. Security aur handover

- Patient health records, child information, bank details aur passwords private rakhein; access sirf authorized staff ko dein.
- Example clinics/patients imaginary hon. Public screenshots ya videos se names, contact details, credentials aur medical records hataayein.
- Live app ka role access, OTP, data isolation, backup/restore aur subscription limits provider se independently verify karayein.
- Production par practice ke liye patient/branch/organization delete, database reset, seed ya backfill na chalayein.
- Is snapshot ke repository README mein hardcoded demo credentials ke baare mein warning hai: agar kabhi production mein use hue hon, authorized administrator se rotate/disable karke verify karayein.

**Training ke liye recommendation:** clinic owner, receptionist, therapist, accounts/HR aur parent ko unke role ki demo training alag dein; har training ke baad fictional record par hands-on verification karein.
