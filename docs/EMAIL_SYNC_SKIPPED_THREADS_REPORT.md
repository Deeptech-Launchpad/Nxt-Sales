# Email Sync — Skipped Conversation Evidence Report

**Company:** saranya pvt ltd

Generated read-only. For every thread Gmail returns as a candidate, the real `anchorForAddresses` function from `server/src/routes/email.js` was applied. Threads below were **rejected**, with the exact clause that rejected them.

The anchor has exactly two clauses:

- **R1 (user → company):** `From` contains the connected mailbox **and** `To` contains a company address
- **R2 (company → user):** `To` contains the connected mailbox **and** `From` contains a company address

`Cc` and `Bcc` are never consulted. A thread is skipped only when **every** message in it fails both clauses.

---

## Mailbox: `dtlpsaranya@gmail.com`

Company addresses used by sync: `saranya@altiusnxt.com`, `jey@deeptechskills.com`, `adithyan@altiusnxt.com`

| | count |
|---|---|
| Candidate threads returned by Gmail | 145 |
| Anchored (imported) | 92 |
| **Skipped** | **53** |

### Skip-reason totals (by the last message evaluated)

| reason | threads |
|---|---|
| R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only) | 21 |
| R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it) | 13 |
| R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender | 7 |
| R1 failed: user is sender, but the company address is in Cc, not To | 7 |
| R1 failed: user is sender, but no company address in To | 5 |

### Full per-thread evidence

#### 1. Thread `19f4ad4a283538c5`

