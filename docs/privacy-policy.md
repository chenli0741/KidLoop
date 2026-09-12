# Privacy policy page

- Public English policy: `https://kid-loop.vercel.app/privacy.html`
- Source: `public/privacy.html` (static, no authentication or database dependency).
- Operator: Li Chen.
- Privacy contact: chenli0741@gmail.com (provided by the operator on 2026-09-07).
- Scope: accounts, children and photos, transportation records, service providers and maps, session preferences, retention, and access/deletion requests.
- App Store Connect: use this URL in the English (United States) Privacy Policy URL field. The separate App Privacy data-type declarations still need to match actual data collection.
- This change creates the public policy page; it does not add an in-app policy entry point or a self-service account deletion feature.

## Support page

- Public English support page: `https://kid-loop.vercel.app/support.html`.
- Source: `public/support.html`.
- Contact: Li Chen, chenli0741@gmail.com.
- Covers account access, schedule issues, photo permissions and privacy requests.
- Use this in the English (United States) Support URL field of the App Store version.

## 2026-09-11 update

- English privacy and support URLs remain unchanged; added `/privacy-zh.html` and `/support-zh.html` for Simplified Chinese.
- All four pages are public static HTML, with same-tab, same-origin language and policy/support links. Email remains readable text to avoid launching an external mail application.
- Updated disclosures for operation location snapshots, optional on-device face comparison, cloud scheduling/voice processing, retention and deletion requests. The operator confirmed that face comparison is useful only when parents supply reference photos; recognition images and embeddings are transient on-device data, not uploaded or persistently stored by that process. Separately submitted student profile photos remain covered by storage and deletion provisions.
- These pages do not change App Store Connect privacy questionnaire answers or introduce self-service deletion/AI consent flows.
- English fields: `https://kid-loop.vercel.app/privacy.html`, `https://kid-loop.vercel.app/support.html`.
- Simplified Chinese fields: `https://kid-loop.vercel.app/privacy-zh.html`, `https://kid-loop.vercel.app/support-zh.html`.

Publication verified 2026-09-11: Vercel production build succeeded and `https://kid-loop.vercel.app` was aliased. Anonymous GET requests to all four URLs returned HTTP 200, no login redirect, and exact matching published HTML. Static link checks passed. Physical iPhone in-app navigation has not been exercised for these page links.
