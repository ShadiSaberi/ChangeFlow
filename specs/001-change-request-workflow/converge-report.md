# گزارش Converge پروژهٔ ChangeFlow

## دامنهٔ تطبیق

تطبیق دستی میان `spec.md` و بخش Clarifications آن، `plan.md`، `contracts/change-requests-api.md`، کد `src/` و آزمون‌های `test/` انجام شد. نتیجهٔ اجرای آزمون‌ها در [validation-report.md](validation-report.md) بر اساس گزارش کاربر ثبت شده است.

## موارد هم‌راستا

| نیازمندی / تصمیم | پیاده‌سازی | شاهد آزمون |
| --- | --- | --- |
| FR-01 و CL-07: ثبت Draft و متن‌های غیرخالی | `POST /change-requests`، مالکیت از کاربر احرازشده | `test/change-requests.test.js` |
| FR-02: ویرایش و ارسال توسط Requester | PATCH و submit با مالکیت، نقش جاری و وضعیت مجاز | `test/change-request-edit.test.js`, `test/change-request-submit.test.js`, T018 در `test/change-request-workflow-cases.test.js` |
| FR-03 و CL-06: تصمیم Reviewer مستقل | approve و request-changes فقط روی PendingReview و غیر از ثبت‌کننده | `test/change-request-approve.test.js`, `test/change-request-self-review.test.js`, T018 |
| FR-04 و FR-05: جلوگیری از خودتأییدی و ویرایش Approved | رد 403 یا 409 و عدم تغییر ردیف | T015 و T016 در `test/change-request-workflow-cases.test.js` |
| FR-06 و CL-03: نقش فعلی و لغو Reviewer | نقش‌ها از DB خوانده می‌شوند؛ mutationها این بررسی را با دادهٔ درخواست در تراکنش انجام می‌دهند | `test/auth.test.js`, T019 |
| FR-07: کنترل نسخه | UPDATE شرطی بر ID و نسخه و افزایش اتمی version | `src/change-request-updates.js`, `test/change-request-updates.test.js`, T017 |
| CL-02: دسترسی مشاهده | Requester مالک، Reviewer درخواست PendingReview، نقش ترکیبی اجتماع دسترسی‌ها | `test/change-request-queries.test.js` |
| CL-04: ارسال مجدد در PendingReview | submit فقط از Draft یا ChangesRequested | وضعیت نامجاز به INVALID_STATE در helper تراکنشی |
| CL-05: درخواست‌های هم‌محتوا | هر POST معتبر یک ردیف مستقل می‌سازد | رفتار INSERT در `src/server.js` |

## شکاف‌ها و پیگیری

1. **آزمون خطاهای ورودی/هویت/مجوز در API** — پیاده‌سازی قرارداد را برای `400 INVALID_INPUT`, `401 UNAUTHENTICATED` و `403 FORBIDDEN` دارد، اما فایل‌های آزمون فعلی عمدتاً مسیرهای موفق و چند خطای وضعیت/نسخه/مجوز را می‌پوشانند. آزمون HTTP جداگانه برای بدنهٔ ناقص/خالی، هدر غایب یا توکن نامعتبر و نقش نامجاز برای ثبت اضافه شود. نیازمندی مرتبط: FR-01، FR-06 و CL-07؛ پیگیری پیشنهادی: **T020**.
2. **خروجی 404/400 مسیرهای خواندن** — قرارداد خطاهای `NOT_FOUND` و `INVALID_INPUT` را تعریف می‌کند و کد آن‌ها را در GET تک‌درخواست پیاده کرده، اما آزمون اختصاصی برای شناسهٔ ناموجود/نامعتبر دیده نشد. نیازمندی مرتبط: قرارداد API؛ پیگیری پیشنهادی: **T021**.

این دو مورد شکاف پوشش آزمون هستند؛ از تطبیق حاضر نقص قطعی در رفتار پیاده‌سازی آن‌ها نتیجه نمی‌شود. در `tasks.md` فعلی T001–T019 کامل‌اند؛ T020 و T021 هنوز به فهرست تسک‌ها افزوده نشده‌اند.

## نتیجه

مسیرهای نسخهٔ اول و گردش اصلی با spec، Clarifications و قرارداد API هم‌راستا هستند و آزمون‌های گزارش‌شده پاس شده‌اند. پوشش خطاهای ورودی و مسیرهای خواندن ناموجود، دو مورد مشخص برای تکمیل آزمون‌ها هستند.
