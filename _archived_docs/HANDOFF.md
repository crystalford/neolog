## Handoff Notes for Next Agent

### Completed
- Export route now threads the `publicationSlug` through all formats (JSON, Markdown, HTML) so generated filenames and metadata match the canonical publication URL.
- Helper signatures were updated, and `npm run lint` / `npm run build` both succeed.

### To Do
1. Resume the broader “polish” work: dashboard microcopy, empty states, post-page alignment (title/subtitle margins, toolbar/data alignment, notification box sizing), and accessibility labels/focus states.
2. Revisit the HTML import workflow so it shows the imported markup inside the editor and gives clearer status feedback; consider options for editing imported HTML or splitting HTML import into its own workflow/page.
3. Leave documentation/migration notes for the publication slug change if needed later (per earlier discussion, not required immediately).
4. Push the build to the `main` branch once the remaining polish passes are applied.
5. Add a tiny doc or comment change (like this one) when you need to retrigger Vercel so builds rerun even if nothing else changed.

Feel free to continue from here: the repo is ready for another pass once you finish the outstanding polish items.