- **Subject:** Launch of NXT Sales CRM – Request for User Testing and Feedback
- **Messages in thread:** 1

  *Message 1* (`19f4ad4a283538c5`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Govindaraj L <govind@altiusnxt.com>`
  - Cc:   `Manoj s <manoj@altiusnxt.com>, "jency.antonyselvi@altiusnxt.com" <jency.antonyselvi@altiusnxt.com>, mohanapriya@altiusnxt.com, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 2. Thread `19e888c57912c673`

- **Subject:** Re: Nxt People Application - UAT
- **Messages in thread:** 1

  *Message 1* (`19e888c57912c673`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Shivanie Varhmen <shivanie@altiusnxt.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Balaji D <balaji@altiusnxt.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 3. Thread `19d6b9c8c9f7e149`

- **Subject:** Admin Page Brand Color Consistency Review
- **Messages in thread:** 3

  *Message 1* (`19d6b9c8c9f7e149`)

  - From: `Prabhakaran R <prabakaran@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  *Message 2* (`19d6c5d470bc558d`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Prabhakaran R <prabakaran@altiusnxt.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 3* (`19d6c7c8b0e7543d`)

  - From: `Prabhakaran R <prabakaran@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 4. Thread `19d5722b5d23b3db`

- **Subject:** ABC Schema LOV Vertical Format
- **Messages in thread:** 1

  *Message 1* (`19d5722b5d23b3db`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Rajkumar D <rkumar@altiusnxt.com>`
  - Cc:   `Saranya dtlp <dtlpsaranya@gmail.com>, Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 5. Thread `19cb77d1e709b5f2`

- **Subject:** Data Extraction From PDF
- **Messages in thread:** 3

  *Message 1* (`19cb77d9a151c616`)

  - From: `Saranya dtlp <dtlpsaranya@gmail.com>`
  - To:   `Nikil Balasubramaniam <nikil.b@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 2* (`19cd1d1de464b013`)

  - From: `Nikil Balasubramaniam <nikil.b@altiusnxt.com>`
  - To:   `Saranya dtlp <dtlpsaranya@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 3* (`19cd65417f07f694`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Nikil Balasubramaniam <nikil.b@altiusnxt.com>`
  - Cc:   `Saranya dtlp <dtlpsaranya@gmail.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 6. Thread `19c98fb2cf5285ee`

- **Subject:** LibreOffice Extension Multiple configuration
- **Messages in thread:** 1

  *Message 1* (`19c98fb2cf5285ee`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `gokul@altiussolution.com`
  - Cc:   `Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 7. Thread `19c934ec398dd300`

- **Subject:** Fwd: Error
- **Messages in thread:** 2

  *Message 1* (`19c934ec398dd300`)

  - From: `Nikil Balasubramaniam <nikil.b@altiusnxt.com>`
  - To:   `dtlpsaranya@gmail.com, Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  *Message 2* (`19c93af4aa5c9501`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Nikil Balasubramaniam <nikil.b@altiusnxt.com>`
  - Cc:   `dtlpsaranya@gmail.com, Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 8. Thread `19c6fdc12746f076`

- **Subject:** Re: Category Definition\Input\APS_Taxonomy Tree Creation_021726_Set1 final
- **Messages in thread:** 1

  *Message 1* (`19c6fdc12746f076`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Karthick B <bkarthick@altiusnxt.com>`
  - Cc:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Govindaraj L <govind@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, sanjana dtlp <dtlpsanjana@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>, Balaji dtlp <dtlpbalaji@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 9. Thread `19bda25a50e6a1fb`

- **Subject:** Launching AltiusNxt LibreOffice Extension
- **Messages in thread:** 3

  *Message 1* (`19bda25a50e6a1fb`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Karthick B <bkarthick@altiusnxt.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19bda6793d6a44f7`)

  - From: `Govindaraj L <govind@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Karthick B <bkarthick@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 3* (`19bda6ac4cd3110d`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Govindaraj L <govind@altiusnxt.com>`
  - Cc:   `Karthick B <bkarthick@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 10. Thread `19b0c40f487db75e`

- **Subject:** Review the Attached Data Scraping Rerun Output File
- **Messages in thread:** 2

  *Message 1* (`19b0c40f487db75e`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Manikandan dtlp <dtlpmanikandan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19b0c4f4a6c2c1f0`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Manikandan dtlp <dtlpmanikandan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 11. Thread `19b0c48ee1420d2b`

- **Subject:** Priority-3 Rerun 282 Skus output
- **Messages in thread:** 1

  *Message 1* (`19b0c48ee1420d2b`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `amarnath ramarav <amarnath.ramarav@altiusnxt.com>`
  - Cc:   `Rajkumar D <rkumar@altiusnxt.com>, Ramkumar G <ramkumar.govindan@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 12. Thread `19b0895493ae2e4b`

- **Subject:** Priority-3 Web extraction output
- **Messages in thread:** 1

  *Message 1* (`19b0895493ae2e4b`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `amarnath ramarav <amarnath.ramarav@altiusnxt.com>`
  - Cc:   `Rajkumar D <rkumar@altiusnxt.com>, Ramkumar G <ramkumar.govindan@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 13. Thread `19b0759d9dca2ed4`

- **Subject:** Priority-2 Output
- **Messages in thread:** 1

  *Message 1* (`19b0759d9dca2ed4`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `amarnath ramarav <amarnath.ramarav@altiusnxt.com>`
  - Cc:   `Rajkumar D <rkumar@altiusnxt.com>, Ramkumar G <ramkumar.govindan@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 14. Thread `19b06b9d34304fb7`

- **Subject:** Re: Grainger: Webscrap Multiple Manufacturer Websites
- **Messages in thread:** 1

  *Message 1* (`19b06b9d34304fb7`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `amarnath ramarav <amarnath.ramarav@altiusnxt.com>`
  - Cc:   `Rajkumar D <rkumar@altiusnxt.com>, Ramkumar G <ramkumar.govindan@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 15. Thread `19b0619ec2e4664a`

- **Subject:** Review the Attached Data Scraping Output File
- **Messages in thread:** 3

  *Message 1* (`19b0619ec2e4664a`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Manikandan dtlp <dtlpmanikandan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19b06b5a19c77a8e`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Manikandan dtlp <dtlpmanikandan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 3* (`19b07360c19d1ad8`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Manikandan dtlp <dtlpmanikandan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 16. Thread `199f1c7551353f2d`

- **Subject:** White-Sync ERP Next Live Deployment
- **Messages in thread:** 1

  *Message 1* (`199f1c7551353f2d`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Coimbatore Sales <sales-cbe@whitenco.net>`
  - Cc:   `Vellayan Lakshmanan <vellayanl@gmail.com>, SasiKumar dtlp <dtlpsasikumar@gmail.com>, Prasanth dtlp <dtlpprasanth@gmail.com>, sneha dtlp <dtlpsneha@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 17. Thread `1992e004a3f233d9`

- **Subject:** Welcome Onboard
- **Messages in thread:** 1

  *Message 1* (`1992e004a3f233d9`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `"dtlpsneha@gmail.com" <dtlpsneha@gmail.com>`
  - Cc:   `sanjana dtlp <dtlpsanjana@gmail.com>, Balaji dtlp <dtlpbalaji@gmail.com>, SasiKumar dtlp <dtlpsasikumar@gmail.com>, Prasanth dtlp <dtlpprasanth@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 18. Thread `1986060fa50f5eda`

- **Subject:** Re: Try these vision technquies
- **Messages in thread:** 1

  *Message 1* (`1986060fa50f5eda`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Vellayan Lakshmanan <vellayanl@gmail.com>`
  - Cc:   `madhumitha dtlp <dtlpmadhumitha@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 19. Thread `19ea60d6fa957454`

- **Subject:** Invitation: ALTIUSNXT - People Portal workflow discussion @ Mon Jun 8, 2026 12:45pm - 1:15pm (IST) (dtlpsaranya@gmail.com)
- **Messages in thread:** 2

  *Message 1* (`19ea60d6fa957454`)

  - From: `Shivanie Varhmen <shivanie@altiusnxt.com>`
  - To:   `dtlpsaranya@gmail.com, Balaji dtlp <dtlpbalaji@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19ea615a60f5b105`)

  - From: `Saranya dtlp <dtlpsaranya@gmail.com>`
  - To:   `"jey.m@antlab.io" <jey.m@antlab.io>`
  - Cc:   `(none)`
  - **Rejected by:** R1 failed: user is sender, but no company address in To

#### 20. Thread `19e973bf312ec030`

- **Subject:** Announcement: New Kanboard Application Available
- **Messages in thread:** 1

  *Message 1* (`19e973bf312ec030`)

  - From: `Prasanth dtlp <dtlpprasanth@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `sneha dtlp <dtlpsneha@gmail.com>, SasiKumar dtlp <dtlpsasikumar@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Balaji dtlp <dtlpbalaji@gmail.com>, sanjana dtlp <dtlpsanjana@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 21. Thread `19e64710a3979d3c`

- **Subject:** Output Results for 30 SKUs
- **Messages in thread:** 1

  *Message 1* (`19e64710a3979d3c`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Govindaraj L <govind@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Saranya dtlp <dtlpsaranya@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 22. Thread `19e170292589c238`

- **Subject:** Altius & AltiusNXT Technologies - Office Holiday Announcement for office working people only for Office premises electrical maintenance Click to teach ANTLABS Mail that this conversation is important
- **Messages in thread:** 1

  *Message 1* (`19e170292589c238`)

  - From: `Shivanie Varhmen <shivanie@altiusnxt.com>`
  - To:   `sanjana dtlp <dtlpsanjana@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Balaji dtlp <dtlpbalaji@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>, Prasanth dtlp <dtlpprasanth@gmail.com>, SasiKumar dtlp <dtlpsasikumar@gmail.com>, dtlpsneha@gmail.com`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Jeyasekaran M <jey.m@antlab.io>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 23. Thread `19df7f5b26ef197e`

- **Subject:** Updated NXT Data Grabber Extension - Tokens Monitor
- **Messages in thread:** 1

  *Message 1* (`19df7f9667b10fe0`)

  - From: `Saranya dtlp <dtlpsaranya@gmail.com>`
  - To:   `Nikil Balasubramaniam <nikil.b@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, govind@altiusnxt.com, "bkarthick@altiusnxt.com" <bkarthick@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 24. Thread `19df6f8a3a3130f4`

- **Subject:** Updated Libre NXT Data Grabber Extension
- **Messages in thread:** 1

  *Message 1* (`19df709206a798aa`)

  - From: `Saranya dtlp <dtlpsaranya@gmail.com>`
  - To:   `Nikil Balasubramaniam <nikil.b@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, govind@altiusnxt.com, "bkarthick@altiusnxt.com" <bkarthick@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 25. Thread `19d611a0d76e748c`

- **Subject:** Request for Work From Home – 06.04.2026
- **Messages in thread:** 1

  *Message 1* (`19d611e816e3ee86`)

  - From: `Saranya dtlp <dtlpsaranya@gmail.com>`
  - To:   `shivanie@altiusnxt.com`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, govind@altiusnxt.com`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 26. Thread `19d33e99b2ea8b4a`

- **Subject:** ALTIUSNXT and ALTIUS - ESI Application Form
- **Messages in thread:** 1

  *Message 1* (`19d33e99b2ea8b4a`)

  - From: `Shivanie Varhmen <shivanie@altiusnxt.com>`
  - To:   `Prasanth dtlp <dtlpprasanth@gmail.com>, dtlpsneha@gmail.com, Manikandan dtlp <dtlpmanikandan@gmail.com>, Balaji dtlp <dtlpbalaji@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>, sanjana dtlp <dtlpsanjana@gmail.com>, SasiKumar dtlp <dtlpsasikumar@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 27. Thread `19d32eb76fdfaecf`

- **Subject:** Text Extraction from Image
- **Messages in thread:** 2

  *Message 1* (`19d32eb76fdfaecf`)

  - From: `Nikil Balasubramaniam <nikil.b@altiusnxt.com>`
  - To:   `Saranya dtlp <dtlpsaranya@gmail.com>`
  - Cc:   `Stephen David <stephen.david@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19d32effed605959`)

  - From: `Saranya dtlp <dtlpsaranya@gmail.com>`
  - To:   `Nikil Balasubramaniam <nikil.b@altiusnxt.com>`
  - Cc:   `(none)`
  - **Rejected by:** R1 failed: user is sender, but no company address in To

#### 28. Thread `19cffb6ceff17643`

- **Subject:** Request to Update UI Based on Shared Files & Screenshots to Data Extraction
- **Messages in thread:** 10

  *Message 1* (`19cffd20695a1948`)

  - From: `Saranya dtlp <dtlpsaranya@gmail.com>`
  - To:   `prabakaran@altiusnxt.com`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 2* (`19cffddb36a09ced`)

  - From: `Prabhakaran R <prabakaran@altiusnxt.com>`
  - To:   `Saranya dtlp <dtlpsaranya@gmail.com>`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the sender is not a company address

  *Message 3* (`19d00012edac54bf`)

  - From: `Saranya dtlp <dtlpsaranya@gmail.com>`
  - To:   `Prabhakaran R <prabakaran@altiusnxt.com>`
  - Cc:   `(none)`
  - **Rejected by:** R1 failed: user is sender, but no company address in To

  _(+7 further message(s) in this thread, all rejected)_

#### 29. Thread `19c940d82f4eae53`

- **Subject:** PDF Extractor
- **Messages in thread:** 1

  *Message 1* (`19c940e3f0b885fe`)

  - From: `Saranya dtlp <dtlpsaranya@gmail.com>`
  - To:   `Nikil Balasubramaniam <nikil.b@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 30. Thread `19c93dae53c10d86`

- **Subject:** API Key
- **Messages in thread:** 2

  *Message 1* (`19c93dae53c10d86`)

  - From: `Nikil Balasubramaniam <nikil.b@altiusnxt.com>`
  - To:   `dtlpsaranya@gmail.com, Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  *Message 2* (`19c940d62712987f`)

  - From: `Saranya dtlp <dtlpsaranya@gmail.com>`
  - To:   `Nikil Balasubramaniam <nikil.b@altiusnxt.com>`
  - Cc:   `(none)`
  - **Rejected by:** R1 failed: user is sender, but no company address in To

#### 31. Thread `19c8f27bfa6f695b`

- **Subject:** PDF Extracter Updated OXT File
- **Messages in thread:** 1

  *Message 1* (`19c8f304d587c130`)

  - From: `Saranya dtlp <dtlpsaranya@gmail.com>`
  - To:   `Nikil Balasubramaniam <nikil.b@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 32. Thread `19c65a8aa07c4459`

- **Subject:** Official Memo: Working Day on 21st February 2026 & Compensatory Off on 28th February 2026
- **Messages in thread:** 1

  *Message 1* (`19c65a8aa07c4459`)

  - From: `Shivanie Varhmen <shivanie@altiusnxt.com>`
  - To:   `SasiKumar dtlp <dtlpsasikumar@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Balaji dtlp <dtlpbalaji@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, sanjana dtlp <dtlpsanjana@gmail.com>, Prasanth dtlp <dtlpprasanth@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>, dtlpsneha@gmail.com`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 33. Thread `19c655539d991016`

- **Subject:** Data Extraction From Pdf
- **Messages in thread:** 1

  *Message 1* (`19c65582a6b12017`)

  - From: `Saranya dtlp <dtlpsaranya@gmail.com>`
  - To:   `Nikil Balasubramaniam <nikil.b@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 34. Thread `19c5234d72c1efc2`

- **Subject:** Spreadsheet shared with you: ‘RAM Expandable’
- **Messages in thread:** 1

  *Message 1* (`19c5234d72c1efc2`)

  - From: `"SasiKumar dtlp (via Google Sheets)" <drive-shares-dm-noreply@google.com>`
  - To:   `dtlpsaranya@gmail.com`
  - Cc:   `dtlpadithyan@gmail.com, dtlpmanikandan@gmail.com, dtlpprasanth@gmail.com, dtlpsanjana@gmail.com, dtlpsneha@gmail.com, jey@deeptechskills.com`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 35. Thread `19bd4c3ab3d7412c`

- **Subject:** LibreOffice Extension – Download, Installation & Usage Instructions
- **Messages in thread:** 1

  *Message 1* (`19bd4c3ab3d7412c`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 36. Thread `19bb21ef8fe6f235`

- **Subject:** Request to create UAN Generation for Provident Fund Process with ALTIUS GROUP
- **Messages in thread:** 1

  *Message 1* (`19bb21ef8fe6f235`)

  - From: `Shivanie Varhmen <shivanie@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Balaji dtlp <dtlpbalaji@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Prasanth dtlp <dtlpprasanth@gmail.com>, sanjana dtlp <dtlpsanjana@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>, SasiKumar dtlp <dtlpsasikumar@gmail.com>, dtlpsneha@gmail.com`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 37. Thread `19adefea311bc3c5`

- **Subject:** Export DPO
- **Messages in thread:** 1

  *Message 1* (`19adefea311bc3c5`)

  - From: `SasiKumar dtlp <dtlpsasikumar@gmail.com>`
  - To:   `Saranya dtlp <dtlpsaranya@gmail.com>`
  - Cc:   `Prasanth dtlp <dtlpprasanth@gmail.com>, sneha dtlp <dtlpsneha@gmail.com>, Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 38. Thread `19a72acefeb3ab05`

- **Subject:** oledb service error
- **Messages in thread:** 1

  *Message 1* (`19a72ada9d1a9360`)

  - From: `Saranya dtlp <dtlpsaranya@gmail.com>`
  - To:   `itsupport@altiusnxt.com`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 39. Thread `199f0d0b9dd7320a`

- **Subject:** WC_ERP Next_User Manual_V0.1_17102025
- **Messages in thread:** 1

  *Message 1* (`199f0d0b9dd7320a`)

  - From: `SasiKumar dtlp <dtlpsasikumar@gmail.com>`
  - To:   `Prasanth dtlp <dtlpprasanth@gmail.com>, Jeyasekaran M <jey@deeptechskills.com>, sneha dtlp <dtlpsneha@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

#### 40. Thread `199f0cb4aef699c7`

- **Subject:** WC_ERP Next_User Manual_V0.1_17102025
- **Messages in thread:** 2

  *Message 1* (`199f0cb4aef699c7`)

  - From: `SasiKumar dtlp <dtlpsasikumar@gmail.com>`
  - To:   `Prasanth dtlp <dtlpprasanth@gmail.com>, sneha dtlp <dtlpsneha@gmail.com>, Jeyasekaran M <jey@deeptechskills.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  *Message 2* (`199f0dfbaaab9c77`)

  - From: `Saranya dtlp <dtlpsaranya@gmail.com>`
  - To:   `SasiKumar dtlp <dtlpsasikumar@gmail.com>`
  - Cc:   `(none)`
  - **Rejected by:** R1 failed: user is sender, but no company address in To

#### 41. Thread `199e64020dc52f85`

- **Subject:** Quote Approved - PRABHURAM MILLS
- **Messages in thread:** 1

  *Message 1* (`199e64020dc52f85`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `jey@deeptechskills.com, dtlpsneha@gmail.com, dtlpsasikumar@gmail.com, dtlpsaranya@gmail.com, dtlpbalaji@gmail.com, dtplsasikumar@gmail.com, dtlpprasanth@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

#### 42. Thread `199e62681ea4fbe6`

- **Subject:** Quote Approved - Pricol
- **Messages in thread:** 2

  *Message 1* (`199e62681ea4fbe6`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `jey@deeptechskills.com, dtlpsneha@gmail.com, dtlpsasikumar@gmail.com, dtlpsaranya@gmail.com, dtlpbalaji@gmail.com, dtplsasikumar@gmail.com, dtlpprasanth@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  *Message 2* (`199e626adfff9fc6`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `jey@deeptechskills.com, dtlpsneha@gmail.com, dtlpsasikumar@gmail.com, dtlpsaranya@gmail.com, dtlpbalaji@gmail.com, dtplsasikumar@gmail.com, dtlpprasanth@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

#### 43. Thread `199c25b18f364eae`

- **Subject:** Quote Approved - PRABATH SPINNER INDIA (P) LTD.,
- **Messages in thread:** 4

  *Message 1* (`199c25b18f364eae`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `dtplsasikumar@gmail.com, dtlpprasanth@gmail.com, dtlpsaranya@gmail.com, dtlpbalaji@gmail.com, vellayanl@gmail.com, dtlpsneha@gmail.com, dtlpsasikumar@gmail.com, jey@deeptechskills.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  *Message 2* (`199c25ec04826dce`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `dtplsasikumar@gmail.com, dtlpprasanth@gmail.com, dtlpsaranya@gmail.com, dtlpbalaji@gmail.com, vellayanl@gmail.com, dtlpsneha@gmail.com, dtlpsasikumar@gmail.com, jey@deeptechskills.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  *Message 3* (`199c25ef21ea0965`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `dtplsasikumar@gmail.com, dtlpprasanth@gmail.com, dtlpsaranya@gmail.com, dtlpbalaji@gmail.com, vellayanl@gmail.com, dtlpsneha@gmail.com, dtlpsasikumar@gmail.com, jey@deeptechskills.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  _(+1 further message(s) in this thread, all rejected)_

#### 44. Thread `199bef757d75d8e4`

- **Subject:** Quote Approved - PANDIAN TEXTILE MILLS P LTD
- **Messages in thread:** 1

  *Message 1* (`199bef757d75d8e4`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `jey@deeptechskills.com, dtlpsaranya@gmail.com, dtlpsasikumar@gmail.com, dtlpbalaji@gmail.com, dtlpsneha@gmail.com, dtplsasikumar@gmail.com, dtlpprasanth@gmail.com, vellayanl@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

#### 45. Thread `199be85b05fc90c3`

- **Subject:** Quote Approved - Krihaan Texchem Private Limited-Billing
- **Messages in thread:** 1

  *Message 1* (`199be85b05fc90c3`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `jey@deeptechskills.com, dtlpsaranya@gmail.com, dtlpprasanth@gmail.com, dtlpbalaji@gmail.com, dtlpsneha@gmail.com, dtlpsasikumar@gmail.com, vellayanl@gmail.com, dtplsasikumar@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

#### 46. Thread `199be8208af9f15a`

- **Subject:** Quote Approved - THE PRIYADARSINI CO-OPERATIVE SPINNING MILLS LTD.
- **Messages in thread:** 1

  *Message 1* (`199be8208af9f15a`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `jey@deeptechskills.com, dtlpsaranya@gmail.com, dtlpprasanth@gmail.com, dtlpbalaji@gmail.com, dtlpsneha@gmail.com, dtlpsasikumar@gmail.com, vellayanl@gmail.com, dtplsasikumar@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

#### 47. Thread `199b94dbebe0d2eb`

- **Subject:** Quote Approved - None
- **Messages in thread:** 68

  *Message 1* (`199b94dbebe0d2eb`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `jey@deeptechskills.com, dtlpsaranya@gmail.com, dtlpprasanth@gmail.com, dtlpsneha@gmail.com, vellayanl@gmail.com, dtlpbalaji@gmail.com, dtlpsasikumar@gmail.com, dtplsasikumar@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  *Message 2* (`199b94def5957e72`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `jey@deeptechskills.com, dtlpsaranya@gmail.com, dtlpprasanth@gmail.com, dtlpsneha@gmail.com, vellayanl@gmail.com, dtlpbalaji@gmail.com, dtlpsasikumar@gmail.com, dtplsasikumar@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  *Message 3* (`199b94e1ee6f900b`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `jey@deeptechskills.com, dtlpsaranya@gmail.com, dtlpprasanth@gmail.com, dtlpsneha@gmail.com, vellayanl@gmail.com, dtlpbalaji@gmail.com, dtlpsasikumar@gmail.com, dtplsasikumar@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  _(+65 further message(s) in this thread, all rejected)_

#### 48. Thread `199b90bbb43a8e22`

- **Subject:** Quote Approved - Pricol
- **Messages in thread:** 2

  *Message 1* (`199b90bbb43a8e22`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `jey@deeptechskills.com, dtlpsaranya@gmail.com, dtlpprasanth@gmail.com, dtlpsneha@gmail.com, vellayanl@gmail.com, dtlpbalaji@gmail.com, dtlpsasikumar@gmail.com, dtplsasikumar@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  *Message 2* (`199b90f628044cde`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `jey@deeptechskills.com, dtlpsaranya@gmail.com, dtlpprasanth@gmail.com, dtlpsneha@gmail.com, vellayanl@gmail.com, dtlpbalaji@gmail.com, dtlpsasikumar@gmail.com, dtplsasikumar@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

#### 49. Thread `199954fe21904eb2`

- **Subject:** Quote Approved - Sri Hari Tex Industries
- **Messages in thread:** 1

  *Message 1* (`199954fe21904eb2`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `dtplsasikumar@gmail.com, vellayanl@gmail.com, dtlpprasanth@gmail.com, dtlpsasikumar@gmail.com, dtlpsneha@gmail.com, dtlpbalaji@gmail.com, jey@deeptechskills.com, dtlpsaranya@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

#### 50. Thread `199954c60c428ab5`

- **Subject:** Quote Approved - KANNAPPAN TEXTILE MILL PVT LTD
- **Messages in thread:** 1

  *Message 1* (`199954c60c428ab5`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `dtplsasikumar@gmail.com, vellayanl@gmail.com, dtlpprasanth@gmail.com, dtlpsasikumar@gmail.com, dtlpsneha@gmail.com, dtlpbalaji@gmail.com, jey@deeptechskills.com, dtlpsaranya@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

#### 51. Thread `19995483a64874f9`

- **Subject:** Quote Approved - ABC Pvt Ltd
- **Messages in thread:** 5

  *Message 1* (`19995483a64874f9`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `dtplsasikumar@gmail.com, vellayanl@gmail.com, dtlpprasanth@gmail.com, dtlpsasikumar@gmail.com, dtlpsneha@gmail.com, dtlpbalaji@gmail.com, jey@deeptechskills.com, dtlpsaranya@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  *Message 2* (`1999553ce79ad489`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `dtplsasikumar@gmail.com, vellayanl@gmail.com, dtlpprasanth@gmail.com, dtlpsasikumar@gmail.com, dtlpsneha@gmail.com, dtlpbalaji@gmail.com, jey@deeptechskills.com, dtlpsaranya@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  *Message 3* (`19995543f924246a`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `dtplsasikumar@gmail.com, vellayanl@gmail.com, dtlpprasanth@gmail.com, dtlpsasikumar@gmail.com, dtlpsneha@gmail.com, dtlpbalaji@gmail.com, jey@deeptechskills.com, dtlpsaranya@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  _(+2 further message(s) in this thread, all rejected)_

#### 52. Thread `199954c2f7deb87c`

- **Subject:** Quote Approved - jeya sekaran
- **Messages in thread:** 1

  *Message 1* (`199954c2f7deb87c`)

  - From: `sneha <dtlpsneha@gmail.com>`
  - To:   `dtplsasikumar@gmail.com, vellayanl@gmail.com, dtlpprasanth@gmail.com, dtlpsasikumar@gmail.com, dtlpsneha@gmail.com, dtlpbalaji@gmail.com, jey@deeptechskills.com, dtlpsaranya@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

#### 53. Thread `1995c0c4130fd649`

- **Subject:** VM Access
- **Messages in thread:** 1

  *Message 1* (`1995c0c4130fd649`)

  - From: `Shunmuga PrabuKumar <shunmuga.prabukumar@altiusnxt.com>`
  - To:   `dtlpsaranya@gmail.com`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender


---

## Mailbox: `dtlpadithyan@gmail.com`

Company addresses used by sync: `saranya@altiusnxt.com`, `jey@deeptechskills.com`, `adithyan@altiusnxt.com`

| | count |
|---|---|
| Candidate threads returned by Gmail | 226 |
| Anchored (imported) | 124 |
| **Skipped** | **102** |

### Skip-reason totals (by the last message evaluated)

| reason | threads |
|---|---|
| R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only) | 47 |
| R1 failed: user is sender, but the company address is in Cc, not To | 31 |
| R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender | 14 |
| R1 failed: user is sender, but no company address in To | 4 |
| R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it) | 3 |
| R0: connected mailbox appears in neither From nor To | 2 |
| R2 failed: user is a recipient, but the sender is not a company address | 1 |

### Full per-thread evidence

#### 1. Thread `19f182cf2fe35cfd`

- **Subject:** BalckWood_Scrapping Work
- **Messages in thread:** 6

  *Message 1* (`19f182cf2fe35cfd`)

  - From: `Karthick B <bkarthick@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f1c512d063bd4d`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Karthick B <bkarthick@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 3* (`19f1d3141a551f72`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Karthick B <bkarthick@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  _(+3 further message(s) in this thread, all rejected)_

#### 2. Thread `19e395954c64f98d`

- **Subject:** Request for RS_PRO Load File Tool
- **Messages in thread:** 9

  *Message 1* (`19e395954c64f98d`)

  - From: `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19e3984a1bd07eb2`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Govindaraj L <govind@altiusnxt.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Karthick B <bkarthick@altiusnxt.com>, sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 3* (`19e3986300e2e921`)

  - From: `Govindaraj L <govind@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Karthick B <bkarthick@altiusnxt.com>, sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  _(+6 further message(s) in this thread, all rejected)_

#### 3. Thread `19d9617a7e7e17ec`

- **Subject:** RS_PRO_Batch-4_Load File Input_2381 Skus_04162026
- **Messages in thread:** 2

  *Message 1* (`19d9617a7e7e17ec`)

  - From: `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Stephen David <stephen.david@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19d96615f08819f0`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - Cc:   `Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Stephen David <stephen.david@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 4. Thread `19d72f2e0fb915db`

- **Subject:** RS_PRO_Batch-4_Load File Input_2381 Skus_04092026
- **Messages in thread:** 2

  *Message 1* (`19d72f2e0fb915db`)

  - From: `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Stephen David <stephen.david@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19d7602028849053`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Stephen David <stephen.david@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 5. Thread `19d6b9c8c665f505`

- **Subject:** Admin Page Brand Color Consistency Review
- **Messages in thread:** 4

  *Message 1* (`19d6b9c8c665f505`)

  - From: `Prabhakaran R <prabakaran@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  *Message 2* (`19d6ba6b1a7540e8`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Balaji dtlp <dtlpbalaji@gmail.com>`
  - Cc:   `(none)`
  - **Rejected by:** R1 failed: user is sender, but no company address in To

  *Message 3* (`19d6c5d47322ffe0`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Prabhakaran R <prabakaran@altiusnxt.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  _(+1 further message(s) in this thread, all rejected)_

#### 6. Thread `19d0a29590c5ed16`

- **Subject:** Catalog wiz is on live
- **Messages in thread:** 1

  *Message 1* (`19d0a29590c5ed16`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Govindaraj L <govind@altiusnxt.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Prasanth dtlp <dtlpprasanth@gmail.com>, Gokul R <gokul@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 7. Thread `19d09c10af966c94`

- **Subject:** Re: AltiusNXT_Delivered Data for AI Training
- **Messages in thread:** 1

  *Message 1* (`19d09c10af966c94`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Karthick B <bkarthick@altiusnxt.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Stephen David <stephen.david@altiusnxt.com>, Rajkumar D <rkumar@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 8. Thread `19d05bce9b5c7999`

- **Subject:** CommerzNXT is now available in Hostinger Server
- **Messages in thread:** 1

  *Message 1* (`19d05bce9b5c7999`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Vellayan Lakshmanan <vellayanl@gmail.com>`
  - Cc:   `(none)`
  - Bcc:  `dtlpadithyan@gmail.com`
  - **Rejected by:** R0: connected mailbox appears in neither From nor To

#### 9. Thread `19cf63dbb242ffa9`

- **Subject:** Yantra Site Hosted in Hostinger
- **Messages in thread:** 3

  *Message 1* (`19cf63dbb242ffa9`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `suresh sathiyanarayanan <suresh.sathiyanarayanan@yantra24x7.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19cf6886a8a841d9`)

  - From: `suresh sathiyanarayanan <suresh.sathiyanarayanan@yantra24x7.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 3* (`19cf6f2f0e0f9271`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `suresh sathiyanarayanan <suresh.sathiyanarayanan@yantra24x7.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 10. Thread `19cb874a2e9d9e89`

- **Subject:** Altius Backoffice Official Website
- **Messages in thread:** 2

  *Message 1* (`19cb874a2e9d9e89`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Balaji dtlp <dtlpbalaji@gmail.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19e546e94e8ec46c`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Prasanth dtlp <dtlpprasanth@gmail.com>`
  - Cc:   `(none)`
  - **Rejected by:** R1 failed: user is sender, but no company address in To

#### 11. Thread `19c70e024d4c4a68`

- **Subject:** eClass Data Extraction Output for 96 Codes
- **Messages in thread:** 3

  *Message 1* (`19c70e024d4c4a68`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - Cc:   `Manikandan dtlp <dtlpmanikandan@gmail.com>, sanjana dtlp <dtlpsanjana@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19c7109781ed5ff4`)

  - From: `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Manikandan dtlp <dtlpmanikandan@gmail.com>, sanjana dtlp <dtlpsanjana@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 3* (`19c75778ef183ce9`)

  - From: `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Manikandan dtlp <dtlpmanikandan@gmail.com>, sanjana dtlp <dtlpsanjana@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 12. Thread `19c6b72f49ee4e59`

- **Subject:** eClass web scrapping sample output template
- **Messages in thread:** 1

  *Message 1* (`19c6b72f49ee4e59`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `sanjana dtlp <dtlpsanjana@gmail.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 13. Thread `19c524223e1e27de`

- **Subject:** Siemens sample output
- **Messages in thread:** 1

  *Message 1* (`19c524223e1e27de`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Karthick B <bkarthick@altiusnxt.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 14. Thread `19c4795d65f709eb`

- **Subject:** Spell Check Application with Suggested Text
- **Messages in thread:** 1

  *Message 1* (`19c4795d65f709eb`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Karthick B <bkarthick@altiusnxt.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 15. Thread `19c47776d554ec49`

- **Subject:** Fwd: SWD_Solent
- **Messages in thread:** 1

  *Message 1* (`19c47776d554ec49`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Saranya dtlp <dtlpsaranya@gmail.com>`
  - Cc:   `Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 16. Thread `19c3284a1f05d4c0`

- **Subject:** Spell Check Output from Spell Checker Tool
- **Messages in thread:** 1

  *Message 1* (`19c3284a1f05d4c0`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Karthick B <bkarthick@altiusnxt.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 17. Thread `19bda25a54316b5c`

- **Subject:** Launching AltiusNxt LibreOffice Extension
- **Messages in thread:** 3

  *Message 1* (`19bda25a54316b5c`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Karthick B <bkarthick@altiusnxt.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19bda67937ea6c60`)

  - From: `Govindaraj L <govind@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Karthick B <bkarthick@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 3* (`19bda6ac2f968170`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Govindaraj L <govind@altiusnxt.com>`
  - Cc:   `Karthick B <bkarthick@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 18. Thread `19b0c48ee02dedd7`

- **Subject:** Priority-3 Rerun 282 Skus output
- **Messages in thread:** 1

  *Message 1* (`19b0c48ee02dedd7`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `amarnath ramarav <amarnath.ramarav@altiusnxt.com>`
  - Cc:   `Rajkumar D <rkumar@altiusnxt.com>, Ramkumar G <ramkumar.govindan@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 19. Thread `19b08954883a491e`

- **Subject:** Priority-3 Web extraction output
- **Messages in thread:** 1

  *Message 1* (`19b08954883a491e`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `amarnath ramarav <amarnath.ramarav@altiusnxt.com>`
  - Cc:   `Rajkumar D <rkumar@altiusnxt.com>, Ramkumar G <ramkumar.govindan@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 20. Thread `19b0759d92ed3d2d`

- **Subject:** Priority-2 Output
- **Messages in thread:** 1

  *Message 1* (`19b0759d92ed3d2d`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `amarnath ramarav <amarnath.ramarav@altiusnxt.com>`
  - Cc:   `Rajkumar D <rkumar@altiusnxt.com>, Ramkumar G <ramkumar.govindan@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 21. Thread `19abb4dabd18ee9a`

- **Subject:** Re: An tool to compare different AI Engines for OCR accuracy and capability
- **Messages in thread:** 1

  *Message 1* (`19abb4dabd18ee9a`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Vellayan Lakshmanan <vellayanl@gmail.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>`
  - Bcc:  `dtlpadithyan@gmail.com`
  - **Rejected by:** R0: connected mailbox appears in neither From nor To

#### 22. Thread `19aa10dafe6e0645`

- **Subject:** Irrelevant Missing Value
- **Messages in thread:** 2

  *Message 1* (`19aa10dafe6e0645`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19ab472b390da89f`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Govindaraj L <govind@altiusnxt.com>`
  - Cc:   `Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 23. Thread `19aa51ecd24f6ea7`

- **Subject:** Perplexity API from Govind's Account
- **Messages in thread:** 1

  *Message 1* (`19aa51ecd24f6ea7`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `stephen.david@altiusnxt.com`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Govindaraj L <govind@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 24. Thread `19a9af035c838037`

- **Subject:** On the fly schema data capturing application
- **Messages in thread:** 1

  *Message 1* (`19a9af035c838037`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Karthick B <bkarthick@altiusnxt.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 25. Thread `19a8218190072b07`

- **Subject:** Need Breadcrumbs
- **Messages in thread:** 2

  *Message 1* (`19a8218190072b07`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19a8218e1928a118`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 26. Thread `19a772f65b9fce9c`

- **Subject:** Vendor Data Extraction with UPC
- **Messages in thread:** 2

  *Message 1* (`19a772f65b9fce9c`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Govindaraj L <govind@altiusnxt.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19a7740eb8db604a`)

  - From: `Govindaraj L <govind@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 27. Thread `19a630fe7c7692bb`

- **Subject:** On the fly schema and data extractor application
- **Messages in thread:** 1

  *Message 1* (`19a630fe7c7692bb`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Karthick B <bkarthick@altiusnxt.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 28. Thread `19a63006be02ef4c`

- **Subject:** Vendors Official Website
- **Messages in thread:** 1

  *Message 1* (`19a63006be02ef4c`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Govindaraj L <govind@altiusnxt.com>`
  - Cc:   `Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 29. Thread `19a3a7f39f6e32da`

- **Subject:** Data Extraction Plugin
- **Messages in thread:** 1

  *Message 1* (`19a3a7f39f6e32da`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - Cc:   `Karthick B <bkarthick@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 30. Thread `19a399eac5c7071b`

- **Subject:** Subject: AWS Instance Storage Extended – Pdf_Data_Extractor (i-0fb389e67d9976c09)
- **Messages in thread:** 2

  *Message 1* (`19a399eac5c7071b`)

  - From: `Prasanth dtlp <dtlpprasanth@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, dtlpmanikandan@gmail.com, dtlpsanjana@gmail.com`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19a4846368d3578d`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Prasanth dtlp <dtlpprasanth@gmail.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, dtlpmanikandan@gmail.com, dtlpsanjana@gmail.com`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 31. Thread `19a39191e451f295`

- **Subject:** SWD_HG_For Scrap_Sample 18 skus_103125
- **Messages in thread:** 2

  *Message 1* (`19a39191e451f295`)

  - From: `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `dtlpmanikandan@gmail.com, Adithyan dtlp <dtlpadithyan@gmail.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19a3929fee166cd3`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - Cc:   `dtlpmanikandan@gmail.com, Adithyan dtlp <dtlpadithyan@gmail.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 32. Thread `1998a4d1b4c5a4f5`

- **Subject:** DTLP: AI Powered PDF Data Extractor Application Access
- **Messages in thread:** 1

  *Message 1* (`1998a4d1b4c5a4f5`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `bkarthick@altiusnxt.com`
  - Cc:   `stephen.david@altiussolution.com, Govindaraj L <govind@altiusnxt.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 33. Thread `1992e004d48169ff`

- **Subject:** Welcome Onboard
- **Messages in thread:** 1

  *Message 1* (`1992e004d48169ff`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `"dtlpsneha@gmail.com" <dtlpsneha@gmail.com>`
  - Cc:   `sanjana dtlp <dtlpsanjana@gmail.com>, Balaji dtlp <dtlpbalaji@gmail.com>, SasiKumar dtlp <dtlpsasikumar@gmail.com>, Prasanth dtlp <dtlpprasanth@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 34. Thread `198d1a66cc97f9bd`

- **Subject:** Re: PDF Layout Analysis Libraries
- **Messages in thread:** 1

  *Message 1* (`198d1a66cc97f9bd`)

  - From: `Jeyasekaran M <jey@deeptechskills.com>`
  - To:   `Vellayan Lakshmanan <vellayanl@gmail.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 35. Thread `19fa28adb20c09ae`

- **Subject:** Reg: Blackwoods_Electricals_Set-1_Navigation & Dispaly Page URL
- **Messages in thread:** 4

  *Message 1* (`19fa28adb20c09ae`)

  - From: `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19fa2fe528ba85b6`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 3* (`19fa37b5430bac2e`)

  - From: `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  _(+1 further message(s) in this thread, all rejected)_

#### 36. Thread `19f98b69cb38d33d`

- **Subject:** Request for Deployment Support – RSPro XLSX PDF Tool
- **Messages in thread:** 3

  *Message 1* (`19f98b69cb38d33d`)

  - From: `Prabhakaran R <prabakaran@altiusnxt.com>`
  - To:   `Govindaraj L <govind@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

  *Message 2* (`19f9a1dc52a5963f`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Prabhakaran R <prabakaran@altiusnxt.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 3* (`19fa19ad0b736b41`)

  - From: `Prabhakaran R <prabakaran@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 37. Thread `19f9392fec6fee2d`

- **Subject:** RS PRO_CR_ Batch-4-Part-2_361 SKUs_Individual Load File Input_07242026
- **Messages in thread:** 3

  *Message 1* (`19f9392fec6fee2d`)

  - From: `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f93c73bb7e99db`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 3* (`19f93d4aff8ec9f9`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 38. Thread `19f8e056d36fd0f2`

- **Subject:** RS PRO CR_Change Request Batch4_1552 Skus_Consolidated Load_Input_07232026
- **Messages in thread:** 3

  *Message 1* (`19f8e056d36fd0f2`)

  - From: `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f8e11d67d52e0f`)

  - From: `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 3* (`19f8e28e2a41ad62`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 39. Thread `19f88e480dec773f`

- **Subject:** Claude Memory File for Schema Mapping Optimization
- **Messages in thread:** 1

  *Message 1* (`19f88ef4da1ef26e`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Karthick B <bkarthick@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>, Rajkumar D <rkumar@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 40. Thread `19f7f8f633250677`

- **Subject:** Reg: ANXT_Blackwoods_Schema Build_Batch-1_QC Validation
- **Messages in thread:** 2

  *Message 1* (`19f7f8f633250677`)

  - From: `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Rajkumar D <rkumar@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f80bf938e9ce4d`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Rajkumar D <rkumar@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 41. Thread `19f6ae6555886a0f`

- **Subject:** IDA Sourcing: Data Wrong and Conflict Validation_071626
- **Messages in thread:** 3

  *Message 1* (`19f6ae6555886a0f`)

  - From: `Rajkumar D <rkumar@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Hema N <nhema@altiusnxt.com>, amarnath ramarav <amarnath.ramarav@altiusnxt.com>, Bhuvaneshwaran Shanmugam <bhuvaneshwaran.s@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f6c05314669a27`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Rajkumar D <rkumar@altiusnxt.com>`
  - Cc:   `Hema N <nhema@altiusnxt.com>, amarnath ramarav <amarnath.ramarav@altiusnxt.com>, Bhuvaneshwaran Shanmugam <bhuvaneshwaran.s@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 3* (`19f6e4e620ea26fc`)

  - From: `Rajkumar D <rkumar@altiussolution.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the sender is not a company address

#### 42. Thread `19f6b5d1dd73c153`

- **Subject:** Reg: BW_Schema Mapping_QC_Set-5_116 Nodes_071626
- **Messages in thread:** 2

  *Message 1* (`19f6b5d1dd73c153`)

  - From: `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Rajkumar D <rkumar@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f6bfd6d8af3fb7`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Rajkumar D <rkumar@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 43. Thread `19f7092f8b586dcc`

- **Subject:** Reg: Blackwoods_Batch-2_Navigation & Dispaly Page URL_071726
- **Messages in thread:** 3

  *Message 1* (`19f7092f8b586dcc`)

  - From: `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Rajkumar D <rkumar@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f73336ca45e9b6`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Rajkumar D <rkumar@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 3* (`19f7d69aab12e684`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Rajkumar D <rkumar@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 44. Thread `19f65d148ad68a01`

- **Subject:** BW_Schema Mapping_QC_Set-1 to Set-4_66 Nodes
- **Messages in thread:** 2

  *Message 1* (`19f65d148ad68a01`)

  - From: `Rajkumar D <rkumar@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `amarnath ramarav <amarnath.ramarav@altiusnxt.com>, dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f6690e81542af8`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Rajkumar D <rkumar@altiusnxt.com>`
  - Cc:   `amarnath ramarav <amarnath.ramarav@altiusnxt.com>, dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 45. Thread `19f65b245a316064`

- **Subject:** Grainger 2026_NPI_Flight Group 32_Vertical Data for Validation & GapFill
- **Messages in thread:** 2

  *Message 1* (`19f65b245a316064`)

  - From: `Rajkumar D <rkumar@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `amarnath ramarav <amarnath.ramarav@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f66ea1fc4cd792`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Rajkumar D <rkumar@altiusnxt.com>`
  - Cc:   `(none)`
  - **Rejected by:** R1 failed: user is sender, but no company address in To

#### 46. Thread `19f50c2338055525`

- **Subject:** BW_Set-4_Schema Mapping_36 Nodes_071126
- **Messages in thread:** 2

  *Message 1* (`19f50c2338055525`)

  - From: `Rajkumar D <rkumar@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f516f7603bfb1d`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Rajkumar D <rkumar@altiusnxt.com>`
  - Cc:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 47. Thread `19f362e6afb012a8`

- **Subject:** Audit Output for Classification, Taxonomy, and General Modules – Request for Review
- **Messages in thread:** 4

  *Message 1* (`19f362e6afb012a8`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `Veeravasudevan R <vasu@altiusnxt.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19f4bdb7b8e9f715`)

  - From: `Veeravasudevan R <vasu@altiusnxt.com>`
  - To:   `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 3* (`19f505401c2b1aa4`)

  - From: `Veeravasudevan R <vasu@altiusnxt.com>`
  - To:   `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  _(+1 further message(s) in this thread, all rejected)_

#### 48. Thread `19f60f5715eb1bc4`

- **Subject:** Reg: BW_Schema Mapping_QC_Set-1 to Set-4_111 Nodes
- **Messages in thread:** 3

  *Message 1* (`19f60f5715eb1bc4`)

  - From: `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Rajkumar D <rkumar@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f61cca0f25d728`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Rajkumar D <rkumar@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 3* (`19f63e462b454a1b`)

  - From: `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Rajkumar D <rkumar@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 49. Thread `19f4b420402d93fc`

- **Subject:** BW_Set-2_Schema Mapping_20 Nodes_071026
- **Messages in thread:** 2

  *Message 1* (`19f4b420402d93fc`)

  - From: `Rajkumar D <rkumar@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `amarnath ramarav <amarnath.ramarav@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f4ba25c6113280`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Rajkumar D <rkumar@altiusnxt.com>`
  - Cc:   `amarnath ramarav <amarnath.ramarav@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 50. Thread `19e067fbfcbb3342`

- **Subject:** Claude New Request link
- **Messages in thread:** 14

  *Message 1* (`19e0680ec9d825d0`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `suresh sathiyanarayanan <suresh.sathiyanarayanan@yantra24x7.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 2* (`19e0682dca42fa90`)

  - From: `suresh sathiyanarayanan <suresh.sathiyanarayanan@yantra24x7.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 3* (`19f187ff56935403`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `suresh sathiyanarayanan <suresh.sathiyanarayanan@yantra24x7.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  _(+11 further message(s) in this thread, all rejected)_

#### 51. Thread `19f4a44d51b06f64`

- **Subject:** Blackwoods_Claude AI_Schema Mapping_30 Nodes_071026
- **Messages in thread:** 2

  *Message 1* (`19f4a44d51b06f64`)

  - From: `Rajkumar D <rkumar@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f4afe71399f284`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Rajkumar D <rkumar@altiusnxt.com>`
  - Cc:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 52. Thread `19f365943ad0e963`

- **Subject:** Blackwoods_Set-2_Navigation & Display Page URL_070626
- **Messages in thread:** 12

  *Message 1* (`19f365943ad0e963`)

  - From: `Rajkumar D <rkumar@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>, amarnath ramarav <amarnath.ramarav@altiusnxt.com>, sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f3b568a894b51a`)

  - From: `Rajkumar D <rkumar@altiussolution.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>, amarnath ramarav <amarnath.ramarav@altiusnxt.com>, sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 3* (`19f3c3d72c26bd2b`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Rajkumar D <rkumar@altiussolution.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>, amarnath ramarav <amarnath.ramarav@altiusnxt.com>, sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  _(+9 further message(s) in this thread, all rejected)_

#### 53. Thread `19f45aef07a61288`

- **Subject:** Fwd: Reg: Blackwoods_Schema Mapping_Claude
- **Messages in thread:** 2

  *Message 1* (`19f45aef07a61288`)

  - From: `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f46541971471e2`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>, Rajkumar D <rkumar@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 54. Thread `19f412ea64f60e86`

- **Subject:** Reg: Blackwoods_Schema Attribute Definition
- **Messages in thread:** 3

  *Message 1* (`19f412ea64f60e86`)

  - From: `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f41a01ca95eafe`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 3* (`19f41ada1a247e39`)

  - From: `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 55. Thread `19f228903f613299`

- **Subject:** Reg: Blackwoods_Set-1_Navigation & Dispaly Page URL
- **Messages in thread:** 7

  *Message 1* (`19f228903f613299`)

  - From: `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Rajkumar D <rkumar@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f26a71c6865030`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Rajkumar D <rkumar@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 3* (`19f27665a4da7adc`)

  - From: `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Rajkumar D <rkumar@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  _(+4 further message(s) in this thread, all rejected)_

#### 56. Thread `19f2171fcec9c6c2`

- **Subject:** Reg: Blackwoods_Schema Build_Automation Tool input file
- **Messages in thread:** 5

  *Message 1* (`19f2171fcec9c6c2`)

  - From: `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f22d11f4b39b07`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 3* (`19f26cc52a613c10`)

  - From: `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  _(+2 further message(s) in this thread, all rejected)_

#### 57. Thread `19f4f63fef04ca9a`

- **Subject:** BW_Set-3_Schema Mapping_19 Nodes_071126
- **Messages in thread:** 2

  *Message 1* (`19f4f63fef04ca9a`)

  - From: `Rajkumar D <rkumar@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19f50ac136bbf60b`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Rajkumar D <rkumar@altiusnxt.com>`
  - Cc:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 58. Thread `19f1d665af59d399`

- **Subject:** Invitation: Blackwoods_Schema Build_Automation Tool Discussion @ Thu Jul 2, 2026 11am - 11:30am (GMT+5:30) (Adithyan dtlp)
- **Messages in thread:** 1

  *Message 1* (`19f1d665af59d399`)

  - From: `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

#### 59. Thread `19f07a7acafc2e98`

- **Subject:** Request for Review of Sourcing Audit Output
- **Messages in thread:** 7

  *Message 1* (`19f07a7acafc2e98`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `vasu@altiusnxt.com`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19f07f6724a1b259`)

  - From: `Veeravasudevan R <vasu@altiusnxt.com>`
  - To:   `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 3* (`19f085f65e6fe7dd`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `Veeravasudevan R <vasu@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  _(+4 further message(s) in this thread, all rejected)_

#### 60. Thread `19e973bf257fba00`

- **Subject:** Announcement: New Kanboard Application Available
- **Messages in thread:** 1

  *Message 1* (`19e973bf257fba00`)

  - From: `Prasanth dtlp <dtlpprasanth@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `sneha dtlp <dtlpsneha@gmail.com>, SasiKumar dtlp <dtlpsasikumar@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Balaji dtlp <dtlpbalaji@gmail.com>, sanjana dtlp <dtlpsanjana@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 61. Thread `19e86d61efcab97a`

- **Subject:** New Ticketing System for IT Support Requests
- **Messages in thread:** 1

  *Message 1* (`19e86d61efcab97a`)

  - From: `Gokul R <gokul@altiusnxt.com>`
  - To:   `Abhishekh S <abhishekh.s@altiusnxt.com>, Adithyan E <adithyan@altiusnxt.com>, Ajay C <ajay.chandran@altiusnxt.com>, Akshaya s <akshaya.s@altiusnxt.com>, amarnath ramarav <amarnath.ramarav@altiusnxt.com>, Anitha M <anitha.m@altiusnxt.com>, Annamani S <annamani@altiusnxt.com>, Aswini S <aswini@altiusnxt.com>, Babiloonal M <babiloonal.m@altiusnxt.com>, Balaji D <balaji@altiusnxt.com>, Balaji M <balaji.murugesan@altiusnxt.com>, bhuvaneshwaran shanmugam <bhuvaneshwaran.s@altiusnxt.com>, deepa ganesan <deepa.ganesan@altiusnxt.com>, dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>, Gokul Prakash <gokulprakash.g@altiusnxt.com>, Gowtham S <gowtham.s@altiusnxt.com>, Hema N <nhema@altiusnxt.com>, Indhumathi s <indhumathi@altiusnxt.com>, Jayavaishnavi manikandan <jayavaishnavi.manikandan@altiusnxt.com>, Jeevanantham V <jeevanantham.v@altiusnxt.com>, jency antonyselvi <jency.antonyselvi@altiusnxt.com>, krishnakumar G <krishnakumar.g@altiusnxt.com>, Lochana Balasubramaniam <lochana.balasubramaniam@altiusnxt.com>, Manikandan S <manikandan@altiusnxt.com>, Manjula Devi <manjula.radhakrishnan@altiusnxt.com>, Manoj s <manoj@altiusnxt.com>, Mohanapriya P <mohanapriya@altiusnxt.com>, Natarajan Arunachalam <natarajan.arunachalam@altiusnxt.com>, Naveenkumar Jayaraman <naveen.jayaraman@altiusnxt.com>, Nikil Balasubramaniam <nikil.b@altiusnxt.com>, poorani duraisamy <poorani.duraisamy@altiusnxt.com>, Poornima Kannan <poornima.kannan@altiusnxt.com>, Prabhakaran R <prabakaran@altiusnxt.com>, Rajkumar D <rkumar@altiusnxt.com>, Sakthivel Gopal <sakthivel.gopal@altiusnxt.com>, Samyuktha p <samyuktha@altiusnxt.com>, Sanjana V <sanjana@altiusnxt.com>, Saranya S <saranya@altiusnxt.com>, satheesh Karuppusamy <satheesh.karuppusamy@altiusnxt.com>, Sathishkumar Bathirammal <sathishkumar.bathirammal@altiusnxt.com>, Seenivasan D <seenivasan.dharmaraj@altiusnxt.com>, shanmugapriya b <shanmugapriya.b@altiusnxt.com>, Shivanie Varhmen <shivanie@altiusnxt.com>, sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>, Stephen David <stephen.david@altiusnxt.com>, Subaparvathi M <subaparvathi@altiusnxt.com>, Subaranjana T <subaranjana@altiusnxt.com>, Suresh Narayanasamy <suresh.narayanasamy@altiusnxt.com>, Surya S <surya.s@altiusnxt.com>, sushma p <sushma.p@altiusnxt.com>, Swathi Priya <swathi.priya@altiusnxt.com>, "Thushara T.S" <thushara@altiusnxt.com>, Veeravasudevan R <vasu@altiusnxt.com>, Velmani Palanisamy <velmani.p@altiusnxt.com>, Vijayakumar Durairaj <vijay.durairaj@altiusnxt.com>, Vishnu Kannan <vishnukannan@altiusnxt.com>, Anushika Vinoba <anushika@yantra24x7.com>, Danial Raymonds <danial.raymonds@yantra24x7.com>, Dharshini Radhakrishnan <dharshini.r@yantra24x7.com>, Kiruthika M <kiruthika.m@yantra24x7.com>, Manikandan K <manikandan@yantra24x7.com>, Manisankar Gnanasekaran <manisankar.gnanasekaran@yantra24x7.com>, Santhosh K <santhosh@yantra24x7.com>, suresh sathiyanarayanan <suresh.sathiyanarayanan@yantra24x7.com>, Thooyavan Venkatachalam <thooyavan.venkatachalam@yantra24x7.com>, Yogesan S <yogesan.s@yantra24x7.com>, Prasanth dtlp <dtlpprasanth@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Veeramani C <manager.accounts@whitenco.net>, sales-cbe@whitenco.net, cbe-accts@whitenco.net, kiruthika.ravikumar@antlab.io, simeon@antlab.io, madhavan a <madhavan.a@accuratebackoffice.com>, Valli S <valli@accuratebackoffice.com>, SELVAM P <selvam@accuratebackoffice.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, IT Support <itsupport@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 62. Thread `19e646c24fe49413`

- **Subject:** Output Results for 30 SKUs
- **Messages in thread:** 1

  *Message 1* (`19e6470ddabfa185`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Govindaraj L <govind@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Saranya dtlp <dtlpsaranya@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 63. Thread `19e4f71a7b60f6af`

- **Subject:** RS PRO_Batch-4-Part-2_363 Skus_Individual Load File Input
- **Messages in thread:** 2

  *Message 1* (`19e4f71a7b60f6af`)

  - From: `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Stephen David <stephen.david@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19e4f7e64f6e1cf0`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Stephen David <stephen.david@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 64. Thread `19e38eb6f34e0b56`

- **Subject:** RS_PRO_Batch-4_Load File Input_Individual 2381 Skus_05162026
- **Messages in thread:** 3

  *Message 1* (`19e38eb6f34e0b56`)

  - From: `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Stephen David <stephen.david@altiusnxt.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19e396d249b2d2ea`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Stephen David <stephen.david@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 3* (`19e39b66b17c147c`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Stephen David <stephen.david@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 65. Thread `19e26596ac94ad27`

- **Subject:** RS PRO_Batch-4-Part-2_363 Skus_Consolidate Load File Input
- **Messages in thread:** 2

  *Message 1* (`19e26596ac94ad27`)

  - From: `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19e26765f19f706e`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 66. Thread `19e170294ebb9a7f`

- **Subject:** Altius & AltiusNXT Technologies - Office Holiday Announcement for office working people only for Office premises electrical maintenance Click to teach ANTLABS Mail that this conversation is important
- **Messages in thread:** 1

  *Message 1* (`19e170294ebb9a7f`)

  - From: `Shivanie Varhmen <shivanie@altiusnxt.com>`
  - To:   `sanjana dtlp <dtlpsanjana@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Balaji dtlp <dtlpbalaji@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>, Prasanth dtlp <dtlpprasanth@gmail.com>, SasiKumar dtlp <dtlpsasikumar@gmail.com>, dtlpsneha@gmail.com`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Jeyasekaran M <jey.m@antlab.io>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 67. Thread `19e073e3d7addee2`

- **Subject:** RS_PRO_Batch-4_Load File Input_Individual 2381 Skus_05082026
- **Messages in thread:** 2

  *Message 1* (`19e073e3d7addee2`)

  - From: `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Stephen David <stephen.david@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Govindaraj L <govind@altiusnxt.com>, sanjana dtlp <dtlpsanjana@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19e0764c301344be`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Stephen David <stephen.david@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, sanjana dtlp <dtlpsanjana@gmail.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 68. Thread `19e066b2b29ff183`

- **Subject:** Request to Claude Access token
- **Messages in thread:** 3

  *Message 1* (`19e066d3a44bbfb4`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `suresh sathiyanarayanan <suresh.sathiyanarayanan@yantra24x7.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 2* (`19e066fa90a4f52a`)

  - From: `suresh sathiyanarayanan <suresh.sathiyanarayanan@yantra24x7.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 3* (`19e067b5be84b1dc`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `suresh sathiyanarayanan <suresh.sathiyanarayanan@yantra24x7.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 69. Thread `19df2c01a063785d`

- **Subject:** RS_PRO_Batch-4_Load File Input_Individual 100 Skus_05042026
- **Messages in thread:** 2

  *Message 1* (`19df2c01a063785d`)

  - From: `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19df3335e7f7f7ed`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 70. Thread `19df27fcaa2d01fe`

- **Subject:** RS_PRO_Batch-4_Load File Input_Consolidated 2381 Skus_05042026
- **Messages in thread:** 2

  *Message 1* (`19df27fcaa2d01fe`)

  - From: `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19df2e4f21b7be47`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 71. Thread `19dbe68c211f2dd4`

- **Subject:** Output  file review
- **Messages in thread:** 8

  *Message 1* (`19dbe6bd686abf48`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 2* (`19dbeb814e9e36ab`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>, Karthick B <bkarthick@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 3* (`19dbed187a84a1ae`)

  - From: `Karthick B <bkarthick@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  _(+5 further message(s) in this thread, all rejected)_

#### 72. Thread `19dbe7fff223a870`

- **Subject:** RS_PRO_Batch-4_Load File Input_2381 Skus_04242026
- **Messages in thread:** 2

  *Message 1* (`19dbe7fff223a870`)

  - From: `sivagami subramaniam <sivagami.subramaniam@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>, Govindaraj L <govind@altiusnxt.com>, Stephen David <stephen.david@altiusnxt.com>, sanjana dtlp <dtlpsanjana@gmail.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 2* (`19dbedd852f59816`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - Cc:   `(none)`
  - **Rejected by:** R1 failed: user is sender, but no company address in To

#### 73. Thread `19d8fb13305deb9e`

- **Subject:** Submission of Workflow Document
- **Messages in thread:** 1

  *Message 1* (`19d8fb13305deb9e`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 74. Thread `19d33e99ac4397c6`

- **Subject:** ALTIUSNXT and ALTIUS - ESI Application Form
- **Messages in thread:** 1

  *Message 1* (`19d33e99ac4397c6`)

  - From: `Shivanie Varhmen <shivanie@altiusnxt.com>`
  - To:   `Prasanth dtlp <dtlpprasanth@gmail.com>, dtlpsneha@gmail.com, Manikandan dtlp <dtlpmanikandan@gmail.com>, Balaji dtlp <dtlpbalaji@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>, sanjana dtlp <dtlpsanjana@gmail.com>, SasiKumar dtlp <dtlpsasikumar@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 75. Thread `19d05e278e7510d8`

- **Subject:** Yantra24x7 Website Hosting – Guidance Document Attached
- **Messages in thread:** 3

  *Message 1* (`19d05e61ac7ea8af`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `suresh.sathiyanarayanan@yantra24x7.com`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 2* (`19d28be64a62b30e`)

  - From: `suresh sathiyanarayanan <suresh.sathiyanarayanan@yantra24x7.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 3* (`19d2931fe447acc4`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `suresh sathiyanarayanan <suresh.sathiyanarayanan@yantra24x7.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 76. Thread `19d239fe35587623`

- **Subject:** CatWiz Frontend – Review & Design
- **Messages in thread:** 2

  *Message 1* (`19d239fe35587623`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `Prabhakaran R <prabakaran@altiusnxt.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19d23ab988a7f684`)

  - From: `Prabhakaran R <prabakaran@altiusnxt.com>`
  - To:   `Manikandan dtlp <dtlpmanikandan@gmail.com>, Jeyasekaran M <jey@deeptechskills.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Govindaraj L <govind@altiusnxt.com>`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)

#### 77. Thread `19d1eb36516b92b9`

- **Subject:** Folder shared with you: "WP Engine Site Backup"
- **Messages in thread:** 1

  *Message 1* (`19d1eb36516b92b9`)

  - From: `"Jeyasekaran M (via Google Drive)" <drive-shares-dm-noreply@google.com>`
  - To:   `dtlpadithyan@gmail.com`
  - Cc:   `adithyan@altiusnxt.com`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 78. Thread `19ceafc71a82b7b9`

- **Subject:** Request for Domain Details (WP Engine Hosted Website)
- **Messages in thread:** 4

  *Message 1* (`19ceb105798c9caf`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `"gokul@altiusnxt.com" <gokul@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 2* (`19ceb2cb18ffaf4a`)

  - From: `Gokul R <gokul@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 3* (`19cec07573170747`)

  - From: `Gokul R <gokul@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  _(+1 further message(s) in this thread, all rejected)_

#### 79. Thread `19cce3352285b0cc`

- **Subject:** Leave Request for Monday (09/03/2026)– Medical Emergency
- **Messages in thread:** 1

  *Message 1* (`19cce3a1d23a4121`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `shivanie@altiusnxt.com`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Govindaraj L <govind@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 80. Thread `19c8f307edb19ce3`

- **Subject:** PDF Extracter Updated OXT File
- **Messages in thread:** 1

  *Message 1* (`19c8f307edb19ce3`)

  - From: `Saranya dtlp <dtlpsaranya@gmail.com>`
  - To:   `Nikil Balasubramaniam <nikil.b@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 81. Thread `19c7fc4a39976270`

- **Subject:** Review the Pentair sample output
- **Messages in thread:** 1

  *Message 1* (`19c7fc87c76fc696`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Rajkumar D <rkumar@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 82. Thread `19c66c5a7c7d6bc6`

- **Subject:** RS Web Scraping Output
- **Messages in thread:** 4

  *Message 1* (`19c66cff80d6b40d`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 2* (`19c66d7300cd851e`)

  - From: `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Karthick B <bkarthick@altiusnxt.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

  *Message 3* (`19c6a395f15677b3`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `dhanalakshmi gopal <dhanalakshmi.gopal@altiusnxt.com>`
  - Cc:   `(none)`
  - **Rejected by:** R1 failed: user is sender, but no company address in To

  _(+1 further message(s) in this thread, all rejected)_

#### 83. Thread `19c65a8ad9feec6c`

- **Subject:** Official Memo: Working Day on 21st February 2026 & Compensatory Off on 28th February 2026
- **Messages in thread:** 1

  *Message 1* (`19c65a8ad9feec6c`)

  - From: `Shivanie Varhmen <shivanie@altiusnxt.com>`
  - To:   `SasiKumar dtlp <dtlpsasikumar@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Balaji dtlp <dtlpbalaji@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, sanjana dtlp <dtlpsanjana@gmail.com>, Prasanth dtlp <dtlpprasanth@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>, dtlpsneha@gmail.com`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 84. Thread `19c65585aa305043`

- **Subject:** Data Extraction From Pdf
- **Messages in thread:** 1

  *Message 1* (`19c65585aa305043`)

  - From: `Saranya dtlp <dtlpsaranya@gmail.com>`
  - To:   `Nikil Balasubramaniam <nikil.b@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 85. Thread `19c562ce071e8775`

- **Subject:** Siemens Output 1 Ready
- **Messages in thread:** 2

  *Message 1* (`19c562ce071e8775`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `Karthick B <bkarthick@altiusnxt.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

  *Message 2* (`19c58905785f3bfc`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - Cc:   `Karthick B <bkarthick@altiusnxt.com>, Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 86. Thread `19c5234cf03a66fc`

- **Subject:** Spreadsheet shared with you: "RAM Expandable"
- **Messages in thread:** 1

  *Message 1* (`19c5234cf03a66fc`)

  - From: `"SasiKumar dtlp (via Google Sheets)" <drive-shares-dm-noreply@google.com>`
  - To:   `dtlpadithyan@gmail.com`
  - Cc:   `dtlpmanikandan@gmail.com, dtlpprasanth@gmail.com, dtlpsanjana@gmail.com, dtlpsaranya@gmail.com, dtlpsneha@gmail.com, jey@deeptechskills.com`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 87. Thread `19bee6a154b3b535`

- **Subject:** Document shared with you: "NVIDIA Coimbatore Event – LLM & Enterprise AI Summary"
- **Messages in thread:** 1

  *Message 1* (`19bee6a154b3b535`)

  - From: `"SasiKumar dtlp (via Google Docs)" <drive-shares-dm-noreply@google.com>`
  - To:   `dtlpadithyan@gmail.com`
  - Cc:   `dtlpmanikandan@gmail.com, jey@deeptechskills.com`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 88. Thread `19bd4c3aa37a4f62`

- **Subject:** LibreOffice Extension – Download, Installation & Usage Instructions
- **Messages in thread:** 1

  *Message 1* (`19bd4c3aa37a4f62`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 89. Thread `19bdb117da443547`

- **Subject:** CMS Detection Completed – Output File Attached (12,564 URLs)
- **Messages in thread:** 1

  *Message 1* (`19bdb1a4fdb09294`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `Govindaraj L <govind@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

#### 90. Thread `19bb21ef8eedb7e0`

- **Subject:** Request to create UAN Generation for Provident Fund Process with ALTIUS GROUP
- **Messages in thread:** 1

  *Message 1* (`19bb21ef8eedb7e0`)

  - From: `Shivanie Varhmen <shivanie@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>, Balaji dtlp <dtlpbalaji@gmail.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>, Prasanth dtlp <dtlpprasanth@gmail.com>, sanjana dtlp <dtlpsanjana@gmail.com>, Saranya dtlp <dtlpsaranya@gmail.com>, SasiKumar dtlp <dtlpsasikumar@gmail.com>, dtlpsneha@gmail.com`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 91. Thread `19b221911188c310`

- **Subject:** Sample Output
- **Messages in thread:** 1

  *Message 1* (`19b221911188c310`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `stephen.david@altiusnxt.com`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 92. Thread `19ad96602b1c6b8f`

- **Subject:** Audit Report
- **Messages in thread:** 1

  *Message 1* (`19ad96602b1c6b8f`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 93. Thread `19ad8e88ebb950fa`

- **Subject:** Reports From Auditing
- **Messages in thread:** 1

  *Message 1* (`19ad8e88ebb950fa`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 94. Thread `19ac97fb8bccb2ca`

- **Subject:** Fwd: MKM_Batch 20_Data_2288 SKUs_112425
- **Messages in thread:** 1

  *Message 1* (`19ac97fb8bccb2ca`)

  - From: `Govindaraj L <govind@altiusnxt.com>`
  - To:   `Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 95. Thread `19ac9752d3812fc3`

- **Subject:** Fwd: Reg: Conrad_Gap Fill_748 SKUs
- **Messages in thread:** 1

  *Message 1* (`19ac9752d3812fc3`)

  - From: `Govindaraj L <govind@altiusnxt.com>`
  - To:   `Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 96. Thread `19aa0d16b239e73d`

- **Subject:** Result Of the Product And Extraction
- **Messages in thread:** 1

  *Message 1* (`19aa0d16b239e73d`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `Govindaraj L <govind@altiusnxt.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 97. Thread `19a7cde0f3e5ce12`

- **Subject:** Unable to Fetch Product URLs Due to 403 Forbidden
- **Messages in thread:** 1

  *Message 1* (`19a7cde0f3e5ce12`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 98. Thread `19a7280518b32c5a`

- **Subject:** Review Extract Data in Vendors Official Website
- **Messages in thread:** 2

  *Message 1* (`19a72831b577b242`)

  - From: `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - To:   `govind@altiusnxt.com`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - **Rejected by:** R1 failed: user is sender, but the company address is in Cc, not To

  *Message 2* (`19a72899eb0f4064`)

  - From: `Govindaraj L <govind@altiusnxt.com>`
  - To:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - Cc:   `Jeyasekaran M <jey@deeptechskills.com>, Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a co-recipient (Cc), not the sender

#### 99. Thread `19a6bc96fd5f91e0`

- **Subject:** Extension Update Completed
- **Messages in thread:** 1

  *Message 1* (`19a6bc96fd5f91e0`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>, sivagami.subramaniam@altiusnxt.com`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 100. Thread `19a4d6d074cec050`

- **Subject:** AI Product Normalization Tool
- **Messages in thread:** 1

  *Message 1* (`19a4d6d074cec050`)

  - From: `sanjana dtlp <dtlpsanjana@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Manikandan dtlp <dtlpmanikandan@gmail.com>, Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 101. Thread `19a2f59aa8a67a34`

- **Subject:** Submission of [Dtlp Extension] – ZIP File Attached
- **Messages in thread:** 1

  *Message 1* (`19a2f59aa8a67a34`)

  - From: `Manikandan dtlp <dtlpmanikandan@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>`
  - Cc:   `Adithyan dtlp <dtlpadithyan@gmail.com>`
  - **Rejected by:** R0: connected mailbox appears ONLY in Cc — neither clause can apply (anchor reads From/To only)

#### 102. Thread `19985b49510b08e7`

- **Subject:** AWS instance -Pdf_Data_Extractor
- **Messages in thread:** 1

  *Message 1* (`19985b49510b08e7`)

  - From: `Prasanth dtlp <dtlpprasanth@gmail.com>`
  - To:   `Jeyasekaran M <jey@deeptechskills.com>, Adithyan dtlp <dtlpadithyan@gmail.com>, Prasanth dtlp <dtlpprasanth@gmail.com>, dtlpmanikandan@gmail.com`
  - Cc:   `(none)`
  - **Rejected by:** R2 failed: user is a recipient, but the company address is a CO-RECIPIENT in To (third party sent it)


---

