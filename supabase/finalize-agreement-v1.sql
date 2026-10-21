-- AXZIO | ARRIVAL — finalize Beta Testing Agreement v1.0
-- Run ONCE in the SQL Editor of the axzio-arrival-beta project.
-- Replaces the placeholder v1.0 seed with the completed text
-- (entity: Nova Labs, contact: affinitymojo3@gmail.com,
-- effective October 21, 2026). Safe: no tester has accepted v1.0 yet.

delete from beta_agreements where version = '1.0';

insert into beta_agreements (version, effective_date, title, body, active)
values (
  '1.0',
  '2026-10-21'::date,
  'AXZIO | ARRIVAL — Beta Testing Agreement',
  $AGREEMENT$
DRAFT — FOR ATTORNEY REVIEW. Version 1.0. Provider: Nova Labs ("NE3ULA"). Contact: affinitymojo3@gmail.com. Product: AXZIO | ARRIVAL (the "Beta").

You must be 18 years or older to participate in the Beta.

A. CONFIDENTIALITY
The Beta, and everything you learn through it that is not public, is confidential information belonging to NE3ULA ("Confidential Information"). This includes nonpublic application features, workflows, product designs, business information, technical materials, development plans, and related materials provided to you as a tester. You agree to keep Confidential Information confidential, use it only to evaluate the Beta as authorized, not disclose it to any third party, and protect it with at least the care you use for your own confidential information. Confidential Information does not include information that: is or becomes publicly available through no fault of yours; you lawfully received from a third party without a duty of confidentiality; you independently developed without using Confidential Information; or must be disclosed by law or court order (where legally permitted, you will notify us promptly so we may seek protection).

B. LIMITED EVALUATION LICENSE
We grant you a personal, limited, revocable, non-exclusive, non-transferable right to access and use the Beta solely to evaluate it and provide feedback. This is a license to evaluate only — it is not a sale, and it does not grant any other rights.

C. RESTRICTIONS ON USE
Subject to applicable law, you agree not to: copy or redistribute the Beta or its nonpublic materials; share your login credentials, invitation, or access links with anyone; provide unauthorized third parties with access to the Beta; publish nonpublic screenshots, recordings, or descriptions of the Beta; reverse engineer or extract proprietary materials from the Beta, except where this restriction is prohibited by applicable law; use Confidential Information to build, or help build, a competing implementation of the Beta's nonpublic features; or use confidential beta materials for any commercial purpose. Nothing in this Agreement prohibits lawful independent development that does not use Confidential Information, or any conduct that cannot legally be restricted.

D. INTELLECTUAL PROPERTY OWNERSHIP
The Beta, AXZIO, NE3ULA, and all underlying code, designs, branding, and proprietary materials are and remain the property of NE3ULA and its licensors. This Agreement does not transfer any ownership to you. All rights not expressly granted are reserved.

E. FEEDBACK PERMISSION
If you voluntarily submit feedback, suggestions, or bug reports, you grant NE3ULA permission to use them for product development and any other lawful purpose, without additional compensation, subject to applicable law. This does not give NE3ULA ownership of your personal journal entries, reflections, intentions, or other private user content. Your private reflections remain yours (see the Privacy Notice).

F. BETA DISCLAIMERS
The Beta is experimental, unfinished software provided "as is." Features may change, fail, or disappear without notice; access may be interrupted or revoked at any time; data loss is possible — do not rely on the Beta to store anything you cannot afford to lose; continuous availability is not guaranteed; participation is entirely voluntary. To the maximum extent permitted by applicable law, NE3ULA disclaims all warranties, express or implied, and will not be liable for indirect, incidental, or consequential damages arising from participation in the Beta. Nothing in this section limits liability that cannot lawfully be limited. AXZIO is a self-reflection and personal development tool. It is not medical, psychological, or emergency treatment, and it is not a substitute for professional care.

G. TERMINATION
Either party may end your participation at any time. We may revoke Beta access at our discretion, including for violation of this Agreement. Upon termination, your access ends and you must stop using Confidential Information. The confidentiality obligations in Section A survive termination for two (2) years, except where a longer or shorter period is required by law. Sections D, E, and F survive as applicable.

H. GOVERNING LAW
This Agreement is governed by the laws of the State of California, United States, without regard to conflict-of-law rules. Disputes arising under this Agreement will be resolved in the state or federal courts located in California.

This draft has not been reviewed by an attorney and is not legal advice. It is not, by itself, a guarantee of a legally binding signature mechanism.
$AGREEMENT$,
  true
);
