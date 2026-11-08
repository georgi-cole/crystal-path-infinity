# Worldwide web signup review

Prepared 8 November 2026 for CPI-018. Worldwide availability is the product
target. The production account service is deployed and currently approves no
signup countries. The public game remains available in guest mode. This review
covers the account-only web release.

## What the deployed flow does

- The game checks the player's declared age and residence before showing an email
  field. The service checks residence and the connection country reported by
  Cloudflare. Both need approved entries and the stricter minimum applies.
- The issuer uses the age for the eligibility decision. It stores the resulting
  privacy category and country for permitted requests. The gateway passes a keyed
  peer identifier to Supabase for abuse controls. Cloudflare receives the IP, and
  GitHub Pages logs visitor IPs for security. [GitHub Pages data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)
- Resend receives the email address and message for delivery. Supabase stores the
  verified email after the code succeeds. Codes last up to ten minutes. The server
  removes the encrypted delivery payload after sending and clears expired
  challenges during scheduled maintenance. Browser session credentials live in
  the tab. Profile, export and deletion use the verified account.
- The current age screen uses self-declaration. Markets that require verified
  age or a guardian process stay closed until the required flow is available.
  Guest play provides a path for younger players.

## Territory decisions to review

These are starting points for the review. The production policy needs an approved
decision for each connection and residence code. For each code, record the legal
basis, audience classification, minimum age, approved verification method,
privacy notice version, reviewer and date. The review also needs to cover
provider availability and applicable export rules. [Supabase service terms](https://supabase.com/terms)

| Market | Evidence and review needed |
| --- | --- |
| Bulgaria | Article 25c requires a parent or guardian for consent-based processing under 14. Confirm the account's lawful basis and whether the current screen is appropriate for this game. [Bulgarian Data Protection Act](https://cpdp.bg/en/legislation/personal-data-protection-act/) |
| Other EU and EEA markets | GDPR Article 8 sets 16 as the default where consent is the basis for an online service offered directly to children. National rules can lower it to 13 through 15. Confirm the national rules and proportionate age checks for each market. [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng) · [EDPB age assurance statement](https://www.edpb.europa.eu/our-work-tools/our-documents/statements/statement-12025-age-assurance_en) |
| United Kingdom | The ICO describes parental authorisation below 13 where consent is the basis, and a risk-based choice of age assurance for services likely to be accessed by children. Assess the signup and profile features against the Children's Code. [ICO guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/how-to-use-our-guidance-for-standard-one-best-interests-of-the-child/best-interests-framework/age-assurance/) |
| United States | COPPA applies to relevant child-directed services and to other services with actual knowledge of collection from children under 13. Determine whether the game's art, presentation and marketing make it child-directed or mixed audience. The FTC's neutral-screen exception is limited. Review any applicable state rules. [FTC COPPA FAQs](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) |
| Canada | The federal privacy regulator generally expects a parent or guardian to consent for children under 13. Québec has a separate rule on collection from minors under 14 with a defined exception. Record the provincial approach before opening the Canadian country code. [OPC meaningful consent guidance](https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/appropriate-handling-of-personal-information/collecting-personal-information-and-consent/consent/gl_omc_201805/) · [Québec private sector Act](https://www.legisquebec.gouv.qc.ca/en/pdf/cs/P-39.1.pdf) |
| Brazil | The ANPD calls for a case-specific best-interests assessment for children's and teens' data under the LGPD. Confirm the legal basis and age handling for this flow. [ANPD interpretation of Article 14](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-enunciado-sobre-o-tratamento-de-dados-pessoais-de-criancas-e-adolescentes) |
| Australia | Check whether the service falls under the Children's Online Privacy Code and confirm its final requirements at release. [OAIC code and timeline](https://www.oaic.gov.au/privacy/privacy-registers/privacy-codes/childrens-online-privacy-code) |
| China | PIPL Article 31 requires parent or guardian consent and separate rules for processing data of children under 14. Review local game availability and the international data path for the hosted service. [PIPL](https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm) |
| Japan and Singapore | Review the service and data in context. Japan's PPC describes a context-dependent decision on guardian consent. Singapore's PDPC has specific guidance for children's data in the digital environment. [Japan PPC guidance](https://www.ppc.go.jp/all_faq_index/faq1-q1-62/) · [Singapore PDPC guidelines](https://www.pdpc.gov.sg/-/media/files/pdpc/pdf-files/advisory-guidelines/advisory-guidelines-on-the-pdpa-for-children%27s-personal-data-in-the-digital-environment_mar24.pdf) |
| Remaining locations and territories | Complete the local and provider review before approving their codes. The country selector offers residence values independently of eligibility. |

## Privacy notice for review

Place a short notice and a link to the full policy before the age and residence
submission. Proposed short copy follows.

> You can play Crystal Path as a guest. To create an account, we first check
> your age and where you live. If signup is available, we send a one-time code
> to your email address. You can export your account data or ask us to delete
> your account. Read the privacy notice for details.

The full notice needs the confirmed controller name and contact, the legal basis
for eligibility and account processing, the providers and transfer safeguards,
retention and backups, and how to exercise rights or make a complaint. Use the
verified account flow and each provider's actual terms to confirm those details.
The database is in Ireland. Check the processing locations for the gateway,
hosting and mail separately. [GDPR Article 13](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng)

## Launch acceptance

1. Record the approved territory entries and publish the reviewed notice with
   a monitored privacy contact. Enable the scheduled mail retry and cleanup
   handler and check its operation.
2. Verify the age boundary, unknown and conflicting countries, and that closed
   cases stop before email. Check the guest path and the privacy link on a phone.
3. Verify signup, re-entry on another device, export and deletion through a
   real authorised mailbox on production. Check that the tester store and
   controls remain in their separate build.
4. Publish the opt-in account build from main. If a country entry is withdrawn,
   confirm a support route for existing players' access and deletion requests.

[Production setup and current deployment](../RELEASE_SERVICES_SETUP_BG.md)
