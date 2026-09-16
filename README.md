# neolog

**A permanent personal record.** You put things in — typed, spoken, photos,
files — and the log keeps them, in order, dated twice, with the way back to
every word.

## What it does that nothing else does

**It never puts words in your mouth.** Every line says who wrote it. A line
the log composed from a file's metadata is marked as the log's, always,
including the ones that read naturally.

**It reads your recordings without a model.** Four hundred vlogs become
entries by cutting the transcript at your own pauses — a 2.5-second gap
between two words is a fact about the recording, not a judgement about your
thoughts. Every entry is a contiguous run of what you said, at the second you
said it. Nothing summarises, nothing paraphrases.

**It closes the loop on your phone.** A file is hashed in the browser before
it leaves, hashed again once stored, and compared. Only then does anything
say it is safe to delete locally — and the row names which check ran.

## The shape

Two times on every entry: when it *happened* and when it was *logged*. Seven
kinds. Burial, never deletion. Public by default, with the log holding back
what it recognises as an identity document, a statement, a medical letter —
and saying what it saw rather than giving an unnamed reason.

The nav is three entries: **home · search · index**. Everything else is
reached from the page it belongs to.

## Running on

Cloudflare, entirely. Pages, R2 (the recordings), D1 (the log), Workers,
Workers AI (Whisper), Access, and FFmpeg in a Container Worker. One bill.

## History

Until 8 Sep 2026 this repo was an AI video-essay studio — Subjects, Topics,
Spark, a librarian, a production engine, voice cloning, b-roll. All of it was
deleted, along with every table it wrote into. The operator's reason: *"the
problem with the old system was i didn't trust its output anyway."* The
recordings in R2 are the only thing that survived, and the log now reads them
with no model in the path.

`CLAUDE.md` is the working document — read it before changing anything.
