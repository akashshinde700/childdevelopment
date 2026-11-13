# Video improvements — review notes

## Is update mein

1. Full video ka chapter order badla: introduction → setup → patients/clinical work → patient journey → corrections → billing/HR → reports/parent → daily closing checklist. Purane version mein closing checklist ke baad aur chapters aa rahe the.
2. Full MP4 mein 13 named chapter markers add kiye aur [chapter index](CHAPTERS.md) banaya. Player chapter navigation support kare to direct jump kar sakte hain; index ke links se individual clips khol sakte hain.
3. Subtitle file ko naye chapter order ke mutabik regenerate karke selectable Hindi subtitle stream dobara add ki. UTF-8 `.srt` sidecar bhi available hai. Timing narration ke text length par approximate hai; precise speech alignment verified nahi hai.
4. Combined video ko FFmpeg se decode kiya; video aur audio decoding mein koi error report nahi hua. Metadata mein 13 chapters aur Hindi subtitle stream verify hui. Subtitle structure check: 73 cues, maximum 2 lines per cue, line length 51 characters ya kam; ek cue approximately 1.48 seconds hai. Yeh reading speed ya accurate synchronization ki guarantee nahi hai.

## Abhi bhi zaroori

- Actual app screen capture aur end-to-end workflow test bina safe test clinic ke nahi ho sakta. Yeh illustrated training hai, actual interactive demo nahi.
- Subtitle timing aur Hindi narration ka human playback/listening review, caption correction, scene-by-scene sync, mobile UI overflow aur real feature/permission verification pending hain.
- Alag chapters short summaries hain; sabhi forms aur role-specific exceptional workflows cover nahi karte. Detailed written guide saath dein.
- Chapter markers/selectable subtitle support player par depend karta hai. Agar player subtitles na dikhaye to `.srt` file load karein.
