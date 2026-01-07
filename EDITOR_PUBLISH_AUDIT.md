# Editor & Publish Flow Audit: Before/After Table and Refactor Plan

## Before/After Table

| Control                | Before (Location)      | After (Location)         |
|------------------------|-----------------------|--------------------------|
| Title                  | Editor (inline)       | Editor (inline)          |
| Subtitle               | Editor (inline)       | Editor (inline)          |
| Content                | Editor                | Editor                   |
| Cover Image            | Publish panel         | Editor (inline, or defaulted) |
| Tags                   | Publish panel         | Publish dialog (suggested, not required) |
| Vault Attachments      | Publish panel         | Publish dialog (suggested, optional) |
| Premium Toggle         | Publish panel         | Advanced toggle (hidden by default) |
| Publication            | Publish panel         | Publish dialog (defaulted, can override) |
| Scheduling             | Publish panel         | Publish dialog (hidden unless enabled) |
| Visibility             | Publish panel         | Publish dialog           |
| Post Type (Pulse, etc) | Publish panel         | Advanced toggle (hidden) |
| Distribution Tools     | Publish panel         | Advanced toggle (hidden) |
| Metadata/SEO           | Publish panel         | Advanced toggle (hidden) |
| Canonical URL/Source   | Publish panel         | Advanced toggle (hidden) |
| Version History        | Advanced/hidden       | Advanced/hidden          |
| Import/Export          | Advanced/hidden       | Advanced/hidden          |

---

## New Interaction Flow

1. **Edit:**
   - User writes post, sets title/subtitle, optionally sets cover image inline.
   - Content, cover, and basic info are always visible and editable.
2. **Publish:**
   - User clicks “Publish” → dialog opens with:
     - Visibility (required)
     - Publication (defaulted, can override)
     - Tags (suggested, not required)
     - Scheduling (hidden unless enabled)
     - Vault attachments (suggested, optional)
     - Advanced toggle for rare options (Pulse, distribution, metadata, etc.)
3. **Confirm:**
   - User confirms publish; system applies defaults and infers where possible.

---

## Refactor & Implementation Plan

### 1. UI Refactor
- Move title, subtitle, and cover image inline in the editor.
- Remove catch-all publish side panel; implement a focused publish dialog/modal.
- In the publish dialog, show only: visibility, publication (defaulted), tags (suggested), scheduling (hidden unless enabled), vault attachments (suggested), and advanced toggle for rare options.
- Move distribution toggles, metadata fields, and advanced options to be hidden behind an advanced toggle.

### 2. Defaults & Autofill
- Default publication set per workspace/user, autofilled in publish dialog.
- Cover image: if empty, use first image in content, else publication default, else none.
- Tags: suggest from recent tags/content, not required.
- Scheduling: hidden unless user enables, default to “publish now.”
- Vault attachments: suggest likely related items, manual attach optional.

### 3. Complexity Gating
- Hide Pulse and other post types, distribution, and metadata behind an advanced toggle.
- Remove any setting that introduces a new mental model without proven demand.

### 4. Types & API
- Update post types and API calls to support new structure and defaults.
- Ensure API can infer cover image and tags if not provided.
- Add support for user/workspace-level defaults in backend.
- Maintain backwards compatibility for legacy posts.

---

**Ready for implementation.**
