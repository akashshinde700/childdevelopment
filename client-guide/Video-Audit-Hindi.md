# Clinic training video — audit aur limitations

## Kya deliver hua
- Updated combined Hindi-voice overview lagbhag 5 minute 4 second ka hai aur 13 topic-wise clips hain. Clips combined video ke hi chapters hain, alag se detailed demonstrations nahi.
- Four naye chapters: fictional patient journey, corrections, parent portal requests aur role-wise kaam. Full video mein optional Hindi subtitle track aur alag .srt file hai; timing approximate hai.
- Illustrative slides hain; app ke real interactive screens ya live patient data ki recording nahi. Video mein clinic client ka workflow hai; platform administration nahi.
- Written guide mein modules ki zyada detailed instructions hain. Menu aur permissions live version/role/plan ke mutabik alag ho sakti hain.

## Coverage review
Dashboard/login, Settings, branch/users, Patients/Patient History, Appointments, Packages, Therapy Sessions, Assessments, Billing/Payments/Expenses, Employees, Attendance/Leaves, Payroll/Therapist Earnings, Reports/Exports, Parent Login/Portal, Print, Projection aur Subscription covered hain. Pehle version mein communication/history ko alag se prominent coverage nahi mili thi; final mein supplementary chapter mein Patient History, Parent Portal, Leads aur WhatsApp records (availability par dependent) add kiye.

## Tests
- Video banane wale renderer ne har slide ke text bounds frame ke andar check kiye. Pehle 25 slides ka contact sheet dekha gaya; baad ki slides wahi measured layout use karti hain, lekin unka manual visual review nahi hua. Yeh automated check text ke frame boundaries ka hai, real app ke responsive layout ka nahi.
- FFmpeg se full video aur har chapter ka complete decode kiya: koi error output nahi mila. Final file H.264 video, AAC audio, 1280×720, 30 fps hai; duration lagbhag 3:19 hai.
- Audio track volume measurement: peak approximately -2.1 dBFS; yeh loudness ya human listening quality ki guarantee nahi.
- Video ke visible slide definitions check kiye; platform administration label nahi hai. Voice scripts mein bhi clinic-only wording rakhi.

## Kya verify nahi hua
- Live clinic, database, login, permissions, billing, OTP, parent access, cross-tenant security aur app ke real mobile/desktop overflow ka functional test nahi hua. Test environment/data available nahi tha. Isliye application ko certified ya bug-free nahi kaha ja sakta.
- Narration ka human listening review aur frame-by-frame playback audit nahi hua; slides narration ki duration ke barabar portions mein divided hain, isliye har line exact voice ke saath sync ho ye guarantee nahi. Full video mein optional Hindi subtitles hain, lekin cues approximate proportional timing se bane hain, forced alignment ya human correction nahi hui. Individual clips mein subtitle track nahi hai.
- Visuals static instructional cards hain, real button-by-button demo nahi. Short overview mein har field aur exceptional workflow cover nahi hua; detailed guide padh kar aur demo clinic mein hands-on practice karke use karein.
- Live delivery se pehle authorized team test environment mein actual screen recording, permissions, UI fit, data protection, session/package accounting aur billing reconciliation verify kare.
