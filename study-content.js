import { BRITISH_IPA } from "./lib/pronunciation.js";

const G=[
{n:"Họp và lịch",w:[
["reschedule","dời lịch","We had to reschedule the call because the client was travelling."],
["agenda","chương trình họp","Please send the agenda before the meeting."],
["postpone","hoãn lại","The team decided to postpone the release until Monday."],
["attendee","người tham dự","Each attendee received a copy of the minutes."],
["minutes","biên bản họp","Could you take the minutes today?"],
["follow up","theo dõi, liên hệ lại","I'll follow up with the vendor tomorrow."],
["adjourn","bế mạc, tạm dừng họp","The chair adjourned the meeting at five."]]},
{n:"Email và báo cáo",w:[
["regarding","về việc","I'm writing regarding the invoice dated 5 May."],
["attached","đính kèm","Please find the report attached."],
["deadline","hạn chót","We must meet the deadline despite the delays."],
["deliverable","sản phẩm bàn giao","The main deliverable is a test report."],
["status update","cập nhật tiến độ","She sends a status update every Friday."],
["clarify","làm rõ","Could you clarify the second requirement?"],
["escalate","báo lên cấp cao hơn","If the issue persists, we will escalate it to management."]]},
{n:"Quản lý dự án",w:[
["milestone","cột mốc","We reached the first milestone two weeks early."],
["scope","phạm vi","The change request expanded the project scope."],
["stakeholder","bên liên quan","Every stakeholder must approve the plan."],
["requirement","yêu cầu","The client changed the requirement at the last minute."],
["on track","đúng tiến độ","The project is on track for launch."],
["behind schedule","chậm tiến độ","We are two days behind schedule."],
["bottleneck","điểm nghẽn","Code review has become a bottleneck."]]},
{n:"Nhân sự",w:[
["recruit","tuyển dụng","The company plans to recruit ten engineers."],
["onboarding","hội nhập nhân viên mới","Onboarding takes about two weeks."],
["probation","thử việc","He passed his probation period."],
["promotion","thăng chức","She earned a promotion after the migration project."],
["resign","nghỉ việc","He resigned to join a startup."],
["performance review","đánh giá hiệu suất","Performance reviews are held twice a year."],
["workload","khối lượng công việc","The heavy workload led to overtime."]]},
{n:"Tài chính, hợp đồng",w:[
["budget","ngân sách","The project went over budget."],
["invoice","hóa đơn","The vendor will issue an invoice next week."],
["expense","chi phí","Travel expenses are reimbursed monthly."],
["quotation","báo giá","We requested a quotation from three suppliers."],
["terms and conditions","điều khoản và điều kiện","Read the terms and conditions before signing."],
["negotiate","đàm phán","They negotiated a lower price."],
["revenue","doanh thu","Revenue rose by ten percent."]]},
{n:"Khách hàng và IT",w:[
["inquiry","yêu cầu thông tin","We replied to every customer inquiry within a day."],
["complaint","khiếu nại","The complaint was about slow response times."],
["refund","hoàn tiền","Customers can request a refund within 30 days."],
["deployment","triển khai","The deployment was completed overnight."],
["bug fix","sửa lỗi","A bug fix will ship in the next patch."],
["migration","di chuyển hệ thống","The database migration caused brief downtime."],
["rollback","quay lui bản phát hành","We performed a rollback after the error."]]}
];
const R=[
{t:"Đọc B2: Remote work",time:"8 phút",p:"When the software company Northwind moved to a hybrid model last year, managers expected productivity to fall. Instead, output remained steady, but a different problem emerged: miscommunication. Teams that once solved issues over lunch now relied on chat messages, which were often brief and easy to misread. Several projects fell behind schedule because requirements were interpreted differently by developers and testers. In response, Northwind introduced two simple rules. First, any request that affects the project scope must be confirmed in writing, with a clear deadline. Second, a fifteen-minute daily call replaced most long status meetings. Within three months, the number of complaints from clients dropped by almost a third. However, some employees say the daily call feels like surveillance, and the company is now considering making it optional for experienced staff.",
q:[
{q:"What unexpected problem did Northwind face?",o:["Falling productivity","Miscommunication","Rising costs","Staff resignations"],a:1,e:"Output stayed steady; the new problem was miscommunication."},
{q:"Why did some projects fall behind schedule?",o:["Chat tools were unreliable","Managers cancelled meetings","Developers and testers read requirements differently","Clients missed deadlines"],a:2,e:"Requirements were interpreted differently by developers and testers."},
{q:"What replaced most long status meetings?",o:["A weekly email","A fifteen-minute daily call","A shared chat channel","Lunch meetings"],a:1,e:"A fifteen-minute daily call took their place."},
{q:"What might happen to the daily call?",o:["It will be cancelled for everyone","Experienced staff may be exempt","Clients will join it","It will become longer"],a:1,e:"The company is considering making it optional for experienced staff."}]},
{t:"Đọc C1: Meetings",time:"14 phút",p:"Few workplace habits are as widely criticised, and as stubbornly persistent, as the meeting. Studies suggest that managers spend nearly a quarter of their working week in them, yet fewer than half of participants believe the time is well spent. The problem is rarely the meeting itself; it is the absence of a defined purpose. When no decision is required, a meeting tends to drift into status reporting, which an email could have handled more efficiently. Moreover, frequent interruptions fragment concentration, so that a one-hour meeting can consume an entire morning of productive thinking. Some organisations have responded by banning meetings on certain days, while others insist on circulating a written brief beforehand and cancelling the session if no one has read it. Critics argue that such measures treat the symptom rather than the cause, since the real issue is a culture in which being visibly busy is rewarded over producing results. Until that changes, they contend, any new policy will merely be absorbed into old habits.",
q:[
{q:"According to the passage, what mainly makes meetings ineffective?",o:["They are too short","They have no defined purpose","Too few managers attend","They are held online"],a:1,e:"The problem is the absence of a defined purpose."},
{q:"Why can a one-hour meeting waste a whole morning?",o:["Meetings always overrun","Interruptions fragment concentration","Participants arrive late","Email replaces focus time"],a:1,e:"Frequent interruptions fragment concentration."},
{q:"What do the critics mean by 'treat the symptom rather than the cause'?",o:["The policies are too expensive","The policies ignore the underlying culture","The policies are too strict","The policies are copied from others"],a:1,e:"The measures do not address the culture that rewards looking busy."},
{q:"What do the critics predict?",o:["Meetings will disappear","New policies will fade into old habits unless culture changes","Managers will work fewer hours","Email will replace all meetings"],a:1,e:"Without a cultural change, policies are absorbed into old habits."}]}
];

const groupIds=["meetings-schedule","email-reports","project-management","human-resources","finance-contracts","customers-it"];
const readingIds=["remote-work","meetings"];
export const STUDY_CONTENT={
  groups:G.map((group,i)=>({...group,id:groupIds[i],w:group.w.map(word=>[...word,BRITISH_IPA[word[0]] || ""])})),
  readings:R.map((reading,i)=>({...reading,id:readingIds[i]}))
};
