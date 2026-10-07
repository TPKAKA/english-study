-- Generated from src/data/study-content.js by node scripts/generate-seed.cjs.
-- Existing lesson edits are preserved when this script is rerun.
begin;

insert into public.vocabulary_groups (id, title, sort_order) values
  ('meetings-schedule', 'Họp và lịch', 0),
  ('email-reports', 'Email và báo cáo', 1),
  ('project-management', 'Quản lý dự án', 2),
  ('human-resources', 'Nhân sự', 3),
  ('finance-contracts', 'Tài chính, hợp đồng', 4),
  ('customers-it', 'Khách hàng và IT', 5)
on conflict (id) do nothing;

insert into public.vocabulary_words (word, group_id, meaning, example, ipa, sort_order) values
  ('reschedule', 'meetings-schedule', 'dời lịch', 'We had to reschedule the call because the client was travelling.', '/ˌriːˈʃedjuːl/', 0),
  ('agenda', 'meetings-schedule', 'chương trình họp', 'Please send the agenda before the meeting.', '/əˈdʒendə/', 1),
  ('postpone', 'meetings-schedule', 'hoãn lại', 'The team decided to postpone the release until Monday.', '/pəˈspəʊn/', 2),
  ('attendee', 'meetings-schedule', 'người tham dự', 'Each attendee received a copy of the minutes.', '/əˌtenˈdiː/', 3),
  ('minutes', 'meetings-schedule', 'biên bản họp', 'Could you take the minutes today?', '/ˈmɪnɪts/', 4),
  ('follow up', 'meetings-schedule', 'theo dõi, liên hệ lại', 'I''ll follow up with the vendor tomorrow.', '/ˌfɒləʊ ˈʌp/', 5),
  ('adjourn', 'meetings-schedule', 'bế mạc, tạm dừng họp', 'The chair adjourned the meeting at five.', '/əˈdʒɜːn/', 6),
  ('regarding', 'email-reports', 'về việc', 'I''m writing regarding the invoice dated 5 May.', '/rɪˈɡɑːdɪŋ/', 0),
  ('attached', 'email-reports', 'đính kèm', 'Please find the report attached.', '/əˈtætʃt/', 1),
  ('deadline', 'email-reports', 'hạn chót', 'We must meet the deadline despite the delays.', '/ˈdedlaɪn/', 2),
  ('deliverable', 'email-reports', 'sản phẩm bàn giao', 'The main deliverable is a test report.', '/dɪˈlɪvərəbl/', 3),
  ('status update', 'email-reports', 'cập nhật tiến độ', 'She sends a status update every Friday.', '/ˈsteɪtəs ˌʌpdeɪt/', 4),
  ('clarify', 'email-reports', 'làm rõ', 'Could you clarify the second requirement?', '/ˈklærəfaɪ/', 5),
  ('escalate', 'email-reports', 'báo lên cấp cao hơn', 'If the issue persists, we will escalate it to management.', '/ˈeskəleɪt/', 6),
  ('milestone', 'project-management', 'cột mốc', 'We reached the first milestone two weeks early.', '/ˈmaɪlstəʊn/', 0),
  ('scope', 'project-management', 'phạm vi', 'The change request expanded the project scope.', '/skəʊp/', 1),
  ('stakeholder', 'project-management', 'bên liên quan', 'Every stakeholder must approve the plan.', '/ˈsteɪkhəʊldə(r)/', 2),
  ('requirement', 'project-management', 'yêu cầu', 'The client changed the requirement at the last minute.', '/rɪˈkwaɪəmənt/', 3),
  ('on track', 'project-management', 'đúng tiến độ', 'The project is on track for launch.', '/ɒn ˈtræk/', 4),
  ('behind schedule', 'project-management', 'chậm tiến độ', 'We are two days behind schedule.', '/bɪˈhaɪnd ˈʃedjuːl/', 5),
  ('bottleneck', 'project-management', 'điểm nghẽn', 'Code review has become a bottleneck.', '/ˈbɒtlnek/', 6),
  ('recruit', 'human-resources', 'tuyển dụng', 'The company plans to recruit ten engineers.', '/rɪˈkruːt/', 0),
  ('onboarding', 'human-resources', 'hội nhập nhân viên mới', 'Onboarding takes about two weeks.', '/ˈɒnbɔːdɪŋ/', 1),
  ('probation', 'human-resources', 'thử việc', 'He passed his probation period.', '/prəˈbeɪʃn/', 2),
  ('promotion', 'human-resources', 'thăng chức', 'She earned a promotion after the migration project.', '/prəˈməʊʃn/', 3),
  ('resign', 'human-resources', 'nghỉ việc', 'He resigned to join a startup.', '/rɪˈzaɪn/', 4),
  ('performance review', 'human-resources', 'đánh giá hiệu suất', 'Performance reviews are held twice a year.', '/pəˈfɔːməns rɪˈvjuː/', 5),
  ('workload', 'human-resources', 'khối lượng công việc', 'The heavy workload led to overtime.', '/ˈwɜːkləʊd/', 6),
  ('budget', 'finance-contracts', 'ngân sách', 'The project went over budget.', '/ˈbʌdʒɪt/', 0),
  ('invoice', 'finance-contracts', 'hóa đơn', 'The vendor will issue an invoice next week.', '/ˈɪnvɔɪs/', 1),
  ('expense', 'finance-contracts', 'chi phí', 'Travel expenses are reimbursed monthly.', '/ɪkˈspens/', 2),
  ('quotation', 'finance-contracts', 'báo giá', 'We requested a quotation from three suppliers.', '/kwəʊˈteɪʃn/', 3),
  ('terms and conditions', 'finance-contracts', 'điều khoản và điều kiện', 'Read the terms and conditions before signing.', '/ˌtɜːmz ən kənˈdɪʃnz/', 4),
  ('negotiate', 'finance-contracts', 'đàm phán', 'They negotiated a lower price.', '/nɪˈɡəʊʃieɪt/', 5),
  ('revenue', 'finance-contracts', 'doanh thu', 'Revenue rose by ten percent.', '/ˈrevənjuː/', 6),
  ('inquiry', 'customers-it', 'yêu cầu thông tin', 'We replied to every customer inquiry within a day.', '/ɪnˈkwaɪəri/', 0),
  ('complaint', 'customers-it', 'khiếu nại', 'The complaint was about slow response times.', '/kəmˈpleɪnt/', 1),
  ('refund', 'customers-it', 'hoàn tiền', 'Customers can request a refund within 30 days.', '/ˈriːfʌnd/', 2),
  ('deployment', 'customers-it', 'triển khai', 'The deployment was completed overnight.', '/dɪˈplɔɪmənt/', 3),
  ('bug fix', 'customers-it', 'sửa lỗi', 'A bug fix will ship in the next patch.', '/ˈbʌɡ fɪks/', 4),
  ('migration', 'customers-it', 'di chuyển hệ thống', 'The database migration caused brief downtime.', '/maɪˈɡreɪʃn/', 5),
  ('rollback', 'customers-it', 'quay lui bản phát hành', 'We performed a rollback after the error.', '/ˈrəʊlbæk/', 6)
on conflict (word) do nothing;

insert into public.reading_passages (id, title, time_label, passage, sort_order) values
  ('remote-work', 'Đọc B2: Remote work', '8 phút', 'When the software company Northwind moved to a hybrid model last year, managers expected productivity to fall. Instead, output remained steady, but a different problem emerged: miscommunication. Teams that once solved issues over lunch now relied on chat messages, which were often brief and easy to misread. Several projects fell behind schedule because requirements were interpreted differently by developers and testers. In response, Northwind introduced two simple rules. First, any request that affects the project scope must be confirmed in writing, with a clear deadline. Second, a fifteen-minute daily call replaced most long status meetings. Within three months, the number of complaints from clients dropped by almost a third. However, some employees say the daily call feels like surveillance, and the company is now considering making it optional for experienced staff.', 0),
  ('meetings', 'Đọc C1: Meetings', '14 phút', 'Few workplace habits are as widely criticised, and as stubbornly persistent, as the meeting. Studies suggest that managers spend nearly a quarter of their working week in them, yet fewer than half of participants believe the time is well spent. The problem is rarely the meeting itself; it is the absence of a defined purpose. When no decision is required, a meeting tends to drift into status reporting, which an email could have handled more efficiently. Moreover, frequent interruptions fragment concentration, so that a one-hour meeting can consume an entire morning of productive thinking. Some organisations have responded by banning meetings on certain days, while others insist on circulating a written brief beforehand and cancelling the session if no one has read it. Critics argue that such measures treat the symptom rather than the cause, since the real issue is a culture in which being visibly busy is rewarded over producing results. Until that changes, they contend, any new policy will merely be absorbed into old habits.', 1)
on conflict (id) do nothing;

insert into public.reading_questions (reading_id, sort_order, prompt, options, answer_index, explanation) values
  ('remote-work', 0, 'What unexpected problem did Northwind face?', ARRAY['Falling productivity', 'Miscommunication', 'Rising costs', 'Staff resignations']::text[], 1, 'Output stayed steady; the new problem was miscommunication.'),
  ('remote-work', 1, 'Why did some projects fall behind schedule?', ARRAY['Chat tools were unreliable', 'Managers cancelled meetings', 'Developers and testers read requirements differently', 'Clients missed deadlines']::text[], 2, 'Requirements were interpreted differently by developers and testers.'),
  ('remote-work', 2, 'What replaced most long status meetings?', ARRAY['A weekly email', 'A fifteen-minute daily call', 'A shared chat channel', 'Lunch meetings']::text[], 1, 'A fifteen-minute daily call took their place.'),
  ('remote-work', 3, 'What might happen to the daily call?', ARRAY['It will be cancelled for everyone', 'Experienced staff may be exempt', 'Clients will join it', 'It will become longer']::text[], 1, 'The company is considering making it optional for experienced staff.'),
  ('meetings', 0, 'According to the passage, what mainly makes meetings ineffective?', ARRAY['They are too short', 'They have no defined purpose', 'Too few managers attend', 'They are held online']::text[], 1, 'The problem is the absence of a defined purpose.'),
  ('meetings', 1, 'Why can a one-hour meeting waste a whole morning?', ARRAY['Meetings always overrun', 'Interruptions fragment concentration', 'Participants arrive late', 'Email replaces focus time']::text[], 1, 'Frequent interruptions fragment concentration.'),
  ('meetings', 2, 'What do the critics mean by ''treat the symptom rather than the cause''?', ARRAY['The policies are too expensive', 'The policies ignore the underlying culture', 'The policies are too strict', 'The policies are copied from others']::text[], 1, 'The measures do not address the culture that rewards looking busy.'),
  ('meetings', 3, 'What do the critics predict?', ARRAY['Meetings will disappear', 'New policies will fade into old habits unless culture changes', 'Managers will work fewer hours', 'Email will replace all meetings']::text[], 1, 'Without a cultural change, policies are absorbed into old habits.')
on conflict (reading_id, sort_order) do nothing;

commit;
